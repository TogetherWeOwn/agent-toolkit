import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { summarizePagesRecordedCoverage } from "../dist/plugins/cloudflare-broker/src/pages-recorded-coverage.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32), revision = "resource-1";
const projectName = "selected-pages", projectId = "project-id";
function fixture({ deployments = false, auditFailure = false, totalPages = 2 } = {}) {
  const f = providerFixture({ authority: null });
  const selected = { accountId, revision, scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName, projectId, deploymentIds: [] }],
    pagesPagination: { projects: !deployments, deploymentProjects: deployments ? [projectName] : [] } };
  const source = { accountId, revision };
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
  const broker = createCloudflareReadBroker(selected, source, f.dependencies, { async append(record) { receipts.push(record); } }, async url => {
    const page = Number(new URL(url).searchParams.get("page"));
    return new Response(JSON.stringify({ success: true, errors: [], result: [], result_info: { page, per_page: 10, total_pages: totalPages } }),
      { headers: { "content-type": "application/json" } });
  });
  const scope = { resource, perPage: 10, principalHash: canonicalHash(f.vector.principal), policyRevision: "policy-1" };
  function observation(result, page) {
    const evidence = receipts.find(record => record.event === result.event);
    const target = targets.find(target => canonicalHash(target) === evidence.targetHash);
    const item = [...f.journal.values()].find(item => item.event === result.event);
    return { result, evidence, target, arguments: args(page), audit: f.audit.filter(record => record.event === result.event),
      journal: { event: item.event, targetHash: item.target, outcome: item.outcome } };
  }
  return { ...f, receipts, scope, observation, invoke: page => broker.call(tool, args(page), "verified-runtime", `page-${page}`) };
}
function rebind(o) {
  const hash = canonicalHash(o.target);
  o.evidence.targetHash = o.journal.targetHash = hash;
  for (const record of o.audit) record.targetHash = hash;
}
function refused(scope, o) { assert.throws(() => summarizePagesRecordedCoverage(scope, [o]), /schema|scope|cap/); }

// Synthetic core records, not authenticated/native storage acceptance.
test("Cloudflare Pages recorded coverage joins concurrent actual-core ALLOW and completed journal records", async () => {
  const f = fixture();
  const results = await Promise.all([f.invoke(2), f.invoke(1)]);
  assert.ok(results.every(result => result.ok));
  const entries = results.map((result, i) => f.observation(result, i === 0 ? 2 : 1));
  const out = summarizePagesRecordedCoverage(f.scope, entries);
  assert.equal(out.recordedOutcome, "consistent-supplied-records");
  assert.equal(out.pageCoverage, "all-reported-pages-observed");
  assert.equal(out.complete, false);
  for (const key of ["enumeration", "snapshotConsistency", "hostingAbsence", "nativeAcceptance"]) assert.equal(out[key], "not-established");
  assert.equal(out.outcomeBindingsHash, summarizePagesRecordedCoverage(f.scope, [...entries].reverse()).outcomeBindingsHash);
  assert.ok(Object.isFrozen(out));
  for (const omitted of [credentialCanary, derivedCanary, results[0].event, entries[0].target.principal.agent, f.scope.principalHash]) {
    assert.ok(!JSON.stringify(out).includes(omitted));
  }
});

test("Cloudflare Pages recorded coverage accepts the distinct deployment-list target and name arguments", async () => {
  const f = fixture({ deployments: true, totalPages: 1 });
  const result = await f.invoke(1);
  assert.equal(result.ok, true);
  const entry = f.observation(result, 1);
  assert.ok(entry.target.resource.id.includes(`:project:${projectId}:deployments`));
  assert.equal(entry.arguments.projectName, projectName);
  assert.equal(summarizePagesRecordedCoverage(f.scope, [entry]).recordedOutcome, "consistent-supplied-records");
});

test("Cloudflare Pages recorded coverage requires exactly ordered matching ALLOW intent and outcome records", async () => {
  const f = fixture(), entry = f.observation(await f.invoke(1), 1);
  for (const edit of [o => { o.audit = []; }, o => { o.audit.pop(); }, o => { o.audit.push(o.audit[1]); },
    o => { o.audit.reverse(); }, o => { o.audit[1].decision = "OUTCOME_UNCERTAIN"; },
    o => { o.audit[0].phase = "refused"; }, o => { o.audit[1].time = -1; },
    o => { o.audit[1].time = 0.5; }, o => { o.audit[0].time = 1001; },
    o => { o.audit[1].event = "wrong"; }, o => { o.audit[1].targetHash = "b".repeat(64); },
    o => { o.audit[1].principalHash = "b".repeat(64); }, o => { o.audit[1].provider = "other"; },
    o => { o.audit[1].tool = "cloudflare.pages.projects.get"; }, o => { o.audit[1].contract = "wrong"; }]) {
    const o = structuredClone(entry); edit(o); refused(f.scope, o);
  }
  const changed = structuredClone(entry); changed.audit[1].time++;
  assert.notEqual(summarizePagesRecordedCoverage(f.scope, [entry]).outcomeBindingsHash,
    summarizePagesRecordedCoverage(f.scope, [changed]).outcomeBindingsHash);
});

