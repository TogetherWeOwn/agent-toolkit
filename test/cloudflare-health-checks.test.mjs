import assert from "node:assert/strict";
import test from "node:test";
import { healthCheckDescriptors } from "../dist/plugins/cloudflare-broker/src/health-checks.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const own = "Selected_ID-1";
const foreign = "unselected-id";
const scope = () => ({ accountId: account, revision: "resource-1", zoneId: zone, listIds: [own], healthcheckIds: [own] });
const row = (id = own) => ({ id, address: derivedCanary, http_config: { header: { Authorization: [credentialCanary] }, path: derivedCanary },
  tcp_config: { port: 443 }, status: "healthy", failure_reason: derivedCanary,
  zone_name: derivedCanary, default_pools: [foreign], fallback_pool: foreign, proxied: true, steering_policy: derivedCanary,
  name: derivedCanary, description: derivedCanary, notification_email: derivedCanary, header: { Authorization: [credentialCanary] },
  path: derivedCanary, expected_body: derivedCanary, expected_codes: derivedCanary, monitor: foreign, enabled: true });
const envelope = result => JSON.stringify({ success: true, errors: [], messages: [], result, result_info: { total_count: 9999 } });
const cases = [
  { key: "checksList", field: "listIds", arg: { page: 1, perPage: 100 }, suffix: "?page=1&per_page=100", resource: "checks", list: true,
    operationId: "health-checks-list-health-checks" },
  { key: "checkGet", field: "healthcheckIds", arg: { healthcheckId: own }, suffix: `/${own}`, resource: `check:${own}`,
    operationId: "health-checks-health-check-details" },
];
const name = c => `cloudflare.health_checks.${c.list ? "list" : "get"}`;
const result = c => c.list ? [row(), row(foreign)] : row();
function fixture(c, { response = envelope(result(c)), status = 200, scopes = scope(), headers = { "content-type": "application/json" }, networkFailure = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], healthCheckListIds: scopes.listIds, healthCheckIds: scopes.healthcheckIds } },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    if (networkFailure) throw new Error(derivedCanary);
    return new Response(response, { status, headers });
  });
  const operation = operations.find(op => op.name === name(c));
  let resource;
  try { resource = operation.prepare(c.arg).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (args = c.arg, key = "call-a") => broker.call(name(c), args, "verified-runtime", key) };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, "http_config", "tcp_config", "healthy", "failure_reason", "notification_email", "expected_body", "zone_name", "default_pools", "fallback_pool", "proxied", "steering_policy"]) assert.ok(!serialized.includes(value));
}

test("zone health check registry omits zone-less reads and grants nothing from ordinary/pool/monitor scopes", async () => {
  const ordinary = { accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    loadBalancingPoolListIds: [own], loadBalancingPoolIds: [own], loadBalancingMonitorListIds: [own], loadBalancingMonitorIds: [own] };
  const source = { accountId: account, revision: "resource-1" };
  const absent = cloudflareReadOperations(ordinary, source);
  for (const c of cases) assert.ok(!absent.some(op => op.name === name(c)));
  const present = cloudflareReadOperations({ ...ordinary, zone: { zoneId: zone, dnsRecordIds: [] } }, source);
  for (const c of cases) assert.throws(() => present.find(op => op.name === name(c)).prepare(c.arg), /scope/);
});

test("zone health checks accept a documented path-safe string subset and independent maximum detail scope", () => {
  const ids = Array.from({ length: 100 }, (_, i) => `Health_${i}-ID`.padEnd(32, "x"));
  const d = healthCheckDescriptors({ ...scope(), zoneId: "Zone_ID-1", listIds: [], healthcheckIds: ids });
  const p = d.checkGet.prepare({ healthcheckId: ids[99] });
  assert.equal(p.request.path, `/zones/Zone_ID-1/healthchecks/${ids[99]}`);
  assert.throws(() => d.checksList.prepare({ page: 1, perPage: 100 }), /scope/);
  assert.throws(() => healthCheckDescriptors({ ...scope(), healthcheckIds: [...ids, "excess"] }), /cap/);
  const listOnly = healthCheckDescriptors({ ...scope(), healthcheckIds: [] });
  assert.throws(() => listOnly.checkGet.prepare({ healthcheckId: own }), /scope/);
});

