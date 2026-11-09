import assert from "node:assert/strict";
import test from "node:test";
import { loadBalancingDescriptors } from "../dist/plugins/cloudflare-broker/src/load-balancing.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const own = "Selected_ID-1";
const foreign = "unselected-id";
const scope = () => ({ accountId: account, revision: "resource-1", poolListIds: [own], poolIds: [own], monitorListIds: [own], monitorIds: [own] });
const row = (id = own) => ({ id, origins: [{ address: derivedCanary, header: { Host: [derivedCanary] } }],
  name: derivedCanary, description: derivedCanary, notification_email: derivedCanary, header: { Authorization: [credentialCanary] },
  path: derivedCanary, expected_body: derivedCanary, expected_codes: derivedCanary, monitor: foreign, enabled: true });
const envelope = result => JSON.stringify({ success: true, errors: [], messages: [], result, result_info: { total_count: 9999 } });
const cases = [
  { key: "poolsList", family: "pools", field: "poolListIds", arg: {}, suffix: "", resource: "pools", list: true,
    operationId: "account-load-balancer-pools-list-pools" },
  { key: "poolGet", family: "pools", field: "poolIds", arg: { poolId: own }, suffix: `/${own}`, resource: `pool:${own}`,
    operationId: "account-load-balancer-pools-pool-details" },
  { key: "monitorsList", family: "monitors", field: "monitorListIds", arg: {}, suffix: "", resource: "monitors", list: true,
    operationId: "account-load-balancer-monitors-list-monitors" },
  { key: "monitorGet", family: "monitors", field: "monitorIds", arg: { monitorId: own }, suffix: `/${own}`, resource: `monitor:${own}`,
    operationId: "account-load-balancer-monitors-monitor-details" },
];
const name = c => `cloudflare.load_balancing.${c.family}.${c.list ? "list" : "get"}`;
const result = c => c.list ? [row(), row(foreign)] : row();
function fixture(c, { response = envelope(result(c)), status = 200, scopes = scope(), headers = { "content-type": "application/json" }, networkFailure = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    loadBalancingPoolListIds: scopes.poolListIds, loadBalancingPoolIds: scopes.poolIds,
    loadBalancingMonitorListIds: scopes.monitorListIds, loadBalancingMonitorIds: scopes.monitorIds },
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
  for (const value of [credentialCanary, derivedCanary, foreign, "origins", "notification_email", "expected_body"]) assert.ok(!serialized.includes(value));
}

for (const c of cases) {
  test(`${name(c)} snapshots its own exact scope and closed immutable prepared resource`, () => {
    const s = scope(), d = loadBalancingDescriptors(s)[c.key];
    s[c.field][0] = foreign; s[c.field].push("later"); s.accountId = "b".repeat(32); s.revision = "changed";
    const p = d.prepare(c.arg);
    assert.equal(d.name, name(c));
    assert.equal(d.providerOperationId, c.operationId);
    assert.equal(p.request.path, `/accounts/${account}/load_balancers/${c.family}${c.suffix}`);
    assert.equal(p.resource.id, `cloudflare:account:${account}:load-balancing:${c.resource}`);
    for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d.project(envelope(result(c)), { ...p }), /scope/);
    assert.throws(() => loadBalancingDescriptors(scope())[c.key].project(envelope(result(c)), p), /scope/);
    assert.throws(() => d.prepare(c.list ? { page: 1 } : { ...c.arg, accountId: account }), /schema/);
    for (const ids of [[own, own], ["../escape"], ["bad\n"], [""], ["x".repeat(129)], [null]]) {
      assert.throws(() => loadBalancingDescriptors({ ...scope(), [c.field]: ids }), /schema/);
    }
    assert.throws(() => loadBalancingDescriptors({ ...scope(), [c.field]: Array(101).fill(own) }), /cap/);
  });

  test(`${name(c)} returns selected IDs only, not health, configuration or completeness`, () => {
    const d = loadBalancingDescriptors(scope())[c.key], p = d.prepare(c.arg);
    const out = d.project(envelope(result(c)), p);
    const base = { subject: `configured-load-balancer-${c.family}`, effectiveTrafficAndHealth: "not-established" };
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
    const d = loadBalancingDescriptors(scope())[c.key], p = d.prepare(c.arg);
    const malformed = ["not-json", "null", "[]", "{}", envelope(null),
      JSON.stringify({ success: false, errors: [], messages: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [credentialCanary], messages: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [], result: result(c) })];
    for (const bad of [null, {}, { id: null }, { id: "../escape" }, { id: "bad\n" }, { id: "x".repeat(129) }]) {
      malformed.push(envelope(c.list ? [bad] : bad));
    }
    for (const raw of malformed) assert.throws(() => d.project(raw, p));
    if (c.list) {
      for (const rows of [[row(), row()], [row(foreign), row(foreign)]]) assert.throws(() => d.project(envelope(rows), p), /upstream/);
      assert.throws(() => d.project(envelope(Array(1001).fill(row())), p), /cap/);
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
    for (const patch of [{ accountId: account }, { page: 2 }, { perPage: 10 }, { monitor: own }, { url: "https://example.com" },
      { headers: {} }, { approval: "forged" }, { agentId: "other" }, c.list ? { id: foreign } : { [c.family === "pools" ? "poolId" : "monitorId"]: foreign }]) {
      const f = fixture(c);
      assert.equal((await f.invoke({ ...c.arg, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} actual-core exact GET plan, audit, journal, cleanup and replay`, async () => {
    const f = fixture(c), p = f.operation.prepare(c.arg);
    assert.deepEqual(p, { resource: { id: `cloudflare:account:${account}:load-balancing:${c.resource}`, revision: "resource-1" },
      arguments: c.arg, plan: { kind: "bounded-current-read", providerOperationId: c.operationId,
        request: { method: "GET", path: `/accounts/${account}/load_balancers/${c.family}${c.suffix}`,
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
    for (const denied of ["agent", "resource", "binding", "revocation"]) {
      const f = fixture(c);
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
      assert.equal(f.calls.close, denied === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0);
      safe(f, out);
    }
  });

  test(`${name(c)} prepared argument/resource/plan tampering and forged receipts refuse`, async () => {
    const f = fixture(c), p = f.operation.prepare(c.arg);
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; },
      p => { p.plan.request.path += "/other"; }, p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.page = 2; }]) {
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
