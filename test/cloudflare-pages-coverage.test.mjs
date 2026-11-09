import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { summarizePagesCoverage } from "../dist/plugins/cloudflare-broker/src/pages-coverage.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32);
const resource = { id: `cloudflare:account:${accountId}:pages:projects:pagination`, revision: "resource-1" };
const scope = { resource, perPage: 10 };
const unavailable = { status: "unavailable", reason: "not-returned" };
const observation = (page = 1, total = 3, items = []) => {
  const event = randomUUID();
  const value = { items, complete: false, pagination: { status: "provider-reported", page, perPage: 10,
    totalPages: total === undefined ? unavailable : { status: "provider-reported", value: total },
    enumeration: "not-established", snapshotConsistency: "not-established" },
  capture: { correlationId: randomUUID(), startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000, resource: { ...resource }, provenance: "internal-transport-observation",
    enumeration: "not-established", snapshotConsistency: "not-established" } };
  return { result: { ok: true, event, value }, evidence: { contract: "toolkit.cloudflare-capture/v1",
    subject: "credential-filtered-pages-list-projection", event, targetHash: canonicalHash({ event, page }), valueHash: canonicalHash(value) } };
};
function changed(edit, source = observation()) {
  const o = structuredClone(source);
  edit(o.result.value);
  o.evidence.valueHash = canonicalHash(o.result.value);
  return o;
}
function denied(o, selected = scope) { assert.throws(() => summarizePagesCoverage(selected, [o]), /scope|schema|cap/); }

// These are source-input consistency tests, never a native issuer/storage fixture.
test("Cloudflare Pages source coverage sorts observed pages and reports compact missing ranges", () => {
  const a = observation(2, 8), b = observation(5, 8);
  b.result.value.capture.startedAt = "2026-01-01T00:00:02.000Z";
  b.result.value.capture.completedAt = "2026-01-01T00:00:03.000Z";
  b.evidence.valueHash = canonicalHash(b.result.value);
  const out = summarizePagesCoverage(scope, [b, a]);
  assert.deepEqual(out.observedPages, [2, 5]);
  assert.deepEqual(out.missingRanges, [{ first: 1, last: 1 }, { first: 3, last: 4 }, { first: 6, last: 8 }]);
  assert.equal(out.pageCoverage, "gaps");
  assert.deepEqual(out.window, { startedAt: a.result.value.capture.startedAt, completedAt: b.result.value.capture.completedAt,
    provenance: "internal-transport-observation" });
  assert.equal(out.observationsHash, summarizePagesCoverage(scope, [a, b]).observationsHash);
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.observedPages) && Object.isFrozen(out.missingRanges[0]));
});

test("Cloudflare Pages all reported pages including zero and empty selections never establish enumeration or absence", () => {
  for (const entries of [[observation(3), observation(1), observation(2)], [observation(1, 0)], [observation(1, 1)]]) {
    const out = summarizePagesCoverage(scope, entries);
    assert.equal(out.pageCoverage, "all-reported-pages-observed");
    assert.deepEqual(out.missingRanges, []);
    assert.equal(out.complete, false);
    for (const key of ["enumeration", "snapshotConsistency", "hostingAbsence", "nativeAcceptance"]) assert.equal(out[key], "not-established");
  }
});

test("Cloudflare Pages omitted totals never inherit another page total or imply a terminal short page", () => {
  const missing = changed(v => { v.pagination.totalPages = unavailable; }, observation(2));
  const out = summarizePagesCoverage(scope, [observation(1), missing]);
  assert.equal(out.pageCoverage, "unavailable");
  assert.deepEqual(out.reportedTotalPages, { status: "unavailable" });
  assert.equal(out.missingRanges, null);
  denied(changed(v => { v.pagination = unavailable; }));
});

