import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash, createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), own = "b".repeat(32), databaseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const cases = [
  { key: "hyperdriveGet", list: "hyperdriveList", name: "cloudflare.hyperdrive.get", field: "hyperdriveConfigurationIds", id: own,
    args: { hyperdriveId: own }, listArgs: { page: 1, perPage: 10 },
    response: { id: own, caching: { disabled: false, max_age: 60 }, origin_connection_limit: 60, origin: { password: credentialCanary } } },
  { key: "d1Get", list: "d1List", name: "cloudflare.d1.get", field: "databaseConfigurationIds", id: databaseId,
    args: { databaseId }, listArgs: { page: 1, perPage: 10 },
    response: { uuid: databaseId, jurisdiction: "eu", read_replication: { mode: "auto" }, rows: [derivedCanary] } },
  { key: "queueGet", list: "queuesList", name: "cloudflare.queues.get", field: "queueConfigurationIds", id: own,
    args: { queueId: own }, listArgs: {},
    response: { queue_id: own, settings: { delivery_paused: false }, messages: [credentialCanary] } },
];
const scope = (entry, expanded) => ({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [own],
  databaseIds: [databaseId], queueIds: [own], [entry.field]: expanded ? [entry.id] : [] });
const success = result => JSON.stringify({ success: true, errors: [], result });
function safe(f, out) {
  const text = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, '"origin"', '"password"', '"rows"', '"messages"']) assert.ok(!text.includes(value));
}
// Actual reviewed core with synthetic host, credentials and state ports only.
function fixture(entry, expanded, policyResource) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations(scope(entry, expanded), { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(entry.response), { headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === entry.name);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [policyResource ?? operation.prepare(entry.args).resource.id] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: () => broker.call(entry.name, entry.args, "verified-runtime", "configuration-policy-call") };
}

test("Cloudflare configuration resources snapshot selection and preserve basic requests and lists", () => {
  for (const entry of cases) {
    const basic = metadataDescriptors(scope(entry, false)), selected = scope(entry, true), expanded = metadataDescriptors(selected);
    selected[entry.field].length = 0;
    const b = basic[entry.key].prepare(entry.args), p = expanded[entry.key].prepare(entry.args);
    assert.equal(p.resource.id, `${b.resource.id}:configuration`);
    assert.equal(p.resource.revision, b.resource.revision); assert.deepEqual(p.arguments, b.arguments);
    if (entry.key === "d1Get") {
      assert.equal(p.request.path, b.request.path + ",jurisdiction,read_replication");
      assert.equal(p.request.method, b.request.method);
    } else assert.deepEqual(p.request, b.request);
    assert.ok(expanded[entry.key].project(success(entry.response), p).configuration);
    assert.equal(Object.hasOwn(basic[entry.key].project(success(entry.response), b), "configuration"), false);
    assert.deepEqual(expanded[entry.list].prepare(entry.listArgs), basic[entry.list].prepare(entry.listArgs));
  }
});

test("Cloudflare configuration policy and basic policy cannot authorize each other's projection", async () => {
  for (const entry of cases) {
    for (const expanded of [false, true]) {
      const foreign = metadataDescriptors(scope(entry, !expanded))[entry.key].prepare(entry.args).resource.id;
      const f = fixture(entry, expanded, foreign), out = await f.invoke();
      assert.equal(out.code, "POLICY_DENIED"); assert.equal(out.ok, false);
      assert.equal(f.calls.secret, 0); assert.equal(f.calls.close, 0); assert.equal(f.requests.length, 0); safe(f, out);
    }
  }
});

test("Cloudflare exact configuration policy binds core target audit journal cleanup and replay", async () => {
  for (const entry of cases) {
    for (const expanded of [false, true]) {
      const f = fixture(entry, expanded), resolve = f.dependencies.credentials.resolve;
      let target;
      f.dependencies.credentials.resolve = async value => { target = value; return resolve(value); };
      const out = await f.invoke(); assert.equal(out.ok, true);
      assert.equal(Object.hasOwn(out.value, "configuration"), expanded);
      assert.deepEqual(target.resource, f.operation.prepare(entry.args).resource);
      assert.deepEqual(f.audit.map(record => record.phase), ["intent", "outcome"]);
      for (const record of f.audit) assert.equal(record.targetHash, canonicalHash(target));
      assert.equal([...f.journal.values()][0].target, canonicalHash(target));
      assert.equal([...f.journal.values()][0].outcome, "complete");
      assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
    }
  }
});

test("Cloudflare configuration execution refuses swapped basic or expanded prepared resources", async () => {
  for (const entry of cases) {
    for (const expanded of [false, true]) {
      const f = fixture(entry, expanded), prepared = f.operation.prepare(entry.args);
      const resource = metadataDescriptors(scope(entry, !expanded))[entry.key].prepare(entry.args).resource;
      await assert.rejects(() => f.operation.execute({ ...prepared, resource }, credentialCanary, new AbortController().signal), /scope/);
      assert.equal(f.requests.length, 0);
    }
  }
});
