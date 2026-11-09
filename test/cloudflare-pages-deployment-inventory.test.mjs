import assert from "node:assert/strict";
import test from "node:test";
import { pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { summarizePagesCoverage } from "../dist/plugins/cloudflare-broker/src/pages-coverage.js";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32);
const tool = "cloudflare.pages.deployments.list";
const args = { projectName: "project-1", page: 1, perPage: 10 };
const unavailable = { status: "unavailable", reason: "not-returned" };
const id = n => `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;
const scope = () => ({ accountId, revision: "resource-1", projects: [{ projectName: "project-1", projectId: "id-1", deploymentIds: [] }],
  deploymentInventoryProjects: ["project-1"], pagination: { projects: false, deploymentProjects: ["project-1"] } });
const row = (n = 1) => ({ id: id(n), project_name: "project-1", project_id: "id-1", environment: "production",
  deployment_trigger: { type: "github:push", metadata: { branch: `branch-${n}`, commit_hash: "b".repeat(40),
    commit_message: credentialCanary, commit_dirty: false } }, source: { config: { owner: derivedCanary } },
  env_vars: credentialCanary, build_config: { build_command: derivedCanary }, url: derivedCanary,
  created_on: credentialCanary, latest_stage: derivedCanary });
const body = (result, patch = {}) => JSON.stringify({ success: true, errors: [], result,
  result_info: { page: 1, per_page: 10, total_pages: 1 }, ...patch });
function fixture({ selected = true, result = [row(), row(2)], sink } = {}) {
  const f = providerFixture({ authority: null });
  const s = { accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [], pagesProjects: scope().projects,
    pagesDeploymentInventoryProjects: selected ? ["project-1"] : [], pagesPagination: scope().pagination };
  const source = { accountId, revision: "resource-1" };
  const operation = cloudflareReadOperations(s, source).find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(args).resource.id] };
  const receipts = [], requests = [];
  const broker = createCloudflareReadBroker(s, source, f.dependencies, { async append(record) {
    if (sink) await sink(record);
    receipts.push(record);
  } }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(body(result), { headers: { "content-type": "application/json" } });
  });
  return { ...f, receipts, requests, operation,
    invoke: (input = args, key = "call-a", context = "verified-runtime") => broker.call(tool, input, context, key) };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, receipts: f.receipts, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "env_vars", "build_command", "commit_message", "latest_stage", "created_on"])
    assert.ok(!serialized.includes(value), value);
}

test("Cloudflare Pages deployment inventory is independently scoped, copied, page-authorized and resource-distinct", () => {
  const s = scope(), d = pagesMetadataDescriptors(s);
  s.deploymentInventoryProjects.length = 0; s.pagination.deploymentProjects.length = 0; s.projects[0].projectId = "changed";
  const p = d.pagesDeploymentsList.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${accountId}:pages:project:id-1:deployments:inventory`);
  assert.equal(p.request.path, `/accounts/${accountId}/pages/projects/project-1/deployments?page=1&per_page=10`);
  assert.equal(d.pagesDeploymentsList.project(body([row()]), p).items.length, 1);
  for (const selected of [undefined, []]) {
    const legacy = pagesMetadataDescriptors({ ...scope(), deploymentInventoryProjects: selected });
    const prepared = legacy.pagesDeploymentsList.prepare(args);
    assert.equal(prepared.resource.id, `cloudflare:account:${accountId}:pages:project:id-1:deployments:pagination`);
    assert.deepEqual(legacy.pagesDeploymentsList.project(body([row()]), prepared).items, []);
  }
  for (const selected of [null, true, ["other"], ["project-1", "project-1"], Array(101).fill("project-1")])
    assert.throws(() => pagesMetadataDescriptors({ ...scope(), deploymentInventoryProjects: selected }), /schema|scope|cap/);
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), pagination: undefined }), /scope/);
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), pagination: { projects: true, deploymentProjects: [] } }), /scope/);
  assert.throws(() => d.pagesDeploymentGet.prepare({ projectName: args.projectName, deploymentId: id(1) }), /scope/);
  assert.throws(() => d.pagesDeploymentsList.prepare({ ...args, projectName: "other" }), /scope/);
});

test("Cloudflare Pages deployment inventory projects every returned identity environment and trigger only", () => {
  const d = pagesMetadataDescriptors(scope()).pagesDeploymentsList;
  for (const type of ["github:push", "ad_hoc", "deploy_hook"]) {
    const first = row(); first.deployment_trigger.type = type;
    const second = row(2); second.environment = "preview";
    const out = d.project(body([first, second]), d.prepare(args));
    assert.deepEqual(out.items.map(item => item.id), [id(1), id(2)]);
    assert.deepEqual(out.items[0].inventory, { subject: "provider-pages-deployment-inventory", projectName: "project-1", projectId: "id-1",
      environment: { status: "provider-reported", value: "production" }, trigger: { status: "provider-reported", type,
        branch: { status: "provider-reported", value: "branch-1" }, commitHash: { status: "provider-reported", value: "b".repeat(40) } },
      servingDeployment: "not-established", historicalSourceBinding: "not-established" });
    assert.equal(out.selection, "all-returned-deployments"); assert.equal(out.complete, false);
    safe({ receipts: [], audit: [], journal: [] }, out);
  }
  const minimal = d.project(body([{ id: id(1), project_name: "project-1", project_id: "id-1" }]), d.prepare(args)).items[0];
  assert.deepEqual(minimal.inventory.environment, unavailable); assert.deepEqual(minimal.inventory.trigger, unavailable);
  const partial = row(); partial.deployment_trigger = { type: "ad_hoc" };
  const trigger = d.project(body([partial]), d.prepare(args)).items[0].inventory.trigger;
  assert.deepEqual(trigger.branch, unavailable); assert.deepEqual(trigger.commitHash, unavailable);
});

