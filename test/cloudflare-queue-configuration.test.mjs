import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const own = "b".repeat(32);
const other = "c".repeat(32);
const tool = "cloudflare.queues.get";
const args = { queueId: own };
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
  queueIds: [own], queueConfigurationIds: [own] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = () => ({ queue_id: own, settings: { delivery_delay: 5, delivery_paused: false, message_retention_period: 345600,
  token: derivedCanary }, queue_name: credentialCanary, producers: [{ token: credentialCanary }],
  consumers: [{ script_name: derivedCanary }], consumers_total_count: 1, producers_total_count: 2,
  jurisdiction: "private-jurisdiction", created_on: credentialCanary, modified_on: derivedCanary });
function fixture({ configurations = [own], allowed = true, response = result(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ ...scope(), queueIds: allowed ? [own] : [], queueConfigurationIds: configurations },
    { accountId: account, revision: "resource-1" }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(success(response), { status, headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [`cloudflare:account:${account}:queue:${own}${configurations.includes(own) ? ":configuration" : ""}`] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "private-jurisdiction", "queue_name", "producers", "consumers", "created_on", "modified_on"])
    assert.ok(!data.includes(value));
}

test("Cloudflare Queue configuration is independently copied and leaves basic detail and list ID-only", () => {
  const s = scope();
  const d = metadataDescriptors(s);
  s.queueConfigurationIds.length = 0;
  s.queueIds.push(other);
  s.accountId = "f".repeat(32);
  s.revision = "changed";
  const p = d.queueGet.prepare(args);
  assert.deepEqual(p.resource, { id: `cloudflare:account:${account}:queue:${own}:configuration`, revision: "resource-1" });
  assert.equal(p.request.path, `/accounts/${account}/queues/${own}`);
  assert.equal(d.queueGet.project(success(result()), p).configuration.deliveryDelaySeconds, 5);
  assert.throws(() => d.queueGet.prepare({ queueId: other }), /scope/);
  for (const queueConfigurationIds of [undefined, []]) {
    const basic = metadataDescriptors({ ...scope(), queueConfigurationIds }).queueGet;
    assert.deepEqual(basic.project(success(result()), basic.prepare(args)), { id: own });
  }
  assert.deepEqual(d.queuesList.project(success([result()]), d.queuesList.prepare({})), { items: [{ id: own }], complete: false });
  for (const queueConfigurationIds of [[other], [own, own], ["invalid"], Array(101).fill(own), "invalid"])
    assert.throws(() => metadataDescriptors({ ...scope(), queueConfigurationIds }));
});

test("Cloudflare Queue configured values preserve false zero fractional numbers and unavailable without defaults", () => {
  const d = metadataDescriptors(scope()).queueGet;
  const p = d.prepare(args);
  for (const deliveryPaused of [true, false]) {
    for (const value of [0, 0.5, 345600, Number.MAX_SAFE_INTEGER]) {
      assert.deepEqual(d.project(success({ queue_id: own, settings: { delivery_delay: value, delivery_paused: deliveryPaused,
        message_retention_period: value } }), p), { id: own, configuration: { subject: "configured-queue-delivery-and-retention",
        deliveryDelaySeconds: value, deliveryPaused, messageRetentionSeconds: value, effectiveDeliveryAndRetention: "not-established" } });
    }
  }
  for (const row of [{ queue_id: own }, { queue_id: own, settings: {} }]) {
    assert.deepEqual(d.project(success(row), p).configuration, { subject: "configured-queue-delivery-and-retention",
      deliveryDelaySeconds: "unavailable", deliveryPaused: "unavailable", messageRetentionSeconds: "unavailable",
      effectiveDeliveryAndRetention: "not-established" });
  }
});

test("Cloudflare Queue selected settings reject malformed values foreign identity and oversized responses", () => {
  const d = metadataDescriptors(scope()).queueGet;
  const p = d.prepare(args);
  for (const settings of [null, [], true, "settings"]) assert.throws(() => d.project(success({ ...result(), settings }), p), /upstream/);
  for (const key of ["delivery_delay", "message_retention_period"]) {
    for (const value of [null, -1, Number.MAX_SAFE_INTEGER + 1, "5", false, [], {}])
      assert.throws(() => d.project(success({ ...result(), settings: { [key]: value } }), p), /upstream/);
    for (const value of ["1e999", "-1e999"])
      assert.throws(() => d.project(`{"success":true,"errors":[],"result":{"queue_id":"${own}","settings":{"${key}":${value}}}}`, p), /upstream/);
  }
  for (const value of [null, 0, 1, "false", [], {}])
    assert.throws(() => d.project(success({ ...result(), settings: { delivery_paused: value } }), p), /upstream/);
  for (const row of [{ ...result(), queue_id: other }, { ...result(), account_id: "f".repeat(32) }])
    assert.throws(() => d.project(success(row), p), /scope/);
  assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], account_id: "f".repeat(32), result: result() }), p), /scope/);
  assert.throws(() => d.project(success({ ...result(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare Queue configuration cannot be selected by model fields or widen Queue scope", async () => {
  for (const input of [{ ...args, configuration: true }, { ...args, queueConfigurationIds: [own] }, { ...args, accountId: account },
    { ...args, settings: {} }, { ...args, headers: {} }, { ...args, approval: "forged" }, { queueId: other }]) {
    const f = fixture();
    assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  const denied = fixture({ allowed: false, configurations: [] });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  const basic = fixture({ configurations: [] });
  assert.deepEqual((await basic.invoke()).value, { id: own });
});

test("Cloudflare Queue configured detail uses actual core GET redaction cleanup audit and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerOperationId, "queues-get");
  assert.equal(p.plan.providerDryRun, false);
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.equal(out.value.configuration.deliveryPaused, false);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare Queue configuration agent resource binding and lease-time revocation deny network", async () => {
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

test("Cloudflare Queue configuration corruption and audit outage preserve uncertain replay refusal", async () => {
  for (const options of [{ response: { ...result(), settings: { delivery_paused: credentialCanary } } },
    { response: { ...result(), queue_id: other } }, { status: 403 }, { auditFailure: true }]) {
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