test("Cloudflare Pages recorded coverage refuses pending uncertain refused missing and mismatched journal snapshots", async () => {
  const f = fixture(), entry = f.observation(await f.invoke(1), 1);
  for (const edit of [o => { o.journal = null; }, o => { o.journal.event = "wrong"; },
    o => { o.journal.targetHash = "b".repeat(64); }, ...["pending", "refused", "uncertain", undefined].map(outcome => o => { o.journal.outcome = outcome; })]) {
    const o = structuredClone(entry); edit(o); refused(f.scope, o);
  }
});

test("Cloudflare Pages recorded coverage refuses foreign context and semantic targets even when all record hashes are rebound", async () => {
  const f = fixture(), entry = f.observation(await f.invoke(1), 1);
  for (const edit of [t => { t.provider = "other"; }, t => { t.contract = "wrong"; }, t => { t.version = "2"; },
    t => { t.tool = "cloudflare.pages.deployments.list"; }, t => { t.tier = "reserved"; },
    t => { t.artifactDigest = "b".repeat(64); }, t => { t.resource.revision = "resource-2"; },
    t => { t.resource.id += ":foreign"; }, t => { t.principal.agent = "other-agent"; },
    t => { t.policyRevision = "policy-2"; }, t => { t.argumentsHash = "b".repeat(64); }, t => { t.planHash = "invalid"; }]) {
    const o = structuredClone(entry); edit(o.target); rebind(o); refused(f.scope, o);
  }
  for (const selected of [{ ...f.scope, principalHash: "invalid" }, { ...f.scope, principalHash: "b".repeat(64) },
    { ...f.scope, policyRevision: "policy-2" }, { ...f.scope, policyRevision: "" }]) refused(selected, entry);
});

test("Cloudflare Pages recorded coverage binds selected page size and closed list arguments to the exact target", async () => {
  for (const deployments of [false, true]) {
    const f = fixture({ deployments }), entry = f.observation(await f.invoke(1), 1);
    for (const edit of [a => { a.page = 2; }, a => { a.perPage = 20; }, a => { a.extra = true; },
      a => { delete a.page; }, a => { a.projectName = "../foreign"; }]) {
      const o = structuredClone(entry); edit(o.arguments); o.target.argumentsHash = canonicalHash(o.arguments); rebind(o); refused(f.scope, o);
    }
    const o = structuredClone(entry); o.evidence.targetHash = "b".repeat(64); refused(f.scope, o);
  }
});

test("Cloudflare Pages recorded coverage rejects a persisted capture after failed outcome audit and preserves replay refusal", async () => {
  const f = fixture({ auditFailure: true });
  const result = await f.invoke(1);
  assert.equal(result.code, "OUTCOME_UNCERTAIN");
  assert.equal(f.receipts.length, 1);
  const entry = f.observation(result, 1);
  assert.equal(entry.journal.outcome, "uncertain");
  assert.ok(!entry.audit.some(record => record.phase === "outcome" && record.decision === "ALLOW"));
  refused(f.scope, entry);
  const before = { ...f.calls };
  assert.equal((await f.invoke(1)).code, "REPLAY_CONFLICT");
  assert.equal(f.calls.secret, before.secret);
  assert.equal([...f.journal.values()][0].outcome, "uncertain");
});

test("Cloudflare Pages recorded coverage inherits the full observation cap without oversized aggregate hashes", async () => {
  const f = fixture({ totalPages: 100 });
  const entries = [];
  for (let page = 1; page <= 100; page++) entries.push(f.observation(await f.invoke(page), page));
  const out = summarizePagesRecordedCoverage(f.scope, entries);
  assert.equal(out.observedPages.length, 100);
  assert.equal(out.pageCoverage, "all-reported-pages-observed");
  assert.equal(out.outcomeBindingsHash, summarizePagesRecordedCoverage(f.scope, [...entries].reverse()).outcomeBindingsHash);
  assert.throws(() => summarizePagesRecordedCoverage(f.scope, [...entries, entries[0]]), /cap/);
});