test("Cloudflare Pages coverage rejects mixed resources revisions page sizes and contradictory provider totals", () => {
  for (const edit of [v => { v.capture.resource.id = resource.id.replace(accountId, "b".repeat(32)); },
    v => { v.capture.resource.revision = "resource-2"; }, v => { v.pagination.perPage = 20; },
    v => { v.complete = true; }, v => { v.pagination.enumeration = "complete"; },
    v => { v.capture.provenance = "provider-time"; }, v => { v.pagination.page = 0; },
    v => { v.pagination.totalPages.value = 0; v.items = [{ id: "selected" }]; }]) denied(changed(edit));
  assert.throws(() => summarizePagesCoverage(scope, [observation(1, 3), observation(2, 4)]), /scope/);
  assert.throws(() => summarizePagesCoverage(scope, [observation(1, 1), changed(v => { v.pagination.totalPages = unavailable; }, observation(2))]), /scope/);
  for (const id of ["cloudflare:anything", resource.id + ":detail", "https://example.com"]) denied(observation(), { ...scope, resource: { ...resource, id } });
});

test("Cloudflare Pages coverage refuses duplicate pages events correlations and target hashes", () => {
  for (const duplicate of ["page", "event", "correlation", "target"]) {
    const a = observation(1), b = observation(2);
    if (duplicate === "page") b.result.value.pagination.page = 1;
    if (duplicate === "event") b.result.event = b.evidence.event = a.result.event;
    if (duplicate === "correlation") b.result.value.capture.correlationId = a.result.value.capture.correlationId;
    if (duplicate === "target") b.evidence.targetHash = a.evidence.targetHash;
    b.evidence.valueHash = canonicalHash(b.result.value);
    assert.throws(() => summarizePagesCoverage(scope, [a, b]), /scope/);
  }
});

test("Cloudflare Pages coverage requires matching successful capture receipts and validates local clocks", () => {
  for (const edit of [o => { o.result.ok = false; o.result.code = "OUTCOME_UNCERTAIN"; },
    o => { o.evidence.valueHash = "a".repeat(64); }, o => { o.evidence.event = randomUUID(); },
    o => { o.evidence.subject = "credential-filtered-current-content-projection"; },
    o => { o.evidence.contract = "wrong"; }, o => { o.evidence.targetHash = "invalid"; }]) {
    const o = observation(); edit(o); denied(o);
  }
  for (const edit of [v => { v.capture.startedAt = "2026-02-30T00:00:00.000Z"; },
    v => { v.capture.completedAt = "2025-01-01T00:00:00.000Z"; }, v => { v.capture.durationMs = -1; },
    v => { v.capture.durationMs = 10001; }, v => { v.capture.correlationId = "forged"; }]) denied(changed(edit));
});

test("Cloudflare Pages coverage bounds inputs and returns hashes not selected item or unrelated payloads", () => {
  for (const entries of [[], Array.from({ length: 101 }, () => observation()), null]) assert.throws(() => summarizePagesCoverage(scope, entries), /cap/);
  denied(observation(1, 1001));
  const oversized = observation();
  oversized.result.value.extra = "x".repeat(32768);
  denied(oversized);
  assert.throws(() => summarizePagesCoverage(scope, Array.from({ length: 100 }, (_, i) => changed(v => {
    v.extra = Array.from({ length: 4 }, () => "x".repeat(3000));
  }, observation(i + 1, 100)))), /cap/);
  denied(changed(v => { v.items = Array.from({ length: 11 }, () => ({ id: "x" })); }));
  const o = observation(1, 1, [{ id: "private-selected-id", provenance: { repositoryName: "private-repository" } }]);
  const out = summarizePagesCoverage(scope, [o]);
  const serialized = JSON.stringify(out);
  for (const omitted of ["private-selected-id", "private-repository", o.result.event, o.result.value.capture.correlationId, o.evidence.targetHash]) {
    assert.ok(!serialized.includes(omitted));
  }
});

