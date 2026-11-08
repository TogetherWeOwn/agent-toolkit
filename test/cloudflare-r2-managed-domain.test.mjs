import assert from "node:assert/strict";
import test from "node:test";
import { r2ManagedDomainDescriptor } from "../dist/plugins/cloudflare-broker/src/r2-managed-domain.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const bucketId = "b".repeat(32);
const args = { bucketName: "safe-bucket" };
const tool = "cloudflare.r2.managed_domain.get";
const scope = (jurisdiction = "eu") => ({ accountId: account, revision: "resource-1",
  buckets: [{ bucketName: args.bucketName, bucketId, jurisdiction }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ bucketId, domain: credentialCanary, enabled: false, objects: derivedCanary });
function fixture({ jurisdiction = "eu", buckets = scope(jurisdiction).buckets, result = row() } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    defaultBucketNames: [args.bucketName], euBucketLocks: [], r2ManagedDomainBuckets: buckets },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(result), { headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(args).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (raw = args, key = "call-a") => broker.call(tool, raw, "verified-runtime", key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary]) assert.ok(!serialized.includes(value));
}

test("Cloudflare managed-domain scope copies exact bucket identities and jurisdiction independently", () => {
  const s = scope();
  const d = r2ManagedDomainDescriptor(s);
  s.buckets[0].bucketId = "f".repeat(32);
  s.buckets[0].jurisdiction = "default";
  s.buckets.push({ bucketName: "other-bucket", bucketId: "c".repeat(32), jurisdiction: "eu" });
  s.accountId = "f".repeat(32);
  const p = d.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${account}:r2:jurisdiction:eu:bucket:${args.bucketName}:id:${bucketId}:managed-domain`);
  assert.equal(p.request.path, `/accounts/${account}/r2/buckets/${args.bucketName}/domains/managed`);
  assert.equal(p.request.r2Jurisdiction, "eu");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.prepare({ bucketName: "other-bucket" }), /scope/);
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  const entry = scope().buckets[0];
  for (const buckets of [[entry, { ...entry, jurisdiction: "default" }], [entry, { ...entry, bucketName: "other-bucket" }],
    [{ ...entry, jurisdiction: "us" }], [{ ...entry, bucketId: "invalid" }], [{ ...entry, bucketName: "safe-bucket\n" }]]) {
    assert.throws(() => r2ManagedDomainDescriptor({ ...scope(), buckets }), /schema/);
  }
  assert.throws(() => r2ManagedDomainDescriptor({ ...scope(), buckets: Array(101).fill(entry) }), /cap/);
});

test("Cloudflare managed-domain projection exposes configured switch, never domains or effective privacy", () => {
  const d = r2ManagedDomainDescriptor(scope());
  for (const enabled of [false, true]) {
    const out = d.project(success({ ...row(), enabled }), d.prepare(args));
    assert.deepEqual(out, { bucketName: args.bucketName, bucketId, requestedJurisdiction: "eu", enabled,
      subject: "configured-r2-dev-access", customDomainAccess: "not-established", effectivePrivacy: "not-established", recoveryCustody: "not-established" });
    assert.ok(Object.isFrozen(out));
    assert.ok(!JSON.stringify(out).includes(credentialCanary));
    assert.ok(!JSON.stringify(out).includes(derivedCanary));
  }
});

test("Cloudflare managed-domain malformed, missing or foreign identity and enabled fields refuse", () => {
  const d = r2ManagedDomainDescriptor(scope());
  const p = d.prepare(args);
  for (const patch of [{ bucketId: "f".repeat(32) }, { bucketId: undefined }, { bucketId: null },
    { account_id: "f".repeat(32) }, { bucket_name: "other-bucket" }, { jurisdiction: "default" }]) {
    assert.throws(() => d.project(success({ ...row(), ...patch }), p), /scope/);
  }
  for (const enabled of [undefined, null, "false", 0, {}]) assert.throws(() => d.project(success({ ...row(), enabled }), p), /upstream/);
  for (const raw of ["null", "{}", "not-json", success(null), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: true, errors: [credentialCanary], result: row() }), JSON.stringify({ success: false, errors: [], result: row() })]) {
    assert.throws(() => d.project(raw, p), /upstream/);
  }
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare managed-domain default-empty scope and model overrides refuse before credentials", async () => {
  const empty = fixture({ buckets: [] });
  assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(empty.calls.secret, 0);
  assert.equal(empty.requests.length, 0);
  for (const patch of [{ jurisdiction: "default" }, { bucketId }, { accountId: "f".repeat(32) }, { bucketName: "other-bucket" },
    { enabled: true }, { url: "https://example.com" }, { headers: { "cf-r2-jurisdiction": "default" } }, { approval: "forged" }, { agentId: "other" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare managed-domain core plan binds default/EU fixed GET, redaction, cleanup and replay", async () => {
  for (const jurisdiction of ["default", "eu"]) {
    const f = fixture({ jurisdiction });
    const plan = f.operation.prepare(args);
    assert.equal(plan.plan.request.r2Jurisdiction, jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(plan.plan.providerDryRun, false);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.requestedJurisdiction, jurisdiction);
    assert.equal(out.value.enabled, false);
    assert.equal(f.requests[0].init.headers["cf-r2-jurisdiction"], jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${args.bucketName}/domains/managed`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare managed-domain agent, identity, resource and lease-time revocation deny before network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = [f.operation.prepare(args).resource.id.replace(bucketId, "c".repeat(32))];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const out = await f.invoke();
    assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0);
    safe(f, out);
  }
});

test("Cloudflare managed-domain reassignment and malformed responses retain uncertain replay tombstones", async () => {
  for (const result of [{ ...row(), bucketId: "f".repeat(32) }, { ...row(), jurisdiction: "default" }, { ...row(), enabled: "false" }]) {
    const f = fixture({ result });
    const out = await f.invoke();
    assert.equal(out.code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare managed-domain EU header cannot escape exact path or retry another jurisdiction", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { calls++; throw new Error("must-not-call"); });
  const d = r2ManagedDomainDescriptor(scope());
  const p = d.prepare(args);
  for (const path of [p.request.path + "?jurisdiction=eu", p.request.path + "/objects", p.request.path.replace("managed", "custom")]) {
    await assert.rejects(read({ ...d, prepare: () => ({ ...p, request: { ...p.request, path } }) }, args, credentialCanary, new AbortController().signal));
    assert.equal(calls, 0);
  }
  const unavailable = metadataTransport(async (_url, init) => {
    calls++;
    assert.equal(init.headers["cf-r2-jurisdiction"], "eu");
    return new Response("denied", { status: 403 });
  });
  await assert.rejects(unavailable(d, args, credentialCanary, new AbortController().signal));
  assert.equal(calls, 1);
});
