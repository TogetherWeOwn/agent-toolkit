import assert from "node:assert/strict";
import test from "node:test";
import { zonePlanDescriptors } from "../dist/plugins/cloudflare-broker/src/zone-plans.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const plan = "c".repeat(32);
const foreign = "f".repeat(32);
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", listPlanIds: [plan], planIds: [plan] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ id: plan, can_subscribe: true, is_subscribed: false, price: credentialCanary,
  currency: derivedCanary, name: credentialCanary, legacy_id: foreign, externally_managed: true });
const expected = { planId: plan, canSubscribe: true, isSubscribed: false,
  subject: "provider-reported-available-plan", effectiveEntitlements: "not-established", cost: "not-projected" };
const cases = [
  ["plansList", "cloudflare.zones.available_plans.list", {}, rows => rows, ""],
  ["planGet", "cloudflare.zones.available_plans.get", { planId: plan }, rows => rows[0], `/${plan}`],
];
function fixture(entry, { listPlanIds = [plan], planIds = [plan], response = entry[3]([row()]), status = 200 } = {}) {
  const f = providerFixture(); const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], availablePlanListIds: listPlanIds, availablePlanIds: planIds } },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === entry[1]);
  let resource;
  try { resource = operation.prepare(entry[2]).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (args = entry[2], key = "call-a") => broker.call(entry[1], args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, "legacy_id", "externally_managed"]) assert.ok(!data.includes(value));
}

