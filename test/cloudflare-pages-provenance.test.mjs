import assert from "node:assert/strict";
import test from "node:test";
import { pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const projectId = "project-id";
const projectName = "safe-pages";
const deploymentId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const hash = "c".repeat(40);
const projects = () => [{ projectName, projectId, deploymentIds: [deploymentId] }];
const provenanceProjects = () => [{ projectName, sourceType: "github", repositoryOwner: "safe-org",
  repositoryName: "safe-repo", productionBranch: "main", deploymentBranches: ["main", "preview"] }];
const scope = () => ({ accountId: account, revision: "resource-1", projects: projects(), provenanceProjects: provenanceProjects() });
const success = result => JSON.stringify({ success: true, errors: [], result });
const unavailable = { status: "unavailable", reason: "not-returned" };
const source = () => ({ type: "github", config: { owner: "safe-org", repo_name: "safe-repo", production_branch: "main",
  production_deployments_enabled: false, owner_id: credentialCanary, repo_id: derivedCanary,
  path_includes: [credentialCanary], preview_branch_excludes: [derivedCanary] } });
const project = () => ({ id: projectId, name: projectName, source: source(), production_branch: "main",
  build_config: { build_command: credentialCanary }, deployment_configs: { production: { env_vars: derivedCanary } } });
const deployment = () => ({ id: deploymentId, project_name: projectName, project_id: projectId, source: source(), environment: "production",
  deployment_trigger: { type: "github:push", metadata: { branch: "main", commit_hash: hash, commit_message: credentialCanary, commit_dirty: true } },
  env_vars: { SECRET: { value: derivedCanary } }, url: credentialCanary, aliases: [derivedCanary] });
const cases = [
  ["pagesProjectsList", "cloudflare.pages.projects.list", { page: 2, perPage: 10 }, () => [project()]],
  ["pagesProjectGet", "cloudflare.pages.projects.get", { projectName }, project],
  ["pagesDeploymentsList", "cloudflare.pages.deployments.list", { projectName, page: 2, perPage: 10 }, () => [deployment()]],
  ["pagesDeploymentGet", "cloudflare.pages.deployments.get", { projectName, deploymentId }, deployment],
];
function fixture(c, { selected = provenanceProjects(), response = c[3](), status = 200, pagination, resultInfo } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: projects(), pagesProvenanceProjects: selected, pagesPagination: pagination }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(JSON.stringify({ success: true, errors: [], result: response, result_info: resultInfo }),
      { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === c[1]);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(c[2]).resource.id] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (args = c[2], key = "call-a") => broker.call(c[1], args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "env_vars", "commit_message", "build_command", "path_includes", "owner_id", "repo_id"]) {
    assert.ok(!data.includes(value), value);
  }
}

test("Cloudflare Pages provenance is independently default-empty and copies exact repository and branch scope", () => {
  const s = scope();
  const d = pagesMetadataDescriptors(s);
  s.provenanceProjects[0].repositoryName = "other";
  s.provenanceProjects[0].deploymentBranches.push("other");
  s.provenanceProjects.length = 0;
  for (const [name, , args, row] of cases) {
    const out = d[name].project(success(row()), d[name].prepare(args));
    assert.ok((out.items?.[0] ?? out).provenance);
    const base = pagesMetadataDescriptors({ ...scope(), provenanceProjects: [] });
    const legacy = base[name].project(success(row()), base[name].prepare(args));
    assert.deepEqual(legacy, out.items ? { items: [{ id: out.items[0].id }], complete: false } : { id: out.id });
    safe({ audit: [], journal: [] }, out);
  }
  const p = d.pagesDeploymentGet.prepare({ projectName, deploymentId });
  const row = deployment(); row.deployment_trigger.metadata.branch = "other";
  assert.throws(() => d.pagesDeploymentGet.project(success(row), p), /scope/);
  for (const patch of [{ projectName: "other" }, { sourceType: "other" }, { repositoryOwner: "bad\n" },
    { repositoryName: "../escape" }, { productionBranch: "main\n" }, { deploymentBranches: ["main", "main"] }]) {
    assert.throws(() => pagesMetadataDescriptors({ ...scope(), provenanceProjects: [{ ...provenanceProjects()[0], ...patch }] }), /schema|scope/);
  }
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), provenanceProjects: [...provenanceProjects(), ...provenanceProjects()] }), /scope/);
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), provenanceProjects: Array(101).fill(provenanceProjects()[0]) }), /cap/);
});

