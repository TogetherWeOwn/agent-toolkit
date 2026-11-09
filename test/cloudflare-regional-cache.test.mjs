import assert from "node:assert/strict";
import test from "node:test";
import { regionalCacheDescriptor } from "../dist/plugins/cloudflare-broker/src/regional-cache.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const name = "cloudflare.cache.regional.get";
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", readAllowed: true });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const row = () => ({ id: "tc_regional", value: "on", editable: true, modified_on: derivedCanary,
  owner: credentialCanary, unrelated: { token: credentialCanary } });
function fixture({ readAllowed = true, response = row(), status = 200, noZone = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], regionalCacheReadAllowed: readAllowed } }) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === name);
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations, invoke: (args = {}, key = "call-a") => broker.call(name, args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "editable", "modified_on", "owner", "unrelated"]) assert.ok(!data.includes(value));
}

test("Cloudflare regional cache snapshots independent trusted scope and authenticates prepared projections", () => {
  const s = scope();
  const d = regionalCacheDescriptor(s);
  s.accountId = foreign;
  s.zoneId = foreign;
  s.readAllowed = false;
  const p = d.prepare({});
  assert.equal(p.request.path, `/zones/${zone}/cache/regional_tiered_cache`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:regional-tiered-cache`);
  assert.equal(p.resource.revision, "resource-1");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  assert.throws(() => regionalCacheDescriptor(scope()).project(success(row()), p), /scope/);
  for (const readAllowed of [null, 1, "true", [], {}]) assert.throws(() => regionalCacheDescriptor({ ...scope(), readAllowed }), /schema/);
  for (const field of ["accountId", "zoneId", "revision"]) assert.throws(() => regionalCacheDescriptor({ ...scope(), [field]: "bad/identity" }), /schema/);
});

test("Cloudflare regional cache projects only exact configured on/off values without defaults or effective claims", () => {
  const d = regionalCacheDescriptor(scope());
  const p = d.prepare({});
  for (const value of ["off", "on"]) {
    const out = d.project(success({ ...row(), value }), p);
    assert.deepEqual(out, { configuredValue: value, subject: "configured-regional-tiered-cache", effectiveCacheBehavior: "not-established" });
    assert.ok(Object.isFrozen(out));
    for (const canary of [credentialCanary, derivedCanary, "editable", "modified_on", "owner"]) assert.ok(!JSON.stringify(out).includes(canary));
  }
  for (const value of [undefined, null, true, false, 0, 1, "ON", "", "auto", [], {}]) {
    assert.throws(() => d.project(success({ ...row(), value }), p), /upstream/);
  }
});

test("Cloudflare regional cache rejects wrong setting identity, foreign context, malformed envelopes and bounds", () => {
  const d = regionalCacheDescriptor(scope());
  const p = d.prepare({});
  for (const patch of [{ account_id: foreign }, { zone_id: foreign }]) {
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], messages: [], result: row(), ...patch }), p), /scope/);
    assert.throws(() => d.project(success({ ...row(), ...patch }), p), /scope/);
  }
  for (const id of [undefined, null, "regional_tiered_cache", "cache_reserve", foreign, 1, {}, []]) {
    assert.throws(() => d.project(success({ ...row(), id }), p), /upstream/);
  }
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: true, errors: [], result: row() }), JSON.stringify({ success: false, errors: [], messages: [], result: row() }),
    JSON.stringify({ success: true, errors: [credentialCanary], messages: [], result: row() })]) assert.throws(() => d.project(raw, p), /upstream/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare regional cache defaults denied, isolates family scopes and refuses overrides before credentials", async () => {
  assert.ok(!fixture({ noZone: true }).operations.some(op => op.name === name));
  assert.throws(() => regionalCacheDescriptor({ accountId: account, zoneId: zone, revision: "resource-1" }).prepare({}), /scope/);
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], zoneHoldReadAllowed: true, dnsSettingsReadAllowed: true, tlsSettingIds: ["ssl"] } },
  { accountId: account, revision: "resource-1" });
  assert.throws(() => operations.find(op => op.name === name).prepare({}), /scope/);
  const allowed = fixture();
  assert.throws(() => allowed.operations.find(op => op.name === "cloudflare.zones.hold.get").prepare({}), /scope/);
  assert.throws(() => allowed.operations.find(op => op.name === "cloudflare.tls.zone.get").prepare({ settingId: "ssl" }), /scope/);
  const denied = fixture({ readAllowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  assert.equal(denied.requests.length, 0);
  for (const args of [{ accountId: foreign }, { zoneId: foreign }, { readAllowed: true }, { value: "off" },
    { headers: {} }, { page: 2 }, { approval: "forged" }, { settingId: "tc_regional" }]) {
    const f = fixture();
    assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare regional cache actual-core fixed GET preserves safe output, audit, cleanup and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare({});
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "zone-cache-settings-get-regional-tiered-cache-setting");
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.equal(out.value.configuredValue, "on");
  assert.equal(out.value.effectiveCacheBehavior, "not-established");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/cache/regional_tiered_cache`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare regional cache current agent, resource, binding and lease-time revocation deny network", async () => {
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

test("Cloudflare regional cache upstream and outcome audit failures preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: { ...row(), id: "cache_reserve" } }]) {
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

test("Cloudflare regional cache rejects prepared resource, revision, argument and plan swaps before transport", async () => {
  for (const change of [p => ({ ...p, resource: { ...p.resource, id: `cloudflare:account:${account}:zone:${foreign}:regional-tiered-cache` } }),
    p => ({ ...p, resource: { ...p.resource, revision: "other-revision" } }),
    p => ({ ...p, arguments: { zoneId: foreign } }), p => ({ ...p, plan: { ...p.plan, providerOperationId: "zones-get" } })]) {
    const f = fixture();
    await assert.rejects(f.operation.execute(change(f.operation.prepare({})), credentialCanary, new AbortController().signal), /scope|schema/);
    assert.equal(f.requests.length, 0);
  }
});
