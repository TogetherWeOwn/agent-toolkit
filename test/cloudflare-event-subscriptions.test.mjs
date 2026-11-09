import assert from "node:assert/strict";
import test from "node:test";
import { eventSubscriptionDescriptors } from "../dist/plugins/cloudflare-broker/src/event-subscriptions.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const id = "b".repeat(32);
const queue = "c".repeat(32);
const foreign = "f".repeat(32);
const tools = ["cloudflare.queues.event_subscriptions.list", "cloudflare.queues.event_subscriptions.get"];
const scope = () => ({ accountId: account, revision: "resource-1", subscriptions: [
  { subscriptionId: id, source: { type: "workersBuilds.worker", worker_name: "safe-worker" }, queueId: queue, events: ["build.completed"] },
] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ id, source: { type: "workersBuilds.worker", worker_name: "safe-worker" },
  destination: { type: "queues.queue", queue_id: queue }, enabled: true, events: ["build.completed", "ignored.event"],
  name: credentialCanary, created_at: derivedCanary, modified_at: credentialCanary, settings: { token: derivedCanary } });
function fixture(tool, { subscriptions = scope().subscriptions, response, status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"],
    hyperdriveIds: [], queueIds: [queue], eventSubscriptions: subscriptions }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    const value = response ?? (tool === tools[0] ? [row(), { ...row(), id: foreign }] : row());
    return new Response(success(value), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  const input = tool === tools[0] ? {} : { subscriptionId: id };
  let resource;
  try { resource = operation.prepare(input).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, input, invoke: (value = input, key = "call-a") => broker.call(tool, value, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, "ignored.event", "created_at", "modified_at", "settings", "worker_name"]) {
    assert.ok(!data.includes(value), value);
  }
}

test("Cloudflare event subscription scope copies exact source, destination and selected events independently", () => {
  const s = scope();
  const d = eventSubscriptionDescriptors(s);
  s.accountId = foreign;
  s.subscriptions[0].source.worker_name = "changed";
  s.subscriptions[0].queueId = foreign;
  s.subscriptions[0].events.push("ignored.event");
  s.subscriptions.push({ ...s.subscriptions[0], subscriptionId: foreign });
  const p = d.eventSubscriptionGet.prepare({ subscriptionId: id });
  assert.equal(p.request.path, `/accounts/${account}/event_subscriptions/subscriptions/${id}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:event-subscriptions:${id}`);
  for (const value of [d, d.eventSubscriptionGet, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.eventSubscriptionGet.project(success(row()), p).subscription.events, ["build.completed"]);
  assert.throws(() => d.eventSubscriptionGet.prepare({ subscriptionId: foreign }), /scope/);
  assert.throws(() => d.eventSubscriptionGet.project(success(row()), { ...p }), /scope/);
  assert.throws(() => eventSubscriptionDescriptors(scope()).eventSubscriptionGet.project(success(row()), p), /scope/);
  assert.throws(() => d.eventSubscriptionsList.project(success([row()]), p), /scope/);
  assert.throws(() => d.eventSubscriptionGet.project(success(row()), d.eventSubscriptionsList.prepare({})), /scope/);
});

test("Cloudflare event subscriptions bind every official source variant without inventing resource fields", () => {
  const sources = ["images", "kv", "r2", "superSlurper", "vectorize"].map(type => ({ type }));
  sources.push({ type: "workersAi.model", model_name: "@cf/model" }, { type: "workersBuilds.worker", worker_name: "safe-worker" },
    { type: "workers.script", script_tag: "script-tag" }, { type: "workflows.workflow", workflow_name: "safe-workflow" });
  for (const source of sources) {
    const s = scope(); s.subscriptions[0].source = source;
    const d = eventSubscriptionDescriptors(s);
    const p = d.eventSubscriptionGet.prepare({ subscriptionId: id });
    assert.equal(d.eventSubscriptionGet.project(success({ ...row(), source }), p).subscription.sourceType, source.type);
    assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), source: { ...source, bucket_name: "invented" } }), p), /schema/);
    assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), source: { type: "unknown" } }), p), /schema/);
    for (const key of Object.keys(source).filter(key => key !== "type")) {
      assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), source: { ...source, [key]: "changed" } }), p), /scope/);
      assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), source: { type: source.type } }), p), /schema/);
    }
  }
});

test("Cloudflare event subscription construction refuses ambiguous, malformed and oversized selections", () => {
  const selected = scope().subscriptions[0];
  for (const subscriptions of [[selected, selected], [{ ...selected, subscriptionId: "bad" }], [{ ...selected, queueId: "bad" }],
    [{ ...selected, source: { type: "r2", bucket_name: "not-in-schema" } }], [{ ...selected, source: { type: "workers.script" } }],
    [{ ...selected, events: ["build.completed", "build.completed"] }], [{ ...selected, events: ["bad\n"] }], [null]]) {
    assert.throws(() => eventSubscriptionDescriptors({ ...scope(), subscriptions }), /schema|upstream/);
  }
  for (const events of [[], Array(101).fill("build.completed")]) {
    assert.throws(() => eventSubscriptionDescriptors({ ...scope(), subscriptions: [{ ...selected, events }] }), /cap/);
  }
  assert.throws(() => eventSubscriptionDescriptors({ ...scope(), subscriptions: Array(101).fill(selected) }), /cap/);
});

