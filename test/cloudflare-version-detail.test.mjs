import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const versionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const scriptName = "safe-worker";
const tag = "13a3240e8fb414561b0366813b0b8f42b3e6cfa0d9e70e99835dae83d0d8a794";
const args = { scriptName, versionId };
const unavailable = { status: "unavailable", reason: "not-returned" };
const scope = () => ({
  accountId: account, revision: "resource-1", scriptNames: [scriptName], hyperdriveIds: [],
  workerVersions: [{ scriptName, versionIds: [versionId] }],
  workerVersionDetailScriptNames: [scriptName],
});
const row = () => ({ id: versionId, metadata: { author_email: "never-return-private" }, resources: {
  script: { etag: tag, handlers: ["never-return-private"], last_deployed_from: "never-return-private" },
  script_runtime: { limits: { cpu_ms: 50 }, exports: { "never-return-private": {} }, migration_tag: "never-return-private" },
  bindings: [{ text: "never-return-private" }], assets: { config: { run_worker_first: true }, jwt: "never-return-private" },
} });
const expected = () => ({ id: versionId, detail: {
  subject: "provider-version-detail",
  scriptContentTag: { status: "provider-reported", value: tag, algorithm: "not-established" },
  cpuMs: { status: "configured", value: 50 }, activeDeployment: "not-established", historicalSourceBinding: "not-established",
} });
const success = result => JSON.stringify({ success: true, errors: [], result });
function project(value, inputScope = scope()) {
  const d = metadataDescriptors(inputScope).versionGet;
  return d.project(success(value), d.prepare(args));
}

test("Cloudflare version detail reports provider content tag and version CPU without SHA or active-source claims", () => {
  assert.deepEqual(project(row()), expected());
  assert.ok(!JSON.stringify(project(row())).includes("never-return-private"));
  const prepared = metadataDescriptors(scope()).versionGet.prepare(args);
  assert.equal(prepared.request.path, `/accounts/${account}/workers/scripts/${scriptName}/versions/${versionId}`);
  assert.equal(prepared.resource.id, `cloudflare:account:${account}:worker:${scriptName}:version:${versionId}`);
  assert.equal(prepared.resource.revision, "resource-1");
});

test("Cloudflare version detail scope is copied, default empty and independent of timestamps and list visibility", () => {
  const original = scope();
  const d = metadataDescriptors(original);
  original.workerVersionDetailScriptNames.length = 0;
  original.workerVersions[0].versionIds.length = 0;
  assert.deepEqual(d.versionGet.project(success(row()), d.versionGet.prepare(args)), expected());
  assert.deepEqual(project(row(), { ...scope(), workerVersionDetailScriptNames: undefined }), { id: versionId });
  assert.deepEqual(project(row(), { ...scope(), workerVersionDetailScriptNames: [], workerAttributionScriptNames: [scriptName] }), {
    id: versionId, attribution: { createdOn: unavailable },
  });
  assert.deepEqual(d.versionsList.project(success({ items: [row()] }), d.versionsList.prepare({ scriptName, page: 1, perPage: 10 })), { items: [{ id: versionId }], complete: false });
  assert.throws(() => metadataDescriptors({ ...scope(), workerVersionDetailScriptNames: ["foreign-worker"] }), /scope/);
  assert.throws(() => metadataDescriptors({ ...scope(), workerVersionDetailScriptNames: Array(101).fill(scriptName) }), /cap/);
  assert.throws(() => metadataDescriptors({ ...scope(), workerVersionDetailScriptNames: "safe-worker" }), /cap/);
});

