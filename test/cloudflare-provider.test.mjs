import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { accessPolicyMetadataDescriptors, accessApplicationMetadataDescriptors, metadataDescriptors, zoneMetadataDescriptors, workerRouteMetadataDescriptors, secretsStoreMetadataDescriptors, durableObjectMetadataDescriptors, pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { currentContentDescriptor } from "../dist/plugins/cloudflare-broker/src/current-content.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { versionAssetDescriptor } from "../dist/plugins/cloudflare-broker/src/version-assets.js";
import { workerDomainMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/worker-domains.js";
import { deletionPlanDescriptors } from "../dist/plugins/cloudflare-broker/src/deletion-plans.js";
import { inventory, source } from "../plugins/cloudflare-broker/scripts/inventory.mjs";
import { familySummary } from "../plugins/cloudflare-broker/scripts/families.mjs";
import { supplementalInventory, supplementalSource } from "../plugins/cloudflare-broker/scripts/supplemental.mjs";

const account = "a".repeat(32);
const own = "b".repeat(32);
const other = "c".repeat(32);
const db = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const otherDb = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const scope = { accountId: account, revision: "policy-1", scriptNames: ["safe-worker"], hyperdriveIds: [own], databaseIds: [db], defaultBucketNames: ["safe-bucket"], workerDeployments: [{ scriptName: "safe-worker", deploymentIds: [db] }], workerVersions: [{ scriptName: "safe-worker", versionIds: [db] }] };
scope.kvNamespaceIds = [own];
scope.queueIds = [other];
scope.workerControlScriptNames = ["safe-worker"];
const descriptors = metadataDescriptors(scope);
const kvQueueCases = [
  ["kvNamespacesList", { page: 2, perPage: 10 }, "storage/kv/namespaces?page=2&per_page=10", "kv:namespaces"],
  ["kvNamespaceGet", { namespaceId: own }, `storage/kv/namespaces/${own}`, `kv:namespace:${own}`],
  ["queuesList", {}, "queues", "queues"],
  ["queueGet", { queueId: other }, `queues/${other}`, `queue:${other}`],
];
const zone = "d".repeat(32);
const zoneScope = { accountId: account, zoneId: zone, revision: "policy-1", dnsRecordIds: [own] };
const zoneDescriptors = zoneMetadataDescriptors(zoneScope);
const target = id => ({ id, revision: "resource-1", securityImpact: "does-not-weaken-security" });
const deletionScope = {
  accountId: account, zoneId: zone,
  workerScripts: [target("safe-worker")], hyperdrives: [target(own)],
  databases: [target(db)], defaultBuckets: [target("safe-bucket")], dnsRecords: [target(own)],
};
const deletionDescriptors = deletionPlanDescriptors(deletionScope);
const secretsStoreScope = { accountId: account, revision: "policy-1", stores: [{ storeId: own, secretIds: [zone] }, { storeId: other, secretIds: [account] }] };
const secretsStoreDescriptors = secretsStoreMetadataDescriptors(secretsStoreScope);
const secretsStoreCases = [
  ["storesList", { page: 2, perPage: 10 }, `?page=2&per_page=10`, ""],
  ["storeGet", { storeId: own }, `/${own}`, `:${own}`],
  ["secretsList", { storeId: own, page: 2, perPage: 10 }, `/${own}/secrets?page=2&per_page=10`, `:${own}:secrets`],
  ["secretGet", { storeId: own, secretId: zone }, `/${own}/secrets/${zone}`, `:${own}:secret:${zone}`],
];
const objectId = "e".repeat(64);
const foreignObjectId = "f".repeat(64);
const durableScope = { accountId: account, revision: "policy-1", namespaces: [{ namespaceId: own, objectIds: [objectId] }, { namespaceId: other, objectIds: [foreignObjectId] }] };
const durableDescriptors = durableObjectMetadataDescriptors(durableScope);
const durableCases = [
  ["durableNamespacesList", { page: 2, perPage: 10 }, "?page=2&per_page=10", ":namespaces"],
  ["durableObjectsList", { namespaceId: own, limit: 10 }, `/${own}/objects?limit=10`, `:namespace:${own}:objects`],
];
const pagesScope = { accountId: account, revision: "policy-1", projects: [{ projectName: "safe-project", projectId: own, deploymentIds: [db] }, { projectName: "other-project", projectId: other, deploymentIds: [otherDb] }] };
const pagesDescriptors = pagesMetadataDescriptors(pagesScope);
const pagesCases = [
  ["pagesProjectsList", { page: 2, perPage: 10 }, "?page=2&per_page=10", ":projects"],
  ["pagesProjectGet", { projectName: "safe-project" }, "/safe-project", `:project:${own}`],
  ["pagesDeploymentsList", { projectName: "safe-project", page: 2, perPage: 10 }, "/safe-project/deployments?page=2&per_page=10", `:project:${own}:deployments`],
  ["pagesDeploymentGet", { projectName: "safe-project", deploymentId: db }, `/safe-project/deployments/${db}`, `:project:${own}:deployment:${db}`],
];
const routeDescriptors = workerRouteMetadataDescriptors({ accountId: account, zoneId: zone, revision: "policy-1", routes: [{ routeId: own, scriptName: "safe-worker" }] });
const accessDescriptors = accessApplicationMetadataDescriptors({ accountId: account, revision: "policy-1", applications: [{ applicationId: db, primaryDomain: "example.com/admin" }] });
const accessPolicyDescriptors = accessPolicyMetadataDescriptors({ accountId: account, revision: "policy-1", applications: [{ applicationId: db, policyIds: [otherDb] }] });
const metadataOnly = { ...descriptors, ...zoneDescriptors, ...routeDescriptors, ...accessDescriptors, ...accessPolicyDescriptors, ...secretsStoreDescriptors, ...durableDescriptors, ...pagesDescriptors };
const contentDescriptor = currentContentDescriptor({ accountId: account, revision: "source-policy-1", sourceDigestScriptNames: ["safe-worker"] });
const allDescriptors = { ...metadataOnly, ...deletionDescriptors, contentDescriptor,
  ...workerDomainMetadataDescriptors({ accountId: account, revision: "policy-1" }),
  versionAssets: versionAssetDescriptor({ accountId: account, revision: "policy-1", workers: [{ scriptName: "safe-worker", versionIds: [db] }] }),
};
const deletionCases = [
  ["workerDelete", { scriptName: "safe-worker" }, `/accounts/${account}/workers/scripts/safe-worker?force=false`, `cloudflare:account:${account}:worker:safe-worker`],
  ["hyperdriveDelete", { hyperdriveId: own }, `/accounts/${account}/hyperdrive/configs/${own}`, `cloudflare:account:${account}:hyperdrive:${own}`],
  ["d1Delete", { databaseId: db }, `/accounts/${account}/d1/database/${db}`, `cloudflare:account:${account}:d1:${db}`],
  ["r2Delete", { bucketName: "safe-bucket" }, `/accounts/${account}/r2/buckets/safe-bucket`, `cloudflare:account:${account}:r2:jurisdiction:default:bucket:safe-bucket`],
  ["dnsDelete", { dnsRecordId: own }, `/zones/${zone}/dns_records/${own}`, `cloudflare:account:${account}:zone:${zone}:dns:${own}`],
];
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const refuses = (callback, code) => assert.throws(callback, error => error.message === code && error.code === code);

// Descriptors are intentionally not a live authorization or provider client fixture.
test("Cloudflare descriptors build exact bounded GET requests from trusted account context", () => {
  const workers = descriptors.workersList.prepare({});
  assert.deepEqual(workers.request, {
    method: "GET", path: `/accounts/${account}/workers/scripts`, maxResponseBytes: 131072,
    timeoutMs: 10000, maxRequests: 1, redirects: "deny",
  });
  const secrets = descriptors.secretNames.prepare({ scriptName: "safe-worker" });
  assert.equal(secrets.request.path, `/accounts/${account}/workers/scripts/safe-worker/secrets`);
  const list = descriptors.hyperdriveList.prepare({ page: 2, perPage: 10 });
  assert.equal(list.request.path, `/accounts/${account}/hyperdrive/configs?page=2&per_page=10`);
  const get = descriptors.hyperdriveGet.prepare({ hyperdriveId: own });
  assert.equal(get.request.path, `/accounts/${account}/hyperdrive/configs/${own}`);
  assert.equal(get.resource.id, `cloudflare:account:${account}:hyperdrive:${own}`);
  assert.equal(get.resource.revision, "policy-1");
  assert.ok(Object.isFrozen(get) && Object.isFrozen(get.arguments) && Object.isFrozen(get.request) && Object.isFrozen(get.resource));
});

test("Cloudflare descriptors reject model-supplied identity, account, authority and transport fields", () => {
  for (const key of ["accountId", "zoneId", "agentId", "approval", "url", "headers", "credential", "secretRef", "operation"]) {
    refuses(() => descriptors.workersList.prepare({ [key]: "forged" }), "schema");
    refuses(() => descriptors.secretNames.prepare({ scriptName: "safe-worker", [key]: "forged" }), "schema");
  }
  refuses(() => descriptors.secretNames.prepare({ scriptName: "other-worker" }), "scope");
  refuses(() => descriptors.hyperdriveGet.prepare({ hyperdriveId: other }), "scope");
  refuses(() => descriptors.secretNames.prepare({ scriptName: "../safe-worker?account=other" }), "schema");
  refuses(() => descriptors.hyperdriveGet.prepare({ hyperdriveId: own.toUpperCase() }), "schema");
  for (const scriptName of ["safe-worker%2fsecret", "safe-worker\u0000", "safе-worker", "safe-worker\ud800"]) {
    refuses(() => descriptors.secretNames.prepare({ scriptName }), "schema");
  }
});

test("Cloudflare resource snapshots cannot be widened by mutating the source allowlists", () => {
  const input = { ...scope, scriptNames: ["safe-worker"], hyperdriveIds: [own] };
  const snapshot = metadataDescriptors(input);
  input.scriptNames.push("other-worker");
  input.hyperdriveIds.push(other);
  input.accountId = other;
  refuses(() => snapshot.secretNames.prepare({ scriptName: "other-worker" }), "scope");
  refuses(() => snapshot.hyperdriveGet.prepare({ hyperdriveId: other }), "scope");
  assert.equal(snapshot.workersList.prepare({}).request.path, `/accounts/${account}/workers/scripts`);
});

test("Cloudflare projections expose only allowed resource metadata and secret names, never values", () => {
  const canary = "postgres://admin:never-return-this@private.example/db";
  const workerResult = descriptors.workersList.project(success([
    { id: "safe-worker", script: canary, bindings: [{ text: canary }] },
    { id: "other-worker", source: canary },
  ]), descriptors.workersList.prepare({}));
  assert.deepEqual(workerResult, { items: [{ id: "safe-worker" }], complete: false });
  const input = descriptors.secretNames.prepare({ scriptName: "safe-worker" });
  const names = descriptors.secretNames.project(success([
    { name: "DATABASE_URL", type: "secret_text", text: canary, value: canary },
    { name: "SIGNING_KEY", type: "secret_key", algorithm: canary, key_base64: canary },
  ]), input);
  assert.deepEqual(names, { items: [{ name: "DATABASE_URL", type: "secret_text" }, { name: "SIGNING_KEY", type: "secret_key" }], complete: false });
  const config = { id: own, name: canary, origin: { password: canary, host: canary }, caching: { disabled: false }, connectionString: canary, integration: { token: canary } };
  const get = descriptors.hyperdriveGet.project(success(config), descriptors.hyperdriveGet.prepare({ hyperdriveId: own }));
  assert.deepEqual(get, { id: own, cachingDisabled: false });
  const list = descriptors.hyperdriveList.project(success([config, { ...config, id: other }]), descriptors.hyperdriveList.prepare({ page: 1, perPage: 2 }));
  assert.deepEqual(list, { items: [get], complete: false });
  assert.ok(!JSON.stringify([workerResult, names, get, list]).includes(canary));
});

test("Cloudflare descriptors refuse mismatched resources, malformed success and unsafe provider strings", () => {
  const input = descriptors.hyperdriveGet.prepare({ hyperdriveId: own });
  refuses(() => descriptors.hyperdriveGet.project(success({ id: other, caching: { disabled: false } }), input), "scope");
  for (const raw of ["not-json", "null", "[]", success(null), JSON.stringify({ success: false, errors: [{ message: "secret-value" }], result: [] }), JSON.stringify({ success: true, result: [] })]) {
    assert.throws(() => descriptors.hyperdriveGet.project(raw, input), error => ["upstream", "scope"].includes(error.code) && !error.message.includes("secret-value"));
  }
  refuses(() => descriptors.secretNames.project(success([{ name: "unsafe\nname", type: "secret_text" }]), descriptors.secretNames.prepare({ scriptName: "safe-worker" })), "upstream");
  refuses(() => descriptors.secretNames.project(success([{ name: "KEY", type: "plain_text" }]), descriptors.secretNames.prepare({ scriptName: "safe-worker" })), "upstream");
  refuses(() => descriptors.hyperdriveGet.project(success({ id: own, caching: { disabled: "no" } }), input), "upstream");
});

test("Cloudflare descriptor limits refuse oversized results and never imply complete pagination", () => {
  for (const value of [0, -1, 1.5, 1001, Infinity, "1"]) refuses(() => descriptors.hyperdriveList.prepare({ page: value, perPage: 10 }), "schema");
  for (const value of [0, 101, -1, "10"]) refuses(() => descriptors.hyperdriveList.prepare({ page: 1, perPage: value }), "schema");
  refuses(() => descriptors.workersList.project(success(Array.from({ length: 101 }, () => ({ id: "safe-worker" }))), descriptors.workersList.prepare({})), "cap");
  refuses(() => descriptors.workersList.project("x".repeat(131073), descriptors.workersList.prepare({})), "cap");
  refuses(() => descriptors.hyperdriveList.project(success([{ id: own, caching: { disabled: true } }, { id: other }]), descriptors.hyperdriveList.prepare({ page: 1, perPage: 1 })), "cap");
  assert.deepEqual(descriptors.workersList.project(success([]), descriptors.workersList.prepare({})), { items: [], complete: false });
});

test("Cloudflare descriptors supply no credential, execution, approval or generic transport entry point", () => {
  for (const descriptor of Object.values(metadataOnly)) {
    assert.equal(descriptor.tier, "read");
    assert.deepEqual(Object.keys(descriptor).sort(), ["name", "prepare", "project", "providerOperationId", "tier", "version"]);
    assert.equal(descriptor.execute, undefined);
    assert.equal(descriptor.call, undefined);
  }
  assert.equal(descriptors.dnsUpdate, undefined);
});

test("Cloudflare storage descriptors bind IDs and default jurisdiction without query or object access", () => {
  const list = descriptors.d1List.prepare({ page: 2, perPage: 10 });
  assert.equal(list.request.path, `/accounts/${account}/d1/database?page=2&per_page=10`);
  const get = descriptors.d1Get.prepare({ databaseId: db });
  assert.equal(get.request.path, `/accounts/${account}/d1/database/${db}?fields=uuid`);
  assert.equal(get.resource.id, `cloudflare:account:${account}:d1:${db}`);
  assert.equal(descriptors.r2List.prepare({ perPage: 10 }).request.path, `/accounts/${account}/r2/buckets?per_page=10`);
  const bucket = descriptors.r2Get.prepare({ bucketName: "safe-bucket" });
  assert.equal(bucket.request.path, `/accounts/${account}/r2/buckets/safe-bucket`);
  assert.equal(bucket.resource.id, `cloudflare:account:${account}:r2:jurisdiction:default:bucket:safe-bucket`);
  for (const [descriptor, args] of [[descriptors.d1List, { page: 1, perPage: 10 }], [descriptors.d1Get, { databaseId: db }], [descriptors.r2List, { perPage: 10 }], [descriptors.r2Get, { bucketName: "safe-bucket" }]]) {
    for (const key of ["accountId", "agentId", "jurisdiction", "headers", "url", "sql", "objectKey", "cursor", "approval", "credential"]) {
      refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
    }
    const prepared = descriptor.prepare(args);
    assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared.arguments) && Object.isFrozen(prepared.request));
    assert.equal(prepared.request.method, "GET");
    assert.equal(prepared.request.maxRequests, 1);
    assert.equal(prepared.request.redirects, "deny");
  }
  refuses(() => descriptors.d1Get.prepare({ databaseId: otherDb }), "scope");
  refuses(() => descriptors.r2Get.prepare({ bucketName: "other-bucket" }), "scope");
  for (const databaseId of [db.toUpperCase(), "../database", own]) refuses(() => descriptors.d1Get.prepare({ databaseId }), "schema");
  for (const bucketName of ["ab", "a".repeat(65), "safe-bucket/objects", "safe-bucket?x=1", "sаfe-bucket", "safe-bucket\n"]) refuses(() => descriptors.r2Get.prepare({ bucketName }), "schema");
});

