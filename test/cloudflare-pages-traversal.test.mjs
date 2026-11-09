import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash, PROVIDER_CONTRACT } from "../dist/packages/core/src/provider/index.js";
import { pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { collectPagesInventory, createPagesInventoryTraversal, pagesTraversalCeilings } from "../dist/plugins/cloudflare-broker/src/pages-traversal.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32), startedAt = Date.parse("2026-01-01T00:00:00.000Z");
const principal = providerFixture().vector.principal;
const project = n => ({ id: `project-${n}`, name: `site-${n}` });
const deployment = (n, p = 1) => ({ id: `11111111-1111-1111-1111-${String(p * 1000 + n).padStart(12, "0")}`, project_id: `project-${p}`, project_name: `site-${p}` });
const uuid = n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
function scope() {
  return { accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: [1, 2].map(n => ({ projectId: `project-${n}`, projectName: `site-${n}`, deploymentIds: [] })),
    pagesProjectInventoryReadAllowed: true, pagesDeploymentInventoryProjects: ["site-1", "site-2"],
    pagesPagination: { projects: true, deploymentProjects: ["site-1", "site-2"] } };
}
function session(extra = {}) {
  return { sessionId: "session-1", principalHash: canonicalHash(principal), company: principal.company, accountId,
    policyRevision: "policy-1", resourceRevision: "resource-1", ownershipRevision: "ownership-1", perPage: 1, startedAt,
    budgets: { requests: 100, rows: 1000, valueBytes: 1048576, manifestBytes: 1048576, elapsedMs: 600000 }, ...extra };
}
// Deterministic, explicitly fabricated supplied records. Projections and plans
// still come from the existing descriptors/operations, not a second collector.
function fixture(extra = {}, selected = scope()) {
  const s = session(extra), traversal = createPagesInventoryTraversal(s, selected);
  const descriptors = pagesMetadataDescriptors({ accountId, revision: selected.revision, projects: selected.pagesProjects,
    projectInventoryReadAllowed: selected.pagesProjectInventoryReadAllowed, deploymentInventoryProjects: selected.pagesDeploymentInventoryProjects,
    pagination: selected.pagesPagination });
  const ops = cloudflareReadOperations(selected, { accountId, revision: selected.revision });
  let sequence = 0;
  function record(request, { rows = [], total = 1, info } = {}) {
    const projects = request.tool === "cloudflare.pages.projects.list";
    const descriptor = projects ? descriptors.pagesProjectsList : descriptors.pagesDeploymentsList;
    const prepared = descriptor.prepare(request.arguments), bound = ops.find(op => op.name === request.tool).prepare(request.arguments);
    const value = { ...descriptor.project(JSON.stringify({ success: true, errors: [], result: rows,
      result_info: info ?? { page: request.arguments.page, per_page: s.perPage, ...(total === null ? {} : { total_pages: total }) } }), prepared),
      capture: { correlationId: uuid(++sequence), startedAt: new Date(startedAt).toISOString(), completedAt: new Date(startedAt).toISOString(),
        durationMs: 0, resource: prepared.resource, provenance: "internal-transport-observation", enumeration: "not-established", snapshotConsistency: "not-established" } };
    const target = { contract: PROVIDER_CONTRACT, provider: "cloudflare", tool: request.tool, version: "1", tier: "read", principal,
      resource: bound.resource, argumentsHash: canonicalHash(request.arguments), planHash: canonicalHash(bound.plan), artifactDigest: null, policyRevision: s.policyRevision };
    const event = uuid(++sequence), targetHash = canonicalHash(target);
    return { result: { ok: true, value, event }, evidence: { contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-pages-list-projection",
      event, targetHash, valueHash: canonicalHash(value) }, target, arguments: request.arguments,
      audit: ["intent", "outcome"].map(phase => ({ event, time: startedAt, phase, decision: "ALLOW", contract: PROVIDER_CONTRACT,
        provider: "cloudflare", tool: request.tool, principalHash: s.principalHash, targetHash })), journal: { event, targetHash, outcome: "complete" } };
  }
  function drive(body = () => ({ rows: [] })) {
    const requests = [];
    for (;;) {
      const request = traversal.next(startedAt, s);
      if (!request) break;
      requests.push(request); traversal.accept(request, record(request, body(request)), startedAt, s);
    }
    return { manifest: traversal.manifest(), requests };
  }
  return { s, selected, traversal, record, drive };
}
function rehash(o) { o.evidence.valueHash = canonicalHash(o.result.value); }
function rebind(o) {
  o.evidence.targetHash = o.journal.targetHash = canonicalHash(o.target);
  for (const a of o.audit) a.targetHash = o.evidence.targetHash;
}
function incomplete(m) {
  assert.equal(m.complete, false);
  for (const key of ["enumeration", "snapshotConsistency", "hostingAbsence", "nativeAcceptance", "authenticatedDurableCoverage", "consumerAcceptance"])
    assert.equal(m[key], "not-established");
}

test("Pages traversal covers multi-page projects AND every multi-page deployment collection", () => {
  const f = fixture(), { manifest: m, requests } = f.drive(r => r.tool.includes("projects.list")
    ? { rows: [project(r.arguments.page)], total: 2 }
    : { rows: [deployment(r.arguments.page, Number(r.arguments.projectName.slice(-1)))], total: 2 });
  assert.deepEqual(requests.map(r => [r.tool.split(".")[2], r.arguments.projectName ?? null, r.arguments.page]),
    [["projects", null, 1], ["projects", null, 2], ["deployments", "site-1", 1], ["deployments", "site-1", 2], ["deployments", "site-2", 1], ["deployments", "site-2", 2]]);
  assert.equal(m.sourceTraversal, "all-reported-pages-observed");
  assert.deepEqual(m.projects, { denominator: "all-observed-projects", discovered: 2, visited: 2, observed: 2 });
  assert.equal(m.usage.requests, 6); assert.equal(m.usage.rows, 6);
  assert.ok(m.collections.every(c => c.coverage.recordedOutcome === "consistent-supplied-records"));
  incomplete(m); assert.ok(Object.isFrozen(m.collections));
});

for (const total of [0, 1]) test(`Pages traversal explicitly observes empty account and empty project total ${total}`, () => {
  const empty = fixture().drive(() => ({ total })).manifest;
  assert.equal(empty.sourceTraversal, "all-reported-pages-observed"); assert.equal(empty.projects.discovered, 0); incomplete(empty);
  const m = fixture().drive(r => r.tool.includes("projects.list") ? { rows: [project(1)] } : { total }).manifest;
  assert.equal(m.projects.observed, 1); assert.deepEqual(m.collections[1].coverage.observedPages, [1]); incomplete(m);
});

test("Pages traversal never treats short/empty page as terminal with known or missing totals", () => {
  const f = fixture();
  const m = f.drive(r => r.tool.includes("projects.list") ? { rows: r.arguments.page === 1 ? [] : [project(1)], total: 2 } : { rows: [] }).manifest;
  assert.equal(m.usage.requests, 3); assert.equal(m.projects.discovered, 1);
  const unknown = fixture().drive(() => ({ total: null })).manifest;
  assert.equal(unknown.stopReason, "pagination-unavailable"); assert.equal(unknown.sourceTraversal, "incomplete"); incomplete(unknown);
});

for (const field of ["page", "per_page"]) test(`Pages traversal refuses unavailable ${field} pagination`, () => {
  const f = fixture(), r = f.traversal.next(startedAt, f.s), info = { page: 1, per_page: 1, total_pages: 1 };
  delete info[field]; f.traversal.accept(r, f.record(r, { info }), startedAt, f.s);
  assert.equal(f.traversal.manifest().stopReason, "pagination-unavailable");
});

for (const page of [0, 2, 1001]) test(`Pages traversal refuses skipped/regressing/invalid page ${page}`, () => {
  const f = fixture(), r = f.traversal.next(startedAt, f.s), o = f.record(r, { total: 3 });
  o.result.value.pagination.page = page; rehash(o); f.traversal.accept(r, o, startedAt, f.s);
  assert.equal(f.traversal.manifest().stopReason, "invalid-evidence");
});

test("Pages traversal refuses repeated pages and contradictory totals across sequential requests", () => {
  for (const mutate of [o => { o.result.value.pagination.page = 1; }, o => { o.result.value.pagination.totalPages.value = 3; }]) {
    const f = fixture(), first = f.traversal.next(startedAt, f.s);
    f.traversal.accept(first, f.record(first, { total: 2 }), startedAt, f.s);
    const second = f.traversal.next(startedAt, f.s), o = f.record(second, { total: 2 });
    mutate(o); rehash(o); f.traversal.accept(second, o, startedAt, f.s);
    assert.equal(f.traversal.manifest().stopReason, "invalid-evidence");
  }
});

for (const total of [-1, 0.5, "2", 1001]) test(`Pages traversal refuses malformed/out-of-helper-range total ${total}`, () => {
  const f = fixture(), r = f.traversal.next(startedAt, f.s), o = f.record(r);
  o.result.value.pagination.totalPages.value = total; rehash(o); f.traversal.accept(r, o, startedAt, f.s);
  assert.equal(f.traversal.manifest().stopReason, "invalid-evidence");
});

test("Pages traversal refuses cross-page duplicate project ID and name and deployment UUID", () => {
  for (const duplicate of ["id", "name", "deployment"]) {
    const f = fixture(), { manifest: m } = f.drive(r => {
      if (r.tool.includes("projects.list")) return duplicate === "deployment" ? { rows: [project(1)] }
        : { rows: [r.arguments.page === 1 ? project(1) : { id: duplicate === "id" ? "project-1" : "project-2", name: duplicate === "name" ? "site-1" : "site-2" }], total: 2 };
      return { rows: [deployment(1)], total: 2 };
    });
    assert.equal(m.stopReason, "invalid-evidence");
  }
});

test("Pages traversal retains unapproved discoveries as denominator gaps without auto-enrollment", () => {
  const selected = scope(); selected.pagesDeploymentInventoryProjects = ["site-1"];
  const f = fixture({}, selected), { manifest: m, requests } = f.drive(r => r.tool.includes("projects.list")
    ? { rows: [project(r.arguments.page + 1)], total: 2 } : { rows: [] });
  assert.equal(m.projects.discovered, 2); assert.equal(m.projects.observed, 0);
  assert.equal(m.collections.length, 3); assert.ok(m.collections.slice(1).every(c => c.gap === "unapproved-project"));
  assert.equal(requests.length, 2); assert.equal(m.sourceTraversal, "incomplete"); incomplete(m);
});

test("Pages traversal copies grants; discovery and later caller mutations do not authorize reads", () => {
  const selected = scope(); selected.pagesDeploymentInventoryProjects = [];
  const f = fixture({}, selected); selected.pagesDeploymentInventoryProjects.push("site-1");
  const m = f.drive(r => ({ rows: [project(1)] })).manifest;
  assert.equal(m.collections[1].gap, "unapproved-project"); assert.equal(m.usage.requests, 1);
});

for (const field of ["principalHash", "company", "accountId", "policyRevision", "resourceRevision", "ownershipRevision"]) test(`Pages traversal halts on trusted ${field} drift`, () => {
  const f = fixture(), r = f.traversal.next(startedAt, f.s);
  f.traversal.accept(r, f.record(r), startedAt, { ...f.s, [field]: "foreign" });
  const m = f.traversal.manifest(); assert.equal(m.stopReason, "context-drift"); incomplete(m);
});

for (const [budget, limit, reason] of [["requests", 1, "request-cap"], ["rows", 1, "row-cap"],
  ["valueBytes", 32767, "value-byte-cap"], ["manifestBytes", 8192, "manifest-byte-cap"]]) test(`Pages traversal stops before exceeding ${budget}`, () => {
  const f = fixture({ budgets: { ...session().budgets, [budget]: limit } });
  const m = f.drive(r => ({ rows: [project(r.arguments.page)], total: 3 })).manifest;
  assert.equal(m.stopReason, reason); assert.ok(m.usage.requests <= f.s.budgets.requests);
  assert.ok(m.usage.rows <= f.s.budgets.rows); assert.ok(m.usage.valueBytes <= f.s.budgets.valueBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(m)) <= f.s.budgets.manifestBytes); incomplete(m);
});