test("Cloudflare Pages project provenance reports configured false without inferring absence or effective production", () => {
  const d = pagesMetadataDescriptors(scope());
  const out = d.pagesProjectGet.project(success(project()), d.pagesProjectGet.prepare({ projectName }));
  assert.deepEqual(out, { id: projectId, provenance: { subject: "configured-pages-project", source: { status: "provider-reported",
    type: "github", repositoryOwner: "safe-org", repositoryName: "safe-repo", productionBranch: { status: "configured", value: "main" },
    productionDeploymentsEnabled: { status: "configured", value: false } }, productionBranch: { status: "configured", value: "main" },
    effectiveProduction: "not-established" } });
  const lp = d.pagesProjectsList.prepare({ page: 2, perPage: 10 });
  const list = d.pagesProjectsList.project(success([project(), { id: "other", name: "other" }]), lp);
  assert.equal(list.complete, false);
  assert.deepEqual(list.items, [out]);
  const missing = d.pagesProjectGet.project(success({ id: projectId, name: projectName }), d.pagesProjectGet.prepare({ projectName }));
  assert.deepEqual(missing.provenance.source, unavailable);
  assert.deepEqual(missing.provenance.productionBranch, unavailable);
  assert.deepEqual(d.pagesProjectsList.project(success([]), lp), { items: [], complete: false });
});

test("Cloudflare Pages deployment trigger stays provider-reported not historical-source or serving proof", () => {
  const d = pagesMetadataDescriptors(scope());
  const p = d.pagesDeploymentGet.prepare({ projectName, deploymentId });
  for (const type of ["github:push", "ad_hoc", "deploy_hook"]) {
    const row = deployment(); row.deployment_trigger.type = type;
    const out = d.pagesDeploymentGet.project(success(row), p);
    assert.deepEqual(out.provenance.trigger, { status: "provider-reported", type,
      branch: { status: "provider-reported", value: "main" }, commitHash: { status: "provider-reported", value: hash } });
    assert.equal(out.provenance.servingDeployment, "not-established");
    assert.equal(out.provenance.historicalSourceBinding, "not-established");
    safe({ audit: [], journal: [] }, out);
  }
  const row = deployment(); delete row.source; delete row.environment; delete row.deployment_trigger;
  const out = d.pagesDeploymentGet.project(success(row), p);
  for (const key of ["source", "environment", "trigger"]) assert.deepEqual(out.provenance[key], unavailable);
  row.deployment_trigger = { type: "ad_hoc" };
  assert.deepEqual(d.pagesDeploymentGet.project(success(row), p).provenance.trigger.branch, unavailable);
  row.source = source(); delete row.source.config.production_branch; delete row.source.config.production_deployments_enabled;
  const partial = d.pagesDeploymentGet.project(success(row), p).provenance.source;
  assert.deepEqual(partial.productionBranch, unavailable);
  assert.deepEqual(partial.productionDeploymentsEnabled, unavailable);
  const gitlab = pagesMetadataDescriptors({ ...scope(), provenanceProjects: [{ ...provenanceProjects()[0], sourceType: "gitlab" }] });
  row.source = source(); row.source.type = "gitlab";
  assert.equal(gitlab.pagesDeploymentGet.project(success(row), gitlab.pagesDeploymentGet.prepare({ projectName, deploymentId })).provenance.source.type, "gitlab");
});

test("Cloudflare Pages selected provenance refuses repository drift, malformed triggers and explicit foreign context", () => {
  const d = pagesMetadataDescriptors(scope());
  const p = d.pagesDeploymentGet.prepare({ projectName, deploymentId });
  for (const change of [row => { row.source.type = "gitlab"; }, row => { row.source.config.owner = "other"; },
    row => { row.source.config.repo_name = "other"; }, row => { row.source.config.production_branch = "other"; },
    row => { row.source.config.production_deployments_enabled = "false"; }, row => { row.source = null; },
    row => { row.environment = "unknown"; }, row => { row.deployment_trigger.type = "unknown"; },
    row => { row.deployment_trigger.metadata.branch = "other"; }, row => { row.deployment_trigger.metadata.commit_hash = credentialCanary; },
    row => { row.deployment_trigger.metadata.commit_hash = hash + "\n"; },
    row => { row.deployment_trigger.metadata = null; }, row => { row.account_id = "f".repeat(32); }]) {
    const row = deployment(); change(row);
    assert.throws(() => d.pagesDeploymentGet.project(success(row), p), /scope|upstream/);
  }
  assert.throws(() => d.pagesProjectGet.project(success({ ...project(), production_branch: "other" }), d.pagesProjectGet.prepare({ projectName })), /scope/);
});