test("Cloudflare storage projections filter each item and omit rows, objects and descriptive payloads", () => {
  const canary = "never-return-private-content";
  const database = { uuid: db, name: canary, rows: [{ secret: canary }], file_size: canary };
  const bucket = { name: "safe-bucket", jurisdiction: "default", objects: [{ body: canary }], location: canary };
  const d1 = descriptors.d1Get.project(success(database), descriptors.d1Get.prepare({ databaseId: db }));
  assert.deepEqual(d1, { id: db });
  const d1List = descriptors.d1List.project(success([database, { uuid: otherDb, name: canary }]), descriptors.d1List.prepare({ page: 1, perPage: 10 }));
  assert.deepEqual(d1List, { items: [d1], complete: false });
  const r2 = descriptors.r2Get.project(success(bucket), descriptors.r2Get.prepare({ bucketName: "safe-bucket" }));
  assert.deepEqual(r2, { name: "safe-bucket" });
  const r2List = descriptors.r2List.project(success({ buckets: [bucket, { name: "other-bucket", objects: canary }], cursor: canary }), descriptors.r2List.prepare({ perPage: 10 }));
  assert.deepEqual(r2List, { items: [r2], complete: false });
  assert.ok(!JSON.stringify([d1, d1List, r2, r2List]).includes(canary));
  refuses(() => descriptors.d1Get.project(success({ uuid: otherDb }), descriptors.d1Get.prepare({ databaseId: db })), "scope");
  refuses(() => descriptors.r2Get.project(success({ name: "other-bucket" }), descriptors.r2Get.prepare({ bucketName: "safe-bucket" })), "scope");
  refuses(() => descriptors.r2Get.project(success({ ...bucket, jurisdiction: "eu" }), descriptors.r2Get.prepare({ bucketName: "safe-bucket" })), "scope");
  refuses(() => descriptors.r2List.project(success({ buckets: [{ ...bucket, jurisdiction: "eu" }] }), descriptors.r2List.prepare({ perPage: 10 })), "scope");
});

test("Cloudflare storage snapshots default empty and cannot be widened after construction", () => {
  const input = { ...scope, databaseIds: [db], defaultBucketNames: ["safe-bucket"] };
  const snapshot = metadataDescriptors(input);
  input.databaseIds.push(otherDb);
  input.defaultBucketNames.push("other-bucket");
  refuses(() => snapshot.d1Get.prepare({ databaseId: otherDb }), "scope");
  refuses(() => snapshot.r2Get.prepare({ bucketName: "other-bucket" }), "scope");
  const empty = metadataDescriptors({ accountId: account, revision: "policy-1", scriptNames: [], hyperdriveIds: [] });
  refuses(() => empty.d1Get.prepare({ databaseId: db }), "scope");
  refuses(() => empty.r2Get.prepare({ bucketName: "safe-bucket" }), "scope");
  assert.deepEqual(empty.d1List.project(success([{ uuid: db }]), empty.d1List.prepare({ page: 1, perPage: 10 })), { items: [], complete: false });
  assert.deepEqual(empty.r2List.project(success({ buckets: [{ name: "safe-bucket" }] }), empty.r2List.prepare({ perPage: 10 })), { items: [], complete: false });
});

test("Cloudflare storage descriptors enforce provider pagination shapes and fail closed on oversize or errors", () => {
  for (const perPage of [0, 9, 101, "10"]) refuses(() => descriptors.d1List.prepare({ page: 1, perPage }), "schema");
  for (const perPage of [0, 101, 1.5, "10"]) refuses(() => descriptors.r2List.prepare({ perPage }), "schema");
  const d1 = descriptors.d1List.prepare({ page: 1, perPage: 10 });
  const r2 = descriptors.r2List.prepare({ perPage: 1 });
  refuses(() => descriptors.d1List.project(success(Array.from({ length: 11 }, () => ({ uuid: db }))), d1), "cap");
  refuses(() => descriptors.r2List.project(success({ buckets: [{ name: "safe-bucket" }, { name: "other-bucket" }] }), r2), "cap");
  refuses(() => descriptors.r2List.project(success([]), r2), "upstream");
  for (const [descriptor, input] of [[descriptors.d1List, d1], [descriptors.r2List, r2]]) {
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    refuses(() => descriptor.project(JSON.stringify({ success: false, errors: [{ message: "secret-value" }], result: [] }), input), "upstream");
  }
});

test("Cloudflare zone context is trusted and cannot be supplied in model arguments", () => {
  assert.equal(zoneDescriptors.zoneGet.prepare({}).request.path, `/zones/${zone}`);
  assert.equal(zoneDescriptors.dnsList.prepare({ page: 2, perPage: 10 }).request.path, `/zones/${zone}/dns_records?page=2&per_page=10`);
  const get = zoneDescriptors.dnsGet.prepare({ dnsRecordId: own });
  assert.equal(get.request.path, `/zones/${zone}/dns_records/${own}`);
  assert.equal(get.resource.id, `cloudflare:account:${account}:zone:${zone}:dns:${own}`);
  assert.equal(get.resource.revision, "policy-1");
  for (const [descriptor, args] of [[zoneDescriptors.zoneGet, {}], [zoneDescriptors.dnsList, { page: 1, perPage: 10 }], [zoneDescriptors.dnsGet, { dnsRecordId: own }]]) {
    for (const key of ["accountId", "zoneId", "agentId", "approval", "headers", "url", "credential", "content", "search", "name"]) {
      refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
    }
    const input = descriptor.prepare(args);
    assert.ok(Object.isFrozen(input) && Object.isFrozen(input.arguments) && Object.isFrozen(input.resource) && Object.isFrozen(input.request));
    assert.equal(input.request.method, "GET");
    assert.equal(input.request.redirects, "deny");
    assert.equal(input.request.maxRequests, 1);
  }
  refuses(() => zoneDescriptors.dnsGet.prepare({ dnsRecordId: other }), "scope");
  for (const dnsRecordId of [own.toUpperCase(), "../records", `${own}?zone=other`]) refuses(() => zoneDescriptors.dnsGet.prepare({ dnsRecordId }), "schema");
});

