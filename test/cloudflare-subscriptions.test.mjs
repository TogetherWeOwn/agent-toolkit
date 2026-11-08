import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionDescriptors } from "../dist/plugins/cloudflare-broker/src/subscriptions.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const subscriptionId = "b".repeat(32);
const zoneId = "c".repeat(32);
const foreign = "f".repeat(32);
const args = { subscriptionId };
const tools = ["cloudflare.subscriptions.list", "cloudflare.subscriptions.get"];
const scope = () => ({ accountId: account, revision: "resource-1", subscriptions: [{ subscriptionId, ratePlanId: "workers-paid", zoneId }] });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const row = () => ({ id: subscriptionId, rate_plan: { id: "workers-paid", public_name: credentialCanary, sets: [derivedCanary], is_contract: true },
  zone: { id: zoneId, name: derivedCanary }, state: "Paid", frequency: "monthly", price: 99, currency: "USD",
  component_values: [{ name: credentialCanary, value: 99 }], app: { install_id: derivedCanary }, current_period_end: derivedCanary });
function fixture({ list = false, subscriptions = scope().subscriptions, result = row(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [], subscriptions },
    { accountId: account, revision: "resource-1" }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(success(list ? [result] : result), { status, headers: { "content-type": "application/json" } });
    });
  const tool = tools[list ? 0 : 1];
  const raw = list ? {} : args;
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(raw).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, raw, requests, invoke: (input = raw, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "public_name", "component_values", "current_period_end"]) assert.ok(!data.includes(value));
}