test("Health Checks pagination is a strict provider-correct single-page subset", async () => {
  const d = healthCheckDescriptors(scope()).checksList;
  for (const page of [1, 100]) for (const perPage of [5, 25, 100]) {
    const args = { page, perPage }, p = d.prepare(args);
    assert.equal(p.request.path, `/zones/${zone}/healthchecks?page=${page}&per_page=${perPage}`);
    const out = d.project(envelope([]), p);
    assert.equal(out.complete, false);
    const f = fixture(cases[0], { response: envelope([]) });
    assert.equal((await f.invoke(args)).ok, true); assert.equal(f.requests.length, 1);
  }
  for (const page of [undefined, 0, -0, -1, 101, 1.5, "1", NaN, Infinity]) {
    assert.throws(() => d.prepare({ page, perPage: 5 }), /schema/);
  }
  for (const perPage of [undefined, 0, 4, 6, 99, 101, 1000, 5.5, "5", NaN, Infinity]) {
    assert.throws(() => d.prepare({ page: 1, perPage }), /schema/);
  }
  const p = d.prepare({ page: 1, perPage: 5 });
  assert.throws(() => d.project(envelope(Array.from({ length: 6 }, (_, i) => ({ id: `id-${i}` }))), p), /cap/);
  for (const info of [{ page: 2 }, { per_page: 10 }, { page: "1" }, { count: -1 }, { total_count: null }]) {
    const body = JSON.parse(envelope([])); body.result_info = info;
    assert.throws(() => d.project(JSON.stringify(body), p), /upstream/);
  }
});

test("Health Checks credential filtering, audit intent outage, endpoint swaps and scope mutation", async () => {
  for (const c of cases) {
    const f = fixture(c), original = f.dependencies.credentials.resolve;
    f.dependencies.credentials.resolve = async target => ({ ...(await original(target)), redactions: [own] });
    const out = await f.invoke();
    assert.equal(out.code, "OUTPUT_REFUSED"); assert.equal(f.calls.close, 1);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    const g = fixture(c);
    g.dependencies.audit.append = async () => { throw new Error(credentialCanary); };
    assert.equal((await g.invoke()).code, "AUDIT_UNAVAILABLE");
    assert.equal(g.calls.secret, 0); assert.equal(g.requests.length, 0);
    safe(g, {});
    const h = fixture(c), other = fixture(cases.find(candidate => candidate !== c));
    await assert.rejects(() => h.operation.execute(other.operation.prepare(cases.find(candidate => candidate !== c).arg), credentialCanary, new AbortController().signal), /scope|schema/);
    assert.equal(h.requests.length, 0);
    const s = scope(), j = fixture(c, { scopes: s });
    s.listIds[0] = foreign; s.healthcheckIds[0] = foreign;
    assert.equal((await j.invoke()).ok, true);
    assert.equal(j.operation.tier, "read");
    assert.equal(j.audit[0].tool, name(c));
  }
});