test("Cloudflare Pages provenance retains response page output and scope bounds", () => {
  const d = pagesMetadataDescriptors(scope());
  const lp = d.pagesProjectsList.prepare({ page: 1, perPage: 1 });
  assert.throws(() => d.pagesProjectsList.project(success([project(), project()]), lp), /cap/);
  assert.throws(() => d.pagesProjectGet.project(success({ ...project(), padding: "x".repeat(131072) }), d.pagesProjectGet.prepare({ projectName })), /cap/);
  for (const raw of ["null", "not-json", success(null), JSON.stringify({ success: false, errors: [], result: project() })]) {
    assert.throws(() => d.pagesProjectGet.project(raw, d.pagesProjectGet.prepare({ projectName })), /upstream/);
  }
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), provenanceProjects: [{ ...provenanceProjects()[0], deploymentBranches: Array(101).fill("main") }] }), /cap/);
  const many = Array.from({ length: 100 }, (_, i) => ({ projectName: `project-${i}`, projectId: `id-${i}`, deploymentIds: [] }));
  const large = pagesMetadataDescriptors({ ...scope(), projects: many, provenanceProjects: many.map(p => ({ ...provenanceProjects()[0],
    projectName: p.projectName, repositoryOwner: "a".repeat(100), repositoryName: "b".repeat(100), productionBranch: "c".repeat(200) })) });
  const rows = many.map(p => ({ id: p.projectId, name: p.projectName, production_branch: "c".repeat(200),
    source: { type: "github", config: { owner: "a".repeat(100), repo_name: "b".repeat(100), production_branch: "c".repeat(200) } } }));
  assert.throws(() => large.pagesProjectsList.project(success(rows), large.pagesProjectsList.prepare({ page: 1, perPage: 100 })), /cap/);
});

