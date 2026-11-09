import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash, createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), scriptName = "safe-worker";
const deploymentId = "11111111-2222-4333-8444-555555555555", versionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const stamp = "2026-11-08T01:02:03Z", tag = "b".repeat(64);
const page = { scriptName, page: 1, perPage: 10 }, versionArgs = { scriptName, versionId };
const binding = { name: "DB", type: "d1" };
const scope = (mask = 0) => ({ accountId: account, revision: "resource-1", scriptNames: [scriptName], hyperdriveIds: [],
  workerDeployments: [{ scriptName, deploymentIds: [deploymentId] }], workerVersions: [{ scriptName, versionIds: [versionId] }],
  workerAttributionScriptNames: mask & 1 ? [scriptName] : [], workerVersionDetailScriptNames: mask & 2 ? [scriptName] : [],
  workerVersionBindings: mask & 4 ? [{ ...versionArgs, bindings: [{ ...binding }] }] : [] });
const deployment = () => ({ id: deploymentId, created_on: stamp, strategy: "percentage", versions: [{ version_id: versionId, percentage: 100 }], author_email: derivedCanary });
const version = () => ({ id: versionId, metadata: { created_on: stamp, author_email: derivedCanary }, resources: {
  script: { etag: tag }, script_runtime: { limits: { cpu_ms: 50 } }, bindings: [{ ...binding, database_id: credentialCanary }], source: derivedCanary } });
const cases = [
  { key: "deploymentsList", name: "cloudflare.workers.deployments.list", args: page, response: () => ({ deployments: [deployment()] }) },
  { key: "deploymentGet", name: "cloudflare.workers.deployments.get", args: { scriptName, deploymentId }, response: deployment },
  { key: "versionsList", name: "cloudflare.workers.versions.list", args: page, response: () => ({ items: [version()] }) },
  { key: "versionGet", name: "cloudflare.workers.versions.get", args: versionArgs, response: version },
];
const versionCase = cases[3];
const success = result => JSON.stringify({ success: true, errors: [], result });
function suffix(mask) {
  return (mask & 1 ? ":attribution" : "") + (mask & 2 ? ":detail" : "") + (mask & 4 ? ":binding-identities" : "");
}
function safe(f, out) {
  const text = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, "database_id", "author_email", '"source"']) assert.ok(!text.includes(omitted));
}
// Actual reviewed core with process-local synthetic host, credentials and durable-state ports only.
function fixture(entry, mask, policyResource) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations(scope(mask), { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(entry.response()), { headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === entry.name);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [policyResource ?? operation.prepare(entry.args).resource.id] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: () => broker.call(entry.name, entry.args, "verified-runtime", "version-policy-call") };
}

test("Cloudflare deployment and version attribution use distinct copied policy resources with unchanged GETs", () => {
  for (const entry of cases) {
    const basic = metadataDescriptors(scope())[entry.key].prepare(entry.args), selected = scope(1);
    const d = metadataDescriptors(selected)[entry.key];
    selected.workerAttributionScriptNames.length = 0;
    const expanded = d.prepare(entry.args);
    assert.equal(expanded.resource.id, `${basic.resource.id}:attribution`);
    assert.deepEqual(expanded.request, basic.request); assert.deepEqual(expanded.arguments, basic.arguments);
    assert.equal(expanded.resource.revision, basic.resource.revision);
    const out = d.project(success(entry.response()), expanded);
    assert.ok(entry.key.endsWith("List") ? out.items[0].attribution : out.attribution);
  }
});