test("Pages traversal supports conservative value/manifest reservations and preserves prior denominator", () => {
  const f = fixture({ budgets: { ...session().budgets, manifestBytes: 11264 } });
  const m = f.drive(r => ({ rows: [project(1)], total: 2 })).manifest;
  assert.equal(m.stopReason, "manifest-byte-cap"); assert.equal(m.projects.discovered, 1);
  assert.equal(m.collections[1].projectId, "project-1"); assert.equal(m.collections[1].gap, "not-visited");
});

test("Pages traversal rejects cancellation, elapsed exhaustion and regressing clocks before/after a call", () => {
  for (const after of [false, true]) for (const which of ["cancelled", "elapsed-cap", "clock-regression"]) {
    const f = fixture(), time = which === "elapsed-cap" ? startedAt + f.s.budgets.elapsedMs : which === "clock-regression" ? startedAt - 1 : startedAt;
    if (after) {
      const r = f.traversal.next(startedAt, f.s); f.traversal.accept(r, f.record(r), time, f.s, which === "cancelled");
    } else assert.equal(f.traversal.next(time, f.s, which === "cancelled"), null);
    assert.equal(f.traversal.manifest().stopReason, which);
  }
});

test("Pages traversal refuses missing/forged/mismatched capture target audit journal plan and filter injection", () => {
  const edits = [o => { delete o.evidence; }, o => { delete o.result.value.capture; }, o => { o.evidence.valueHash = "b".repeat(64); },
    o => { o.evidence.targetHash = "b".repeat(64); }, o => { o.result.value.selection = "filtered"; rehash(o); },
    o => { o.result.value.capture.resource.id = o.result.value.capture.resource.id.replace(accountId, "b".repeat(32)); rehash(o); },
    o => { o.arguments.env = "production"; o.target.argumentsHash = canonicalHash(o.arguments); rebind(o); },
    o => { o.target.planHash = "b".repeat(64); rebind(o); }, o => { o.target.principal = { ...principal, run: "foreign" }; rebind(o); },
    o => { o.audit.reverse(); }, o => { o.audit.pop(); }, o => { o.audit[1].decision = "OUTCOME_UNCERTAIN"; },
    o => { o.journal.outcome = "uncertain"; }, o => { o.journal.event = uuid(999); },
    o => { o.result.value.capture.startedAt = "2025-01-01T00:00:00.000Z"; rehash(o); }];
  for (const edit of edits) {
    const f = fixture(), r = f.traversal.next(startedAt, f.s), o = structuredClone(f.record(r)); edit(o);
    f.traversal.accept(r, o, startedAt, f.s); const m = f.traversal.manifest();
    assert.equal(m.stopReason, "invalid-evidence"); assert.equal(m.projects.observed, 0); incomplete(m);
  }
});