test("Cloudflare Pages deployment inventory refuses duplicates malformed values foreign identity and bounds", () => {
  const d = pagesMetadataDescriptors(scope()).pagesDeploymentsList;
  for (const change of [r => { r.account_id = "f".repeat(32); }, r => { delete r.project_id; }, r => { r.project_name = "other"; },
    r => { r.project_id = "other"; }, r => { r.id += "\n"; }, r => { r.id = null; }, r => { r.environment = null; },
    r => { r.environment = "unknown"; }, r => { r.deployment_trigger = null; }, r => { r.deployment_trigger.type = "unknown"; },
    r => { r.deployment_trigger.metadata = null; }, r => { r.deployment_trigger.metadata.branch = "main\n"; },
    r => { r.deployment_trigger.metadata.commit_hash = "b".repeat(40) + "\n"; }]) {
    const value = row(); change(value);
    assert.throws(() => d.project(body([value]), d.prepare(args)), /schema|scope|upstream/);
  }
  assert.throws(() => d.project(body([row(), row()]), d.prepare(args)), /scope/);
  assert.throws(() => d.project(body([row()], { account_id: "f".repeat(32) }), d.prepare(args)), /scope/);
  assert.throws(() => d.project(body([row(), row(2)]), d.prepare({ ...args, perPage: 1 })), /cap/);
  assert.throws(() => d.project(body([{ ...row(), padding: "x".repeat(131072) }]), d.prepare(args)), /cap/);
  for (const resource of [{ id: "other", revision: "resource-1" }, { id: d.prepare(args).resource.id, revision: "stale" }])
    assert.throws(() => d.project(body([row()]), { ...d.prepare(args), resource }), /scope/);
});

test("Cloudflare Pages deployment inventory cannot be model-enabled or authorized by filtered-list policy", async () => {
  for (const patch of [{ deploymentInventoryProjects: ["project-1"] }, { inventory: true }, { env: "production" }, { accountId }, { approval: "forged" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  const f = fixture(); f.vector.policy.resources = [`cloudflare:account:${accountId}:pages:project:id-1:deployments`];
  assert.equal((await f.invoke()).code, "POLICY_DENIED"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
});

test("Cloudflare Pages deployment inventory binds captured projection to core event target and completed outcome", async () => {
  const f = fixture(), out = await f.invoke();
  assert.equal(out.ok, true); assert.equal(out.value.items.length, 2);
  assert.equal(out.value.capture.resource.id, f.operation.prepare(args).resource.id);
  assert.deepEqual(f.receipts, [{ contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-pages-list-projection",
    event: out.event, targetHash: f.audit[0].targetHash, valueHash: canonicalHash(out.value) }]);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.equal(f.calls.consumed, 0); assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1);
  assert.throws(() => summarizePagesCoverage({ resource: out.value.capture.resource, perPage: 10 }, []), /schema/);
  safe(f, out);
});

test("Cloudflare Pages deployment inventory current identity resource and lease-time revocation refuse network", async () => {
  for (const denial of ["identity", "agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denial === "agent") f.vector.policy.agents = ["other-agent"];
    if (denial === "resource") f.vector.policy.resources = ["other-resource"];
    if (denial === "binding") f.dependencies.host.revalidate = async () => false;
    if (denial === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const out = await f.invoke(args, "call-a", denial === "identity" ? {} : "verified-runtime");
    assert.equal(out.ok, false); assert.equal(f.requests.length, 0); assert.equal(f.receipts.length, 0);
    assert.equal(f.calls.secret, denial === "revocation" ? 1 : 0); assert.equal(f.calls.close, denial === "revocation" ? 1 : 0);
    safe(f, out);
  }
});

test("Cloudflare Pages deployment inventory reflection cleanup sink and audit outages preserve uncertain replay", async () => {
  for (const failure of ["reflection", "cleanup", "sink", "audit", "duplicate"]) {
    const reflected = row(); reflected.deployment_trigger.metadata.branch = credentialCanary;
    const result = failure === "reflection" ? [reflected] : failure === "duplicate" ? [row(), row()] : [row()];
    const f = fixture({ result, sink: failure === "sink" ? async () => { throw Error(credentialCanary); } : undefined });
    const append = f.dependencies.audit.append;
    if (failure === "cleanup") f.dependencies.credentials.resolve = async () => ({ value: credentialCanary, redactions: [derivedCanary],
      async close() { throw Error(credentialCanary); } });
    if (failure === "audit") f.dependencies.audit.append = async record => {
      if (record.phase === "outcome" && record.decision === "ALLOW") throw Error(credentialCanary);
      await append(record);
    };
    const out = await f.invoke();
    assert.equal(out.ok, false); assert.equal(out.value, undefined); assert.equal(f.receipts.length, failure === "audit" ? 1 : 0);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
});

test("Cloudflare Pages deployment inventory never promotes empty terminal or missing page evidence to absence", async () => {
  const d = pagesMetadataDescriptors(scope()).pagesDeploymentsList;
  for (const info of [undefined, { page: 1, per_page: 10, total_pages: 0 }]) {
    const out = d.project(body([], { result_info: info }), d.prepare(args));
    assert.equal(out.complete, false); assert.equal(out.selection, "all-returned-deployments"); assert.deepEqual(out.items, []);
    if (info === undefined) assert.deepEqual(out.pagination, unavailable); else assert.equal(out.pagination.enumeration, "not-established");
  }
  const f = fixture({ selected: false }), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, []); assert.equal(out.value.selection, undefined); safe(f, out);
});
