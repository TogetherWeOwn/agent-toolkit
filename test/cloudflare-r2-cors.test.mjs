import assert from "node:assert/strict";
import test from "node:test";
import { r2CorsDescriptor } from "../dist/plugins/cloudflare-broker/src/r2-cors.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const allowedOrigin = "https://safe.example";
const foreignOrigin = "https://unrelated.example";
const args = { bucketName: "safe-bucket" };
const tool = "cloudflare.r2.cors.get";
const scope = (jurisdiction = "eu") => ({ accountId: account, revision: "resource-1",
  buckets: [{ bucketName: args.bucketName, jurisdiction, origins: [allowedOrigin] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const rule = () => ({ id: credentialCanary, allowed: { origins: [allowedOrigin, foreignOrigin], methods: ["GET", "HEAD"], headers: [derivedCanary] },
  exposeHeaders: [credentialCanary], maxAgeSeconds: 3600 });
const row = () => ({ rules: [rule(), { allowed: { origins: [foreignOrigin], methods: ["PUT"] } }], objects: derivedCanary });
function fixture({ jurisdiction = "eu", buckets = scope(jurisdiction).buckets, result = row() } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    defaultBucketNames: [args.bucketName], r2CorsBuckets: buckets },
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
  for (const value of [credentialCanary, derivedCanary, foreignOrigin]) assert.ok(!serialized.includes(value));
}

test("Cloudflare CORS copies independent exact origin/bucket/jurisdiction scope", () => {
  const s = scope();
  const d = r2CorsDescriptor(s);
  s.buckets[0].origins.push(foreignOrigin);
  s.buckets[0].jurisdiction = "default";
  s.buckets.push({ bucketName: "other-bucket", jurisdiction: "eu", origins: [allowedOrigin] });
  s.accountId = "f".repeat(32);
  const p = d.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${account}:r2:jurisdiction:eu:bucket:${args.bucketName}:cors`);
  assert.equal(p.request.path, `/accounts/${account}/r2/buckets/${args.bucketName}/cors`);
  assert.equal(p.request.r2Jurisdiction, "eu");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.prepare({ bucketName: "other-bucket" }), /scope/);
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  assert.deepEqual(d.project(success(row()), p).rules[0].origins, [allowedOrigin]);
  const entry = scope().buckets[0];
  for (const buckets of [[entry, { ...entry }], [{ ...entry, jurisdiction: "us" }], [{ ...entry, origins: [allowedOrigin, allowedOrigin] }],
    ...["https://user:pass@safe.example", "https://safe.example/path", "https://safe.example/", "https://safe.example?x=1", "null", "https://*.example", "https://safe.example\n"].map(origin => [{ ...entry, origins: [origin] }])]) {
    assert.throws(() => r2CorsDescriptor({ ...scope(), buckets }), /schema/);
  }
  assert.throws(() => r2CorsDescriptor({ ...scope(), buckets: Array(101).fill(entry) }), /cap/);
  assert.throws(() => r2CorsDescriptor({ ...scope(), buckets: [{ ...entry, origins: Array(101).fill(allowedOrigin) }] }), /cap/);
});

test("Cloudflare CORS projects selected origins/methods/cache only, never authorization guarantees", () => {
  const d = r2CorsDescriptor(scope());
  const p = d.prepare(args);
  const out = d.project(success(row()), p);
  assert.deepEqual(out, { bucketName: args.bucketName, requestedJurisdiction: "eu",
    rules: [{ origins: [allowedOrigin], methods: ["GET", "HEAD"], maxAgeSeconds: 3600 }], subject: "configured-selected-cors", complete: false,
    effectiveAccess: "not-established", effectivePrivacy: "not-established", recoveryCustody: "not-established" });
  for (const value of [out, out.rules, out.rules[0], out.rules[0].origins, out.rules[0].methods]) assert.ok(Object.isFrozen(value));
  safe({ audit: [], journal: [] }, out);
  assert.equal(d.project(success({ rules: [{ allowed: { origins: [allowedOrigin], methods: ["DELETE"] } }] }), p).rules[0].maxAgeSeconds, "unavailable");
  assert.deepEqual(d.project(success({ rules: [] }), p).rules, []);
  const wildcard = { rules: [{ allowed: { origins: ["*"], methods: ["GET"] } }] };
  assert.deepEqual(d.project(success(wildcard), p).rules, []);
  const explicit = r2CorsDescriptor({ ...scope(), buckets: [{ ...scope().buckets[0], origins: ["*"] }] });
  assert.deepEqual(explicit.project(success(wildcard), explicit.prepare(args)).rules[0].origins, ["*"]);
});

test("Cloudflare CORS malformed selected config, foreign context and bounds refuse", () => {
  const d = r2CorsDescriptor(scope());
  const p = d.prepare(args);
  for (const patch of [{ account_id: "f".repeat(32) }, { bucket_name: "other-bucket" }, { jurisdiction: "default" }]) {
    assert.throws(() => d.project(success({ ...row(), ...patch }), p), /scope/);
  }
  for (const methods of [undefined, null, [], ["OPTIONS"], ["get"], ["GET", "GET"], [credentialCanary]]) {
    assert.throws(() => d.project(success({ rules: [{ allowed: { origins: [allowedOrigin], methods } }] }), p));
  }
  for (const origins of [undefined, null, [], [allowedOrigin, allowedOrigin], ["not-an-origin"], Array(101).fill(allowedOrigin)]) {
    assert.throws(() => d.project(success({ rules: [{ allowed: { origins, methods: ["GET"] } }] }), p));
  }
  for (const maxAgeSeconds of [null, -1, 86401, 0.5, "3600"]) {
    assert.throws(() => d.project(success({ rules: [{ ...rule(), maxAgeSeconds }] }), p), /upstream/);
  }
  for (const raw of ["null", "{}", "not-json", success(null), success({}), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: [credentialCanary], result: row() })]) assert.throws(() => d.project(raw, p));
  assert.throws(() => d.project(success({ rules: Array(1001).fill({}) }), p), /cap/);
  assert.throws(() => d.project(success({ rules: Array(400).fill({ allowed: { origins: [allowedOrigin], methods: ["GET"] } }) }), p), /cap/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare CORS empty scope and model overrides refuse before credentials", async () => {
  for (const buckets of [[], [{ ...scope().buckets[0], origins: [] }]]) {
    const f = fixture({ buckets });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  for (const patch of [{ jurisdiction: "default" }, { origins: [foreignOrigin] }, { accountId: "f".repeat(32) }, { bucketName: "other-bucket" },
    { methods: ["PUT"] }, { url: "https://example.com" }, { headers: { "cf-r2-jurisdiction": "default" } }, { approval: "forged" }, { agentId: "other" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare CORS core plan binds default/EU fixed GET, redaction, cleanup and replay", async () => {
  for (const jurisdiction of ["default", "eu"]) {
    const f = fixture({ jurisdiction });
    const plan = f.operation.prepare(args);
    assert.equal(plan.plan.request.r2Jurisdiction, jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(plan.plan.providerDryRun, false);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.requestedJurisdiction, jurisdiction);
    assert.deepEqual(out.value.rules[0].origins, [allowedOrigin]);
    assert.equal(f.requests[0].init.headers["cf-r2-jurisdiction"], jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${args.bucketName}/cors`);
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

test("Cloudflare CORS agent/resource/binding and lease-time revocation deny before network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = [f.operation.prepare(args).resource.id.replace(":eu:", ":default:")];
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

test("Cloudflare CORS foreign/malformed responses retain uncertain replay tombstones", async () => {
  for (const result of [{ ...row(), bucket_name: "other-bucket" }, { ...row(), jurisdiction: "default" }, { rules: [{ ...rule(), maxAgeSeconds: -1 }] }]) {
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

test("Cloudflare CORS EU header cannot escape exact path or fall back after provider denial", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { calls++; throw new Error("must-not-call"); });
  const d = r2CorsDescriptor(scope());
  const p = d.prepare(args);
  for (const path of [p.request.path + "?jurisdiction=eu", p.request.path + "/objects", p.request.path.replace("cors", "objects")]) {
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
