import assert from "node:assert/strict";
import test from "node:test";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const store = "c".repeat(32);
const secret = "d".repeat(32);
const namespace = "e".repeat(32);
const object = "f".repeat(64);
const record = "1".repeat(32);
const deployment = "11111111-2222-4333-8444-555555555555";
const page = { page: 1, perPage: 10 };
const partial = item => ({ items: [item], complete: false });
const storeRow = { id: store, account_id: account };
const secretRow = { id: secret, store_id: store, name: "DATABASE_URL" };
const namespaceRow = { id: namespace, account_id: account };
const objectRow = { id: object, namespace_id: namespace, account_id: account };
const projectRow = { id: "project-id", name: "safe-project", account_id: account };
const deploymentRow = { id: deployment, project_name: "safe-project", project_id: "project-id", account_id: account };
const recordRow = { id: record, zone_id: zone };
const zoneRow = { id: zone, account: { id: account } };
const root = `/accounts/${account}`;
const cases = [
  ["cloudflare.secrets_store.stores.list", page, [storeRow], partial({ id: store }), `${root}/secrets_store/stores?page=1&per_page=10`],
  ["cloudflare.secrets_store.stores.get", { storeId: store }, storeRow, { id: store }, `${root}/secrets_store/stores/${store}`],
  ["cloudflare.secrets_store.secrets.list", { storeId: store, ...page }, [secretRow], partial({ id: secret, name: "DATABASE_URL" }), `${root}/secrets_store/stores/${store}/secrets?page=1&per_page=10`],
  ["cloudflare.secrets_store.secrets.get", { storeId: store, secretId: secret }, secretRow, { id: secret, name: "DATABASE_URL" }, `${root}/secrets_store/stores/${store}/secrets/${secret}`],
  ["cloudflare.durable_objects.namespaces.list", page, [namespaceRow], partial({ id: namespace }), `${root}/workers/durable_objects/namespaces?page=1&per_page=10`],
  ["cloudflare.durable_objects.objects.list", { namespaceId: namespace, limit: 10 }, [objectRow], partial({ id: object }), `${root}/workers/durable_objects/namespaces/${namespace}/objects?limit=10`],
  ["cloudflare.pages.projects.list", page, [projectRow], partial({ id: "project-id" }), `${root}/pages/projects?page=1&per_page=10`],
  ["cloudflare.pages.projects.get", { projectName: "safe-project" }, projectRow, { id: "project-id" }, `${root}/pages/projects/safe-project`],
  ["cloudflare.pages.deployments.list", { projectName: "safe-project", ...page }, [deploymentRow], partial({ id: deployment }), `${root}/pages/projects/safe-project/deployments?page=1&per_page=10`],
  ["cloudflare.pages.deployments.get", { projectName: "safe-project", deploymentId: deployment }, deploymentRow, { id: deployment }, `${root}/pages/projects/safe-project/deployments/${deployment}`],
  ["cloudflare.zones.get", {}, zoneRow, { id: zone }, `/zones/${zone}`],
  ["cloudflare.dns.list", page, [recordRow], partial({ id: record }), `/zones/${zone}/dns_records?page=1&per_page=10`],
  ["cloudflare.dns.get", { dnsRecordId: record }, recordRow, { id: record }, `/zones/${zone}/dns_records/${record}`],
];
function scope() {
  return { accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    secretStores: [{ storeId: store, secretIds: [secret] }],
    durableNamespaces: [{ namespaceId: namespace, objectIds: [object] }],
    pagesProjects: [{ projectName: "safe-project", projectId: "project-id", deploymentIds: [deployment] }],
    zone: { zoneId: zone, dnsRecordIds: [record] } };
}
// Actual reviewed executor with process-local synthetic host/journal/lease only.
function fixture(entry, { metadataScope = scope(), result = entry[2] } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations(metadataScope,
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      const sensitive = row => ({ ...row, value: credentialCanary, content: derivedCanary,
        env_vars: { PRIVATE: credentialCanary }, origin: { password: derivedCanary } });
      return new Response(JSON.stringify({ success: true, errors: [],
        result: Array.isArray(result) ? result.map(sensitive) : sensitive(result) }),
      { headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === entry[0]);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(entry[1]).resource.id] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operations, operation, requests, invoke: (raw = entry[1], key = "call-a") => broker.call(entry[0], raw, "verified-runtime", key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary]) assert.ok(!serialized.includes(canary));
}
function noEffects(f) {
  assert.equal(f.calls.secret, 0);
  assert.equal(f.requests.length, 0);
}