test("Pages traversal binds deployment names and resources even for empty pages", () => {
  for (const edit of [o => { o.arguments.projectName = "foreign"; o.target.argumentsHash = canonicalHash(o.arguments); rebind(o); },
    o => { o.result.value.capture.resource.id = o.result.value.capture.resource.id.replace("project-1", "foreign"); rehash(o); },
    o => { o.result.value.items = [{ id: deployment(1).id, inventory: { subject: "provider-pages-deployment-inventory", projectName: "foreign", projectId: "project-1", servingDeployment: "not-established", historicalSourceBinding: "not-established" } }]; rehash(o); }]) {
    const f = fixture(), first = f.traversal.next(startedAt, f.s);
    f.traversal.accept(first, f.record(first, { rows: [project(1)] }), startedAt, f.s);
    const r = f.traversal.next(startedAt, f.s), o = structuredClone(f.record(r)); edit(o);
    f.traversal.accept(r, o, startedAt, f.s); assert.equal(f.traversal.manifest().stopReason, "invalid-evidence");
  }
});

test("Pages traversal opaque in-flight tokens isolate concurrent sessions and refuse replay", () => {
  const a = fixture(), b = fixture({ sessionId: "session-2" }), ar = a.traversal.next(startedAt, a.s), br = b.traversal.next(startedAt, b.s);
  assert.notEqual(ar.sessionHash, br.sessionHash); assert.throws(() => a.traversal.next(startedAt, a.s), /conflict/);
  b.traversal.accept(ar, a.record(ar), startedAt, b.s); assert.equal(b.traversal.manifest().stopReason, "request-mismatch");
  a.traversal.accept(ar, a.record(ar, { total: 2 }), startedAt, a.s);
  a.traversal.accept(ar, a.record(ar), startedAt, a.s); assert.equal(a.traversal.manifest().stopReason, "request-mismatch");
});