test("Cloudflare available plans snapshot separate list/detail scope and bind prepared objects", () => {
  const s = scope(); const d = zonePlanDescriptors(s);
  s.accountId = foreign; s.zoneId = foreign; s.listPlanIds.push(foreign); s.planIds.push(foreign);
  for (const entry of cases) {
    const p = d[entry[0]].prepare(entry[2]);
    assert.equal(p.request.path, `/zones/${zone}/available_plans${entry[4]}`);
    assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:available-plans${entry[4] ? `:plan:${plan}` : ""}`);
    for (const value of [d[entry[0]], p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d[entry[0]].project(success(entry[3]([row()])), { ...p }), /scope/);
    assert.throws(() => zonePlanDescriptors(scope())[entry[0]].project(success(entry[3]([row()])), p), /scope/);
  }
  assert.throws(() => d.planGet.prepare({ planId: foreign }), /scope/);
  assert.deepEqual(d.plansList.project(success([{ id: foreign }]), d.plansList.prepare({})), { items: [], complete: false });
  for (const field of ["listPlanIds", "planIds"]) {
    for (const ids of [null, {}, [plan, plan], ["bad/id"], Array.from({ length: 101 }, () => plan)]) {
      assert.throws(() => zonePlanDescriptors({ ...scope(), [field]: ids }), /schema|cap/);
    }
  }
});

test("Cloudflare available plans project selected reported flags without defaults, cost or effective entitlement", () => {
  const d = zonePlanDescriptors(scope());
  for (const entry of cases) {
    const p = d[entry[0]].prepare(entry[2]);
    const out = d[entry[0]].project(success(entry[3]([row(), { id: foreign, name: credentialCanary }])), p);
    assert.deepEqual(out, entry[0] === "planGet" ? expected : { items: [expected], complete: false });
    assert.ok(Object.isFrozen(out));
    const missing = d[entry[0]].project(success(entry[3]([{ id: plan }])), p);
    const item = entry[0] === "planGet" ? missing : missing.items[0];
    assert.equal(item.canSubscribe, "unavailable"); assert.equal(item.isSubscribed, "unavailable");
    for (const flag of [true, false]) {
      const out = d[entry[0]].project(success(entry[3]([{ id: plan, can_subscribe: flag, is_subscribed: flag }])), p);
      const item = entry[0] === "planGet" ? out : out.items[0];
      assert.equal(item.canSubscribe, flag); assert.equal(item.isSubscribed, flag);
    }
  }
});

test("Cloudflare available plans reject foreign parents, malformed identities, duplicates, flags and envelopes", () => {
  const d = zonePlanDescriptors(scope());
  for (const entry of cases) {
    const descriptor = d[entry[0]]; const p = descriptor.prepare(entry[2]);
    for (const context of [{ account_id: foreign }, { zone_id: foreign }, { account: { id: foreign } }, { zone: { id: foreign } }]) {
      assert.throws(() => descriptor.project(success(entry[3]([{ ...row(), ...context }])), p), /scope/);
      assert.throws(() => descriptor.project(JSON.stringify({ success: true, errors: [], ...context, result: entry[3]([row()]) }), p), /scope/);
    }
    for (const field of ["can_subscribe", "is_subscribed"]) for (const value of [null, 0, 1, "true", [], {}]) {
      assert.throws(() => descriptor.project(success(entry[3]([{ ...row(), [field]: value }])), p), /upstream/);
    }
    for (const raw of ["null", "not-json", "{}", success(null), JSON.stringify({ success: true, result: entry[3]([row()]) }),
      JSON.stringify({ success: false, errors: [], result: entry[3]([row()]) }),
      JSON.stringify({ success: true, errors: [credentialCanary], result: entry[3]([row()]) })]) assert.throws(() => descriptor.project(raw, p), /upstream|cap/);
    assert.throws(() => descriptor.project(success(entry[3]([{ ...row(), padding: "x".repeat(131072) }])), p), /cap/);
  }
  const p = d.plansList.prepare({});
  for (const rows of [[row(), row()], [{ id: "bad/id" }], [null], [{ id: foreign, account_id: foreign }], Array(1001).fill({ id: plan })]) {
    assert.throws(() => d.plansList.project(success(rows), p), /scope|schema|upstream|cap/);
  }
  assert.throws(() => d.planGet.project(success({ ...row(), id: foreign }), d.planGet.prepare({ planId: plan })), /scope/);
});

test("Cloudflare available plans deny absent or other-endpoint scopes and model overrides before credentials", async () => {
  for (const entry of cases) {
    const d = zonePlanDescriptors({ accountId: account, zoneId: zone, revision: "resource-1" });
    assert.throws(() => d[entry[0]].prepare(entry[2]), /scope/);
    const f = fixture(entry, entry[0] === "plansList" ? { listPlanIds: [] } : { planIds: [] });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    for (const field of ["accountId", "zoneId", "agentId", "approval", "url", "headers", "price", "page"]) {
      const f = fixture(entry); assert.equal((await f.invoke({ ...entry[2], [field]: "forged" })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  }
  const empty = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [] },
    { accountId: account, revision: "resource-1" });
  for (const entry of cases) assert.ok(!empty.some(op => op.name === entry[1]));
});

test("Cloudflare available plans actual-core fixed GETs redact output and preserve audit, cleanup and replay", async () => {
  for (const entry of cases) {
    const f = fixture(entry); const p = f.operation.prepare(entry[2]);
    assert.equal(p.plan.providerDryRun, false); assert.equal(f.operation.tier, "read");
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.deepEqual(out.value, entry[0] === "planGet" ? expected : { items: [expected], complete: false });
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/available_plans${entry[4]}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
});

test("Cloudflare available plans current principal, exact resource, ownership and lease-time revocation deny network", async () => {
  for (const entry of cases) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(entry);
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const out = await f.invoke();
    assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0); assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0); safe(f, out);
  }
});

test("Cloudflare available plans upstream and outcome-audit failures preserve uncertain replay tombstones", async () => {
  for (const entry of cases) for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: entry[3]([{ ...row(), zone_id: foreign }]) }]) {
    const f = fixture(entry, options); const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke(); assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1); const journal = structuredClone([...f.journal]);
    if (options.auditFailure) {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal); f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});

test("Cloudflare available plans reject prepared resource, revision, argument and plan swaps", async () => {
  for (const entry of cases) for (const change of [p => ({ ...p, resource: { ...p.resource, id: `cloudflare:account:${foreign}:zone:${zone}:available-plans` } }),
    p => ({ ...p, resource: { ...p.resource, revision: "other-revision" } }), p => ({ ...p, arguments: { planId: foreign } }),
    p => ({ ...p, plan: { ...p.plan, providerOperationId: "zones-get" } })]) {
    const f = fixture(entry); const prepared = change(f.operation.prepare(entry[2]));
    await assert.rejects(f.operation.execute(prepared, credentialCanary, new AbortController().signal), /scope|schema/); assert.equal(f.requests.length, 0);
  }
});