test("Cloudflare remaining thirteen metadata bindings execute exact paths with ID/name-only projection and replay refusal", async () => {
  for (const entry of cases) {
    const f = fixture(entry);
    assert.equal(f.operations.length, 44);
    assert.equal(new Set(f.operations.map(op => op.name)).size, 44);
    assert.equal(f.operation.tier, "read");
    const result = await f.invoke();
    assert.equal(result.ok, true, entry[0]);
    assert.deepEqual(result.value, entry[3], entry[0]);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${entry[4]}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(row => row.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare family binding requires current agent AND exact resource policy before credentials", async () => {
  for (const entry of cases) {
    for (const denied of ["agent", "resource", "binding"]) {
      const f = fixture(entry);
      if (denied === "agent") f.vector.policy.agents = ["foreign-agent"];
      if (denied === "resource") f.vector.policy.resources = ["foreign-resource"];
      if (denied === "binding") f.dependencies.host.revalidate = async () => false;
      assert.equal((await f.invoke()).code, denied === "binding" ? "RESOURCE_CHANGED" : "POLICY_DENIED", `${entry[0]} ${denied}`);
      noEffects(f);
    }
  }
});

test("Cloudflare family revocation while resolving credentials prevents any provider request", async () => {
  for (const entry of cases) {
    const f = fixture(entry);
    const resolve = f.dependencies.credentials.resolve;
    f.dependencies.credentials.resolve = async target => {
      const lease = await resolve(target);
      f.vector.policy.revision = "policy-revoked";
      return lease;
    };
    assert.equal((await f.invoke()).code, "POLICY_CHANGED", entry[0]);
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.close, 1);
    assert.equal([...f.journal.values()][0].outcome, "refused");
  }
});

test("Cloudflare family arguments cannot override trusted account, zone, identity, transport or authority", async () => {
  for (const entry of cases) {
    for (const field of ["accountId", "zoneId", "agentId", "approval", "credential", "url", "headers"]) {
      const f = fixture(entry);
      assert.equal((await f.invoke({ ...entry[1], [field]: "forged" })).code, "INVALID_ARGUMENTS", `${entry[0]} ${field}`);
      noEffects(f);
    }
  }
});

test("Cloudflare family response association mismatches refuse without leaking provider contents", async () => {
  const mismatches = [
    [1, { ...storeRow, account_id: zone }],
    [3, { ...secretRow, store_id: zone }],
    [5, [{ ...objectRow, namespace_id: zone }]],
    [7, { ...projectRow, id: "reused-name-foreign-id" }],
    [9, { ...deploymentRow, project_id: "foreign-project" }],
    [10, { ...zoneRow, account: { id: zone } }],
    [12, { ...recordRow, zone_id: account }],
  ];
  for (const [index, result] of mismatches) {
    const f = fixture(cases[index], { result });
    const refused = await f.invoke();
    assert.equal(refused.code, "UPSTREAM_UNAVAILABLE", cases[index][0]);
    assert.equal(f.calls.close, 1);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    safe(f, refused);
  }
});

test("Cloudflare family snapshots cannot be widened; absent zone means absent zone/DNS operations", () => {
  const input = scope();
  const operations = cloudflareReadOperations(input, { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] });
  input.secretStores[0].secretIds.push(zone);
  input.durableNamespaces.push({ namespaceId: zone, objectIds: [object] });
  input.pagesProjects[0].deploymentIds.push("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  input.zone.dnsRecordIds.push(account);
  input.zone.zoneId = account;
  input.accountId = zone;
  for (const [name, args] of [
    ["cloudflare.secrets_store.secrets.get", { storeId: store, secretId: zone }],
    ["cloudflare.durable_objects.objects.list", { namespaceId: zone, limit: 10 }],
    ["cloudflare.pages.deployments.get", { projectName: "safe-project", deploymentId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }],
    ["cloudflare.dns.get", { dnsRecordId: account }],
  ]) assert.throws(() => operations.find(op => op.name === name).prepare(args), /scope/);
  assert.equal(operations.find(op => op.name === "cloudflare.zones.get").prepare({}).plan.request.path, `/zones/${zone}`);
  const empty = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [] },
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] });
  assert.ok(!empty.some(op => op.name.startsWith("cloudflare.zones.") || op.name.startsWith("cloudflare.dns.")));
  for (const [name, args] of [
    ["cloudflare.secrets_store.stores.get", { storeId: store }],
    ["cloudflare.durable_objects.objects.list", { namespaceId: namespace, limit: 10 }],
    ["cloudflare.pages.projects.get", { projectName: "safe-project" }],
  ]) assert.throws(() => empty.find(op => op.name === name).prepare(args), /scope/);
});