test("Cloudflare zone metadata refuses foreign accounts and DNS projections omit contents and names", () => {
  const canary = "never-return-private-dns-content";
  const zoneInput = zoneDescriptors.zoneGet.prepare({});
  assert.deepEqual(zoneDescriptors.zoneGet.project(success({ id: zone, account: { id: account, name: canary }, name: canary, name_servers: [canary], plan: canary }), zoneInput), { id: zone });
  refuses(() => zoneDescriptors.zoneGet.project(success({ id: zone, account: { id: other } }), zoneInput), "scope");
  refuses(() => zoneDescriptors.zoneGet.project(success({ id: other, account: { id: account } }), zoneInput), "scope");
  refuses(() => zoneDescriptors.zoneGet.project(success({ id: zone }), zoneInput), "upstream");
  const row = { id: own, zone_id: zone, content: canary, name: canary, comment: canary, tags: [canary], data: { value: canary }, meta: canary };
  const getInput = zoneDescriptors.dnsGet.prepare({ dnsRecordId: own });
  const get = zoneDescriptors.dnsGet.project(success(row), getInput);
  assert.deepEqual(get, { id: own });
  const listInput = zoneDescriptors.dnsList.prepare({ page: 1, perPage: 10 });
  const list = zoneDescriptors.dnsList.project(success([row, { ...row, id: other }]), listInput);
  assert.deepEqual(list, { items: [get], complete: false });
  assert.ok(!JSON.stringify([get, list]).includes(canary));
  refuses(() => zoneDescriptors.dnsGet.project(success({ ...row, id: other }), getInput), "scope");
  refuses(() => zoneDescriptors.dnsGet.project(success({ ...row, zone_id: other }), getInput), "scope");
  refuses(() => zoneDescriptors.dnsList.project(success([{ ...row, zone_id: other }]), listInput), "scope");
});

test("Cloudflare zone snapshots resist mutation and empty record allowlists expose nothing", () => {
  const input = { ...zoneScope, dnsRecordIds: [own] };
  const snapshot = zoneMetadataDescriptors(input);
  input.dnsRecordIds.push(other);
  input.zoneId = other;
  input.accountId = other;
  refuses(() => snapshot.dnsGet.prepare({ dnsRecordId: other }), "scope");
  assert.equal(snapshot.zoneGet.prepare({}).request.path, `/zones/${zone}`);
  assert.deepEqual(snapshot.zoneGet.project(success({ id: zone, account: { id: account } }), snapshot.zoneGet.prepare({})), { id: zone });
  const empty = zoneMetadataDescriptors({ ...zoneScope, dnsRecordIds: [] });
  refuses(() => empty.dnsGet.prepare({ dnsRecordId: own }), "scope");
  assert.deepEqual(empty.dnsList.project(success([{ id: own }]), empty.dnsList.prepare({ page: 1, perPage: 10 })), { items: [], complete: false });
});

test("Cloudflare zone metadata enforces page, row, byte and upstream-error limits", () => {
  for (const page of [0, 1001, 1.5, "1"]) refuses(() => zoneDescriptors.dnsList.prepare({ page, perPage: 10 }), "schema");
  for (const perPage of [0, 101, 1.5, "10"]) refuses(() => zoneDescriptors.dnsList.prepare({ page: 1, perPage }), "schema");
  const list = zoneDescriptors.dnsList.prepare({ page: 1, perPage: 1 });
  refuses(() => zoneDescriptors.dnsList.project(success([{ id: own }, { id: other }]), list), "cap");
  for (const [descriptor, args] of [[zoneDescriptors.zoneGet, {}], [zoneDescriptors.dnsList, { page: 1, perPage: 10 }], [zoneDescriptors.dnsGet, { dnsRecordId: own }]]) {
    const prepared = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), prepared), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private-value" }], result: [] })]) refuses(() => descriptor.project(raw, prepared), "upstream");
  }
});

test("Cloudflare deployment metadata binds account, script and deployment without a mutation path", () => {
  const list = descriptors.deploymentsList.prepare({ scriptName: "safe-worker", page: 2, perPage: 10 });
  assert.equal(list.request.path, `/accounts/${account}/workers/scripts/safe-worker/deployments?page=2&per_page=10`);
  assert.equal(list.resource.id, `cloudflare:account:${account}:worker:safe-worker:deployments`);
  const get = descriptors.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId: db });
  assert.equal(get.request.path, `/accounts/${account}/workers/scripts/safe-worker/deployments/${db}`);
  assert.equal(get.resource.id, `cloudflare:account:${account}:worker:safe-worker:deployment:${db}`);
  assert.equal(get.resource.revision, "policy-1");
  for (const [descriptor, args] of [[descriptors.deploymentsList, { scriptName: "safe-worker", page: 1, perPage: 10 }], [descriptors.deploymentGet, { scriptName: "safe-worker", deploymentId: db }]]) {
    for (const key of ["accountId", "agentId", "approval", "force", "versions", "headers", "url", "credential", "since", "until"]) refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
    const input = descriptor.prepare(args);
    assert.ok(Object.isFrozen(input) && Object.isFrozen(input.arguments) && Object.isFrozen(input.resource) && Object.isFrozen(input.request));
    assert.equal(input.request.method, "GET");
    assert.equal(input.request.redirects, "deny");
    assert.equal(input.request.maxRequests, 1);
  }
  refuses(() => descriptors.deploymentsList.prepare({ scriptName: "other-worker", page: 1, perPage: 10 }), "scope");
  refuses(() => descriptors.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId: otherDb }), "scope");
  for (const deploymentId of [db.toUpperCase(), own, "../deployment", `${db}?force=true`]) refuses(() => descriptors.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId }), "schema");
});

test("Cloudflare deployment projections omit annotations, author identity, version data and source", () => {
  const canary = "never-return-private-deployment-data";
  const row = { id: db, annotations: { "workers/message": canary }, author_email: canary, source: canary, versions: [{ version_id: canary, percentage: 100 }], bindings: canary };
  const getInput = descriptors.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId: db });
  const get = descriptors.deploymentGet.project(success(row), getInput);
  assert.deepEqual(get, { id: db });
  const listInput = descriptors.deploymentsList.prepare({ scriptName: "safe-worker", page: 1, perPage: 10 });
  const list = descriptors.deploymentsList.project(success({ deployments: [row, { ...row, id: otherDb }] }), listInput);
  assert.deepEqual(list, { items: [get], complete: false });
  assert.ok(!JSON.stringify([get, list]).includes(canary));
  refuses(() => descriptors.deploymentGet.project(success({ ...row, id: otherDb }), getInput), "scope");
});

test("Cloudflare deployment snapshots preserve per-script IDs and default to empty", () => {
  const input = { ...scope, scriptNames: ["safe-worker", "second-worker"], workerDeployments: [{ scriptName: "safe-worker", deploymentIds: [db] }, { scriptName: "second-worker", deploymentIds: [otherDb] }] };
  const snapshot = metadataDescriptors(input);
  input.workerDeployments[0].deploymentIds.push(otherDb);
  input.workerDeployments[1].deploymentIds.push(db);
  input.workerDeployments[0].scriptName = "second-worker";
  input.accountId = other;
  refuses(() => snapshot.deploymentGet.prepare({ scriptName: "second-worker", deploymentId: db }), "scope");
  refuses(() => snapshot.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId: otherDb }), "scope");
  assert.equal(snapshot.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId: db }).request.path, `/accounts/${account}/workers/scripts/safe-worker/deployments/${db}`);
  assert.deepEqual(snapshot.deploymentsList.project(success({ deployments: [{ id: db }, { id: otherDb }] }), snapshot.deploymentsList.prepare({ scriptName: "second-worker", page: 1, perPage: 10 })), { items: [{ id: otherDb }], complete: false });
  const empty = metadataDescriptors({ accountId: account, revision: "policy-1", scriptNames: ["safe-worker"], hyperdriveIds: [] });
  refuses(() => empty.deploymentGet.prepare({ scriptName: "safe-worker", deploymentId: db }), "scope");
  assert.deepEqual(empty.deploymentsList.project(success({ deployments: [{ id: db }] }), empty.deploymentsList.prepare({ scriptName: "safe-worker", page: 1, perPage: 10 })), { items: [], complete: false });
  refuses(() => metadataDescriptors({ ...scope, workerDeployments: [{ scriptName: "other-worker", deploymentIds: [db] }] }), "scope");
  refuses(() => metadataDescriptors({ ...scope, workerDeployments: [scope.workerDeployments[0], scope.workerDeployments[0]] }), "schema");
  refuses(() => metadataDescriptors({ ...scope, workerDeployments: [{ scriptName: "safe-worker", deploymentIds: Array(101).fill(db) }] }), "cap");
});

test("Cloudflare deployment metadata enforces pagination, bytes and fixed error refusals", () => {
  for (const page of [0, 1001, 1.5, "1"]) refuses(() => descriptors.deploymentsList.prepare({ scriptName: "safe-worker", page, perPage: 10 }), "schema");
  for (const perPage of [0, 101, 1.5, "10"]) refuses(() => descriptors.deploymentsList.prepare({ scriptName: "safe-worker", page: 1, perPage }), "schema");
  const list = descriptors.deploymentsList.prepare({ scriptName: "safe-worker", page: 1, perPage: 1 });
  refuses(() => descriptors.deploymentsList.project(success({ deployments: [{ id: db }, { id: otherDb }] }), list), "cap");
  refuses(() => descriptors.deploymentsList.project(success({ deployments: Array(101).fill({ id: db }) }), list), "cap");
  for (const [descriptor, args] of [[descriptors.deploymentsList, { scriptName: "safe-worker", page: 1, perPage: 10 }], [descriptors.deploymentGet, { scriptName: "safe-worker", deploymentId: db }]]) {
    const input = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private-value" }], result: {} })]) refuses(() => descriptor.project(raw, input), "upstream");
  }
  for (const result of [[], { deployments: [null] }]) refuses(() => descriptors.deploymentsList.project(success(result), list), "upstream");
  for (const result of [{}, { deployments: null }]) refuses(() => descriptors.deploymentsList.project(success(result), list), "cap");
});

test("Cloudflare version metadata binds script and version while pinning bounded pagination", () => {
  const list = descriptors.versionsList.prepare({ scriptName: "safe-worker", page: 2, perPage: 10 });
  assert.equal(list.request.path, `/accounts/${account}/workers/scripts/safe-worker/versions?deployable=false&page=2&per_page=10`);
  assert.equal(list.resource.id, `cloudflare:account:${account}:worker:safe-worker:versions`);
  const get = descriptors.versionGet.prepare({ scriptName: "safe-worker", versionId: db });
  assert.equal(get.request.path, `/accounts/${account}/workers/scripts/safe-worker/versions/${db}`);
  assert.equal(get.resource.id, `cloudflare:account:${account}:worker:safe-worker:version:${db}`);
  assert.equal(get.resource.revision, "policy-1");
  for (const [descriptor, args] of [[descriptors.versionsList, { scriptName: "safe-worker", page: 1, perPage: 10 }], [descriptors.versionGet, { scriptName: "safe-worker", versionId: db }]]) {
    for (const key of ["accountId", "agentId", "deployable", "approval", "headers", "url", "credential", "resources", "source"]) refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
    const input = descriptor.prepare(args);
    for (const value of [descriptor, input, input.arguments, input.resource, input.request]) assert.ok(Object.isFrozen(value));
    assert.equal(input.request.method, "GET");
    assert.equal(input.request.maxRequests, 1);
    assert.equal(input.request.redirects, "deny");
  }
  refuses(() => descriptors.versionsList.prepare({ scriptName: "other-worker", page: 1, perPage: 10 }), "scope");
  refuses(() => descriptors.versionGet.prepare({ scriptName: "safe-worker", versionId: otherDb }), "scope");
  for (const versionId of [db.toUpperCase(), own, "../version", `${db}?deployable=true`]) refuses(() => descriptors.versionGet.prepare({ scriptName: "safe-worker", versionId }), "schema");
});