test("Cloudflare subscription scope copies exact plan and zone associations independently", () => {
  const s = scope();
  const d = subscriptionDescriptors(s);
  s.accountId = foreign;
  s.subscriptions[0].ratePlanId = "changed";
  s.subscriptions[0].zoneId = foreign;
  s.subscriptions.push({ subscriptionId: foreign, ratePlanId: "free", zoneId: null });
  const p = d.subscriptionGet.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/subscriptions/${subscriptionId}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:subscriptions:${subscriptionId}:plan:workers-paid:zone:${zoneId}`);
  for (const value of [d, d.subscriptionGet, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.equal(d.subscriptionGet.project(success(row()), p).ratePlanId, "workers-paid");
  assert.throws(() => d.subscriptionGet.prepare({ subscriptionId: foreign }), /scope/);
  assert.throws(() => d.subscriptionGet.project(success(row()), { ...p }), /scope/);
  assert.throws(() => d.subscriptionsList.project(success([row()]), p), /scope/);
  for (const subscriptions of [[...scope().subscriptions, ...scope().subscriptions], [{ subscriptionId, ratePlanId: "bad\n", zoneId }],
    [{ subscriptionId, ratePlanId: "free", zoneId: undefined }], [{ subscriptionId: "../escape", ratePlanId: "free", zoneId: null }]]) {
    assert.throws(() => subscriptionDescriptors({ ...scope(), subscriptions }), /schema/);
  }
  assert.throws(() => subscriptionDescriptors({ ...scope(), subscriptions: Array(101).fill(scope().subscriptions[0]) }), /cap/);
});

test("Cloudflare subscriptions project only selected configured metadata, not cost or effective limits", () => {
  const d = subscriptionDescriptors(scope());
  const out = d.subscriptionsList.project(success([row(), { id: foreign, price: credentialCanary }]), d.subscriptionsList.prepare({}));
  assert.deepEqual(out, { subscriptions: [{ subscriptionId, ratePlanId: "workers-paid", zoneId, state: "Paid", frequency: "monthly",
    subject: "configured-subscription", effectiveEntitlements: "not-established", effectiveLimits: "not-established", cost: "not-projected" }], complete: false });
  for (const value of [out, out.subscriptions, out.subscriptions[0]]) assert.ok(Object.isFrozen(value));
  for (const value of [credentialCanary, derivedCanary, foreign, "price", "currency", "contract"]) assert.ok(!JSON.stringify(out).includes(value));
  const missing = d.subscriptionGet.project(success({ ...row(), state: undefined, frequency: undefined }), d.subscriptionGet.prepare(args));
  assert.deepEqual(missing.state, { unavailable: "not-returned" });
  assert.deepEqual(missing.frequency, { unavailable: "not-returned" });
  const accountOnly = subscriptionDescriptors({ ...scope(), subscriptions: [{ subscriptionId, ratePlanId: "workers-paid", zoneId: null }] });
  for (const zone of [null, { id: null, name: credentialCanary }]) {
    assert.equal(accountOnly.subscriptionGet.project(success({ ...row(), zone }), accountOnly.subscriptionGet.prepare(args)).zoneId, null);
  }
  assert.deepEqual(d.subscriptionsList.project(success([]), d.subscriptionsList.prepare({})), { subscriptions: [], complete: false });
});

test("Cloudflare subscription malformed, duplicate, foreign and bounded responses refuse", () => {
  const d = subscriptionDescriptors(scope());
  const p = d.subscriptionGet.prepare(args);
  for (const patch of [{ id: foreign }, { account_id: foreign }, { account: { id: foreign } }, { rate_plan: { id: "changed" } }, { zone: { id: foreign } }, { zone: null }]) {
    assert.throws(() => d.subscriptionGet.project(success({ ...row(), ...patch }), p), /scope/);
  }
  for (const patch of [{ rate_plan: undefined }, { zone: undefined }, { state: null }, { state: "paid" }, { frequency: 1 }, { frequency: "daily" }]) {
    assert.throws(() => d.subscriptionGet.project(success({ ...row(), ...patch }), p), /upstream/);
  }
  for (const raw of ["not-json", "null", "{}", success(null), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: [credentialCanary], result: row() })]) {
    assert.throws(() => d.subscriptionGet.project(raw, p), /upstream/);
  }
  const l = d.subscriptionsList.prepare({});
  assert.throws(() => d.subscriptionsList.project(success([row(), row()]), l), /upstream/);
  assert.throws(() => d.subscriptionsList.project(success([{ id: foreign, account_id: foreign }]), l), /scope/);
  assert.throws(() => d.subscriptionsList.project(success(Array(1001).fill({ id: foreign })), l), /cap/);
  assert.throws(() => d.subscriptionGet.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
  assert.throws(() => d.subscriptionGet.project(JSON.stringify({ success: true, errors: [], account_id: foreign, result: row() }), p), /scope/);
});

test("Cloudflare subscription default-empty policy and model overrides refuse before credentials", async () => {
  for (const list of [false, true]) {
    const empty = fixture({ list, subscriptions: [] });
    assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(empty.calls.secret, 0);
    assert.equal(empty.requests.length, 0);
    for (const patch of [{ accountId: foreign }, { zoneId }, { ratePlanId: "free" }, { price: 0 }, { page: 2 },
      { headers: {} }, { approval: "forged" }, { agentId: "other" }, { subscriptionId: foreign }]) {
      const f = fixture({ list });
      assert.equal((await f.invoke({ ...f.raw, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare subscription actual-core fixed GET and exact plan retain cleanup, audit and replay", async () => {
  for (const list of [false, true]) {
    const f = fixture({ list });
    const p = f.operation.prepare(f.raw);
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.request.path, `/accounts/${account}/subscriptions${list ? "" : `/${subscriptionId}`}`);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(list ? out.value.subscriptions[0].state : out.value.state, "Paid");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare subscription current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const list of [false, true]) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture({ list });
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

test("Cloudflare subscription changed associations and denied reads preserve uncertain replay state", async () => {
  for (const list of [false, true]) for (const options of [{ result: { ...row(), rate_plan: { id: "changed" } } },
    { result: { ...row(), zone: { id: foreign } } }, { result: { ...row(), state: "unknown" } }, { status: 403 }, { status: 404 }]) {
    const f = fixture({ list, ...options });
    const out = await f.invoke();
    assert.equal(out.code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare subscription selected output cap refuses rather than claiming truncated completeness", () => {
  const entries = Array.from({ length: 100 }, (_, i) => ({ subscriptionId: i.toString(16).padStart(32, "0"), ratePlanId: "p".repeat(80), zoneId }));
  const d = subscriptionDescriptors({ ...scope(), subscriptions: entries });
  const rows = entries.map(entry => ({ ...row(), id: entry.subscriptionId, rate_plan: { id: entry.ratePlanId } }));
  assert.throws(() => d.subscriptionsList.project(success(rows), d.subscriptionsList.prepare({})), /cap/);
});