test("Pages traversal finite scope/budget validation does not raise retained ceilings", () => {
  for (const [key, value] of Object.entries(pagesTraversalCeilings)) {
    if (key === "perPage") assert.throws(() => fixture({ perPage: value + 1 }), /schema/);
    else assert.throws(() => fixture({ budgets: { ...session().budgets, [key]: value + 1 } }), /schema/);
  }
  const selected = scope(); selected.pagesProjectInventoryReadAllowed = false;
  assert.throws(() => fixture({}, selected), /scope/);
});

function runnerFixture({ changeResponse, changeRecord, perPage = 1, auditFailure = false, sinkFailure = false, readFailure = false, denied = false, revoke = false, cancel = false } = {}) {
  const f = providerFixture(), selected = scope(), receipts = [], targets = [], requests = [], controller = new AbortController();
  const s = session({ principalHash: canonicalHash(f.vector.principal), perPage });
  const ops = cloudflareReadOperations(selected, { accountId, revision: selected.revision });
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: ops.filter(op => ["cloudflare.pages.projects.list", "cloudflare.pages.deployments.list"].includes(op.name))
    .flatMap(op => op.name.includes("projects.list") ? [op.prepare({ page: 1, perPage: 1 }).resource.id]
      : [1, 2].map(n => op.prepare({ projectName: `site-${n}`, page: 1, perPage: 1 }).resource.id)) };
  if (denied) f.vector.policy.resources = f.vector.policy.resources.filter(id => !id.includes(":project:"));
  const resolve = f.dependencies.credentials.resolve;
  f.dependencies.credentials.resolve = async target => { targets.push(target); return resolve(target); };
  const append = f.dependencies.audit.append;
  f.dependencies.audit.append = async record => {
    if (auditFailure && record.phase === "outcome" && record.decision === "ALLOW") throw Error("offline");
    await append(record);
  };
  const ports = { clock: () => startedAt, signal: controller.signal, readContext: async () => s,
    async readObservation(result, request) {
      if (readFailure) throw Error("unavailable secret diagnostics must not leak");
      const evidence = receipts.find(e => e.event === result.event), target = targets.find(t => canonicalHash(t) === evidence?.targetHash);
      const entry = [...f.journal.values()].find(j => j.event === result.event);
      const o = { result, evidence, target, arguments: request.arguments, audit: f.audit.filter(a => a.event === result.event), journal: { event: entry.event, targetHash: entry.target, outcome: entry.outcome } };
      return changeRecord ? changeRecord(structuredClone(o)) : o;
    } };
  const fetcher = async url => {
    const u = new URL(url), page = Number(u.searchParams.get("page")), projects = u.pathname.endsWith("/projects");
    requests.push(u.pathname + u.search);
    if (cancel) controller.abort();
    const result = projects ? [project(page)] : [deployment(page, Number(u.pathname.split("/").at(-2).slice(-1)))];
    const body = { success: true, errors: [], result, result_info: { page, per_page: s.perPage, total_pages: 2 } };
    if (projects) { result[0].env_vars = credentialCanary; result[0].build_config = { build_command: derivedCanary }; }
    if (revoke && !projects) f.vector.policy = { ...f.vector.policy, revision: "policy-2", resources: [] };
    return new Response(JSON.stringify(changeResponse ? changeResponse(body, projects) : body), { headers: { "content-type": "application/json" } });
  };
  return { ...f, receipts, requests, ports, s, run: () => collectPagesInventory(s, selected, f.dependencies, { async append(e) {
    if (sinkFailure) throw Error("offline"); receipts.push(e);
  } }, ports, "verified-runtime", fetcher) };
}