test("Cloudflare version projections omit bindings, runtime, source and author identity", () => {
  const canary = "never-return-private-version-data";
  const row = { id: db, metadata: { author_email: canary, author_id: canary, source: canary }, resources: { bindings: [{ type: "plain_text", text: canary }], script: { etag: canary }, script_runtime: { exports: canary } }, source: canary };
  const getInput = descriptors.versionGet.prepare({ scriptName: "safe-worker", versionId: db });
  const get = descriptors.versionGet.project(success(row), getInput);
  assert.deepEqual(get, { id: db });
  const listInput = descriptors.versionsList.prepare({ scriptName: "safe-worker", page: 1, perPage: 10 });
  const list = descriptors.versionsList.project(success({ items: [row, { ...row, id: otherDb }] }), listInput);
  assert.deepEqual(list, { items: [get], complete: false });
  assert.ok(!JSON.stringify([get, list]).includes(canary));
  refuses(() => descriptors.versionGet.project(success({ ...row, id: otherDb }), getInput), "scope");
});

test("Cloudflare version allowlists are copied, script-specific and separate from deployments", () => {
  const input = { ...scope, scriptNames: ["safe-worker", "second-worker"], workerVersions: [{ scriptName: "safe-worker", versionIds: [db] }, { scriptName: "second-worker", versionIds: [otherDb] }] };
  const snapshot = metadataDescriptors(input);
  input.workerVersions[0].versionIds.push(otherDb);
  input.workerVersions[1].versionIds.push(db);
  input.workerVersions[0].scriptName = "second-worker";
  input.accountId = other;
  refuses(() => snapshot.versionGet.prepare({ scriptName: "second-worker", versionId: db }), "scope");
  refuses(() => snapshot.versionGet.prepare({ scriptName: "safe-worker", versionId: otherDb }), "scope");
  assert.equal(snapshot.versionGet.prepare({ scriptName: "safe-worker", versionId: db }).request.path, `/accounts/${account}/workers/scripts/safe-worker/versions/${db}`);
  assert.deepEqual(snapshot.versionsList.project(success({ items: [{ id: db }, { id: otherDb }] }), snapshot.versionsList.prepare({ scriptName: "second-worker", page: 1, perPage: 10 })), { items: [{ id: otherDb }], complete: false });
  const empty = metadataDescriptors({ ...scope, workerVersions: undefined });
  refuses(() => empty.versionGet.prepare({ scriptName: "safe-worker", versionId: db }), "scope");
  assert.deepEqual(empty.versionsList.project(success({ items: [{ id: db }] }), empty.versionsList.prepare({ scriptName: "safe-worker", page: 1, perPage: 10 })), { items: [], complete: false });
  refuses(() => metadataDescriptors({ ...scope, workerVersions: [{ scriptName: "other-worker", versionIds: [db] }] }), "scope");
  refuses(() => metadataDescriptors({ ...scope, workerVersions: [scope.workerVersions[0], scope.workerVersions[0]] }), "schema");
  refuses(() => metadataDescriptors({ ...scope, workerVersions: [{ scriptName: "safe-worker", versionIds: Array(101).fill(db) }] }), "cap");
  refuses(() => metadataDescriptors({ ...scope, workerVersions: [{ scriptName: "safe-worker", versionIds: ["invalid"] }] }), "schema");
});

test("Cloudflare version metadata refuses unbounded pagination and malformed provider responses", () => {
  for (const page of [0, 1001, 1.5, "1"]) refuses(() => descriptors.versionsList.prepare({ scriptName: "safe-worker", page, perPage: 10 }), "schema");
  for (const perPage of [0, 101, 1.5, "10"]) refuses(() => descriptors.versionsList.prepare({ scriptName: "safe-worker", page: 1, perPage }), "schema");
  const list = descriptors.versionsList.prepare({ scriptName: "safe-worker", page: 1, perPage: 1 });
  refuses(() => descriptors.versionsList.project(success({ items: [{ id: db }, { id: otherDb }] }), list), "cap");
  refuses(() => descriptors.versionsList.project(success({ items: Array(101).fill({ id: db }) }), list), "cap");
  for (const result of [[], { items: [null] }]) refuses(() => descriptors.versionsList.project(success(result), list), "upstream");
  for (const result of [{}, { items: null }]) refuses(() => descriptors.versionsList.project(success(result), list), "cap");
  for (const [descriptor, args] of [[descriptors.versionsList, { scriptName: "safe-worker", page: 1, perPage: 10 }], [descriptors.versionGet, { scriptName: "safe-worker", versionId: db }]]) {
    const input = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private-value" }], result: {} })]) refuses(() => descriptor.project(raw, input), "upstream");
  }
});

test("Cloudflare Secrets Store metadata binds account, store and secret with closed GET arguments", () => {
  for (const [name, args, suffix, resource] of secretsStoreCases) {
    const descriptor = secretsStoreDescriptors[name];
    const input = descriptor.prepare(args);
    assert.equal(input.request.path, `/accounts/${account}/secrets_store/stores${suffix}`);
    assert.equal(input.resource.id, `cloudflare:account:${account}:secrets-store${resource}`);
    assert.equal(input.resource.revision, "policy-1");
    assert.equal(input.request.method, "GET");
    assert.equal(input.request.maxRequests, 1);
    assert.equal(input.request.redirects, "deny");
    for (const value of [descriptor, input, input.arguments, input.resource, input.request]) assert.ok(Object.isFrozen(value));
    for (const key of ["accountId", "agentId", "approval", "url", "headers", "credential", "value", "scopes", "search", "order", "direction"]) refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
  }
  refuses(() => secretsStoreDescriptors.storeGet.prepare({ storeId: zone }), "scope");
  refuses(() => secretsStoreDescriptors.secretGet.prepare({ storeId: own, secretId: account }), "scope");
  refuses(() => secretsStoreDescriptors.secretGet.prepare({ storeId: other, secretId: zone }), "scope");
  for (const storeId of [own.toUpperCase(), "../store", `${own}?search=x`, "a".repeat(33)]) refuses(() => secretsStoreDescriptors.storeGet.prepare({ storeId }), "schema");
  for (const secretId of [zone.toUpperCase(), "../secret", `${zone}%2fvalue`]) refuses(() => secretsStoreDescriptors.secretGet.prepare({ storeId: own, secretId }), "schema");
});

test("Cloudflare Secrets Store projections filter each resource and return only IDs and secret names", () => {
  const canary = "never-return-secret-store-private-data";
  const store = { id: own, account_id: account, name: canary, created: canary, modified: canary, value: canary };
  const secret = { id: zone, store_id: own, name: "DATABASE_URL", value: canary, comment: canary, scopes: [canary], status: canary, created: canary, modified: canary };
  const get = secretsStoreDescriptors.storeGet.project(success(store), secretsStoreDescriptors.storeGet.prepare({ storeId: own }));
  assert.deepEqual(get, { id: own });
  const stores = secretsStoreDescriptors.storesList.project(success([store, { id: zone }]), secretsStoreDescriptors.storesList.prepare({ page: 1, perPage: 10 }));
  assert.deepEqual(stores, { items: [get], complete: false });
  const secretGet = secretsStoreDescriptors.secretGet.project(success(secret), secretsStoreDescriptors.secretGet.prepare({ storeId: own, secretId: zone }));
  assert.deepEqual(secretGet, { id: zone, name: "DATABASE_URL" });
  const secrets = secretsStoreDescriptors.secretsList.project(success([secret, { ...secret, id: account }]), secretsStoreDescriptors.secretsList.prepare({ storeId: own, page: 1, perPage: 10 }));
  assert.deepEqual(secrets, { items: [secretGet], complete: false });
  assert.ok(!JSON.stringify([get, stores, secretGet, secrets]).includes(canary));
  const storeInput = secretsStoreDescriptors.storeGet.prepare({ storeId: own });
  refuses(() => secretsStoreDescriptors.storeGet.project(success({ ...store, id: other }), storeInput), "scope");
  refuses(() => secretsStoreDescriptors.storeGet.project(success({ ...store, account_id: other }), storeInput), "scope");
  const secretInput = secretsStoreDescriptors.secretGet.prepare({ storeId: own, secretId: zone });
  for (const change of [{ id: account }, { store_id: other }, { store_id: undefined }]) refuses(() => secretsStoreDescriptors.secretGet.project(success({ ...secret, ...change }), secretInput), "scope");
  for (const name of ["invalid\nname", "has space", "x".repeat(129), null]) refuses(() => secretsStoreDescriptors.secretGet.project(success({ ...secret, name }), secretInput), "upstream");
  refuses(() => secretsStoreDescriptors.secretsList.project(success([{ ...secret, store_id: other }]), secretsStoreDescriptors.secretsList.prepare({ storeId: own, page: 1, perPage: 10 })), "scope");
  refuses(() => secretsStoreDescriptors.storesList.project(success([{ ...store, account_id: other }]), secretsStoreDescriptors.storesList.prepare({ page: 1, perPage: 10 })), "scope");
});

test("Cloudflare Secrets Store snapshots resist widening and empty secret sets expose nothing", () => {
  const input = { accountId: account, revision: "policy-1", stores: [{ storeId: own, secretIds: [zone] }] };
  const snapshot = secretsStoreMetadataDescriptors(input);
  input.stores[0].secretIds.push(account);
  input.stores.push({ storeId: other, secretIds: [zone] });
  input.stores[0].storeId = other;
  input.accountId = other;
  refuses(() => snapshot.secretGet.prepare({ storeId: own, secretId: account }), "scope");
  refuses(() => snapshot.storeGet.prepare({ storeId: other }), "scope");
  assert.equal(snapshot.secretGet.prepare({ storeId: own, secretId: zone }).request.path, `/accounts/${account}/secrets_store/stores/${own}/secrets/${zone}`);
  const empty = secretsStoreMetadataDescriptors({ accountId: account, revision: "policy-1", stores: [{ storeId: own, secretIds: [] }] });
  refuses(() => empty.secretGet.prepare({ storeId: own, secretId: zone }), "scope");
  assert.deepEqual(empty.secretsList.project(success([{ id: zone, store_id: own, name: "KEY" }]), empty.secretsList.prepare({ storeId: own, page: 1, perPage: 10 })), { items: [], complete: false });
  const noStores = secretsStoreMetadataDescriptors({ accountId: account, revision: "policy-1", stores: [] });
  refuses(() => noStores.storeGet.prepare({ storeId: own }), "scope");
  assert.deepEqual(noStores.storesList.project(success([{ id: own }]), noStores.storesList.prepare({ page: 1, perPage: 10 })), { items: [], complete: false });
  refuses(() => secretsStoreMetadataDescriptors({ ...secretsStoreScope, stores: [secretsStoreScope.stores[0], secretsStoreScope.stores[0]] }), "schema");
  refuses(() => secretsStoreMetadataDescriptors({ ...secretsStoreScope, stores: Array(101).fill(secretsStoreScope.stores[0]) }), "cap");
  refuses(() => secretsStoreMetadataDescriptors({ ...secretsStoreScope, stores: [{ storeId: own, secretIds: Array(101).fill(zone) }] }), "cap");
  refuses(() => secretsStoreMetadataDescriptors({ ...secretsStoreScope, stores: [{ storeId: own, secretIds: ["invalid"] }] }), "schema");
});