test("Cloudflare exact-version attribution detail and binding combinations have eight independent identities", () => {
  const base = metadataDescriptors(scope()).versionGet.prepare(versionArgs), ids = new Set();
  for (let mask = 0; mask < 8; mask++) {
    const selected = scope(mask), d = metadataDescriptors(selected).versionGet;
    selected.workerAttributionScriptNames.length = 0; selected.workerVersionDetailScriptNames.length = 0;
    selected.workerVersionBindings.length = 0;
    const p = d.prepare(versionArgs), out = d.project(success(version()), p);
    assert.equal(p.resource.id, base.resource.id + suffix(mask)); ids.add(p.resource.id);
    assert.deepEqual(p.request, base.request); assert.equal(p.resource.revision, base.resource.revision);
    assert.equal(Object.hasOwn(out, "attribution"), Boolean(mask & 1));
    assert.equal(Object.hasOwn(out, "detail"), Boolean(mask & 2));
    assert.equal(Object.hasOwn(out, "bindings"), Boolean(mask & 4));
    if (mask & 1) assert.deepEqual(out.attribution.createdOn, { status: "provider-reported", value: stamp });
    if (mask & 2) { assert.equal(out.detail.scriptContentTag.value, tag); assert.equal(out.detail.cpuMs.value, 50); }
    if (mask & 4) assert.deepEqual(out.bindings.items, [binding]);
    safe({ audit: [], journal: [] }, out);
  }
  assert.equal(ids.size, 8);
  for (const entry of cases.filter(entry => entry.key.endsWith("List"))) {
    assert.deepEqual(metadataDescriptors(scope(6))[entry.key].prepare(entry.args), metadataDescriptors(scope())[entry.key].prepare(entry.args));
  }
});

test("Cloudflare attribution cannot reuse base policy and base projections cannot reuse attribution policy", async () => {
  for (const entry of cases) {
    const base = metadataDescriptors(scope())[entry.key].prepare(entry.args).resource.id;
    for (const mask of [0, 1]) {
      const f = fixture(entry, mask, base + suffix(mask ^ 1)), out = await f.invoke();
      assert.equal(out.code, "POLICY_DENIED"); assert.equal(out.ok, false);
      assert.equal(f.calls.secret, 0); assert.equal(f.calls.close, 0); assert.equal(f.requests.length, 0); safe(f, out);
    }
  }
});

test("Cloudflare version expansion policy requires the exact combination before credentials and network", async () => {
  const base = metadataDescriptors(scope()).versionGet.prepare(versionArgs).resource.id;
  for (let mask = 0; mask < 8; mask++) {
    for (let policy = 0; policy < 8; policy++) {
      if (policy === mask) continue;
      const f = fixture(versionCase, mask, base + suffix(policy)), out = await f.invoke();
      assert.equal(out.code, "POLICY_DENIED", `selection ${mask}, policy ${policy}`);
      assert.equal(f.calls.secret, 0); assert.equal(f.calls.close, 0); assert.equal(f.requests.length, 0); safe(f, out);
    }
  }
});

test("Cloudflare expanded resources bind exact core targets audit journal and replay", async () => {
  const selections = [...cases.slice(0, 3).map(entry => ({ entry, mask: 1 })),
    ...Array.from({ length: 8 }, (_, mask) => ({ entry: versionCase, mask }))];
  for (const { entry, mask } of selections) {
    const f = fixture(entry, mask), resolve = f.dependencies.credentials.resolve;
    let target;
    f.dependencies.credentials.resolve = async value => { target = value; return resolve(value); };
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.deepEqual(target.resource, f.operation.prepare(entry.args).resource);
    assert.deepEqual(f.audit.map(record => record.phase), ["intent", "outcome"]);
    for (const record of f.audit) assert.equal(record.targetHash, canonicalHash(target));
    assert.equal([...f.journal.values()][0].target, canonicalHash(target));
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
});

test("Cloudflare expanded deployment and version execute refuse downgraded prepared resource identities", async () => {
  for (const entry of cases) {
    for (const mask of entry === versionCase ? [1, 2, 3, 5, 6, 7] : [1]) {
      const f = fixture(entry, mask), prepared = f.operation.prepare(entry.args);
      const resource = metadataDescriptors(scope())[entry.key].prepare(entry.args).resource;
      await assert.rejects(() => f.operation.execute({ ...prepared, resource }, credentialCanary, new AbortController().signal), /scope/);
      assert.equal(f.requests.length, 0);
    }
  }
});