test("Cloudflare Pages coverage accepts the full 100-observation bound without hashing an oversized core JSON array", () => {
  const entries = Array.from({ length: 100 }, (_, i) => observation(i + 1, 100));
  const out = summarizePagesCoverage(scope, entries);
  assert.equal(out.pageCoverage, "all-reported-pages-observed");
  assert.equal(out.observedPages.length, 100);
  assert.equal(out.observationsHash, summarizePagesCoverage(scope, [...entries].reverse()).observationsHash);
  const bindings = entries.map(o => ({ page: o.result.value.pagination.page, event: o.result.event,
    targetHash: o.evidence.targetHash, valueHash: o.evidence.valueHash }));
  assert.throws(() => canonicalHash(bindings), /schema/);
  assert.equal(out.observationsHash, bindings.reduce((previous, binding) => canonicalHash({ previous, binding }), canonicalHash([])));
  entries[99] = observation(100, 100);
  assert.notEqual(out.observationsHash, summarizePagesCoverage(scope, entries).observationsHash);
});

function brokerFixture({ auditFailure = false } = {}) {
  const f = providerFixture({ authority: null });
  const selected = { accountId, revision: resource.revision, scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName: "safe-pages", projectId: "project-id", deploymentIds: [] }],
    pagesPagination: { projects: true, deploymentProjects: [] } };
  const source = { accountId, revision: resource.revision };
  const tool = "cloudflare.pages.projects.list";
  const operation = cloudflareReadOperations(selected, source).find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare({ page: 1, perPage: 10 }).resource.id] };
  const receipts = [];
  if (auditFailure) {
    const append = f.dependencies.audit.append;
    f.dependencies.audit.append = async record => {
      if (record.phase === "outcome" && record.decision === "ALLOW") throw Error("unavailable");
      await append(record);
    };
  }
  const broker = createCloudflareReadBroker(selected, source, f.dependencies, { async append(record) { receipts.push(record); } }, async url => {
    const page = Number(new URL(url).searchParams.get("page"));
    return new Response(JSON.stringify({ success: true, errors: [], result: [{ id: "project-id", name: "safe-pages",
      env_vars: credentialCanary, url: derivedCanary }], result_info: { page, per_page: 10, total_pages: 2 } }),
    { headers: { "content-type": "application/json" } });
  });
  return { ...f, receipts, invoke: page => broker.call(tool, { page, perPage: 10 }, "verified-runtime", `page-${page}`) };
}

test("Cloudflare Pages coverage consumes separate actual-core successful pages without upgrading native acceptance", async () => {
  const f = brokerFixture();
  const results = await Promise.all([f.invoke(2), f.invoke(1)]);
  assert.ok(results.every(result => result.ok));
  const entries = results.map(result => ({ result, evidence: f.receipts.find(receipt => receipt.event === result.event) }));
  const out = summarizePagesCoverage(scope, entries);
  assert.equal(out.pageCoverage, "all-reported-pages-observed");
  assert.equal(out.nativeAcceptance, "not-established");
  assert.equal(out.complete, false);
  assert.equal(f.audit.filter(record => record.phase === "outcome" && record.decision === "ALLOW").length, 2);
  assert.ok([...f.journal.values()].every(entry => entry.outcome === "complete"));
  for (const canary of [credentialCanary, derivedCanary, "env_vars", "project-id"]) assert.ok(!JSON.stringify(out).includes(canary));
});

test("Cloudflare Pages coverage never treats a persisted receipt after failed outcome audit as a successful observation", async () => {
  const f = brokerFixture({ auditFailure: true });
  const result = await f.invoke(1);
  assert.equal(result.code, "OUTCOME_UNCERTAIN");
  assert.equal(f.receipts.length, 1);
  assert.equal([...f.journal.values()][0].outcome, "uncertain");
  denied({ result, evidence: f.receipts[0] });
  assert.equal((await f.invoke(1)).code, "REPLAY_CONFLICT");
});