test("Cloudflare event subscription projections omit names and report partial configured state only", () => {
  const d = eventSubscriptionDescriptors(scope());
  const p = d.eventSubscriptionsList.prepare({});
  assert.equal(p.request.path, `/accounts/${account}/event_subscriptions/subscriptions?page=1&per_page=100`);
  const out = d.eventSubscriptionsList.project(success([row(), { ...row(), id: foreign }]), p);
  assert.deepEqual(out, { items: [{ subscriptionId: id, sourceType: "workersBuilds.worker", queueId: queue, enabled: true,
    events: ["build.completed"], eventsComplete: false }], subject: "configured-event-subscriptions", complete: false, effectiveDelivery: "not-established" });
  for (const value of [out, out.items, out.items[0], out.items[0].events]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.eventSubscriptionsList.project(success([]), p).items, []);
  const detail = d.eventSubscriptionGet.project(success({ ...row(), enabled: false, events: ["ignored.event"] }), d.eventSubscriptionGet.prepare({ subscriptionId: id }));
  assert.equal(detail.subscription.enabled, false);
  assert.deepEqual(detail.subscription.events, []);
  assert.equal(detail.subscription.eventsComplete, false);
  safe({ audit: [], journal: [] }, { out, detail });
});

test("Cloudflare event subscriptions reject reassignment, foreign context, malformed envelopes and response caps", () => {
  const d = eventSubscriptionDescriptors(scope());
  const p = d.eventSubscriptionGet.prepare({ subscriptionId: id });
  for (const patch of [{ id: foreign }, { id: undefined }, { account_id: foreign }, { source: { type: "r2" } },
    { destination: { type: "queues.queue", queue_id: foreign } }, { destination: { type: "unknown", queue_id: queue } },
    { destination: { type: "queues.queue", queue_id: queue, account_id: foreign } }, { enabled: undefined }, { enabled: "true" },
    { events: ["build.completed", "build.completed"] }, { events: "build.completed" }, { events: [] }, { events: ["bad\n"] }]) {
    assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), ...patch }), p));
  }
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: [credentialCanary], result: row() }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: row() })]) assert.throws(() => d.eventSubscriptionGet.project(raw, p));
  const lp = d.eventSubscriptionsList.prepare({});
  for (const rows of [[row(), row()], [{}], [{ ...row(), account_id: foreign }]]) assert.throws(() => d.eventSubscriptionsList.project(success(rows), lp));
  assert.throws(() => d.eventSubscriptionsList.project(success(Array(101).fill({ id: foreign })), lp), /cap/);
  assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), events: Array(1001).fill("build.completed") }), p), /cap/);
  assert.throws(() => d.eventSubscriptionGet.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
  const events = Array.from({ length: 100 }, (_, i) => `event${i}${"x".repeat(120)}`);
  const subscriptions = Array.from({ length: 4 }, (_, i) => ({ ...scope().subscriptions[0], subscriptionId: String(i).repeat(32), events }));
  const capped = eventSubscriptionDescriptors({ ...scope(), subscriptions });
  assert.throws(() => capped.eventSubscriptionsList.project(success(subscriptions.map(s => ({ ...row(), id: s.subscriptionId, events }))), capped.eventSubscriptionsList.prepare({})), /cap/);
});

test("Cloudflare event subscription default-empty scope and model overrides refuse before credentials", async () => {
  for (const tool of tools) {
    const empty = fixture(tool, { subscriptions: [] });
    assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(empty.calls.secret, 0); assert.equal(empty.requests.length, 0);
    for (const patch of [{ subscriptionId: foreign }, { accountId: foreign }, { queueId: foreign }, { events: ["ignored.event"] },
      { source: { type: "r2" } }, { page: 2 }, { headers: {} }, { approval: "forged" }, { agentId: "other" }]) {
      const f = fixture(tool);
      assert.equal((await f.invoke({ ...f.input, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare event subscription actual-core fixed GET preserves redaction, cleanup, audit and replay", async () => {
  for (const tool of tools) {
    const f = fixture(tool);
    const p = f.operation.prepare(f.input);
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, tool === tools[0] ? "subscriptions-list" : "subscriptions-get");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.effectiveDelivery, "not-established");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare event subscription current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const tool of tools) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(tool);
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

test("Cloudflare event subscription upstream and audit failures preserve uncertain replay state", async () => {
  for (const tool of tools) for (const failure of ["foreign", "destination", "denied", "not-found", "audit"]) {
    const value = { ...row(), ...(failure === "foreign" ? { account_id: foreign } : failure === "destination" ? { destination: { type: "queues.queue", queue_id: foreign } } : {}) };
    const f = fixture(tool, { response: tool === tools[0] ? [value] : value, status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      const offline = await f.invoke(); assert.equal(offline.code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal);
      safe(f, offline); f.dependencies.audit.append = append;
    }
    const replay = await f.invoke(); assert.equal(replay.code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1); assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal); safe(f, replay); safe(f, out);
  }
});
