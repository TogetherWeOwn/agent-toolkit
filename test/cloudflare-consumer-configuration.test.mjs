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
const tool = "cloudflare.queues.consumers.get";
const args = { queueId: queue, consumerId: worker };
const scope = () => ({ accountId: account, revision: "resource-1", queues: [{ queueId: queue, consumers: [
  { consumerId: worker, type: "worker", scriptName: "safe-worker" }, { consumerId: http, type: "http_pull", scriptName: null },
] }], configurationConsumers: [{ queueId: queue, consumerIds: [worker, http] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = (consumerId = worker) => ({ consumer_id: consumerId, type: consumerId === worker ? "worker" : "http_pull",
  ...(consumerId === worker ? { script_name: "safe-worker" } : {}), settings: { batch_size: 50, max_retries: 3,
    retry_delay: 10, max_concurrency: null, max_wait_time_ms: 5000, visibility_timeout_ms: 6000, token: derivedCanary },
  queue_name: credentialCanary, dead_letter_queue: derivedCanary, created_on: credentialCanary, messages: [derivedCanary] });
function fixture({ configurations = scope().configurationConsumers, queues = scope().queues, response = row(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    queueConsumers: queues, queueConsumerConfigurations: configurations }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [
    `cloudflare:account:${account}:queue:${queue}:consumers:${worker}`, `cloudflare:account:${account}:queue:${queue}:consumers:${http}`] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "queue_name", "dead_letter_queue", "created_on", "messages", "token"])
    assert.ok(!data.includes(value));
}

test("Cloudflare consumer configuration scope is copied subset-only and never widens list or default detail", () => {
  const s = scope();
  const d = queueConsumerDescriptors(s);
  s.configurationConsumers[0].consumerIds.length = 0;
  s.configurationConsumers.length = 0;
  s.queues[0].consumers[0].scriptName = "changed";
  assert.equal(d.consumerGet.project(success(row()), d.consumerGet.prepare(args)).configuration.batchSize, 50);
  for (const configurationConsumers of [undefined, []]) {
    const basic = queueConsumerDescriptors({ ...scope(), configurationConsumers });
    assert.equal(Object.hasOwn(basic.consumerGet.project(success(row()), basic.consumerGet.prepare(args)), "configuration"), false);
  }
  const list = d.consumersList.project(success([row(), row(http)]), d.consumersList.prepare({ queueId: queue }));
  assert.equal(list.complete, false);
  assert.equal(JSON.stringify(list).includes("configuration"), false);
  for (const configurationConsumers of [[{ queueId: foreign, consumerIds: [worker] }], [{ queueId: queue, consumerIds: [foreign] }],
    [{ queueId: queue, consumerIds: [worker, worker] }], [...scope().configurationConsumers, ...scope().configurationConsumers],
    [{ queueId: queue, consumerIds: "invalid" }], [{ queueId: queue, consumerIds: Array(101).fill(worker) }], "invalid"])
    assert.throws(() => queueConsumerDescriptors({ ...scope(), configurationConsumers }));
});

test("Cloudflare consumer configured fields preserve optional values and documented automatic concurrency null", () => {
  const d = queueConsumerDescriptors(scope()).consumerGet;
  for (const consumerId of [worker, http]) {
    const p = d.prepare({ ...args, consumerId });
    for (const value of [0, 0.5, 50, Number.MAX_SAFE_INTEGER]) {
      const result = row(consumerId);
      for (const key of ["batch_size", "max_retries", "retry_delay", "max_concurrency", "max_wait_time_ms", "visibility_timeout_ms"])
        result.settings[key] = value;
      assert.deepEqual(d.project(success(result), p).configuration, { subject: "configured-queue-consumer-delivery",
        batchSize: value, maxRetries: value, retryDelaySeconds: value,
        ...(consumerId === worker ? { maxConcurrency: value, maxWaitTimeMs: value } : { visibilityTimeoutMs: value }),
        effectiveDelivery: "not-established" });
    }
    for (const settings of [undefined, {}]) {
      const out = d.project(success({ ...row(consumerId), settings }), p).configuration;
      assert.equal(out.batchSize, "unavailable");
      assert.equal(out.maxRetries, "unavailable");
      assert.equal(out.retryDelaySeconds, "unavailable");
      assert.equal(consumerId === worker ? out.maxConcurrency : out.visibilityTimeoutMs, "unavailable");
    }
  }
  assert.equal(d.project(success(row()), d.prepare(args)).configuration.maxConcurrency, null);
});

test("Cloudflare consumer configuration rejects malformed numeric settings and exact identity drift", () => {
  const d = queueConsumerDescriptors(scope()).consumerGet;
  for (const consumerId of [worker, http]) {
    const p = d.prepare({ ...args, consumerId });
    for (const settings of [null, [], true, "settings"])
      assert.throws(() => d.project(success({ ...row(consumerId), settings }), p), /upstream/);
    const keys = ["batch_size", "max_retries", "retry_delay", ...(consumerId === worker ? ["max_concurrency", "max_wait_time_ms"] : ["visibility_timeout_ms"])];
    for (const key of keys) {
      for (const value of [null, -1, Number.MAX_SAFE_INTEGER + 1, "5", false, [], {}]) {
        if (key === "max_concurrency" && value === null) continue;
        assert.throws(() => d.project(success({ ...row(consumerId), settings: { [key]: value } }), p), /upstream/);
      }
      const raw = success({ ...row(consumerId), settings: { [key]: "overflow" } }).replace('"overflow"', "1e999");
      assert.throws(() => d.project(raw, p), /upstream/);
    }
    for (const result of [{ ...row(consumerId), account_id: foreign }, { ...row(consumerId), queue_id: foreign },
      { ...row(consumerId), consumer_id: foreign }, { ...row(consumerId), type: "other" }])
      assert.throws(() => d.project(success(result), p), /scope/);
    assert.throws(() => d.project(success({ ...row(consumerId), padding: "x".repeat(131072) }), p), /cap/);
  }
});

test("Cloudflare consumer configuration model overrides and absent ordinary scope refuse before credentials", async () => {
  for (const input of [{ ...args, configuration: true }, { ...args, settings: {} }, { ...args, accountId: account },
    { ...args, queueConsumerConfigurations: scope().configurationConsumers }, { ...args, headers: {} }, { ...args, approval: "forged" },
    { ...args, consumerId: foreign }]) {
    const f = fixture();
    assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  const denied = fixture({ queues: [], configurations: [] });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  const basic = fixture({ configurations: [] });
  assert.equal(Object.hasOwn((await basic.invoke()).value, "configuration"), false);
});

test("Cloudflare consumer configured worker and HTTP pull detail use actual core redaction audit cleanup and replay", async () => {
  for (const consumerId of [worker, http]) {
    const f = fixture({ response: row(consumerId) });
    const input = { ...args, consumerId };
    const p = f.operation.prepare(input);
    assert.equal(p.plan.providerOperationId, "queues-get-consumer");
    assert.equal(p.plan.providerDryRun, false);
    const out = await f.invoke(input);
    assert.equal(out.ok, true);
    assert.equal(out.value.configuration.batchSize, 50);
    assert.equal(out.value.configuration.effectiveDelivery, "not-established");
    assert.equal(Object.hasOwn(out.value.configuration, consumerId === worker ? "visibilityTimeoutMs" : "maxConcurrency"), false);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/queues/${queue}/consumers/${consumerId}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke(input)).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare consumer configuration current agent resource ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare consumer configuration corruption and audit outage keep uncertain journal and refuse replay", async () => {
  for (const options of [{ response: { ...row(), settings: { max_retries: credentialCanary } } },
    { response: { ...row(), consumer_id: foreign } }, { status: 403 }, { auditFailure: true }]) {
    const f = fixture(options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    assert.equal(f.calls.secret, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
