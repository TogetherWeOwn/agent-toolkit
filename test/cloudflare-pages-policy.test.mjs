import assert from "node:assert/strict";
import test from "node:test";
import { pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { summarizePagesCoverage } from "../dist/plugins/cloudflare-broker/src/pages-coverage.js";
import { summarizePagesRecordedCoverage } from "../dist/plugins/cloudflare-broker/src/pages-recorded-coverage.js";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), revision = "resource-1";
const projectName = "safe-pages", projectId = "project-id";
const deploymentId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const projects = () => [{ projectName, projectId, deploymentIds: [deploymentId] },
  { projectName: "other-pages", projectId: "other-id", deploymentIds: [deploymentId] }];
const provenance = () => [{ projectName, sourceType: "github", repositoryOwner: "safe-org",
  repositoryName: "safe-repo", productionBranch: "main", deploymentBranches: ["main"] }];
const scope = mode => ({ accountId: account, revision, projects: projects(), provenanceProjects: mode & 1 ? provenance() : [],
  pagination: { projects: Boolean(mode & 2), deploymentProjects: mode & 2 ? [projectName] : [] } });
const source = () => ({ type: "github", config: { owner: "safe-org", repo_name: "safe-repo", production_branch: "main",
  production_deployments_enabled: false, token: credentialCanary } });
const project = () => ({ id: projectId, name: projectName, source: source(), production_branch: "main", env_vars: derivedCanary });
const deployment = () => ({ id: deploymentId, project_id: projectId, project_name: projectName, source: source(), environment: "production",
  deployment_trigger: { type: "github:push", metadata: { branch: "main", commit_hash: "c".repeat(40), commit_message: credentialCanary } }, env_vars: derivedCanary });
const base = `cloudflare:account:${account}:pages`;
const cases = [
  { key: "pagesProjectsList", tool: "cloudflare.pages.projects.list", args: { page: 1, perPage: 10 }, row: () => [project()], resource: `${base}:projects`, modes: [0, 1, 2, 3] },
  { key: "pagesProjectGet", tool: "cloudflare.pages.projects.get", args: { projectName }, row: project, resource: `${base}:project:${projectId}`, modes: [0, 1] },
  { key: "pagesDeploymentsList", tool: "cloudflare.pages.deployments.list", args: { projectName, page: 1, perPage: 10 }, row: () => [deployment()], resource: `${base}:project:${projectId}:deployments`, modes: [0, 1, 2, 3] },
  { key: "pagesDeploymentGet", tool: "cloudflare.pages.deployments.get", args: { projectName, deploymentId }, row: deployment, resource: `${base}:project:${projectId}:deployment:${deploymentId}`, modes: [0, 1] },
];
const identity = (c, mode) => c.resource + (mode & 1 ? ":provenance" : "") + (mode & 2 ? ":pagination" : "");
const body = c => JSON.stringify({ success: true, errors: [], result: c.row(), result_info: { page: 1, per_page: 10, total_pages: 1 } });
function fixture(c, mode, policyResource = identity(c, mode)) {
  const f = providerFixture({ authority: null }), selected = scope(mode), requests = [], receipts = [], targets = [];
  const readScope = { accountId: account, revision, scriptNames: [], hyperdriveIds: [], pagesProjects: selected.projects,
    pagesProvenanceProjects: selected.provenanceProjects, pagesPagination: selected.pagination };
  const operations = cloudflareReadOperations(readScope, { accountId: account, revision }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(body(c), { headers: { "content-type": "application/json" } });
  });
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [policyResource] };
  const resolve = f.dependencies.credentials.resolve;
  f.dependencies.credentials.resolve = async target => { targets.push(target); return resolve(target); };
  const broker = createCloudflareReadBroker(readScope, { accountId: account, revision }, f.dependencies,
    { async append(record) { receipts.push(record); } }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(body(c), { headers: { "content-type": "application/json" } });
    });
  return { ...f, requests, receipts, targets, operation: operations.find(op => op.name === c.tool),
    invoke: () => broker.call(c.tool, c.args, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, receipts: f.receipts, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "env_vars", "commit_message", '"token"']) assert.ok(!serialized.includes(value));
}

test("Cloudflare Pages policy identities snapshot each provenance pagination combination without changing requests", () => {
  for (const c of cases) {
    const ordinary = pagesMetadataDescriptors(scope(0))[c.key].prepare(c.args);
    for (const mode of c.modes) {
      const selected = scope(mode), d = pagesMetadataDescriptors(selected)[c.key];
      selected.provenanceProjects.length = 0; selected.pagination.projects = false; selected.pagination.deploymentProjects.length = 0;
      const prepared = d.prepare(c.args);
      assert.equal(prepared.resource.id, identity(c, mode));
      assert.equal(prepared.resource.revision, ordinary.resource.revision);
      assert.deepEqual(prepared.request, ordinary.request); assert.deepEqual(prepared.arguments, ordinary.arguments);
      const out = d.project(body(c), prepared), row = out.items?.[0] ?? out;
      assert.equal(Object.hasOwn(row, "provenance"), Boolean(mode & 1));
      assert.equal(Object.hasOwn(out, "pagination"), Boolean(mode & 2));
    }
    assert.equal(new Set(c.modes.map(mode => identity(c, mode))).size, c.modes.length);
  }
  const partial = pagesMetadataDescriptors(scope(3)), basic = pagesMetadataDescriptors(scope(0));
  for (const key of ["pagesProjectGet", "pagesDeploymentsList", "pagesDeploymentGet"]) {
    const args = { projectName: "other-pages", ...(key === "pagesDeploymentsList" ? { page: 1, perPage: 10 } : {}),
      ...(key === "pagesDeploymentGet" ? { deploymentId } : {}) };
    assert.deepEqual(partial[key].prepare(args), basic[key].prepare(args));
  }
});