test("Cloudflare Secrets Store metadata enforces bounded lists and fixed error refusals", () => {
  for (const [name, args] of secretsStoreCases) {
    const descriptor = secretsStoreDescriptors[name];
    const input = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private-value" }], result: {} }), JSON.stringify({ success: true, result: {} })]) refuses(() => descriptor.project(raw, input), "upstream");
    if (!name.endsWith("List")) continue;
    for (const page of [0, 1001, 1.5, "1"]) refuses(() => descriptor.prepare({ ...args, page }), "schema");
    for (const perPage of [0, 101, 1.5, "10"]) refuses(() => descriptor.prepare({ ...args, perPage }), "schema");
    const bounded = descriptor.prepare({ ...args, perPage: 1 });
    refuses(() => descriptor.project(success([{ id: own }, { id: other }]), bounded), "cap");
    refuses(() => descriptor.project(success(Array(101).fill({ id: own })), input), "cap");
    refuses(() => descriptor.project(success({}), input), "cap");
    refuses(() => descriptor.project(success([null]), input), "upstream");
  }
});

test("Cloudflare deletion plans are exact, bounded, reserved and never claim provider dry-run", () => {
  for (const [name, args, path, resource] of deletionCases) {
    const descriptor = deletionDescriptors[name];
    const prepared = descriptor.prepare(args);
    assert.equal(descriptor.tier, "reserved");
    assert.deepEqual(Object.keys(descriptor).sort(), ["name", "prepare", "providerOperationId", "tier", "version"]);
    assert.equal(Object.getPrototypeOf(prepared.arguments), null);
    assert.deepEqual({ ...prepared.arguments }, args);
    assert.deepEqual(prepared.resource, { id: resource, revision: "resource-1" });
    assert.deepEqual(prepared.request, { method: "DELETE", path, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny", retries: "never" });
    assert.equal(prepared.plan.kind, "validated-local-plan");
    assert.equal(prepared.plan.providerDryRun, false);
    assert.equal(prepared.plan.action, "delete");
    assert.deepEqual(prepared.plan.resource, prepared.resource);
    assert.deepEqual(prepared.plan.requiredAuthorities, ["release-manager"]);
    assert.equal(prepared.plan.remoteConditionalWrite, "not-established");
    assert.equal(prepared.plan.executionPrerequisite, "reviewed-native-authority-and-provider-preconditions");
    for (const value of [descriptor, prepared, prepared.arguments, prepared.request, prepared.resource, prepared.plan, prepared.plan.effects, prepared.plan.requiredAuthorities]) assert.ok(Object.isFrozen(value));
    assert.equal(descriptor.execute, undefined);
    assert.equal(descriptor.project, undefined);
  }
  assert.ok(deletionDescriptors.workerDelete.prepare({ scriptName: "safe-worker" }).plan.effects.includes("durable-object-namespaces-may-be-deleted"));
});

test("Cloudflare destructive arguments cannot assert authority, identity, security impact or force", () => {
  for (const [name, args] of deletionCases) {
    for (const key of ["accountId", "zoneId", "agentId", "approval", "approved", "securityImpact", "requiredAuthorities", "revision", "url", "headers", "credential", "force", "jurisdiction", "dryRun"]) {
      refuses(() => deletionDescriptors[name].prepare({ ...args, [key]: "forged" }), "schema");
    }
    const key = Object.keys(args)[0];
    const foreign = key === "databaseId" ? otherDb : key === "scriptName" ? "other-worker" : key === "bucketName" ? "other-bucket" : other;
    refuses(() => deletionDescriptors[name].prepare({ [key]: foreign }), "scope");
    for (const value of ["../target", "target?force=true", "target%2f", "tаrget", "target\n", "target\u0000"]) refuses(() => deletionDescriptors[name].prepare({ [key]: value }), "schema");
  }
});

test("Cloudflare security weakening requires owner in addition to production/data authority", () => {
  const captured = deletionPlanDescriptors({ ...deletionScope, dnsRecords: [{ ...target(own), securityImpact: "weakens-security" }] });
  const prepared = captured.dnsDelete.prepare({ dnsRecordId: own });
  assert.deepEqual(prepared.plan.requiredAuthorities, ["release-manager", "owner-security"]);
  assert.equal(prepared.plan.securityImpact, "weakens-security");
  for (const securityImpact of [undefined, null, false, "unknown", "safe"]) {
    refuses(() => deletionPlanDescriptors({ ...deletionScope, dnsRecords: [{ ...target(own), securityImpact }] }), "schema");
  }
});

test("Cloudflare destructive snapshots bind revisions and cannot be widened by later source mutation", () => {
  const input = { ...deletionScope, dnsRecords: [{ ...target(own), securityImpact: "weakens-security" }] };
  const captured = deletionPlanDescriptors(input);
  input.dnsRecords[0].revision = "changed";
  input.dnsRecords[0].securityImpact = "does-not-weaken-security";
  input.dnsRecords.push(target(other));
  input.accountId = other;
  input.zoneId = other;
  const prepared = captured.dnsDelete.prepare({ dnsRecordId: own });
  assert.equal(prepared.resource.revision, "resource-1");
  assert.deepEqual(prepared.plan.requiredAuthorities, ["release-manager", "owner-security"]);
  assert.equal(prepared.request.path, `/zones/${zone}/dns_records/${own}`);
  refuses(() => captured.dnsDelete.prepare({ dnsRecordId: other }), "scope");
  const revised = deletionPlanDescriptors({ ...deletionScope, dnsRecords: [{ ...target(own), revision: "resource-2" }] });
  assert.notDeepEqual(revised.dnsDelete.prepare({ dnsRecordId: own }).plan, prepared.plan);
});

test("Cloudflare destructive allowlists are separate from reads, default empty and validate eagerly", () => {
  const empty = deletionPlanDescriptors({ accountId: account, zoneId: zone });
  for (const [name, args] of deletionCases) refuses(() => empty[name].prepare(args), "scope");
  refuses(() => deletionPlanDescriptors({ ...deletionScope, dnsRecords: [target(own), target(own)] }), "schema");
  refuses(() => deletionPlanDescriptors({ ...deletionScope, databases: [target(own)] }), "schema");
  refuses(() => deletionPlanDescriptors({ ...deletionScope, workerScripts: Array(101).fill(target("safe-worker")) }), "cap");
  refuses(() => deletionPlanDescriptors({ ...deletionScope, dnsRecords: [{ ...target(own), revision: "invalid/revision" }] }), "schema");
  refuses(() => deletionPlanDescriptors({ ...deletionScope, zoneId: undefined }), "schema");
});

test("Cloudflare KV and Queue metadata bind separate resources and exact request shapes", () => {
  for (const [name, args, path, resource] of kvQueueCases) {
    const descriptor = descriptors[name];
    const input = descriptor.prepare(args);
    assert.equal(input.request.path, `/accounts/${account}/${path}`);
    assert.deepEqual(input.resource, { id: `cloudflare:account:${account}:${resource}`, revision: "policy-1" });
    assert.deepEqual(input.request, { method: "GET", path: input.request.path, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    for (const value of [descriptor, input, input.arguments, input.resource, input.request]) assert.ok(Object.isFrozen(value));
    for (const key of ["accountId", "agentId", "approval", "url", "headers", "credential", "key", "value", "messages", "consumer", "jurisdiction", "order", "direction"]) refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
  }
  refuses(() => descriptors.kvNamespaceGet.prepare({ namespaceId: other }), "scope");
  refuses(() => descriptors.queueGet.prepare({ queueId: own }), "scope");
  refuses(() => descriptors.queuesList.prepare({ page: 1 }), "schema");
  for (const id of [own.toUpperCase(), "../resource", `${own}?x=1`, "a".repeat(33), `${own}\n`]) {
    refuses(() => descriptors.kvNamespaceGet.prepare({ namespaceId: id }), "schema");
    refuses(() => descriptors.queueGet.prepare({ queueId: id }), "schema");
  }
});

test("Cloudflare KV and Queue projections omit contents and reject foreign resource identities", () => {
  const canary = "private-resource-content";
  const namespace = { id: own, title: canary, keys: [canary], value: canary, jurisdiction: "eu", mode: canary };
  const queue = { queue_id: other, queue_name: canary, consumers: [canary], producers: [canary], settings: { secret: canary }, messages: [canary] };
  const outputs = [
    descriptors.kvNamespacesList.project(success([namespace, { ...namespace, id: other }]), descriptors.kvNamespacesList.prepare({ page: 1, perPage: 10 })),
    descriptors.kvNamespaceGet.project(success(namespace), descriptors.kvNamespaceGet.prepare({ namespaceId: own })),
    descriptors.queuesList.project(success([queue, { ...queue, queue_id: own }]), descriptors.queuesList.prepare({})),
    descriptors.queueGet.project(success(queue), descriptors.queueGet.prepare({ queueId: other })),
  ];
  assert.deepEqual(outputs, [{ items: [{ id: own }], complete: false }, { id: own }, { items: [{ id: other }], complete: false }, { id: other }]);
  assert.ok(!JSON.stringify(outputs).includes(canary));
  const namespaceInput = descriptors.kvNamespaceGet.prepare({ namespaceId: own });
  const queueInput = descriptors.queueGet.prepare({ queueId: other });
  refuses(() => descriptors.kvNamespaceGet.project(success({ ...namespace, id: other }), namespaceInput), "scope");
  refuses(() => descriptors.queueGet.project(success({ ...queue, queue_id: own }), queueInput), "scope");
  refuses(() => descriptors.queueGet.project(success({ id: other }), queueInput), "scope");
  refuses(() => descriptors.kvNamespaceGet.project(success({ ...namespace, account_id: other }), namespaceInput), "scope");
  refuses(() => descriptors.queueGet.project(success({ ...queue, account_id: other }), queueInput), "scope");
  refuses(() => descriptors.kvNamespacesList.project(success([{ ...namespace, account_id: other }]), descriptors.kvNamespacesList.prepare({ page: 1, perPage: 10 })), "scope");
  refuses(() => descriptors.queuesList.project(success([{ ...queue, account_id: other }]), descriptors.queuesList.prepare({})), "scope");
});

test("Cloudflare KV and Queue allowlists are copied, independently empty and bounded", () => {
  const input = { ...scope, kvNamespaceIds: [own], queueIds: [other] };
  const snapshot = metadataDescriptors(input);
  input.kvNamespaceIds[0] = other;
  input.queueIds[0] = own;
  snapshot.kvNamespaceGet.prepare({ namespaceId: own });
  snapshot.queueGet.prepare({ queueId: other });
  refuses(() => snapshot.kvNamespaceGet.prepare({ namespaceId: other }), "scope");
  refuses(() => snapshot.queueGet.prepare({ queueId: own }), "scope");
  for (const change of [{ kvNamespaceIds: [] }, { kvNamespaceIds: undefined }]) {
    const empty = metadataDescriptors({ ...scope, ...change });
    refuses(() => empty.kvNamespaceGet.prepare({ namespaceId: own }), "scope");
    assert.deepEqual(empty.kvNamespacesList.project(success([{ id: own }]), empty.kvNamespacesList.prepare({ page: 1, perPage: 10 })), { items: [], complete: false });
    empty.queueGet.prepare({ queueId: other });
  }
  for (const change of [{ queueIds: [] }, { queueIds: undefined }]) {
    const empty = metadataDescriptors({ ...scope, ...change });
    refuses(() => empty.queueGet.prepare({ queueId: other }), "scope");
    assert.deepEqual(empty.queuesList.project(success([{ queue_id: other }]), empty.queuesList.prepare({})), { items: [], complete: false });
    empty.kvNamespaceGet.prepare({ namespaceId: own });
  }
  for (const field of ["kvNamespaceIds", "queueIds"]) {
    refuses(() => metadataDescriptors({ ...scope, [field]: Array(101).fill(own) }), "cap");
    refuses(() => metadataDescriptors({ ...scope, [field]: ["invalid"] }), "schema");
    refuses(() => metadataDescriptors({ ...scope, [field]: {} }), "cap");
  }
});

test("Cloudflare KV and Queue metadata refuse invalid envelopes and oversized pages", () => {
  for (const [name, args] of kvQueueCases) {
    const descriptor = descriptors[name];
    const input = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private-value" }], result: {} }), JSON.stringify({ success: true, result: {} })]) refuses(() => descriptor.project(raw, input), "upstream");
  }
  for (const page of [0, 1001, 1.5, "1"]) refuses(() => descriptors.kvNamespacesList.prepare({ page, perPage: 10 }), "schema");
  for (const perPage of [0, 101, 1.5, "10"]) refuses(() => descriptors.kvNamespacesList.prepare({ page: 1, perPage }), "schema");
  refuses(() => descriptors.kvNamespacesList.project(success([{ id: own }, { id: other }]), descriptors.kvNamespacesList.prepare({ page: 1, perPage: 1 })), "cap");
  for (const [name, args] of [["kvNamespacesList", { page: 1, perPage: 100 }], ["queuesList", {}]]) {
    const input = descriptors[name].prepare(args);
    refuses(() => descriptors[name].project(success(Array(101).fill({ id: own, queue_id: other })), input), "cap");
    refuses(() => descriptors[name].project(success({}), input), "cap");
    refuses(() => descriptors[name].project(success([null]), input), "upstream");
  }
});

test("Cloudflare Durable Objects metadata uses closed bounded requests and trusted namespace scope", () => {
  for (const [name, args, path, resource] of durableCases) {
    const descriptor = durableDescriptors[name];
    const input = descriptor.prepare(args);
    assert.deepEqual(input.request, { method: "GET", path: `/accounts/${account}/workers/durable_objects/namespaces${path}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    assert.deepEqual(input.resource, { id: `cloudflare:account:${account}:durable-objects${resource}`, revision: "policy-1" });
    assert.ok(Object.isFrozen(descriptor) && Object.isFrozen(input) && Object.isFrozen(input.request) && Object.isFrozen(input.resource));
    assert.equal(descriptor.execute, undefined);
    for (const extra of [{ accountId: other }, { agentId: "foreign" }, { cursor: "untrusted" }, { sql: "SELECT 1" }, { url: "https://example.invalid" }, { headers: {} }, { approval: true }]) refuses(() => descriptor.prepare({ ...args, ...extra }), "schema");
  }
  refuses(() => durableDescriptors.durableObjectsList.prepare({ namespaceId: zone, limit: 10 }), "scope");
  for (const namespaceId of ["../objects", own.toUpperCase(), "b".repeat(64)]) refuses(() => durableDescriptors.durableObjectsList.prepare({ namespaceId, limit: 10 }), "schema");
});

test("Cloudflare Durable Objects metadata projects only namespace-specific allowlisted IDs", () => {
  const list = durableDescriptors.durableNamespacesList;
  const input = list.prepare({ page: 1, perPage: 10 });
  assert.deepEqual(list.project(success([{ id: own, name: "private", script: "private", class: "private", use_sqlite: true }, { id: zone }]), input), { items: [{ id: own }], complete: false });
  const objects = durableDescriptors.durableObjectsList;
  const objectInput = objects.prepare({ namespaceId: own, limit: 10 });
  assert.deepEqual(objects.project(success([{ id: objectId, hasStoredData: true, name: "private", data: "private", account_id: account, namespace_id: own }, { id: foreignObjectId }]), objectInput), { items: [{ id: objectId }], complete: false });
  const otherInput = objects.prepare({ namespaceId: other, limit: 10 });
  assert.deepEqual(objects.project(success([{ id: objectId }]), otherInput), { items: [], complete: false });
  refuses(() => list.project(success([{ id: own, account_id: other }]), input), "scope");
  for (const fields of [{ account_id: other }, { namespace_id: other }]) refuses(() => objects.project(success([{ id: objectId, ...fields }]), objectInput), "scope");
  const empty = durableObjectMetadataDescriptors({ accountId: account, revision: "policy-1", namespaces: [] });
  assert.deepEqual(empty.durableNamespacesList.project(success([{ id: own }]), empty.durableNamespacesList.prepare({ page: 1, perPage: 10 })), { items: [], complete: false });
  refuses(() => empty.durableObjectsList.prepare({ namespaceId: own, limit: 10 }), "scope");
});

test("Cloudflare Durable Objects scope snapshots are copied and invalid scope refuses", () => {
  const mutable = structuredClone(durableScope);
  const captured = durableObjectMetadataDescriptors(mutable);
  mutable.accountId = other;
  mutable.revision = "policy-2";
  mutable.namespaces[0].objectIds.splice(0, 1, foreignObjectId);
  mutable.namespaces.splice(0, 1);
  const input = captured.durableObjectsList.prepare({ namespaceId: own, limit: 10 });
  assert.equal(input.resource.revision, "policy-1");
  assert.match(input.request.path, new RegExp(`/accounts/${account}/`));
  assert.deepEqual(captured.durableObjectsList.project(success([{ id: objectId }, { id: foreignObjectId }]), input), { items: [{ id: objectId }], complete: false });
  for (const namespaces of [null, Array(101).fill({ namespaceId: own, objectIds: [] }), [{ namespaceId: own, objectIds: null }], [{ namespaceId: own, objectIds: Array(101).fill(objectId) }]]) refuses(() => durableObjectMetadataDescriptors({ ...durableScope, namespaces }), "cap");
  refuses(() => durableObjectMetadataDescriptors({ ...durableScope, namespaces: [durableScope.namespaces[0], durableScope.namespaces[0]] }), "schema");
  for (const id of [own, objectId.toUpperCase(), "../object"]) refuses(() => durableObjectMetadataDescriptors({ ...durableScope, namespaces: [{ namespaceId: own, objectIds: [id] }] }), "schema");
});

test("Cloudflare Durable Objects metadata refuses invalid envelopes and oversized pages", () => {
  for (const [name, args] of durableCases) {
    const descriptor = durableDescriptors[name];
    const input = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private" }], result: [] }), JSON.stringify({ success: true, result: [] })]) refuses(() => descriptor.project(raw, input), "upstream");
    refuses(() => descriptor.project(success(Array(11).fill({ id: own })), input), "cap");
    refuses(() => descriptor.project(success({}), input), "cap");
    refuses(() => descriptor.project(success([null]), input), "upstream");
  }
  for (const limit of [0, 9, 101, 10.5, "10"]) refuses(() => durableDescriptors.durableObjectsList.prepare({ namespaceId: own, limit }), "schema");
  for (const page of [0, 1001, 1.5, "1"]) refuses(() => durableDescriptors.durableNamespacesList.prepare({ page, perPage: 10 }), "schema");
  for (const perPage of [0, 101, 1.5, "10"]) refuses(() => durableDescriptors.durableNamespacesList.prepare({ page: 1, perPage }), "schema");
});

test("Cloudflare Pages metadata binds project identities and exact closed requests", () => {
  for (const [name, args, path, resource] of pagesCases) {
    const descriptor = pagesDescriptors[name];
    const input = descriptor.prepare(args);
    assert.deepEqual(input.request, { method: "GET", path: `/accounts/${account}/pages/projects${path}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    assert.deepEqual(input.resource, { id: `cloudflare:account:${account}:pages${resource}`, revision: "policy-1" });
    assert.ok(Object.isFrozen(descriptor) && Object.isFrozen(input) && Object.isFrozen(input.arguments) && Object.isFrozen(input.resource) && Object.isFrozen(input.request));
    for (const extra of [{ accountId: other }, { projectId: other }, { agentId: "other" }, { url: "https://example.invalid" }, { headers: {} }, { env: "production" }, { approval: true }]) refuses(() => descriptor.prepare({ ...args, ...extra }), "schema");
  }
  refuses(() => pagesDescriptors.pagesProjectGet.prepare({ projectName: "missing-project" }), "scope");
  refuses(() => pagesDescriptors.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: otherDb }), "scope");
  for (const projectName of ["../safe-project", "safe-project?force=true", "Safe-project", "x".repeat(64), "safе-project"]) refuses(() => pagesDescriptors.pagesProjectGet.prepare({ projectName }), "schema");
  for (const id of ["../deployment", db.toUpperCase(), own]) refuses(() => pagesDescriptors.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: id }), "schema");
});

test("Cloudflare Pages projections omit configuration and bind deployments to their project", () => {
  const canary = "private-build-secret";
  const project = { id: own, name: "safe-project", account_id: account, deployment_configs: { production: { env_vars: { SECRET: { value: canary } } } }, build_config: canary, source: canary, domains: [canary], latest_deployment: { id: otherDb } };
  const deployment = { id: db, project_id: own, project_name: "safe-project", env_vars: canary, build_config: canary, source: canary, url: canary, deployment_trigger: canary, aliases: [canary], stages: [canary] };
  const outputs = [
    pagesDescriptors.pagesProjectsList.project(success([project, { id: zone, name: "foreign-project" }]), pagesDescriptors.pagesProjectsList.prepare({ page: 1, perPage: 10 })),
    pagesDescriptors.pagesProjectGet.project(success(project), pagesDescriptors.pagesProjectGet.prepare({ projectName: "safe-project" })),
    pagesDescriptors.pagesDeploymentsList.project(success([deployment, { ...deployment, id: otherDb }]), pagesDescriptors.pagesDeploymentsList.prepare({ projectName: "safe-project", page: 1, perPage: 10 })),
    pagesDescriptors.pagesDeploymentGet.project(success(deployment), pagesDescriptors.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: db })),
  ];
  assert.deepEqual(outputs, [{ items: [{ id: own }], complete: false }, { id: own }, { items: [{ id: db }], complete: false }, { id: db }]);
  assert.ok(!JSON.stringify(outputs).includes(canary));
  for (const change of [{ id: other }, { name: "other-project" }, { account_id: other }]) {
    refuses(() => pagesDescriptors.pagesProjectGet.project(success({ ...project, ...change }), pagesDescriptors.pagesProjectGet.prepare({ projectName: "safe-project" })), "scope");
  }
  refuses(() => pagesDescriptors.pagesProjectsList.project(success([{ ...project, id: other }]), pagesDescriptors.pagesProjectsList.prepare({ page: 1, perPage: 10 })), "scope");
  for (const change of [{ project_id: other }, { project_name: "other-project" }, { account_id: other }, { project_id: undefined }, { project_name: undefined }]) {
    const row = { ...deployment, ...change };
    refuses(() => pagesDescriptors.pagesDeploymentsList.project(success([row]), pagesDescriptors.pagesDeploymentsList.prepare({ projectName: "safe-project", page: 1, perPage: 10 })), "scope");
    refuses(() => pagesDescriptors.pagesDeploymentGet.project(success(row), pagesDescriptors.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: db })), "scope");
  }
  refuses(() => pagesDescriptors.pagesDeploymentGet.project(success({ ...deployment, id: otherDb }), pagesDescriptors.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: db })), "scope");
});

