import assert from "node:assert/strict";
import test from "node:test";
import { pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { summarizePagesCoverage } from "../dist/plugins/cloudflare-broker/src/pages-coverage.js";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32);
const tool = "cloudflare.pages.projects.list";
const args = { page: 1, perPage: 10 };
const unavailable = { status: "unavailable", reason: "not-returned" };
const scope = () => ({ accountId, revision: "resource-1", projects: [], projectInventoryReadAllowed: true,
  pagination: { projects: true, deploymentProjects: [] } });
const row = (n = 1) => ({ id: `id-${n}`, name: `project-${n}`, production_branch: "main",
  source: { type: "github", config: { owner: "safe-org", repo_name: "safe-repo", production_branch: "main",
    production_deployments_enabled: false, owner_id: credentialCanary, path_includes: [derivedCanary] } },
  canonical_deployment: { env_vars: credentialCanary }, latest_deployment: derivedCanary,
  deployment_configs: { production: { env_vars: credentialCanary } }, build_config: { build_command: derivedCanary } });
const body = (result, patch = {}) => JSON.stringify({ success: true, errors: [], result,
  result_info: { page: 1, per_page: 10, total_pages: 1 }, ...patch });
function fixture({ selected = true, result = [row(), row(2)], sink } = {}) {
  const f = providerFixture({ authority: null });
  const s = { accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [], pagesProjects: [],
    pagesProjectInventoryReadAllowed: selected, pagesPagination: scope().pagination };
  const source = { accountId, revision: "resource-1" };
  const operations = cloudflareReadOperations(s, source);
  const operation = operations.find(op => op.name === tool);
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
  for (const value of [credentialCanary, derivedCanary, "env_vars", "build_command", "canonical_deployment", "owner_id", "path_includes"])
    assert.ok(!serialized.includes(value), value);
}

