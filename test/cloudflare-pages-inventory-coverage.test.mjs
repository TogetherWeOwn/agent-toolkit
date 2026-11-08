import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { summarizePagesCoverage, summarizePagesInventoryCoverage } from "../dist/plugins/cloudflare-broker/src/pages-coverage.js";
import { summarizePagesRecordedCoverage, summarizePagesInventoryRecordedCoverage } from "../dist/plugins/cloudflare-broker/src/pages-recorded-coverage.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32), projectName = "selected-pages", projectId = "project-id";
const deploymentId = n => `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;
function fixture({ deployments = false, totalPages = 2, rows, auditFailure = false, sinkFailure = false, inventory = true } = {}) {
  const f = providerFixture({ authority: null });
  const selected = { accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName, projectId, deploymentIds: [] }],
    pagesProjectInventoryReadAllowed: inventory && !deployments,
    pagesDeploymentInventoryProjects: inventory && deployments ? [projectName] : [],
    pagesPagination: { projects: !deployments, deploymentProjects: deployments ? [projectName] : [] } };
  const source = { accountId, revision: "resource-1" };
  const tool = deployments ? "cloudflare.pages.deployments.list" : "cloudflare.pages.projects.list";
  const args = page => ({ ...(deployments ? { projectName } : {}), page, perPage: 10 });
  const operation = cloudflareReadOperations(selected, source).find(op => op.name === tool);
  const resource = operation.prepare(args(1)).resource;
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource.id] };
  const targets = [], receipts = [];
  const resolve = f.dependencies.credentials.resolve;
  f.dependencies.credentials.resolve = async target => { targets.push(target); return resolve(target); };
  if (auditFailure) {
    const append = f.dependencies.audit.append;
    f.dependencies.audit.append = async record => {
      if (record.phase === "outcome" && record.decision === "ALLOW") throw Error("offline");
      await append(record);
    };
  }
  const broker = createCloudflareReadBroker(selected, source, f.dependencies, { async append(record) {
    if (sinkFailure) throw Error("offline");
    receipts.push(record);
  } }, async url => {
    const page = Number(new URL(url).searchParams.get("page"));
    const result = rows ? rows(page) : deployments ? [{ id: deploymentId(page), project_name: projectName, project_id: projectId }]
      : [{ id: `id-${page}`, name: `project-${page}`, build_config: { build_command: credentialCanary }, env_vars: derivedCanary }];
    return new Response(JSON.stringify({ success: true, errors: [], result,
      result_info: { page, per_page: 10, ...(totalPages === undefined ? {} : { total_pages: totalPages }) } }),
    { headers: { "content-type": "application/json" } });
  });
  const scope = { resource, perPage: 10, principalHash: canonicalHash(f.vector.principal), policyRevision: "policy-1",
    ...(deployments ? { deploymentProjectName: projectName } : {}) };
  function observation(result, page) {
    const evidence = receipts.find(record => record.event === result.event);
    const target = targets.find(target => canonicalHash(target) === evidence?.targetHash);
    const item = [...f.journal.values()].find(item => item.event === result.event);
    return { result, evidence, target, arguments: args(page), audit: f.audit.filter(record => record.event === result.event),
      journal: { event: item.event, targetHash: item.target, outcome: item.outcome } };
  }
  return { ...f, receipts, scope, observation, invoke: page => broker.call(tool, args(page), "verified-runtime", `page-${page}`) };
}
function rehash(o) { o.evidence.valueHash = canonicalHash(o.result.value); }
function rebind(o) {
  const hash = canonicalHash(o.target);
  o.evidence.targetHash = o.journal.targetHash = hash;
  for (const record of o.audit) record.targetHash = hash;
}
function refused(scope, entries) {
  for (const summarize of [summarizePagesInventoryCoverage, summarizePagesInventoryRecordedCoverage])
    assert.throws(() => summarize(scope, entries), /schema|scope|cap/);
}

// Actual-core synthetic records are not authenticated native evidence.
test("Cloudflare Pages inventory coverage joins concurrent unfiltered project and deployment page records separately", async () => {
  for (const deployments of [false, true]) {
    const f = fixture({ deployments });
    const entries = await Promise.all([2, 1].map(async page => f.observation(await f.invoke(page), page)));
    assert.ok(entries.every(o => o.result.ok));
    const out = summarizePagesInventoryRecordedCoverage(f.scope, entries);
    assert.equal(out.subject, "inventory-pages-source-coverage");
    assert.equal(out.selection, deployments ? "all-returned-deployments" : "all-returned-projects");
    assert.equal(out.recordedOutcome, "consistent-supplied-records");
    assert.equal(out.pageCoverage, "all-reported-pages-observed");
    assert.deepEqual(out.observedPages, [1, 2]);
    assert.equal(out.complete, false);
    for (const key of ["enumeration", "snapshotConsistency", "hostingAbsence", "nativeAcceptance"]) assert.equal(out[key], "not-established");
    assert.deepEqual(out, summarizePagesInventoryRecordedCoverage(f.scope, [...entries].reverse()));
    for (const omitted of [credentialCanary, derivedCanary, entries[0].result.event, "items", "project-2"])
      assert.ok(!JSON.stringify(out).includes(omitted));
    assert.ok(Object.isFrozen(out));
    assert.throws(() => summarizePagesCoverage(f.scope, entries), /schema/);
    assert.throws(() => summarizePagesRecordedCoverage(f.scope, entries), /schema/);
  }
});

test("Cloudflare Pages inventory coverage refuses filtered resources and rebadged filtered selections", async () => {
  const filtered = fixture({ inventory: false }), filteredEntry = filtered.observation(await filtered.invoke(1), 1);
  refused(filtered.scope, [filteredEntry]);
  for (const deployments of [false, true]) {
    const f = fixture({ deployments }), entry = f.observation(await f.invoke(1), 1);
    for (const selection of [undefined, "filtered", deployments ? "all-returned-projects" : "all-returned-deployments"]) {
      const o = structuredClone(entry); o.result.value.selection = selection; rehash(o); refused(f.scope, [o]);
    }
    const o = structuredClone(entry); delete o.result.value.items[0].inventory; rehash(o); refused(f.scope, [o]);
    refused({ ...f.scope, resource: { ...f.scope.resource, id: f.scope.resource.id.replace(":inventory", "") } }, [entry]);
  }
});

test("Cloudflare Pages inventory coverage refuses cross-page duplicate IDs and project names", async () => {
  for (const deployments of [false, true]) {
    const f = fixture({ deployments });
    const entries = [];
    for (const page of [1, 2]) entries.push(f.observation(await f.invoke(page), page));
    for (const edit of [o => { o.result.value.items[0].id = entries[0].result.value.items[0].id; },
      ...(!deployments ? [o => { o.result.value.items[0].inventory.projectName = entries[0].result.value.items[0].inventory.projectName; }] : [])]) {
      const second = structuredClone(entries[1]); edit(second); rehash(second); refused(f.scope, [entries[0], second]);
    }
    const second = structuredClone(entries[1]); second.result.value.items[0].id = "bad\n"; rehash(second); refused(f.scope, [second]);
  }
});

test("Cloudflare Pages inventory coverage binds deployment project ID and separately expected name despite rehashing", async () => {
  const f = fixture({ deployments: true }), entry = f.observation(await f.invoke(1), 1);
  for (const edit of [i => { i.projectName = "foreign"; }, i => { i.projectId = "foreign"; },
    i => { i.subject = "configured-pages-project-inventory"; }, i => { i.servingDeployment = "established"; }]) {
    const o = structuredClone(entry); edit(o.result.value.items[0].inventory); rehash(o); refused(f.scope, [o]);
  }
  for (const deploymentProjectName of [undefined, "foreign", "bad\n", null]) refused({ ...f.scope, deploymentProjectName }, [entry]);
  const wrong = structuredClone(entry); wrong.arguments.projectName = "foreign";
  wrong.target.argumentsHash = canonicalHash(wrong.arguments); rebind(wrong);
  assert.throws(() => summarizePagesInventoryRecordedCoverage(f.scope, [wrong]), /scope/);
  const projects = fixture(), projectEntry = projects.observation(await projects.invoke(1), 1);
  refused({ ...projects.scope, deploymentProjectName: projectName }, [projectEntry]);
});

test("Cloudflare Pages inventory coverage retains gaps unavailable totals drift and empty-page limitations", async () => {
  const f = fixture({ totalPages: 3 }), entry = f.observation(await f.invoke(2), 2);
  assert.deepEqual(summarizePagesInventoryCoverage(f.scope, [entry]).missingRanges, [{ first: 1, last: 1 }, { first: 3, last: 3 }]);
  const unknown = structuredClone(entry); unknown.result.value.pagination.totalPages = { status: "unavailable", reason: "not-returned" }; rehash(unknown);
  assert.equal(summarizePagesInventoryCoverage(f.scope, [unknown]).pageCoverage, "unavailable");
  const second = f.observation(await f.invoke(1), 1);
  const drift = structuredClone(second); drift.result.value.pagination.totalPages.value = 4; rehash(drift); refused(f.scope, [entry, drift]);
  for (const totalPages of [0, 1]) {
    const empty = fixture({ totalPages, rows: () => [] }), o = empty.observation(await empty.invoke(1), 1);
    const out = summarizePagesInventoryRecordedCoverage(empty.scope, [o]);
    assert.equal(out.pageCoverage, "all-reported-pages-observed"); assert.equal(out.complete, false);
    assert.equal(out.hostingAbsence, "not-established");
  }
});

test("Cloudflare Pages inventory recorded coverage rejects consistently rebound targets audit journal and arguments", async () => {
  const f = fixture(), entry = f.observation(await f.invoke(1), 1);
  for (const edit of [o => { o.target.principal.agent = "foreign"; }, o => { o.target.policyRevision = "stale"; },
    o => { o.target.tool = "cloudflare.pages.projects.get"; }, o => { o.target.resource.id = o.target.resource.id.replace(":inventory", ""); },
    o => { o.target.resource.revision = "stale"; }, o => { o.audit[1].decision = "OUTCOME_UNCERTAIN"; },
    o => { o.audit.reverse(); }, o => { o.audit.pop(); }, o => { o.journal.outcome = "uncertain"; },
    o => { o.arguments.extra = true; o.target.argumentsHash = canonicalHash(o.arguments); }]) {
    const o = structuredClone(entry); edit(o); rebind(o);
    assert.throws(() => summarizePagesInventoryRecordedCoverage(f.scope, [o]), /schema|scope/);
  }
});

test("Cloudflare Pages inventory coverage rejects captured uncertain outcomes and preserves replay denial", async () => {
  for (const sinkFailure of [false, true]) {
    const f = fixture({ auditFailure: !sinkFailure, sinkFailure }), result = await f.invoke(1);
    assert.equal(result.code, "OUTCOME_UNCERTAIN");
    assert.equal(f.receipts.length, sinkFailure ? 0 : 1);
    refused(f.scope, [f.observation(result, 1)]);
    const before = f.calls.secret;
    assert.equal((await f.invoke(1)).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, before);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
  }
});

test("Cloudflare Pages inventory coverage inherits duplicate observation hash clock and maximum-page bounds", async () => {
  const f = fixture({ totalPages: 100, rows: () => [] }), entries = [];
  for (let page = 1; page <= 100; page++) entries.push(f.observation(await f.invoke(page), page));
  assert.equal(summarizePagesInventoryRecordedCoverage(f.scope, entries).observedPages.length, 100);
  refused(f.scope, [...entries, entries[0]]);
  refused(f.scope, [entries[0], entries[0]]);
  for (const edit of [o => { o.result.value.capture.startedAt = "invalid"; }, o => { o.evidence.valueHash = "b".repeat(64); },
    o => { o.result.value.pagination.page = 1001; }, o => { o.result.value.capture.resource.revision = "stale"; }]) {
    const o = structuredClone(entries[0]); edit(o);
    if (o.evidence.valueHash !== "b".repeat(64)) rehash(o);
    refused(f.scope, [o]);
  }
});