test("Cloudflare version detail needs independent version authorization and rejects model or foreign-context overrides", () => {
  for (const workerVersions of [[], [{ scriptName, versionIds: [] }]]) {
    assert.throws(() => project(row(), { ...scope(), workerVersions }), /scope/);
  }
  const d = metadataDescriptors(scope()).versionGet;
  for (const key of ["accountId", "agentId", "approval", "url", "headers", "includeDetail", "workerVersionDetailScriptNames", "source", "deploymentId"]) {
    assert.throws(() => d.prepare({ ...args, [key]: true }), /schema/);
  }
  for (const foreign of [{ account_id: "b".repeat(32) }, { script_name: "foreign-worker" }, { id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" }]) {
    assert.throws(() => project({ ...row(), ...foreign }), /scope/);
  }
});

test("Cloudflare absent version content and CPU are unavailable, never synthesized from other fields", () => {
  for (const resources of [undefined, {}, { script: {}, script_runtime: {} }, { script_runtime: { limits: {} } }]) {
    const output = project({ id: versionId, resources, etag: tag, limits: { cpu_ms: 100 }, assets: { config: { run_worker_first: true } } });
    assert.deepEqual(output.detail, { ...expected().detail, scriptContentTag: unavailable, cpuMs: unavailable });
  }
  assert.deepEqual(project({ id: versionId, resources: { script_runtime: { limits: { cpu_ms: 0 } } } }).detail.cpuMs, { status: "configured", value: 0 });
});

test("Cloudflare version detail refuses malformed nesting, tag grammar and CPU instead of returning private data", () => {
  for (const invalid of [null, [], 5, "never-return-private"]) {
    for (const resources of [invalid, { script: invalid }, { script_runtime: invalid }, { script_runtime: { limits: invalid } }]) {
      assert.throws(() => project({ id: versionId, resources }), /upstream/);
    }
  }
  for (const etag of [null, 5, true, "", "never-return-private", `\"${tag}\"`, "a".repeat(31), "a".repeat(129), "a".repeat(32) + "\n"]) {
    assert.throws(() => project({ id: versionId, resources: { script: { etag } } }), /upstream/);
  }
  for (const cpu_ms of [null, -1, 1.5, "50", true, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => project({ id: versionId, resources: { script_runtime: { limits: { cpu_ms } } } }), /upstream/);
  }
  assert.equal(project({ id: versionId, resources: { script: { etag: "A".repeat(32) } } }).detail.scriptContentTag.value, "A".repeat(32));
});

// Reviewed core execution, with synthetic process-local host/lease/audit/journal only.
function fixture(change = () => {}) {
  const f = providerFixture();
  const operations = cloudflareReadOperations(scope(), { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async () => {
    f.calls.fetches++;
    return new Response(success(row()), { headers: { "content-type": "application/json" } });
  });
  const name = "cloudflare.workers.versions.get";
  f.calls.fetches = 0;
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operations.find(op => op.name === name).prepare(args).resource.id] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  change(f);
  const broker = createProviderBroker(f.dependencies);
  return { ...f, invoke: () => broker.call(name, args, "verified-runtime", "version-detail-call") };
}

test("Cloudflare version detail traverses reviewed core with credential cleanup, audit and replay refusal", async () => {
  const f = fixture();
  const result = await f.invoke();
  assert.deepEqual(result.value, expected());
  assert.equal(f.calls.fetches, 1);
  assert.equal(f.calls.secret, 1);
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(item => item.phase), ["intent", "outcome"]);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.ok(!JSON.stringify({ result, audit: f.audit, journal: [...f.journal] }).includes(credentialCanary));
});

test("Cloudflare version detail agent and resource denial, binding drift and lease-time revocation prevent GET", async () => {
  for (const failure of ["agent", "resource", "binding", "revoked"]) {
    const f = fixture(f => {
      if (failure === "agent") f.vector.policy.agents = ["other-agent"];
      if (failure === "resource") f.vector.policy.resources = [];
      if (failure === "binding") f.dependencies.host.revalidate = async () => false;
      if (failure === "revoked") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => {
          const lease = await resolve(target);
          f.vector.policy.revision = "policy-2";
          return lease;
        };
      }
    });
    const result = await f.invoke();
    assert.equal(result.ok, false);
    if (failure !== "binding") assert.equal(result.code, failure === "revoked" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.fetches, 0);
    assert.equal(f.calls.secret, failure === "revoked" ? 1 : 0);
  }
});