test("Cloudflare Pages cross-combination policy denial occurs before credentials or network", async () => {
  for (const c of cases) for (const selected of c.modes) for (const allowed of c.modes) {
    if (selected === allowed) continue;
    const f = fixture(c, selected, identity(c, allowed)), out = await f.invoke();
    assert.equal(out.ok, false); assert.equal(out.code, "POLICY_DENIED");
    assert.equal(f.calls.secret, 0); assert.equal(f.calls.close, 0); assert.equal(f.requests.length, 0); assert.equal(f.receipts.length, 0);
    safe(f, out);
  }
});

test("Cloudflare Pages exact projection policy binds targets capture evidence audit journal cleanup and replay", async () => {
  for (const c of cases) for (const mode of c.modes) {
    const f = fixture(c, mode), out = await f.invoke();
    assert.equal(out.ok, true);
    const target = f.targets[0];
    assert.deepEqual(target.resource, { id: identity(c, mode), revision });
    assert.deepEqual(f.audit.map(record => record.phase), ["intent", "outcome"]);
    for (const record of f.audit) assert.equal(record.targetHash, canonicalHash(target));
    assert.equal([...f.journal.values()][0].target, canonicalHash(target));
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1); assert.equal(f.requests.length, 1);
    assert.equal(f.receipts.length, mode & 2 ? 1 : 0);
    if (mode & 2) {
      assert.equal(f.receipts[0].targetHash, canonicalHash(target));
      assert.equal(f.receipts[0].valueHash, canonicalHash(out.value));
      assert.deepEqual(out.value.capture.resource, target.resource);
      const observation = { result: out, evidence: f.receipts[0], target, arguments: c.args, audit: f.audit,
        journal: { event: out.event, targetHash: canonicalHash(target), outcome: "complete" } };
      const selected = { resource: target.resource, perPage: 10, principalHash: canonicalHash(f.vector.principal), policyRevision: "policy-1",
        ...(c.key === "pagesDeploymentsList" ? { deploymentProjectName: projectName } : {}) };
      const summary = summarizePagesRecordedCoverage(selected, [observation]);
      assert.equal(summary.recordedOutcome, "consistent-supplied-records"); assert.equal(summary.complete, false);
      assert.equal(summary.nativeAcceptance, "not-established");
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
});

test("Cloudflare Pages execution refuses swapped projection-combination prepared resources", async () => {
  for (const c of cases) for (const selected of c.modes) for (const swapped of c.modes) {
    if (selected === swapped) continue;
    const f = fixture(c, selected), prepared = f.operation.prepare(c.args);
    await assert.rejects(() => f.operation.execute({ ...prepared, resource: { ...prepared.resource, id: identity(c, swapped) } },
      credentialCanary, new AbortController().signal), /scope/);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare Pages coverage accepts only pagination-qualified filtered identities and keeps exact record binding", async () => {
  for (const c of [cases[0], cases[2]]) for (const mode of [2, 3]) {
    const f = fixture(c, mode), out = await f.invoke(), target = f.targets[0];
    const observation = { result: out, evidence: f.receipts[0] };
    assert.equal(summarizePagesCoverage({ resource: target.resource, perPage: 10 }, [observation]).complete, false);
    for (const suffix of ["", ":provenance", ":pagination:provenance", ":pagination:pagination", ":inventory", ":detail:pagination"]) {
      const resource = { ...target.resource, id: c.resource + suffix };
      assert.throws(() => summarizePagesCoverage({ resource, perPage: 10 }, [observation]), /schema|scope/);
    }
    // Even consistently rebound captures/receipts cannot mix the two selected resources.
    const wrong = structuredClone(observation);
    wrong.result.value.capture.resource.id = identity(c, mode === 2 ? 3 : 2);
    wrong.evidence.valueHash = canonicalHash(wrong.result.value);
    assert.throws(() => summarizePagesCoverage({ resource: target.resource, perPage: 10 }, [wrong]), /scope/);
  }
});

test("Cloudflare Pages existing inventory policy identities ignore filtered provenance selection", () => {
  for (const mode of [2, 3]) {
    const d = pagesMetadataDescriptors({ ...scope(mode), projectInventoryReadAllowed: true, deploymentInventoryProjects: [projectName] });
    assert.equal(d.pagesProjectsList.prepare(cases[0].args).resource.id, `${base}:projects:inventory`);
    assert.equal(d.pagesDeploymentsList.prepare(cases[2].args).resource.id, `${base}:project:${projectId}:deployments:inventory`);
  }
});
