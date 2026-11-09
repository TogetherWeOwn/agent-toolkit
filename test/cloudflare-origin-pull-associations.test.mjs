import assert from "node:assert/strict";
import test from "node:test";
import { hostnameOriginPullAssociationsDescriptor } from "../dist/plugins/cloudflare-broker/src/hostname-origin-pulls.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const name = "app.example.com";
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", hostnames: [name] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ hostname: name, enabled: true, certificate: credentialCanary, private_key: derivedCanary,
  cert_id: credentialCanary, status: "pending_deployment", created_at: credentialCanary, updated_at: credentialCanary });
function fixture({ hostnames = [name], response = [row()], status = 200, noZone = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], originPullAssociationHostnames: hostnames } }) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === "cloudflare.tls.hostname_origin_pulls.list");
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations,
    invoke: (raw = {}, key = "call-a") => broker.call("cloudflare.tls.hostname_origin_pulls.list", raw, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "certificate", "private_key", "cert_id", "created_at", "updated_at", "pending_deployment", "other.example.com"]) assert.ok(!data.includes(value));
}

test("Cloudflare origin-pull association list copies scope and authenticates prepared projections", () => {
  const s = scope();
  const d = hostnameOriginPullAssociationsDescriptor(s);
  s.accountId = foreign;
  s.zoneId = foreign;
  s.revision = "changed";
  s.hostnames[0] = "other.example.com";
  s.hostnames.push("new.example.com");
  const p = d.prepare({});
  assert.equal(p.request.path, `/zones/${zone}/origin_tls_client_auth/hostnames?page=1&per_page=100&status=all`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:hostname-origin-pull-associations`);
  assert.equal(p.resource.revision, "resource-1");
  assert.deepEqual(d.project(success([row(), { hostname: "new.example.com", enabled: true }]), p).items, [{ hostname: name, enabled: true }]);
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success([row()]), { ...p }), /scope/);
  assert.throws(() => hostnameOriginPullAssociationsDescriptor(scope()).project(success([row()]), p), /scope/);
});

test("Cloudflare origin-pull association list validates bounded canonical unique hostname scope", () => {
  for (const hostnames of [null, {}, name, Array(101).fill(name)]) {
    assert.throws(() => hostnameOriginPullAssociationsDescriptor({ ...scope(), hostnames }), /cap/);
  }
  assert.throws(() => hostnameOriginPullAssociationsDescriptor({ ...scope(), hostnames: [name, name] }), /schema/);
  for (const invalid of ["*.example.com", "App.example.com", "app.example.com.", "https://app.example.com", "app%2eexample.com",
    "app.example.com/other", "app.example.com?x=1", "app.example.com\n", "аpp.example.com", `${"a".repeat(64)}.example.com`, `${"a.".repeat(125)}test`]) {
    assert.throws(() => hostnameOriginPullAssociationsDescriptor({ ...scope(), hostnames: [invalid] }), /schema/);
  }
  for (const field of ["accountId", "zoneId", "revision"]) assert.throws(() => hostnameOriginPullAssociationsDescriptor({ ...scope(), [field]: "bad/identity" }), /schema/);
});

test("Cloudflare origin-pull association list filters names and preserves configured boolean, void null and unavailable", () => {
  const d = hostnameOriginPullAssociationsDescriptor(scope());
  const p = d.prepare({});
  for (const enabled of [false, true, null, undefined]) {
    const out = d.project(success([{ hostname: "other.example.com", enabled: "unselected" }, { ...row(), enabled }]), p);
    assert.deepEqual(out, { items: [{ hostname: name, enabled: enabled === undefined ? "unavailable" : enabled }],
      subject: "configured-hostname-origin-pull-associations", complete: false, effectiveProtection: "not-established" });
    for (const value of [out, out.items, out.items[0]]) assert.ok(Object.isFrozen(value));
    safe({ audit: [], journal: [] }, out);
  }
  for (const rows of [[], [{ hostname: "other.example.com" }]]) {
    const out = d.project(success(rows), p);
    assert.deepEqual(out.items, []);
    assert.equal(out.complete, false);
    assert.equal(out.effectiveProtection, "not-established");
  }
});

test("Cloudflare origin-pull association list rejects foreign context, duplicates, malformed envelopes and bounds", () => {
  const d = hostnameOriginPullAssociationsDescriptor(scope());
  const p = d.prepare({});
  for (const patch of [{ account_id: foreign }, { zone_id: foreign }]) {
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: [row()], ...patch }), p), /scope/);
    for (const hostname of [name, "other.example.com"]) assert.throws(() => d.project(success([{ ...row(), hostname, ...patch }]), p), /scope/);
  }
  for (const raw of ["null", "not-json", "{}", success(null), success({}), success([null]), success([{}]), success([[]]),
    JSON.stringify({ success: true, result: [row()] }), JSON.stringify({ success: false, errors: [], result: [row()] }),
    JSON.stringify({ success: true, errors: [credentialCanary], result: [row()] })]) assert.throws(() => d.project(raw, p));
  for (const enabled of [0, 1, "false", "true", [], {}]) assert.throws(() => d.project(success([{ ...row(), enabled }]), p), /upstream/);
  assert.throws(() => d.project(success([row(), row()]), p), /upstream/);
  assert.equal(d.project(success(Array.from({ length: 100 }, (_, i) => ({ hostname: `unselected${i}.example.com` }))), p).items.length, 0);
  assert.throws(() => d.project(success(Array.from({ length: 101 }, (_, i) => ({ hostname: `unselected${i}.example.com` }))), p), /cap/);
  assert.throws(() => d.project(success([{ ...row(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare origin-pull association list independently defaults denied and refuses overrides before credentials", async () => {
  assert.ok(!fixture({ noZone: true }).operations.some(op => op.name === "cloudflare.tls.hostname_origin_pulls.list"));
  assert.throws(() => hostnameOriginPullAssociationsDescriptor({ accountId: account, zoneId: zone, revision: "resource-1" }).prepare({}), /scope/);
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], originPullsReadAllowed: true, originPullHostnames: [name],
      hostnameTls: [{ settingId: "http2", hostnames: [name] }] } }, { accountId: account, revision: "resource-1" });
  assert.throws(() => operations.find(op => op.name === "cloudflare.tls.hostname_origin_pulls.list").prepare({}), /scope/);
  assert.throws(() => fixture().operations.find(op => op.name === "cloudflare.tls.hostname_origin_pulls.get").prepare({ hostname: name }), /scope/);
  const denied = fixture({ hostnames: [] });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  assert.equal(denied.requests.length, 0);
  for (const raw of [{ hostname: name }, { accountId: foreign }, { zoneId: foreign }, { enabled: false },
    { headers: {} }, { page: 2 }, { perPage: 1000 }, { status: "active" }, { approval: "forged" }, { certificateId: "forged" }]) {
    const f = fixture();
    assert.equal((await f.invoke(raw)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare origin-pull association list actual-core fixed GET preserves safe output, audit, cleanup and replay", async () => {
  const f = fixture({ response: [row(), { hostname: "other.example.com", cert_id: credentialCanary }] });
  const p = f.operation.prepare({});
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "per-hostname-authenticated-origin-pull-list-hostname-associations");
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.items, [{ hostname: name, enabled: true }]);
  assert.equal(out.value.complete, false);
  assert.equal(out.value.effectiveProtection, "not-established");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/origin_tls_client_auth/hostnames?page=1&per_page=100&status=all`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare origin-pull association list current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
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

test("Cloudflare origin-pull association list upstream and outcome-audit failures preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: [{ ...row(), zone_id: foreign }] },
    { response: [row(), row()] }, { response: [{ ...row(), enabled: "false" }] }]) {
    const f = fixture(options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (options.auditFailure) {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
