import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { pagesCollectionTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { pagesMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32);
const projectName = "safe-pages";
const projectId = "project-id";
const deploymentId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const cases = [
  ["cloudflare.pages.projects.list", { page: 1, perPage: 10 }, { id: projectId, name: projectName }],
  ["cloudflare.pages.deployments.list", { projectName, page: 1, perPage: 10 },
    { id: deploymentId, project_name: projectName, project_id: projectId }],
];
const evidenceScope = () => ({ projects: true, deploymentProjects: [projectName] });
const response = (c, page = 1) => new Response(JSON.stringify({ success: true, errors: [],
  result: [{ ...c[2], env_vars: credentialCanary, url: derivedCanary }],
  result_info: { page, per_page: 10, total_pages: 1 }, capture: { startedAt: "forged-provider-time" } }),
{ headers: { "content-type": "application/json", date: "Sat, 01 Jan 2000 00:00:00 GMT" } });

// Synthetic dependencies/sink only: no native durability or real-provider claim.
function fixture(c = cases[0], { pagination = evidenceScope(), fetcher, sink, id = projectId } = {}) {
  const f = providerFixture({ authority: null });
  const scope = { accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName, projectId: id, deploymentIds: [deploymentId] }], pagesPagination: pagination };
  const source = { accountId, revision: "resource-1" };
  const operations = cloudflareReadOperations(scope, source);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources:
    cases.map(item => operations.find(op => op.name === item[0]).prepare(item[1]).resource.id) };
  const receipts = [], requests = [];
  const broker = createCloudflareReadBroker(scope, source, f.dependencies, { async append(record) {
    assert.ok(Object.isFrozen(record));
    assert.ok(f.calls.close > 0);
    if (sink) await sink(record);
    receipts.push(record);
  } }, async (url, init) => {
    requests.push(url);
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return fetcher ? fetcher(url, init) : response(c);
  });
  return { ...f, scope, receipts, requests, operations,
    invoke: (raw = c[1], key = "call-a", tool = c[0], context = "verified-runtime") => broker.call(tool, raw, context, key) };
}
function safe(f, result) {
  const data = JSON.stringify({ result, receipts: f.receipts, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary, "forged-provider-time", "env_vars"]) assert.ok(!data.includes(canary));
}