test("Cloudflare Pages provenance model overrides remain closed before credential lookup", async () => {
  for (const c of cases) for (const patch of [{ accountId: "f".repeat(32) }, { repositoryName: "other" }, { provenance: true },
    { deploymentBranches: ["other"] }, { source: {} }, { approval: "forged" }]) {
    const f = fixture(c);
    assert.equal((await f.invoke({ ...c[2], ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare Pages provenance actual-core fixed GET preserves redaction cleanup audit and replay", async () => {
  for (const c of cases) {
    const f = fixture(c);
    const p = f.operation.prepare(c[2]);
    assert.equal(p.plan.providerDryRun, false);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.ok((out.value.items?.[0] ?? out.value).provenance);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
    const base = fixture(c, { selected: [] });
    const legacy = await base.invoke();
    assert.equal(legacy.ok, true);
    assert.equal((legacy.value.items?.[0] ?? legacy.value).provenance, undefined);
  }
});

test("Cloudflare Pages provenance agent resource binding and lease-time revocation deny network", async () => {
  for (const c of cases) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(c);
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    assert.equal((await f.invoke()).code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare Pages provenance upstream and outcome-audit failures retain uncertain replay state", async () => {
  for (const c of cases) for (const failure of ["repository", "denied", "audit"]) {
    const response = c[3]();
    if (failure === "repository") (Array.isArray(response) ? response[0] : response).source.config.repo_name = "other";
    const f = fixture(c, { response, status: failure === "denied" ? 403 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});

const paginationScope = () => ({ projects: true, deploymentProjects: [projectName] });
const listCases = cases.filter(c => c[0].endsWith("List"));
const pageInfo = () => ({ page: 2, per_page: 10, total_pages: 5, total_count: 49, count: 10,
  cursor: credentialCanary, url: derivedCanary });
const pageBody = (result, info) => JSON.stringify({ success: true, errors: [], result, result_info: info });

test("Cloudflare Pages pagination evidence independently defaults off and snapshots list scopes", () => {
  const pagination = paginationScope();
  const d = pagesMetadataDescriptors({ ...scope(), pagination });
  pagination.projects = false; pagination.deploymentProjects.length = 0;
  for (const c of listCases) {
    const prepared = d[c[0]].prepare(c[2]);
    const out = d[c[0]].project(pageBody(c[3](), pageInfo()), prepared);
    assert.deepEqual(out.pagination, { status: "provider-reported", page: 2, perPage: 10,
      totalPages: { status: "provider-reported", value: 5 }, enumeration: "not-established", snapshotConsistency: "not-established" });
    assert.equal(out.complete, false);
    const base = pagesMetadataDescriptors(scope());
    assert.equal(base[c[0]].project(pageBody(c[3](), pageInfo()), base[c[0]].prepare(c[2])).pagination, undefined);
    safe({ audit: [], journal: [] }, out);
    assert.ok(!JSON.stringify(out).includes("total_count"));
  }
  for (const [selected, expected] of [[{ projects: true, deploymentProjects: [] }, [true, false]],
    [{ projects: false, deploymentProjects: [projectName] }, [false, true]]]) {
    const split = pagesMetadataDescriptors({ ...scope(), pagination: selected });
    listCases.forEach((c, i) => assert.equal(Boolean(split[c[0]].project(pageBody(c[3](), pageInfo()),
      split[c[0]].prepare(c[2])).pagination), expected[i]));
  }
  for (const invalid of [null, { projects: 1, deploymentProjects: [] }, { projects: true, deploymentProjects: "bad" },
    { projects: true, deploymentProjects: ["other"] }, { projects: true, deploymentProjects: [projectName, projectName] },
    { projects: true, deploymentProjects: Array(101).fill(projectName) }]) {
    assert.throws(() => pagesMetadataDescriptors({ ...scope(), pagination: invalid }), /schema|scope|cap/);
  }
});

test("Cloudflare Pages pagination omission is unavailable and terminal or empty pages never prove enumeration", () => {
  const d = pagesMetadataDescriptors({ ...scope(), pagination: paginationScope() });
  for (const c of listCases) {
    const p = d[c[0]].prepare(c[2]);
    for (const info of [undefined, {}, { page: 2 }, { per_page: 10 }]) {
      assert.deepEqual(d[c[0]].project(pageBody(c[3](), info), p).pagination, unavailable);
    }
    const partial = d[c[0]].project(pageBody(c[3](), { page: 2, per_page: 10 }), p);
    assert.deepEqual(partial.pagination.totalPages, unavailable);
    for (const result of [[], c[3]()]) {
      const out = d[c[0]].project(pageBody(result, { page: 2, per_page: 10, total_pages: 2 }), p);
      assert.equal(out.complete, false);
      assert.equal(out.pagination.enumeration, "not-established");
    }
    const first = d[c[0]].prepare({ ...c[2], page: 1 });
    assert.equal(d[c[0]].project(pageBody([], { page: 1, per_page: 10, total_pages: 0 }), first).complete, false);
  }
});

test("Cloudflare Pages pagination rejects drift malformed metadata and contradictory zero pages", () => {
  const d = pagesMetadataDescriptors({ ...scope(), pagination: paginationScope() });
  for (const c of listCases) {
    const p = d[c[0]].prepare(c[2]);
    for (const info of [null, [], { ...pageInfo(), page: 1 }, { ...pageInfo(), page: "2" },
      { ...pageInfo(), per_page: 100 }, { ...pageInfo(), total_pages: -1 }, { ...pageInfo(), total_pages: 1.5 },
      { ...pageInfo(), total_pages: "5" }, { ...pageInfo(), total_pages: null },
      { ...pageInfo(), total_pages: Number.MAX_SAFE_INTEGER + 1 }, { ...pageInfo(), total_pages: 1 },
      { ...pageInfo(), total_pages: 0 }, { total_pages: -1 }]) {
      assert.throws(() => d[c[0]].project(pageBody(c[3](), info), p), /upstream/);
    }
    const first = d[c[0]].prepare({ ...c[2], page: 1 });
    assert.throws(() => d[c[0]].project(pageBody(c[3](), { page: 1, per_page: 10, total_pages: 0 }), first), /upstream/);
    for (const args of [{ ...c[2], page: 1001 }, { ...c[2], perPage: 101 }]) assert.throws(() => d[c[0]].prepare(args), /schema/);
  }
});

test("Cloudflare Pages pagination evidence cannot be enabled by model arguments before credentials", async () => {
  for (const c of listCases) for (const patch of [{ pagination: true }, { pagesPagination: paginationScope() },
    { totalPages: 5 }, { result_info: pageInfo() }, { accountId: "f".repeat(32) }]) {
    const f = fixture(c, { resultInfo: pageInfo() });
    assert.equal((await f.invoke({ ...c[2], ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare Pages pagination actual-core binds exact page and preserves redaction audit cleanup replay", async () => {
  for (const c of listCases) {
    const f = fixture(c, { pagination: paginationScope(), resultInfo: pageInfo() });
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.pagination.page, 2);
    assert.equal(out.value.pagination.totalPages.value, 5);
    assert.equal(out.value.complete, false);
    assert.ok(f.requests[0].url.endsWith("?page=2&per_page=10"));
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
    const legacy = fixture(c, { resultInfo: pageInfo() });
    assert.equal((await legacy.invoke()).value.pagination, undefined);
  }
});

test("Cloudflare Pages pagination current agent resource and lease-time revocation deny network", async () => {
  for (const c of listCases) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(c, { pagination: paginationScope(), resultInfo: pageInfo() });
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    assert.equal((await f.invoke()).code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
  }
});

test("Cloudflare Pages pagination mismatch and outcome-audit outage retain uncertain replay tombstones", async () => {
  for (const c of listCases) for (const failure of ["page", "audit"]) {
    const f = fixture(c, { pagination: paginationScope(), resultInfo: { ...pageInfo(), page: failure === "page" ? 1 : 2 } });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "page" ? "UPSTREAM_UNAVAILABLE" : "OUTCOME_UNCERTAIN");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    assert.equal(f.calls.close, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
