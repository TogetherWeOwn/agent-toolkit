import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const deployment = "11111111-2222-4333-8444-555555555555";
const first = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const second = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const stamp = "2026-11-08T01:02:03.123456Z";
const scriptName = "safe-worker";
const scope = () => ({
  accountId: account, revision: "resource-1", scriptNames: [scriptName], hyperdriveIds: [],
  workerDeployments: [{ scriptName, deploymentIds: [deployment] }],
  workerVersions: [{ scriptName, versionIds: [first, second] }],
  workerAttributionScriptNames: [scriptName],
});
const row = () => ({ id: deployment, created_on: stamp, strategy: "percentage", versions: [{ version_id: first, percentage: 12.5 }, { version_id: second, percentage: 87.5 }], author_email: "never-return-private", annotations: { message: "never-return-private" }, source: "never-return-private" });
const success = result => JSON.stringify({ success: true, errors: [], result });
const args = { scriptName, deploymentId: deployment };
const page = { scriptName, page: 1, perPage: 10 };
function projected(descriptors, value) {
  return descriptors.deploymentGet.project(success(value), descriptors.deploymentGet.prepare(args));
}
const expected = () => ({ id: deployment, attribution: {
  createdOn: stamp,
  traffic: { subject: "deployment-configured-allocation", strategy: "percentage", versions: [{ versionId: first, percentage: 12.5 }, { versionId: second, percentage: 87.5 }] },
  activeDeployment: "not-established", observedTraffic: "not-established",
} });

test("Cloudflare deployment attribution is explicit configured allocation, never active or measured traffic", () => {
  const d = metadataDescriptors(scope());
  assert.deepEqual(projected(d, row()), expected());
  const result = d.deploymentsList.project(success({ deployments: [row(), { ...row(), id: first }] }), d.deploymentsList.prepare(page));
  assert.deepEqual(result, { items: [expected()], complete: false });
  assert.ok(!JSON.stringify(result).includes("never-return-private"));
  assert.equal(d.deploymentGet.prepare(args).request.path, `/accounts/${account}/workers/scripts/${scriptName}/deployments/${deployment}`);
});

test("Cloudflare attribution defaults off, is copied and cannot be selected by model arguments", () => {
  const original = scope();
  const d = metadataDescriptors(original);
  original.workerAttributionScriptNames.length = 0;
  original.workerVersions[0].versionIds.length = 0;
  assert.deepEqual(projected(d, row()), expected());
  assert.deepEqual(projected(metadataDescriptors({ ...scope(), workerAttributionScriptNames: undefined }), row()), { id: deployment });
  assert.throws(() => metadataDescriptors({ ...scope(), workerAttributionScriptNames: ["foreign-worker"] }), /scope/);
  for (const field of ["workerAttributionScriptNames", "includeAttribution", "accountId", "agentId", "versions", "approval", "url"]) {
    assert.throws(() => d.deploymentGet.prepare({ ...args, [field]: true }), /schema/);
  }
});

test("Cloudflare attribution requires independent version authorization and refuses partial traffic maps", () => {
  for (const versionIds of [[], [first], [second]]) {
    const d = metadataDescriptors({ ...scope(), workerVersions: [{ scriptName, versionIds }] });
    assert.throws(() => projected(d, row()), /scope/);
  }
  const d = metadataDescriptors(scope());
  for (const association of [{ account_id: "b".repeat(32) }, { script_name: "foreign-worker" }]) {
    assert.throws(() => projected(d, { ...row(), ...association }), /scope/);
  }
});

test("Cloudflare allocation rejects malformed, duplicate, missing, oversized or non-total percentages", () => {
  const d = metadataDescriptors(scope());
  for (const value of [undefined, null, [], Array(101).fill({ version_id: first, percentage: 1 }), [{ version_id: first, percentage: 50 }], [{ version_id: first, percentage: 50 }, { version_id: first, percentage: 50 }]]) {
    assert.throws(() => projected(d, { ...row(), versions: value }), /upstream|cap/);
  }
  for (const percentage of [null, "100", 0, -1, 0.001, 100.01, 1e100]) {
    assert.throws(() => projected(d, { ...row(), versions: [{ version_id: first, percentage }] }), /upstream/);
  }
  for (const strategy of [undefined, null, "random"]) assert.throws(() => projected(d, { ...row(), strategy }), /upstream/);
  assert.deepEqual(projected(d, { ...row(), versions: [{ version_id: first, percentage: 0.01 }, { version_id: second, percentage: 99.99 }] }).attribution.traffic.versions.map(v => v.percentage), [0.01, 99.99]);
});