test("Cloudflare Pages inventory is independently default-denied, copied, and resource-distinct", () => {
  const s = scope();
  const d = pagesMetadataDescriptors(s);
  s.projectInventoryReadAllowed = false; s.pagination.projects = false;
  const p = d.pagesProjectsList.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${accountId}:pages:projects:inventory`);
  assert.equal(p.request.path, `/accounts/${accountId}/pages/projects?page=1&per_page=10`);
  assert.equal(d.pagesProjectsList.project(body([row()]), p).items.length, 1);
  for (const selected of [undefined, false]) {
    const legacy = pagesMetadataDescriptors({ ...scope(), projectInventoryReadAllowed: selected });
    assert.equal(legacy.pagesProjectsList.prepare(args).resource.id, `cloudflare:account:${accountId}:pages:projects`);
    assert.deepEqual(legacy.pagesProjectsList.project(body([row()]), legacy.pagesProjectsList.prepare(args)).items, []);
  }
  for (const invalid of [null, "true", 1]) assert.throws(() => pagesMetadataDescriptors({ ...scope(), projectInventoryReadAllowed: invalid }), /schema/);
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), pagination: undefined }), /scope/);
  assert.throws(() => pagesMetadataDescriptors({ ...scope(), pagination: { projects: false, deploymentProjects: [] } }), /scope/);
  assert.throws(() => d.pagesProjectGet.prepare({ projectName: "project-1" }), /scope/);
  assert.throws(() => d.pagesDeploymentsList.prepare({ projectName: "project-1", ...args }), /scope/);
});

test("Cloudflare Pages inventory projects all returned project identity and configured repository facts only", () => {
  const d = pagesMetadataDescriptors(scope()).pagesProjectsList;
  const out = d.project(body([row(), row(2)]), d.prepare(args));
  assert.deepEqual(out.items.map(item => item.id), ["id-1", "id-2"]);
  assert.deepEqual(out.items[0].inventory, { subject: "configured-pages-project-inventory", projectName: "project-1",
    source: { status: "provider-reported", type: "github", repositoryOwner: { status: "provider-reported", value: "safe-org" },
      repositoryName: { status: "provider-reported", value: "safe-repo" }, productionBranch: { status: "configured", value: "main" },
      productionDeploymentsEnabled: { status: "configured", value: false } },
    productionBranch: { status: "configured", value: "main" }, effectiveProduction: "not-established" });
  assert.equal(out.selection, "all-returned-projects");
  assert.equal(out.complete, false);
  assert.equal(out.pagination.enumeration, "not-established");
  safe({ receipts: [], audit: [], journal: [] }, out);
  const minimal = d.project(body([{ id: "id-1", name: "project-1" }]), d.prepare(args)).items[0];
  assert.deepEqual(minimal.inventory.source, unavailable);
  assert.deepEqual(minimal.inventory.productionBranch, unavailable);
  const partial = row(); partial.source = { type: "gitlab", config: {} };
  const source = d.project(body([partial]), d.prepare(args)).items[0].inventory.source;
  assert.equal(source.type, "gitlab");
  for (const key of ["repositoryOwner", "repositoryName", "productionBranch", "productionDeploymentsEnabled"]) assert.deepEqual(source[key], unavailable);
});

test("Cloudflare Pages inventory refuses duplicate identity, malformed source, foreign context and overbounds", () => {
  const d = pagesMetadataDescriptors(scope()).pagesProjectsList;
  for (const change of [r => { r.account_id = "f".repeat(32); }, r => { r.id = null; }, r => { r.name = "bad\n"; },
    r => { r.source = null; }, r => { r.source.type = "unknown"; }, r => { r.source.config = null; },
    r => { r.source.config.owner = "bad\n"; }, r => { r.source.config.repo_name = "../bad"; },
    r => { r.source.config.production_branch = null; }, r => { r.production_branch = "main\n"; },
    r => { r.source.config.production_deployments_enabled = "false"; }]) {
    const value = row(); change(value);
    assert.throws(() => d.project(body([value]), d.prepare(args)), /schema|scope|upstream/);
  }
  for (const values of [[row(), row()], [row(), { ...row(2), name: "project-1" }]])
    assert.throws(() => d.project(body(values), d.prepare(args)), /scope/);
  assert.throws(() => d.project(body([row()], { account_id: "f".repeat(32) }), d.prepare(args)), /scope/);
  assert.throws(() => d.project(body([row(), row(2)]), d.prepare({ page: 1, perPage: 1 })), /cap/);
  assert.throws(() => d.project(body([{ ...row(), padding: "x".repeat(131072) }]), d.prepare(args)), /cap/);
  assert.throws(() => d.project(body([row()]), { ...d.prepare(args), resource: { id: "other", revision: "resource-1" } }), /scope/);
});

test("Cloudflare Pages inventory cannot be enabled by model selectors or legacy resource policy", async () => {
  for (const patch of [{ projectInventoryReadAllowed: true }, { inventory: true }, { accountId }, { source: {} }, { approval: "forged" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  const f = fixture();
  f.vector.policy.resources = [`cloudflare:account:${accountId}:pages:projects`];
  assert.equal((await f.invoke()).code, "POLICY_DENIED");
  assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
});

test("Cloudflare Pages inventory binds captured projection to core event, target and completed outcome", async () => {
  const f = fixture();
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.equal(out.value.items.length, 2);
  assert.equal(out.value.capture.resource.id, f.operation.prepare(args).resource.id);
  assert.deepEqual(f.receipts, [{ contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-pages-list-projection",
    event: out.event, targetHash: f.audit[0].targetHash, valueHash: canonicalHash(out.value) }]);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.equal(f.calls.consumed, 0);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1);
  // Existing filtered-record helpers must not silently accept the distinct inventory mode.
  assert.throws(() => summarizePagesCoverage({ resource: out.value.capture.resource, perPage: 10 }, []), /schema/);
  safe(f, out);
});

test("Cloudflare Pages inventory current identity resource and lease-time policy revocation refuse network", async () => {
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
    assert.equal(f.calls.secret, denial === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denial === "revocation" ? 1 : 0);
    safe(f, out);
  }
});

test("Cloudflare Pages inventory reflection cleanup sink and audit failures retain uncertain replay without output", async () => {
  for (const failure of ["reflection", "cleanup", "sink", "audit", "duplicate"]) {
    const result = failure === "reflection" ? [{ ...row(), source: { type: "github", config: { repo_name: credentialCanary } } }] :
      failure === "duplicate" ? [row(), row()] : [row()];
    const f = fixture({ result, sink: failure === "sink" ? async () => { throw Error(credentialCanary); } : undefined });
    const append = f.dependencies.audit.append;
    if (failure === "cleanup") f.dependencies.credentials.resolve = async () => ({ value: credentialCanary, redactions: [derivedCanary],
      async close() { throw Error(credentialCanary); } });
    if (failure === "audit") f.dependencies.audit.append = async record => {
      if (record.phase === "outcome" && record.decision === "ALLOW") throw Error(credentialCanary);
      await append(record);
    };
    const out = await f.invoke();
    assert.equal(out.ok, false); assert.equal(out.value, undefined);
    assert.equal(f.receipts.length, failure === "audit" ? 1 : 0);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare Pages inventory mode never upgrades terminal empty or missing-page evidence to absence", async () => {
  const d = pagesMetadataDescriptors(scope()).pagesProjectsList;
  for (const info of [undefined, { page: 1, per_page: 10, total_pages: 0 }]) {
    const out = d.project(body([], { result_info: info }), d.prepare(args));
    assert.equal(out.complete, false); assert.equal(out.selection, "all-returned-projects");
    assert.deepEqual(out.items, []);
    if (info === undefined) assert.deepEqual(out.pagination, unavailable);
    else assert.equal(out.pagination.enumeration, "not-established");
  }
  const baseline = fixture({ selected: false });
  const out = await baseline.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, []); assert.equal(out.value.selection, undefined);
  safe(baseline, out);
});
