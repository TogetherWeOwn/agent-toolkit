import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { inventory, source } from "../plugins/cloudflare-broker/scripts/inventory.mjs";

const account = "a".repeat(32);
const own = "b".repeat(32);
const other = "c".repeat(32);
const scope = { accountId: account, revision: "policy-1", scriptNames: ["safe-worker"], hyperdriveIds: [own] };
const descriptors = metadataDescriptors(scope);
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
  for (const descriptor of Object.values(descriptors)) {
    assert.equal(descriptor.tier, "read");
    assert.deepEqual(Object.keys(descriptor).sort(), ["name", "prepare", "project", "providerOperationId", "tier", "version"]);
    assert.equal(descriptor.execute, undefined);
    assert.equal(descriptor.call, undefined);
  }
  assert.equal(descriptors.dnsUpdate, undefined);
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
      const descriptor = Object.values(descriptors).find(entry => entry.name === row.typedTool);
      assert.ok(descriptor);
      assert.equal(row.operationId, descriptor.providerOperationId);
      assert.equal(row.tier, descriptor.tier);
      assert.equal(row.implementation, "descriptor-only");
    }
  }
  assert.equal(operations.filter(row => row.typedTool !== null).length, 4);
  assert.equal(manifest.credentialScope.status, "awaiting-operator-attestation");
  assert.equal(manifest.complete, false);
  assert.equal(manifest.supplementalSurfaces.every(surface => surface.status === "not-inventoried"), true);
  assert.throws(() => inventory(Buffer.from("{}")), /schema source digest mismatch/);
});