test("Cloudflare Pages scope is copied, independently empty and refuses duplicate identities", () => {
  const input = structuredClone(pagesScope);
  const captured = pagesMetadataDescriptors(input);
  input.accountId = other;
  input.revision = "policy-2";
  input.projects[0].projectId = other;
  input.projects[0].deploymentIds.splice(0, 1, otherDb);
  input.projects.splice(0, 1);
  const prepared = captured.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: db });
  assert.equal(prepared.resource.revision, "policy-1");
  assert.equal(prepared.request.path, `/accounts/${account}/pages/projects/safe-project/deployments/${db}`);
  refuses(() => captured.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: otherDb }), "scope");
  const empty = pagesMetadataDescriptors({ ...pagesScope, projects: [] });
  assert.deepEqual(empty.pagesProjectsList.project(success([{ id: own, name: "safe-project" }]), empty.pagesProjectsList.prepare({ page: 1, perPage: 10 })), { items: [], complete: false });
  refuses(() => empty.pagesProjectGet.prepare({ projectName: "safe-project" }), "scope");
  const noDeployments = pagesMetadataDescriptors({ ...pagesScope, projects: [{ ...pagesScope.projects[0], deploymentIds: [] }] });
  assert.deepEqual(noDeployments.pagesDeploymentsList.project(success([{ id: db }]), noDeployments.pagesDeploymentsList.prepare({ projectName: "safe-project", page: 1, perPage: 10 })), { items: [], complete: false });
  refuses(() => noDeployments.pagesDeploymentGet.prepare({ projectName: "safe-project", deploymentId: db }), "scope");
  for (const projects of [null, Array(101).fill(pagesScope.projects[0]), [{ ...pagesScope.projects[0], deploymentIds: null }], [{ ...pagesScope.projects[0], deploymentIds: Array(101).fill(db) }]]) refuses(() => pagesMetadataDescriptors({ ...pagesScope, projects }), "cap");
  for (const duplicate of [pagesScope.projects[0], { ...pagesScope.projects[1], projectId: own }]) refuses(() => pagesMetadataDescriptors({ ...pagesScope, projects: [pagesScope.projects[0], duplicate] }), "schema");
  for (const change of [{ projectName: "../project" }, { projectId: "private\nproject" }, { deploymentIds: [own] }]) refuses(() => pagesMetadataDescriptors({ ...pagesScope, projects: [{ ...pagesScope.projects[0], ...change }] }), "schema");
});