for (const c of cases) {
  test(`${name(c)} refuses contradictory parent identities in envelopes and all rows`, () => {
    const d = healthCheckDescriptors(scope())[c.key], p = d.prepare(c.arg);
    for (const context of [{ account_id: "c".repeat(32) }, { zone_id: "c".repeat(32) },
      { account: { id: "c".repeat(32) } }, { zone: { id: "c".repeat(32) } }, { account: null }, { zone: {} }]) {
      const body = JSON.parse(envelope(result(c)));
      assert.throws(() => d.project(JSON.stringify({ ...body, ...context }), p), /scope|upstream/);
      for (const id of [own, foreign]) assert.throws(() => d.project(envelope(c.list ? [{ ...row(id), ...context }] : { ...row(id), ...context }), p), /scope|upstream/);
    }
  });

  if (c.list) test(`${name(c)} maximum raw bytes and 100 unique rows remain incomplete`, async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i === 0 ? own : `unselected-${i}` }));
    const body = JSON.parse(envelope(rows));
    body.padding = "";
    body.padding = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(body)));
    const raw = JSON.stringify(body);
    assert.equal(Buffer.byteLength(raw), 131072);
    const f = fixture(c, { response: raw });
    const out = await f.invoke();
    assert.equal(out.ok, true); assert.deepEqual(out.value.items, [{ id: own }]);
    assert.equal(out.value.complete, false); assert.equal(f.requests.length, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(out.value)) <= 32768);
    safe(f, out);
  });
  test(`${name(c)} snapshots its own exact scope and closed immutable prepared resource`, () => {
    const s = scope(), d = healthCheckDescriptors(s)[c.key];
    s[c.field][0] = foreign; s[c.field].push("later"); s.accountId = "b".repeat(32); s.zoneId = "c".repeat(32); s.revision = "changed";
    const p = d.prepare(c.arg);
    assert.equal(d.name, name(c));
    assert.equal(d.providerOperationId, c.operationId);
    assert.equal(p.request.path, `/zones/${zone}/healthchecks${c.suffix}`);
    assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:health-checks:${c.resource}`);
    for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d.project(envelope(result(c)), { ...p }), /scope/);
    assert.throws(() => healthCheckDescriptors(scope())[c.key].project(envelope(result(c)), p), /scope/);
    assert.throws(() => d.prepare(c.list ? { ...c.arg, per_page: 100 } : { ...c.arg, accountId: account }), /schema/);
    for (const ids of [[own, own], ["../escape"], ["bad\n"], [""], ["x".repeat(33)], [null]]) {
      assert.throws(() => healthCheckDescriptors({ ...scope(), [c.field]: ids }), /schema/);
    }
    assert.throws(() => healthCheckDescriptors({ ...scope(), [c.field]: Array(101).fill(own) }), /cap/);
  });

  test(`${name(c)} returns selected IDs only, not health, configuration or completeness`, () => {
    const d = healthCheckDescriptors(scope())[c.key], p = d.prepare(c.arg);
    const out = d.project(envelope(result(c)), p);
    const base = { subject: "configured-health-checks", effectiveHealthAndProtection: "not-established" };
    assert.deepEqual(out, c.list ? { ...base, items: [{ id: own }], complete: false } : { ...base, item: { id: own } });
    assert.ok(Object.isFrozen(out));
    assert.ok(Object.isFrozen(c.list ? out.items : out.item));
    if (c.list) {
      assert.ok(Object.isFrozen(out.items[0]));
      assert.deepEqual(d.project(envelope([]), p).items, []);
      assert.deepEqual(d.project(envelope([row(foreign)]), p).items, []);
      assert.equal(d.project(envelope([]), p).complete, false);
    }
    safe({ audit: [], journal: [] }, out);
  });

  test(`${name(c)} refuses malformed envelopes, IDs, duplicates and response caps`, () => {
    const d = healthCheckDescriptors(scope())[c.key], p = d.prepare(c.arg);
    const malformed = ["not-json", "null", "[]", "{}", envelope(null),
      JSON.stringify({ success: false, errors: [], messages: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [credentialCanary], messages: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [], result: result(c) })];
    for (const bad of [null, {}, { id: null }, { id: "../escape" }, { id: "bad\n" }, { id: "x".repeat(33) }]) {
      malformed.push(envelope(c.list ? [bad] : bad));
    }
    for (const raw of malformed) assert.throws(() => d.project(raw, p));
    if (c.list) {
      for (const rows of [[row(), row()], [row(foreign), row(foreign)]]) assert.throws(() => d.project(envelope(rows), p), /upstream/);
      assert.throws(() => d.project(envelope(Array(101).fill(row())), p), /cap/);
      for (const info of [undefined, null, []]) assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], messages: [], result: [], result_info: info }), p), /upstream/);
    } else {
      assert.throws(() => d.project(envelope(row(foreign)), p), /scope/);
      assert.throws(() => d.project(envelope([]), p), /upstream/);
    }
    assert.throws(() => d.project(envelope({ padding: "x".repeat(131072) }), p), /cap/);
  });

  test(`${name(c)} default-empty and independent endpoint scopes deny before credentials`, async () => {
    for (const s of [{}, { ...scope(), [c.field]: [] }]) {
      const f = fixture(c, { scopes: s });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ accountId: account }, { page: 101 }, { perPage: 6 }, { monitor: own }, { url: "https://example.com" },
      { headers: {} }, { approval: "forged" }, { agentId: "other" }, c.list ? { id: foreign } : { ["healthcheckId"]: foreign }]) {
      const f = fixture(c);
      assert.equal((await f.invoke({ ...c.arg, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  if (c.list) test(`${name(c)} core-compatible maximum list selection succeeds and excess scope refuses`, async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`.padEnd(32, "x"));
    const scopes = { ...scope(), [c.field]: ids.slice(0, 64) };
    const f = fixture(c, { scopes, response: envelope(ids.map(id => ({ id }))) });
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.deepEqual(out.value.items, ids.slice(0, 64).map(id => ({ id })));
    assert.equal(out.value.complete, false);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal(f.calls.close, 1); assert.equal(f.requests.length, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    safe(f, out);
    assert.throws(() => healthCheckDescriptors({ ...scope(), [c.field]: ids.slice(0, 65) }), /cap/);
    assert.throws(() => fixture(c, { scopes: { ...scope(), [c.field]: ids.slice(0, 65) } }), /cap/);
  });

  test(`${name(c)} actual-core exact GET plan, audit, journal, cleanup and replay`, async () => {
    const f = fixture(c), p = f.operation.prepare(c.arg);
    assert.deepEqual(p, { resource: { id: `cloudflare:account:${account}:zone:${zone}:health-checks:${c.resource}`, revision: "resource-1" },
      arguments: c.arg, plan: { kind: "bounded-current-read", providerOperationId: c.operationId,
        request: { method: "GET", path: `/zones/${zone}/healthchecks${c.suffix}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" },
        providerDryRun: false, providerRevisionFence: "not-established" }, artifactDigest: null });
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
    assert.equal(f.audit[1].targetHash, f.audit[0].targetHash);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1);
    safe(f, out);
  });

  test(`${name(c)} current agent/resource/ownership and lease-time revocation deny network`, async () => {
    for (const denied of ["agent", "resource", "account", "zone", "pool", "monitor", "ordinary-zone", "binding", "revocation"]) {
      const f = fixture(c);
      if (denied === "agent") f.vector.policy.agents = ["other-agent"];
      if (denied === "resource") f.vector.policy.resources = ["other-resource"];
      const resource = f.operation.prepare(c.arg).resource.id;
      if (denied === "account") f.vector.policy.resources = [resource.replace(`account:${account}`, `account:${"c".repeat(32)}`)];
      if (denied === "zone") f.vector.policy.resources = [resource.replace(`zone:${zone}`, `zone:${"c".repeat(32)}`)];
      if (denied === "pool" || denied === "monitor") f.vector.policy.resources = [`cloudflare:account:${account}:load-balancing:${denied}:${own}`];
      if (denied === "ordinary-zone") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}`];
      if (denied === "binding") f.dependencies.host.revalidate = async () => false;
      if (denied === "revocation") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
      }
      const out = await f.invoke();
      assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
      assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
      assert.equal(f.calls.close, denied === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0);
      safe(f, out);
    }
  });

  test(`${name(c)} prepared argument/resource/plan tampering and forged receipts refuse`, async () => {
    const f = fixture(c), p = f.operation.prepare(c.arg);
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; },
      p => { p.plan.request.path += "/other"; }, p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.page = 101; }]) {
      const changed = structuredClone(p); mutate(changed);
      await assert.rejects(() => f.operation.execute(changed, credentialCanary, new AbortController().signal), /scope|schema/);
    }
    assert.throws(() => f.operation.project({}), /scope/); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} transport/projection/audit failures retain uncertain journal and replay denial`, async () => {
    for (const options of [{ response: "not-json" }, { status: 403 }, { status: 404 }, { status: 302 },
      { headers: { "content-type": "text/html" } }, { response: "x".repeat(131073) }, { networkFailure: true },
      { response: envelope(c.list ? [row(), row()] : row(foreign)) }, { auditFailure: true }]) {
      const f = fixture(c, options), append = f.dependencies.audit.append;
      if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
      const out = await f.invoke();
      assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
      assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
      const journal = structuredClone([...f.journal]);
      if (options.auditFailure) {
        assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); f.dependencies.audit.append = append;
      }
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
      assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1); assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal); safe(f, out);
    }
  });
}
