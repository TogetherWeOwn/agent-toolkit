import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { cacheSettingsDescriptors } from "../dist/plugins/cloudflare-broker/src/cache-settings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const cases = [
  { key: "reserveGet", name: "cloudflare.cache.reserve.get", flag: "cacheReserveReadAllowed", permission: "reserveReadAllowed",
    id: "cache_reserve", suffix: "cache-reserve", subject: "configured-cache-reserve", operationId: "zone-cache-settings-get-cache-reserve-setting" },
  { key: "smartTieredGet", name: "cloudflare.cache.smart_tiered.get", flag: "smartTieredCacheReadAllowed", permission: "smartTieredReadAllowed",
    id: "tiered_cache_smart_topology_enable", suffix: "smart-tiered-cache", subject: "configured-smart-tiered-cache", operationId: "smart-tiered-cache-get-smart-tiered-cache-setting" },
];
const scope = c => ({ accountId: account, zoneId: zone, revision: "resource-1", [c.permission]: true });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const row = c => ({ id: c.id, value: "on", editable: true, modified_on: derivedCanary,
  owner: credentialCanary, origin_ip: derivedCanary, unrelated: { token: credentialCanary } });
function fixture(c, { allowed = true, response = row(c), raw, status = 200, noZone = false, flags = {} } = {}) {
  const f = providerFixture();
  const requests = [];
  const trusted = { accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], [c.flag]: allowed, ...flags } }) };
  const operations = cloudflareReadOperations(trusted, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(raw ?? success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === c.name);
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations, trusted,
    invoke: (args = {}, key = "call-a") => broker.call(c.name, args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "editable", "modified_on", "origin_ip", "owner", "unrelated"]) assert.ok(!data.includes(value));
}