test("Cloudflare Pages metadata refuses malformed responses and unbounded pagination", () => {
  for (const [name, args] of pagesCases) {
    const descriptor = pagesDescriptors[name];
    const input = descriptor.prepare(args);
    refuses(() => descriptor.project("x".repeat(131073), input), "cap");
    for (const raw of ["null", "not-json", JSON.stringify({ success: false, errors: [{ message: "private" }], result: [] }), JSON.stringify({ success: true, result: [] })]) refuses(() => descriptor.project(raw, input), "upstream");
  }
  for (const [name, args] of [["pagesProjectsList", {}], ["pagesDeploymentsList", { projectName: "safe-project" }]]) {
    const descriptor = pagesDescriptors[name];
    for (const page of [0, 1001, 1.5, "1"]) refuses(() => descriptor.prepare({ ...args, page, perPage: 10 }), "schema");
    for (const perPage of [0, 101, 1.5, "10"]) refuses(() => descriptor.prepare({ ...args, page: 1, perPage }), "schema");
    const input = descriptor.prepare({ ...args, page: 1, perPage: 10 });
    refuses(() => descriptor.project(success(Array(11).fill({ id: own })), input), "cap");
    refuses(() => descriptor.project(success({}), input), "cap");
    refuses(() => descriptor.project(success([null]), input), "upstream");
  }
});