test("Cloudflare timestamps retain fractional precision and refuse normalized impossible dates", () => {
  const d = metadataDescriptors(scope());
  for (const created_on of [undefined, null, 1, "private-text", "2026-02-29T01:02:03Z", "2026-04-31T01:02:03Z", "2026-11-08T24:02:03Z", "2026-11-08T01:02:60Z", "2026-11-08T01:02:03+00:00", "2026-11-08T01:02:03x123Z"]) {
    assert.throws(() => projected(d, { ...row(), created_on }), /upstream/);
  }
  for (const created_on of [stamp, "2024-02-29T01:02:03Z", "2026-11-08T01:02:03.123456789Z"]) {
    assert.equal(projected(d, { ...row(), created_on }).attribution.createdOn, created_on);
  }
});

test("Cloudflare version timestamp projection omits bindings, author and unqualified script etag", () => {
  const d = metadataDescriptors(scope());
  const value = { id: first, metadata: { created_on: stamp, author_email: "never-return-private", modified_on: "never-return-private" }, resources: { script: { etag: "never-return-private" }, bindings: [{ value: "never-return-private" }] } };
  const input = d.versionGet.prepare({ scriptName, versionId: first });
  const expected = { id: first, attribution: { createdOn: { status: "provider-reported", value: stamp } } };
  assert.deepEqual(d.versionGet.project(success(value), input), expected);
  assert.deepEqual(d.versionsList.project(success({ items: [value] }), d.versionsList.prepare(page)), { items: [expected], complete: false });
  for (const value of [{ id: first }, { id: first, metadata: {} }]) {
    assert.deepEqual(d.versionGet.project(success(value), input), { id: first, attribution: { createdOn: { status: "unavailable", reason: "not-returned" } } });
  }
  for (const metadata of [null, [], { created_on: null }, { created_on: "2026-02-30T00:00:00Z" }]) assert.throws(() => d.versionGet.project(success({ id: first, metadata }), input), /upstream/);
});

// Real reviewed executor with process-local synthetic host/lease/journal only.
function fixture(value, change = () => {}) {
  const f = providerFixture();
  const operations = cloudflareReadOperations(scope(), { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async () => {
    f.calls.fetches++;
    return new Response(success(value), { headers: { "content-type": "application/json" } });
  });
  const name = "cloudflare.workers.deployments.get";
  f.calls.fetches = 0;
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operations.find(op => op.name === name).prepare(args).resource.id] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  change(f);
  const broker = createProviderBroker(f.dependencies);
  return { ...f, invoke: (raw = args) => broker.call(name, raw, "verified-runtime", "attribution-call") };
}

test("Cloudflare attribution traverses the reviewed executor and retains audit and replay refusals", async () => {
  const f = fixture(row());
  const result = await f.invoke();
  assert.deepEqual(result.value, expected());
  assert.equal(f.calls.secret, 1);
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(item => item.phase), ["intent", "outcome"]);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.ok(!JSON.stringify({ result, audit: f.audit, journal: [...f.journal] }).includes(credentialCanary));
});

test("Cloudflare attribution agent/resource denials and mid-lease revocation prevent the GET", async () => {
  for (const failure of ["agent", "resource", "revoked"]) {
    const f = fixture(row(), f => {
      if (failure === "agent") f.vector.policy.agents = ["other-agent"];
      if (failure === "resource") f.vector.policy.resources = [];
      if (failure === "revoked") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => {
          const lease = await resolve(target);
          f.vector.policy.revision = "policy-2";
          return lease;
        };
      }
    });
    assert.equal((await f.invoke()).code, failure === "revoked" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.fetches, 0);
    assert.equal(f.calls.secret, failure === "revoked" ? 1 : 0);
  }
});
