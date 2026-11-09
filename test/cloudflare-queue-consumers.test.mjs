import assert from "node:assert/strict";
import test from "node:test";
import { queueConsumerDescriptors } from "../dist/plugins/cloudflare-broker/src/queue-consumers.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const queue = "b".repeat(32);
const worker = "c".repeat(32);
const http = "d".repeat(32);
const foreign = "f".repeat(32);
const args = { queueId: queue, consumerId: worker };
const tools = ["cloudflare.queues.consumers.list", "cloudflare.queues.consumers.get"];
const scope = () => ({ accountId: account, revision: "resource-1", queues: [{ queueId: queue, consumers: [
  { consumerId: worker, type: "worker", scriptName: "safe-worker" }, { consumerId: http, type: "http_pull", scriptName: null },
] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const workerRow = () => ({ consumer_id: worker, type: "worker", script_name: "safe-worker", queue_name: credentialCanary,
  dead_letter_queue: derivedCanary, created_on: credentialCanary, settings: { token: derivedCanary }, messages: [credentialCanary] });
const httpRow = () => ({ ...workerRow(), consumer_id: http, type: "http_pull", script_name: undefined });
function fixture(tool, { queues = scope().queues, response, status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"],
    hyperdriveIds: [], queueIds: [queue], queueConsumers: queues }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    const value = response ?? (tool === tools[0] ? [workerRow(), httpRow(), { ...workerRow(), consumer_id: foreign }] : workerRow());
    return new Response(success(value), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  const input = tool === tools[0] ? { queueId: queue } : args;
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
  for (const value of [credentialCanary, derivedCanary, foreign, "queue_name", "dead_letter_queue", "created_on", "settings", "messages"]) {
    assert.ok(!data.includes(value), value);
  }
}

test("Cloudflare consumer scope copies exact queue, type and Worker associations independently", () => {
  const s = scope();
  const d = queueConsumerDescriptors(s);
  s.accountId = foreign;
  s.queues[0].consumers[0].scriptName = "changed";
  s.queues[0].consumers.push({ consumerId: foreign, type: "http_pull", scriptName: null });
  s.queues.push({ queueId: foreign, consumers: [] });
  const p = d.consumerGet.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/queues/${queue}/consumers/${worker}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:queue:${queue}:consumers:${worker}`);
  for (const value of [d, d.consumerGet, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.equal(d.consumerGet.project(success(workerRow()), p).consumer.scriptName, "safe-worker");
  assert.throws(() => d.consumerGet.prepare({ ...args, consumerId: foreign }), /scope/);
  assert.throws(() => d.consumersList.prepare({ queueId: foreign }), /scope/);
  assert.throws(() => d.consumerGet.project(success(workerRow()), { ...p }), /scope/);
  assert.throws(() => queueConsumerDescriptors(scope()).consumerGet.project(success(workerRow()), p), /scope/);
  assert.throws(() => d.consumersList.project(success([workerRow()]), p), /scope/);
  assert.throws(() => d.consumerGet.project(success(workerRow()), d.consumersList.prepare({ queueId: queue })), /scope/);
});

test("Cloudflare consumer construction refuses duplicate, malformed, ambiguous or oversized scope", () => {
  const selected = scope().queues[0].consumers[0];
  for (const consumers of [[selected, selected], [{ ...selected, consumerId: "bad" }], [{ ...selected, type: "unknown" }],
    [{ ...selected, scriptName: "../escape" }], [{ ...selected, scriptName: "safe-worker\n" }],
    [{ consumerId: http, type: "http_pull" }], [{ consumerId: http, type: "http_pull", scriptName: "safe-worker" }], [null]]) {
    assert.throws(() => queueConsumerDescriptors({ ...scope(), queues: [{ queueId: queue, consumers }] }), /schema/);
  }
  assert.throws(() => queueConsumerDescriptors({ ...scope(), queues: [...scope().queues, ...scope().queues] }), /schema/);
  assert.throws(() => queueConsumerDescriptors({ ...scope(), queues: [{ queueId: queue, consumers: Array(101).fill(selected) }] }), /cap/);
  assert.throws(() => queueConsumerDescriptors({ ...scope(), queues: Array(101).fill(scope().queues[0]) }), /cap/);
});

test("Cloudflare consumers project selected configured identities only, never delivery or complete lists", () => {
  const d = queueConsumerDescriptors(scope());
  const out = d.consumersList.project(success([workerRow(), httpRow(), { ...workerRow(), consumer_id: foreign }]),
    d.consumersList.prepare({ queueId: queue }));
  assert.deepEqual(out, { queueId: queue, items: scope().queues[0].consumers, subject: "configured-queue-consumers",
    complete: false, effectiveDelivery: "not-established" });
  for (const value of [out, out.items, ...out.items]) assert.ok(Object.isFrozen(value));
  const detail = d.consumerGet.project(success(httpRow()), d.consumerGet.prepare({ queueId: queue, consumerId: http }));
  assert.deepEqual(detail, { queueId: queue, consumer: { consumerId: http, type: "http_pull", scriptName: null },
    subject: "configured-queue-consumer", effectiveDelivery: "not-established" });
  assert.deepEqual(d.consumersList.project(success([]), d.consumersList.prepare({ queueId: queue })).items, []);
  safe({ audit: [], journal: [] }, { out, detail });
});

test("Cloudflare consumers refuse changed associations, foreign context, malformed envelopes and bounds", () => {
  const d = queueConsumerDescriptors(scope());
  const p = d.consumerGet.prepare(args);
  for (const patch of [{ consumer_id: foreign }, { consumer_id: undefined }, { type: "http_pull" }, { type: undefined },
    { script_name: "changed" }, { script_name: undefined }, { queue_id: foreign }, { account_id: foreign }]) {
    assert.throws(() => d.consumerGet.project(success({ ...workerRow(), ...patch }), p), /scope/);
  }
  for (const patch of [{ queue_id: foreign }, { account_id: foreign }]) {
    assert.throws(() => d.consumerGet.project(JSON.stringify({ success: true, errors: [], result: workerRow(), ...patch }), p), /scope/);
    assert.throws(() => d.consumersList.project(success([{ ...workerRow(), ...patch }]), d.consumersList.prepare({ queueId: queue })), /scope/);
  }
  assert.throws(() => d.consumerGet.project(success({ ...httpRow(), script_name: null }), d.consumerGet.prepare({ queueId: queue, consumerId: http })), /scope/);
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: workerRow() }),
    JSON.stringify({ success: false, errors: [], result: workerRow() }), JSON.stringify({ success: true, errors: [credentialCanary], result: workerRow() })]) {
    assert.throws(() => d.consumerGet.project(raw, p), /upstream|scope/);
  }
  const lp = d.consumersList.prepare({ queueId: queue });
  assert.throws(() => d.consumersList.project(success([workerRow(), workerRow()]), lp), /upstream/);
  assert.throws(() => d.consumersList.project(success([{}]), lp), /upstream/);
  assert.throws(() => d.consumersList.project(success(Array(1001).fill(workerRow())), lp), /cap/);
  assert.throws(() => d.consumerGet.project(success({ ...workerRow(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare consumer default-empty scope and closed overrides refuse before credentials", async () => {
  for (const tool of tools) {
    for (const queues of [[], [{ queueId: queue, consumers: [] }]]) {
      const f = fixture(tool, { queues });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ queueId: foreign }, { accountId: foreign }, { page: 2 }, { headers: {} }, { approval: "forged" },
      { agentId: "other" }, { settings: {} }, { scriptName: "changed" }, { queueId: "../escape" }]) {
      const f = fixture(tool);
      assert.equal((await f.invoke({ ...f.input, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
  const f = fixture(tools[1]);
  assert.equal((await f.invoke({ ...args, consumerId: foreign })).code, "INVALID_ARGUMENTS");
  assert.equal(f.calls.secret, 0);
  assert.equal(f.requests.length, 0);
});

test("Cloudflare consumer actual-core fixed GET retains redaction, cleanup, audit and replay", async () => {
  for (const tool of tools) {
    const f = fixture(tool);
    const p = f.operation.prepare(f.input);
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, tool === tools[0] ? "queues-list-consumers" : "queues-get-consumer");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.effectiveDelivery, "not-established");
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

test("Cloudflare consumer current agent, resource, binding and lease-time revocation deny network", async () => {
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
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0);
    safe(f, out);
  }
});

test("Cloudflare consumer malformed, denied and audit failures preserve uncertain replay state", async () => {
  for (const tool of tools) for (const failure of ["foreign", "type", "denied", "not-found", "audit"]) {
    const row = { ...workerRow(), ...(failure === "foreign" ? { account_id: foreign } : failure === "type" ? { type: "http_pull" } : {}) };
    const f = fixture(tool, { response: tool === tools[0] ? [row] : row, status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      const offline = await f.invoke();
      assert.equal(offline.code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      safe(f, offline);
      f.dependencies.audit.append = append;
    }
    const replay = await f.invoke();
    assert.equal(replay.code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, replay);
    safe(f, out);
  }
});