test("Cloudflare Worker control reads require separate copied scope and exact bounded requests", () => {
  const inputScope = { ...scope, scriptNames: ["safe-worker", "other-worker"], workerControlScriptNames: ["safe-worker"] };
  const controls = metadataDescriptors(inputScope);
  inputScope.workerControlScriptNames.push("other-worker");
  for (const [key, suffix] of [["workerSettingsGet", "settings"], ["workerSubdomainGet", "subdomain"]]) {
    const descriptor = controls[key];
    const prepared = descriptor.prepare({ scriptName: "safe-worker" });
    assert.deepEqual(prepared.request, { method: "GET", path: `/accounts/${account}/workers/scripts/safe-worker/${suffix}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    assert.equal(prepared.resource.id, `cloudflare:account:${account}:worker:safe-worker:controls`);
    assert.equal(prepared.resource.revision, "policy-1");
    assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared.arguments) && Object.isFrozen(prepared.request));
    refuses(() => descriptor.prepare({ scriptName: "other-worker" }), "scope");
    refuses(() => metadataDescriptors({ ...scope, workerControlScriptNames: undefined })[key].prepare({ scriptName: "safe-worker" }), "scope");
    for (const field of ["accountId", "agentId", "approval", "credential", "url", "headers", "source", "effective", "versionId"]) refuses(() => descriptor.prepare({ scriptName: "safe-worker", [field]: "forged" }), "schema");
    for (const scriptName of ["../safe-worker", "safe-worker?source=true", "safe-worker\n"]) refuses(() => descriptor.prepare({ scriptName }), "schema");
  }
  refuses(() => metadataDescriptors({ ...scope, workerControlScriptNames: ["foreign-worker"] }), "scope");
  refuses(() => metadataDescriptors({ ...scope, workerControlScriptNames: Array(101).fill("safe-worker") }), "cap");
});

test("Cloudflare Worker control projections omit secrets and distinguish configured from unavailable", () => {
  const canary = "never-return-binding-or-source";
  const settings = descriptors.workerSettingsGet;
  const input = settings.prepare({ scriptName: "safe-worker" });
  const unavailable = { status: "unavailable", reason: "not-in-response-schema" };
  const row = { limits: { cpu_ms: 50, memory_mb: 128, body_bytes: 1048576 }, assets: { config: { run_worker_first: true }, jwt: canary }, bindings: [{ type: "plain_text", text: canary }], annotations: { message: canary }, source: canary, token: canary };
  const result = settings.project(success(row), input);
  assert.deepEqual(result, { cpuMs: { status: "configured", value: 50 }, bodyBytes: unavailable, memoryBytes: unavailable, workerFirst: unavailable });
  for (const missing of [{}, { limits: {} }]) assert.deepEqual(settings.project(success(missing), input), { ...result, cpuMs: { status: "unavailable", reason: "not-returned" } });
  assert.deepEqual(settings.project(success({ limits: { cpu_ms: 0 } }), input).cpuMs, { status: "configured", value: 0 });
  const subdomain = descriptors.workerSubdomainGet;
  const subdomainInput = subdomain.prepare({ scriptName: "safe-worker" });
  assert.deepEqual(subdomain.project(success({ enabled: false, previews_enabled: true, url: canary, token: canary }), subdomainInput), { enabled: false, previewsEnabled: true });
  assert.deepEqual(subdomain.project(success({ enabled: true, previews_enabled: false }), subdomainInput), { enabled: true, previewsEnabled: false });
  assert.ok(!JSON.stringify(result).includes(canary));
});

test("Cloudflare Worker control projections refuse malformed fields without inventing defaults", () => {
  const settings = descriptors.workerSettingsGet;
  const input = settings.prepare({ scriptName: "safe-worker" });
  for (const cpu_ms of [null, -1, 1.5, "50", true, Number.MAX_SAFE_INTEGER + 1, "never-return-secret"]) refuses(() => settings.project(success({ limits: { cpu_ms } }), input), "upstream");
  for (const limits of [null, [], 50, "never-return-secret"]) refuses(() => settings.project(success({ limits }), input), "upstream");
  const subdomain = descriptors.workerSubdomainGet;
  const subdomainInput = subdomain.prepare({ scriptName: "safe-worker" });
  for (const row of [{}, { enabled: false }, { previews_enabled: true }, { enabled: "false", previews_enabled: false }, { enabled: true, previews_enabled: null }]) refuses(() => subdomain.project(success(row), subdomainInput), "upstream");
});

test("Cloudflare Worker control responses reject explicit foreign context, malformed envelopes and oversize", () => {
  for (const descriptor of [descriptors.workerSettingsGet, descriptors.workerSubdomainGet]) {
    const input = descriptor.prepare({ scriptName: "safe-worker" });
    const row = { limits: { cpu_ms: 50 }, enabled: false, previews_enabled: false };
    for (const foreign of [{ account_id: other }, { script_name: "other-worker" }]) refuses(() => descriptor.project(success({ ...row, ...foreign }), input), "scope");
    const otherPrepared = { ...input, arguments: { scriptName: "other-worker" } };
    refuses(() => descriptor.project(success(row), otherPrepared), "scope");
    for (const raw of ["null", "not-json", success([]), JSON.stringify({ success: false, errors: [{ message: "never-return-secret" }], result: row })]) refuses(() => descriptor.project(raw, input), "upstream");
    refuses(() => descriptor.project(success({ ...row, source: "s".repeat(131072) }), input), "cap");
  }
});

test("Cloudflare full schema inventory is pinned, explicit about holes, and consistent with descriptors", async () => {
  const bytes = await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url));
  const manifest = JSON.parse(await readFile(new URL("../plugins/cloudflare-broker/coverage/source.json", import.meta.url)));
  assert.deepEqual(manifest.source, source);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.inventorySha256);
  const operations = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line));
  assert.equal(operations.length, 3777);
  assert.equal(new Set(operations.map(row => row.key)).size, 3777);
  assert.equal(new Set(operations.flatMap(row => row.areas)).size, 599);
  assert.equal(new Set(operations.map(row => row.key.slice(row.key.indexOf(" ") + 1))).size, 2352);
  for (const row of operations) {
    assert.equal(row.credentialScope, "unknown");
    assert.equal(row.review, "not-reviewed");
    assert.equal(row.enablement, "disabled");
    assert.ok(row.prerequisites.length > 0);
    assert.match(row.requestShapeSha256, /^[a-f0-9]{64}$/);
    assert.match(row.responseShapeSha256, /^[a-f0-9]{64}$/);
    if (row.typedTool === null) {
      assert.equal(row.implementation, "missing");
      assert.equal(row.tier, "unclassified");
      assert.equal(row.approvalRoute, "unresolved");
      assert.deepEqual(row.tests, []);
    } else {
      const descriptor = Object.values(allDescriptors).find(entry => entry.name === row.typedTool);
      assert.ok(descriptor);
      assert.equal(row.operationId, descriptor.providerOperationId);
      assert.equal(row.tier, descriptor.tier);
      assert.equal(row.implementation, descriptor === contentDescriptor ? "content-descriptor-only" : descriptor.tier === "reserved" ? "plan-descriptor-only" : "descriptor-only");
      if (descriptor === contentDescriptor) {
        assert.equal(row.approvalRoute, "exact-native-source-authorization-and-agent-resource-policy");
        assert.equal(row.sideEffects, "source-read-digest-only");
        for (const prerequisite of ["separate-source-authorization", "bounded-content-transport-and-success-media-contract", "trusted-capture-window-and-response-correlation", "module-attribution-and-library-projection"]) assert.ok(row.prerequisites.includes(prerequisite));
      }
      if (row.implementation === "plan-descriptor-only") {
        assert.equal(row.approvalRoute, "release-manager-and-conditional-owner-security");
        assert.equal(row.sideEffects, "destructive-production");
        for (const prerequisite of ["native-conjunctive-authority-and-security-impact", "provider-precondition-and-recovery-adapter", "execution-and-projection-adapter"]) assert.ok(row.prerequisites.includes(prerequisite));
      }
    }
  }
  assert.equal(operations.filter(row => row.typedTool !== null).length, 47);
  assert.equal(operations.filter(row => row.tier === "reserved").length, 6);
  assert.equal(operations.filter(row => row.tier === "read").length, 41);
  assert.equal(operations.filter(row => row.implementation === "content-descriptor-only").length, 1);
  assert.equal(manifest.counts.contentDescriptors, 1);
  assert.equal(manifest.counts.descriptors, Object.keys(allDescriptors).length);
  assert.equal(manifest.credentialScope.status, "operation-entitlements-unresolved");
  assert.equal(manifest.complete, false);
  assert.deepEqual(manifest.supplementalSurfaces.map(surface => surface.status), ["documentary-inventory-only", "not-inventoried"]);
  assert.throws(() => inventory(Buffer.from("{}")), /schema source digest mismatch/);
});

test("Cloudflare descriptor, coverage and core-binding tiers agree for every source operation", async () => {
  const bound = cloudflareReadOperations({ ...scope, zone: { zoneId: zone, dnsRecordIds: [own] } },
    { accountId: account, revision: scope.revision });
  const descriptorsByName = new Map(Object.values(allDescriptors).map(descriptor => [descriptor.name, descriptor]));
  const rows = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8"))
    .trimEnd().split("\n").map(line => JSON.parse(line));
  const rowsByName = new Map(rows.filter(row => row.typedTool !== null).map(row => [row.typedTool, row]));
  assert.equal(bound.length, 42);
  assert.equal(new Set(bound.map(operation => operation.name)).size, bound.length);
  for (const operation of bound) {
    assert.equal(operation.tier, descriptorsByName.get(operation.name)?.tier, operation.name);
    assert.equal(operation.tier, rowsByName.get(operation.name)?.tier, operation.name);
  }
  for (const descriptor of Object.values(allDescriptors)) {
    assert.equal(bound.some(operation => operation.name === descriptor.name),
      rowsByName.get(descriptor.name).implementation !== "plan-descriptor-only", descriptor.name);
  }
  assert.equal(bound.find(operation => operation.name === contentDescriptor.name).tier, "reserved");
});

test("Cloudflare family workload summary assigns every operation once without upgrading coverage", async () => {
  const bytes = await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url));
  const saved = JSON.parse(await readFile(new URL("../plugins/cloudflare-broker/coverage/families.json", import.meta.url)));
  const manifest = JSON.parse(await readFile(new URL("../plugins/cloudflare-broker/coverage/source.json", import.meta.url)));
  assert.deepEqual(saved, familySummary(bytes));
  assert.equal(saved.inventorySha256, manifest.inventorySha256);
  assert.equal(saved.grouping, "first-provider-tag-exclusive");
  assert.deepEqual(saved.counts, { operations: 3777, apiTags: 599, primaryFamilies: 596, multiTaggedOperations: 6 });
  const rows = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line));
  assert.equal(new Set(saved.families.map(family => family.area)).size, 596);
  assert.equal(saved.families.reduce((sum, family) => sum + family.operations, 0), 3777);
  for (const family of saved.families) {
    const members = rows.filter(row => row.areas[0] === family.area);
    assert.equal(family.operations, members.length);
    assert.equal(Object.values(family.methods).reduce((sum, count) => sum + count, 0), members.length);
    assert.equal(family.coverage.metadataDescriptors, members.filter(row => row.implementation === "descriptor-only").length);
    assert.equal(family.coverage.contentDescriptors, members.filter(row => row.implementation === "content-descriptor-only").length);
    assert.equal(family.coverage.planDescriptors, members.filter(row => row.implementation === "plan-descriptor-only").length);
    assert.equal(family.coverage.missing, members.filter(row => row.implementation === "missing").length);
    assert.equal(family.coverage.unclassified, members.filter(row => row.tier === "unclassified").length);
    assert.equal(family.coverage.unknownEntitlement, members.length);
    for (const key of ["integrated", "reviewed", "enabled"]) assert.equal(family.coverage[key], 0);
    assert.equal(family.coverage.metadataDescriptors + family.coverage.contentDescriptors + family.coverage.planDescriptors + family.coverage.missing, members.length);
  }
  for (const limitation of ["method-is-not-policy-tier", "not-effort-or-delivery-estimate", "not-credential-intersection", "supplemental-protocols-excluded"]) assert.ok(saved.limitations.includes(limitation));
});

test("Cloudflare family workload summary refuses duplicate identities, missing areas and unsupported states", () => {
  const base = { key: "GET /example", areas: ["first", "second"], resourceParameters: [], implementation: "missing", tier: "unclassified", credentialScope: "unknown", review: "not-reviewed", enablement: "disabled", requestShapeSha256: "a".repeat(64), responseShapeSha256: "b".repeat(64) };
  const encode = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  const summary = familySummary(encode([base, { ...base, key: "POST /example", areas: ["second"] }]));
  assert.equal(summary.counts.operations, 2);
  assert.equal(summary.counts.multiTaggedOperations, 1);
  assert.deepEqual(summary.families[0].secondaryAreas, ["second"]);
  assert.equal(summary.families.reduce((sum, family) => sum + family.operations, 0), 2);
  assert.throws(() => familySummary(encode([base, base])), /invalid operation identity/);
  for (const areas of [[], null, [""], [1]]) assert.throws(() => familySummary(encode([{ ...base, areas }])), /missing API area/);
  for (const change of [{ implementation: "implemented" }, { tier: "write" }, { review: "reviewed" }, { enablement: "enabled" }, { credentialScope: "allowed" }]) assert.throws(() => familySummary(encode([{ ...base, ...change }])), /unsupported coverage state/);
  assert.throws(() => familySummary(encode([{ ...base, requestShapeSha256: "invalid" }])), /invalid shape fingerprint/);
});

test("Cloudflare supplemental S3 inventory retains every documented operation without claiming delivery", async () => {
  const bytes = await readFile(new URL("../plugins/cloudflare-broker/coverage/r2-s3.json", import.meta.url));
  const manifest = JSON.parse(await readFile(new URL("../plugins/cloudflare-broker/coverage/source.json", import.meta.url)));
  const supplemental = JSON.parse(bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.supplementalSurfaces[0].inventorySha256);
  assert.deepEqual(supplemental.source, supplementalSource);
  assert.equal(supplemental.complete, false);
  assert.deepEqual(supplemental.counts, { operations: 73, providerSupported: 26, providerUnsupported: 47, descriptors: 0, implementedTools: 0, reviewedTools: 0, enabledTools: 0 });
  assert.equal(supplemental.operations.length, 73);
  assert.equal(new Set(supplemental.operations.map(row => row.key)).size, 73);
  assert.equal(supplemental.operations.filter(row => row.providerSupport === "supported").length, 26);
  assert.equal(supplemental.operations.filter(row => row.providerSupport === "unsupported").length, 47);
  for (const row of supplemental.operations) {
    assert.equal(row.key, `S3 ${row.operationId}`);
    assert.equal(row.reference, `https://docs.aws.amazon.com/AmazonS3/latest/API/API_${row.operationId}.html`);
    assert.ok(["bucket", "object"].includes(row.level));
    assert.ok(Number.isInteger(row.sourceLine) && row.sourceLine > 0);
    assert.equal(row.typedTool, null);
    assert.equal(row.credentialScope, "unknown");
    assert.equal(row.resourceScope, "unclassified");
    assert.equal(row.tier, "unclassified");
    assert.equal(row.approvalRoute, "unresolved");
    assert.equal(row.implementation, "missing");
    assert.equal(row.review, "not-reviewed");
    assert.equal(row.enablement, "disabled");
    assert.deepEqual(row.tests, []);
    assert.equal(row.prerequisiteOwner, "provider-package-maintainer");
    assert.ok(row.prerequisites.includes("typed-adapter-and-tier-classification"));
    assert.equal(row.prerequisites.includes("provider-operation-support"), row.providerSupport === "unsupported");
    for (const feature of row.features) assert.ok(["heading", "supported", "unsupported", "experimental"].includes(feature.status));
  }
});

test("Cloudflare S3 feature inventory distinguishes unsupported preconditions and copy semantics", async () => {
  const supplemental = JSON.parse(await readFile(new URL("../plugins/cloudflare-broker/coverage/r2-s3.json", import.meta.url)));
  const operation = id => supplemental.operations.find(row => row.operationId === id);
  const feature = (id, name) => operation(id).features.find(row => row.feature === name)?.status;
  assert.equal(feature("HeadBucket", "x-amz-expected-bucket-owner"), "unsupported");
  assert.equal(feature("CopyObject", "x-amz-source-expected-bucket-owner"), "unsupported");
  assert.equal(feature("CopyObject", "x-amz-copy-source-if-match"), "supported");
  assert.equal(feature("UploadPartCopy", "x-amz-copy-source-if-match"), "unsupported");
  assert.equal(feature("PutObject", "If-Match"), "supported");
  assert.equal(feature("PutObject", "x-amz-server-side-encryption-aws-kms-key-id"), "unsupported");
  assert.equal(feature("PutObject", "x-amz-server-side-encryption-customer-key"), "supported");
  assert.equal(feature("ListMultipartUploads", "max-uploads"), "supported");
  assert.equal(operation("GetObjectTagging").providerSupport, "unsupported");
  const constraints = supplemental.constraints.map(row => row.text).join("\n");
  assert.ok(constraints.includes("`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`"));
  assert.ok(constraints.includes("region for an R2 bucket is `auto`"));
  assert.ok(constraints.includes("`FULL_OBJECT` | `COMPOSITE`"));
  assert.ok(constraints.includes("CRC-64/NVME (`CRC64NVME`) | ✅ | ❌"));
  assert.ok(constraints.includes("the original part is lost and must be re-uploaded"));
  assert.ok(constraints.includes("`412 PreconditionFailed`"));
  assert.ok(constraints.includes("use `ListObjectsV2` instead"));
});

test("Cloudflare supplemental source refuses modified or unpinned documentary inputs", () => {
  for (const bytes of [Buffer.from(""), Buffer.from("{}"), Buffer.from("| ✅ [ListBuckets](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html) | |")]) {
    assert.throws(() => supplementalInventory(bytes), /supplemental source digest mismatch/);
  }
});