test("Cloudflare Pages collection windows bind filtered projections to exact core events and resources", async () => {
  for (const c of cases) {
    const before = Date.now();
    const f = fixture(c);
    const result = await f.invoke();
    assert.equal(result.ok, true);
    const capture = result.value.capture;
    assert.match(capture.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(Date.parse(capture.startedAt) >= before);
    assert.ok(Date.parse(capture.completedAt) >= Date.parse(capture.startedAt));
    assert.ok(Date.parse(capture.completedAt) <= Date.now());
    assert.ok(capture.durationMs >= 0 && capture.durationMs <= 10000);
    assert.deepEqual(capture.resource, f.operations.find(op => op.name === c[0]).prepare(c[1]).resource);
    assert.equal(capture.provenance, "internal-transport-observation");
    assert.equal(capture.enumeration, "not-established");
    assert.equal(capture.snapshotConsistency, "not-established");
    assert.equal(result.value.complete, false);
    assert.deepEqual(f.receipts, [{ contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-pages-list-projection",
      event: result.event, targetHash: f.audit[0].targetHash, valueHash: canonicalHash(result.value) }]);
    assert.equal(f.receipts[0].targetHash, [...f.journal.values()][0].target);
    assert.equal(f.calls.consumed, 0);
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare Pages capture inherits copied independent page scope and never enables ordinary or detail reads", async () => {
  for (let index = 0; index < cases.length; index++) {
    const pagination = evidenceScope();
    const selected = fixture(cases[index], { pagination });
    pagination.projects = false; pagination.deploymentProjects.length = 0;
    assert.ok((await selected.invoke()).value.capture);
    for (const configured of [undefined, { projects: index === 1, deploymentProjects: index === 0 ? [projectName] : [] }]) {
      const f = fixture(cases[index], { pagination: configured ?? { projects: false, deploymentProjects: [] },
        sink: async () => { throw Error("unavailable"); } });
      const result = await f.invoke();
      assert.equal(result.ok, true);
      assert.equal(result.value.capture, undefined);
      assert.equal(f.receipts.length, 0);
    }
  }
  const d = pagesMetadataDescriptors({ accountId, revision: "resource-1", projects: [{ projectName, projectId, deploymentIds: [] }] });
  let requests = 0;
  await assert.rejects(pagesCollectionTransport(async () => { requests++; return response(cases[0]); })(
    d.pagesProjectGet, { projectName }, credentialCanary, new AbortController().signal), /schema/);
  assert.equal(requests, 0);
});

test("Cloudflare Pages capture records local collection even when provider page metadata is unavailable", async () => {
  for (const c of cases) {
    const f = fixture(c, { fetcher: async () => new Response(JSON.stringify({ success: true, errors: [], result: [] }),
      { headers: { "content-type": "application/json" } }) });
    const result = await f.invoke();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.pagination, { status: "unavailable", reason: "not-returned" });
    assert.equal(result.value.complete, false);
    assert.equal(result.value.capture.enumeration, "not-established");
    assert.equal(f.receipts.length, 1);
    safe(f, result);
  }
});

test("Cloudflare Pages capture cannot be forged by arguments or unauthorized current principal policy", async () => {
  for (const c of cases) for (const denial of ["argument", "identity", "agent", "resource", "binding", "revocation"]) {
    const f = fixture(c);
    if (denial === "agent") f.vector.policy.agents = ["other-agent"];
    if (denial === "resource") f.vector.policy.resources = ["other-resource"];
    if (denial === "binding") f.dependencies.host.revalidate = async () => false;
    if (denial === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const result = await f.invoke(denial === "argument" ? { ...c[1], capture: { startedAt: "forged" } } : c[1], "call-a", c[0],
      denial === "identity" ? {} : "verified-runtime");
    assert.equal(result.ok, false);
    assert.equal(f.calls.secret, denial === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.receipts.length, 0);
    safe(f, result);
  }
});

test("Cloudflare Pages capture waits for evidence persistence before successful output", async () => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const persisted = new Promise(resolve => { release = resolve; });
  const f = fixture(cases[0], { sink: async () => { enter(); await persisted; } });
  const pending = f.invoke();
  await Promise.race([entered, pending.then(result => assert.fail(`returned before persistence: ${JSON.stringify(result)}`))]);
  assert.deepEqual(f.audit.map(record => record.phase), ["intent"]);
  assert.equal(f.receipts.length, 0);
  release();
  assert.equal((await pending).ok, true);
  assert.equal(f.receipts.length, 1);
});

test("Cloudflare Pages capture sink or subsequent outcome-audit failure suppresses output and retains uncertain replay", async () => {
  for (const c of cases) for (const failure of ["sink", "audit"]) {
    const f = fixture(c, { sink: failure === "sink" ? async () => { throw Error(credentialCanary); } : undefined });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async record => {
      if (record.phase === "outcome" && record.decision === "ALLOW") throw Error(credentialCanary);
      await append(record);
    };
    const result = await f.invoke();
    assert.equal(result.code, "OUTCOME_UNCERTAIN");
    assert.equal(result.value, undefined);
    assert.equal(f.receipts.length, failure === "sink" ? 0 : 1);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare Pages malformed responses credential reflection or failed lease cleanup never persist collection evidence", async () => {
  for (const failure of ["page", "media", "reflection", "cleanup"]) {
    const c = cases[0];
    const f = fixture(c, { id: failure === "reflection" ? credentialCanary : projectId,
      fetcher: async () => failure === "media" ? new Response("bad") : failure === "reflection" ?
        new Response(JSON.stringify({ success: true, errors: [], result: [{ id: credentialCanary, name: projectName }] }),
          { headers: { "content-type": "application/json" } }) : response(c, failure === "page" ? 2 : 1) });
    if (failure === "cleanup") f.dependencies.credentials.resolve = async () => ({ value: credentialCanary, redactions: [derivedCanary],
      async close() { throw Error(credentialCanary); } });
    const result = await f.invoke();
    assert.equal(result.ok, false);
    assert.equal(f.receipts.length, 0);
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare Pages concurrent out-of-order collections preserve independent windows events and target bindings", async () => {
  let enter;
  const entered = new Promise(resolve => { enter = resolve; });
  const waiting = new Map();
  const f = fixture(cases[0], { fetcher: url => new Promise(resolve => {
    waiting.set(url.includes("deployments") ? "deployments" : "projects", resolve);
    if (waiting.size === 2) enter();
  }) });
  const first = f.invoke(cases[0][1], "first", cases[0][0]);
  const second = f.invoke(cases[1][1], "second", cases[1][0]);
  await Promise.race([entered, first.then(result => assert.fail(JSON.stringify(result))), second.then(result => assert.fail(JSON.stringify(result)))]);
  waiting.get("deployments")(response(cases[1]));
  const deployments = await second;
  waiting.get("projects")(response(cases[0]));
  const projects = await first;
  assert.equal(projects.ok, true);
  assert.equal(deployments.ok, true);
  assert.notEqual(projects.value.capture.correlationId, deployments.value.capture.correlationId);
  assert.notEqual(projects.event, deployments.event);
  assert.equal(f.receipts.length, 2);
  for (const result of [projects, deployments]) {
    const receipt = f.receipts.find(record => record.event === result.event);
    assert.equal(receipt.valueHash, canonicalHash(result.value));
    assert.equal(receipt.targetHash, f.audit.find(record => record.event === result.event).targetHash);
  }
  assert.notEqual(f.receipts[0].targetHash, f.receipts[1].targetHash);
  safe(f, { projects, deployments });
});