test("Pages runner uses existing broker for both operations, redacts output and excludes replay", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  const f = runnerFixture(), m = await f.run();
  assert.equal(m.sourceTraversal, "all-reported-pages-observed"); assert.equal(m.usage.requests, 6); incomplete(m);
  const rendered = JSON.stringify(m);
  for (const omitted of [credentialCanary, derivedCanary, "requestKey", "env_vars", "build_command", "items"]) assert.ok(!rendered.includes(omitted));
  assert.equal((await f.run()).stopReason, "provider-refused"); assert.equal(f.requests.length, 6);
});

for (const option of ["auditFailure", "sinkFailure", "readFailure", "denied", "revoke", "cancel"]) test(`Pages runner halts safely on ${option} without retry`, async t => {
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  const f = runnerFixture({ [option]: true }), m = await f.run();
  assert.equal(m.sourceTraversal, "incomplete"); incomplete(m);
  if (option === "auditFailure") { assert.equal(m.stopReason, "uncertain-outcome"); assert.equal(f.receipts.length, 1); }
  if (option === "sinkFailure") { assert.equal(m.stopReason, "uncertain-outcome"); assert.equal(f.receipts.length, 0); }
  if (["denied", "revoke"].includes(option)) { assert.equal(m.projects.discovered, 2); assert.equal(m.projects.observed, 0); }
  assert.ok(f.requests.length <= 3); assert.ok(!JSON.stringify(m).includes("secret diagnostics"));
});