for (const c of cases) {
  test(`${c.name} snapshots independent scope and authenticates frozen prepared projections`, () => {
    const s = scope(c);
    const d = cacheSettingsDescriptors(s)[c.key];
    s.accountId = foreign;
    s.zoneId = foreign;
    s.revision = "revoked";
    s[c.permission] = false;
    const p = d.prepare({});
    assert.equal(p.request.path, `/zones/${zone}/cache/${c.id}`);
    assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:${c.suffix}`);
    assert.equal(p.resource.revision, "resource-1");
    assert.deepEqual(p.request, { method: "GET", path: `/zones/${zone}/cache/${c.id}`, maxResponseBytes: 131072,
      timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d.project(success(row(c)), { ...p }), /scope/);
    assert.throws(() => cacheSettingsDescriptors(scope(c))[c.key].project(success(row(c)), p), /scope/);
    const other = cases.find(item => item !== c);
    assert.throws(() => cacheSettingsDescriptors({ ...scope(c), [other.permission]: true })[other.key].project(success(row(other)), p), /scope/);
    for (const permission of [null, 1, "true", [], {}]) assert.throws(() => cacheSettingsDescriptors({ ...scope(c), [c.permission]: permission }), /schema/);
    for (const field of ["accountId", "zoneId", "revision"]) for (const value of ["bad/identity", "a\n", "é", ""]) {
      assert.throws(() => cacheSettingsDescriptors({ ...scope(c), [field]: value }), /schema/);
    }
  });

  test(`${c.name} preserves required identity/value/editable semantics and omits all other data`, () => {
    const d = cacheSettingsDescriptors(scope(c))[c.key];
    const p = d.prepare({});
    for (const value of ["off", "on"]) for (const editable of [true, false]) {
      const out = d.project(success({ ...row(c), value, editable }), p);
      assert.deepEqual(out, { configuredValue: value, subject: c.subject, effectiveCacheBehavior: "not-established",
        performance: "not-established", entitlements: "not-established" });
      assert.ok(Object.isFrozen(out));
      safe({ audit: [], journal: [] }, out);
    }
    for (const value of [undefined, null, true, false, 0, 1, "ON", "", "auto", [], {}]) {
      assert.throws(() => d.project(success({ ...row(c), value }), p), /upstream/);
    }
    for (const editable of [undefined, null, "true", 1, [], {}]) assert.throws(() => d.project(success({ ...row(c), editable }), p), /upstream/);
    for (const id of [undefined, null, "tc_regional", cases.find(item => item !== c).id, foreign, 1, {}, []]) {
      assert.throws(() => d.project(success({ ...row(c), id }), p), /upstream/);
    }
    const minimal = { id: c.id, value: "off", editable: false };
    assert.equal(d.project(success(minimal), p).configuredValue, "off");
  });

  test(`${c.name} refuses foreign contexts, malformed envelopes and byte overflow`, () => {
    const d = cacheSettingsDescriptors(scope(c))[c.key];
    const p = d.prepare({});
    for (const patch of [{ account_id: foreign }, { zone_id: foreign }, { account_id: null }, { zone_id: {} }]) {
      assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], messages: [], result: row(c), ...patch }), p), /scope/);
      assert.throws(() => d.project(success({ ...row(c), ...patch }), p), /scope/);
    }
    assert.equal(d.project(JSON.stringify({ success: true, errors: [], messages: [], account_id: account, zone_id: zone,
      result: { ...row(c), account_id: account, zone_id: zone } }), p).configuredValue, "on");
    for (const raw of ["null", "not-json", "[]", "{}", success(null), success([]), JSON.stringify({ success: true, result: row(c) }),
      JSON.stringify({ success: true, errors: [], result: row(c) }), JSON.stringify({ success: false, errors: [], messages: [], result: row(c) }),
      JSON.stringify({ success: true, errors: [credentialCanary], messages: [], result: row(c) }),
      JSON.stringify({ success: true, errors: [], messages: {}, result: row(c) })]) assert.throws(() => d.project(raw, p), /upstream/);
    const base = success({ id: c.id, value: "on", editable: true, padding: "" });
    const atCap = base.replace('"padding":""', `"padding":"${"x".repeat(131072 - Buffer.byteLength(base))}"`);
    assert.equal(Buffer.byteLength(atCap), 131072);
    assert.equal(d.project(atCap, p).configuredValue, "on");
    assert.throws(() => d.project(atCap + " ", p), /cap/);
    assert.throws(() => d.project(success({ ...row(c), padding: "é".repeat(65536) }), p), /cap/);
  });

  test(`${c.name} defaults denied and never inherits other cache or zone permissions`, async () => {
    assert.ok(!fixture(c, { noZone: true }).operations.some(op => op.name === c.name));
    assert.throws(() => cacheSettingsDescriptors({ accountId: account, zoneId: zone, revision: "resource-1" })[c.key].prepare({}), /scope/);
    const other = cases.find(item => item !== c);
    const denied = fixture(c, { allowed: false, flags: { [other.flag]: true, regionalCacheReadAllowed: true,
      zoneHoldReadAllowed: true, dnsSettingsReadAllowed: true, tlsSettingIds: ["ssl"] } });
    assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(denied.calls.secret, 0);
    assert.equal(denied.requests.length, 0);
    const allowed = fixture(c);
    for (const name of [other.name, "cloudflare.cache.regional.get", "cloudflare.zones.hold.get"]) {
      assert.throws(() => allowed.operations.find(op => op.name === name).prepare({}), /scope/);
    }
    allowed.trusted.zone[c.flag] = false;
    allowed.trusted.zone.zoneId = foreign;
    assert.equal(allowed.operation.prepare({}).resource.id, `cloudflare:account:${account}:zone:${zone}:${c.suffix}`);
    for (const args of [{ accountId: foreign }, { zoneId: foreign }, { readAllowed: true }, { value: "off" },
      { headers: {} }, { url: "https://example.com" }, { page: 2 }, { approval: "forged" }, { settingId: c.id }]) {
      const f = fixture(c);
      assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  });

  test(`${c.name} actual-core exact fixed GET preserves audit, cleanup, journal and replay`, async () => {
    const f = fixture(c);
    const p = f.operation.prepare({});
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, c.operationId);
    assert.equal(f.operation.tier, "read");
    assert.equal(f.operation.timeoutMs, 10000);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.configuredValue, "on");
    assert.equal(out.value.entitlements, "not-established");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/cache/${c.id}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  });

  test(`${c.name} exact policy resources, agent, binding and revocation deny before network`, async () => {
    for (const denied of ["agent", "resource", "other-cache", "regional", "wildcard", "binding", "revocation"]) {
      const f = fixture(c);
      if (denied === "agent") f.vector.policy.agents = ["other-agent"];
      if (denied === "resource") f.vector.policy.resources = ["other-resource"];
      if (denied === "other-cache") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}:${cases.find(item => item !== c).suffix}`];
      if (denied === "regional") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}:regional-tiered-cache`];
      if (denied === "wildcard") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}:*`];
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

  test(`${c.name} upstream, audit and cleanup failures retain uncertain replay tombstones`, async () => {
    for (const options of [{ status: 302 }, { status: 403 }, { status: 404 }, { status: 500 }, { auditFailure: true },
      { cleanupFailure: true }, { response: { ...row(c), id: "tc_regional" } }]) {
      const f = fixture(c, options);
      const append = f.dependencies.audit.append;
      if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
      if (options.cleanupFailure) {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => {
          const lease = await resolve(target);
          return { ...lease, close: async () => { await lease.close(); throw new Error(credentialCanary); } };
        };
      }
      const out = await f.invoke();
      assert.equal(out.ok, false);
      assert.equal(out.code, options.auditFailure || options.cleanupFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
      assert.equal([...f.journal.values()][0].outcome, "uncertain");
      // The reviewed core attempts cleanup again in its failure handler.
      const closes = options.cleanupFailure ? 2 : 1;
      assert.equal(f.calls.close, closes);
      const journal = structuredClone([...f.journal]);
      f.dependencies.audit.append = append;
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.calls.close, closes);
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      safe(f, out);
    }
  });

  test(`${c.name} intent audit and journal outages refuse before credential acquisition`, async () => {
    for (const failure of ["audit", "journal"]) {
      const f = fixture(c);
      if (failure === "audit") f.dependencies.audit.append = async () => { throw new Error(credentialCanary); };
      else f.dependencies.journal.claim = async () => { throw new Error(credentialCanary); };
      const out = await f.invoke();
      assert.equal(out.ok, false);
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
      safe(f, out);
    }
  });

  test(`${c.name} rejects prepared resource, revision, argument, digest and plan swaps`, async () => {
    for (const change of [p => ({ ...p, resource: { ...p.resource, id: `cloudflare:account:${account}:zone:${foreign}:${c.suffix}` } }),
      p => ({ ...p, resource: { ...p.resource, revision: "other-revision" } }), p => ({ ...p, arguments: { zoneId: foreign } }),
      p => ({ ...p, artifactDigest: "f".repeat(64) }), p => ({ ...p, plan: { ...p.plan, providerOperationId: cases.find(item => item !== c).operationId } }),
      p => ({ ...p, plan: { ...p.plan, request: { ...p.plan.request, timeoutMs: 20000 } } })]) {
      const f = fixture(c);
      await assert.rejects(f.operation.execute(change(f.operation.prepare({})), credentialCanary, new AbortController().signal), /scope|schema/);
      assert.equal(f.requests.length, 0);
    }
  });
}

test("Cloudflare cache-settings ledger has exactly the two disabled descriptor rows with registry parity", async () => {
  const rows = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8")).trimEnd().split("\n").map(JSON.parse);
  for (const c of cases) {
    const matches = rows.filter(row => row.operationId === c.operationId);
    assert.equal(matches.length, 1);
    const r = matches[0];
    assert.equal(r.key, `GET /zones/{zone_id}/cache/${c.id}`);
    assert.equal(r.typedTool, c.name);
    assert.equal(r.implementation, "descriptor-only");
    assert.equal(r.tier, "read");
    assert.equal(r.credentialScope, "unknown");
    assert.equal(r.enablement, "disabled");
    assert.equal(r.review, "not-reviewed");
    assert.ok(r.tests.includes("test/cloudflare-cache-settings.test.mjs"));
    const f = fixture(c);
    assert.equal(f.operations.filter(op => op.name === c.name).length, 1);
    assert.equal(f.operation.prepare({}).plan.providerOperationId, r.operationId);
  }
});
