import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { metadataDescriptors, zoneMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { inventory, source } from "../plugins/cloudflare-broker/scripts/inventory.mjs";
import { supplementalInventory, supplementalSource } from "../plugins/cloudflare-broker/scripts/supplemental.mjs";

const account = "a".repeat(32);
const own = "b".repeat(32);
const other = "c".repeat(32);
const db = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const otherDb = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const scope = { accountId: account, revision: "policy-1", scriptNames: ["safe-worker"], hyperdriveIds: [own], databaseIds: [db], defaultBucketNames: ["safe-bucket"] };
const descriptors = metadataDescriptors(scope);
const zone = "d".repeat(32);
const zoneScope = { accountId: account, zoneId: zone, revision: "policy-1", dnsRecordIds: [own] };
const zoneDescriptors = zoneMetadataDescriptors(zoneScope);
const allDescriptors = { ...descriptors, ...zoneDescriptors };
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
  for (const descriptor of Object.values(allDescriptors)) {
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
      assert.equal(row.implementation, "descriptor-only");
    }
  }
  assert.equal(operations.filter(row => row.typedTool !== null).length, 11);
  assert.equal(manifest.counts.descriptors, Object.keys(allDescriptors).length);
  assert.equal(manifest.credentialScope.status, "awaiting-operator-attestation");
  assert.equal(manifest.complete, false);
  assert.deepEqual(manifest.supplementalSurfaces.map(surface => surface.status), ["documentary-inventory-only", "not-inventoried"]);
  assert.throws(() => inventory(Buffer.from("{}")), /schema source digest mismatch/);
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