for (const mutation of [body => { delete body.result_info; return body; }, body => { body.result_info = null; return body; },
  body => { body.result_info.total_pages = "2"; return body; }, body => { body.result_info.per_page = 2; return body; },
  body => { body.result_info.total_pages = 0; return body; }, body => { body.result.push(project(9)); return body; },
  body => { body.result_info.total_pages = 1001; return body; }]) test("Pages runner refuses malformed/missing/over-bound provider pagination and row counts", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  const f = runnerFixture({ changeResponse: mutation }), m = await f.run();
  assert.equal(m.sourceTraversal, "incomplete"); assert.ok(f.requests.length <= 1); incomplete(m);
});

test("Pages runner rejects foreign project/name data, oversized raw response and substituted results", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  for (const changeResponse of [(body, projects) => { if (!projects) body.result[0].project_id = "foreign"; return body; },
    (body, projects) => { if (!projects) body.result[0].project_name = "foreign"; return body; },
    body => { body.unrelated = "x".repeat(131072); return body; }]) {
    const f = runnerFixture({ changeResponse }), m = await f.run(); assert.equal(m.sourceTraversal, "incomplete"); incomplete(m);
  }
  const f = runnerFixture({ changeRecord: o => { o.result.event = uuid(999); return o; } });
  assert.equal((await f.run()).stopReason, "records-unavailable");
});

test("Pages traversal retains every denied discovery when a thousand-project account exceeds manifest reservations", () => {
  const selected = scope(); selected.pagesProjects = []; selected.pagesDeploymentInventoryProjects = []; selected.pagesPagination.deploymentProjects = [];
  // Small pages respect the retained canonical JSON node/key bounds as well as
  // reader row/byte limits. Reservations deliberately stop before all 100 pages.
  const f = fixture({ perPage: 10 }, selected);
  const m = f.drive(r => ({ rows: Array.from({ length: 10 }, (_, i) => project((r.arguments.page - 1) * 10 + i + 1)), total: 100 })).manifest;
  assert.equal(m.stopReason, "manifest-byte-cap"); assert.equal(m.usage.requests, 92);
  assert.equal(m.projects.discovered, 920); assert.equal(m.collections.length, 921);
  assert.equal(m.projects.denominator, "partial-project-discovery"); assert.equal(m.projects.observed, 0);
  assert.ok(m.collections.slice(1).every(c => c.gap === "unapproved-project"));
  assert.ok(Buffer.byteLength(JSON.stringify(m)) <= m.budgets.manifestBytes); incomplete(m);
});

test("Pages runner stops incomplete when a reader-valid page exceeds retained canonical JSON bounds", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  const f = runnerFixture({ perPage: 100, changeResponse: body => ({ ...body,
    result: Array.from({ length: 100 }, (_, i) => project(i + 1)),
    result_info: { ...body.result_info, total_pages: 1 } }) });
  const m = await f.run();
  assert.equal(m.sourceTraversal, "incomplete"); assert.equal(m.usage.rows, 0);
  assert.equal(f.requests.length, 1); assert.equal(f.receipts.length, 0); incomplete(m);
});

test("Pages traversal stops at 100 observations rather than evading the helper ceiling", () => {
  const m = fixture().drive(() => ({ total: 101 })).manifest;
  assert.equal(m.stopReason, "request-cap"); assert.equal(m.usage.requests, 100);
  assert.deepEqual(m.collections[0].coverage.missingRanges, [{ first: 101, last: 101 }]); incomplete(m);
});

test("Pages traversal refuses a deployment UUID reused in another project collection", () => {
  const m = fixture().drive(r => r.tool.includes("projects.list") ? { rows: [project(r.arguments.page)], total: 2 }
    : { rows: [{ ...deployment(1, Number(r.arguments.projectName.slice(-1))), id: deployment(1).id }] }).manifest;
  assert.equal(m.stopReason, "invalid-evidence"); assert.equal(m.projects.observed, 1); incomplete(m);
});

test("Pages fabricated self-consistent records never establish authenticated completeness", () => {
  const m = fixture().drive().manifest;
  assert.equal(m.sourceTraversal, "all-reported-pages-observed");
  assert.equal(m.suppliedRecords, "consistent-accepted-records-only"); incomplete(m);
});
