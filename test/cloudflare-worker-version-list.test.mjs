import assert from "node:assert/strict";
import test from "node:test";
import { workerVersionListDescriptor } from "../dist/plugins/cloudflare-broker/src/worker-version-list.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), workerId = "b".repeat(30), foreign = "f".repeat(32);
const version = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", otherVersion = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const tool = "cloudflare.workers.full_versions.list", args = { workerId, page: 1, perPage: 10 };
const worker = () => ({ workerId, versionIds: [version] });
const scope = () => ({ accountId: account, revision: "resource-1", workers: [worker()] });
const row = () => ({ id: version, number: 1, urls: [credentialCanary], created_on: derivedCanary,
  modules: [{ content: credentialCanary }], assets: { config: { run_worker_first: true } },
  package_dependencies: [{ name: derivedCanary, installedVersion: "1.0.0" }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
function fixture({ allowed = true, response = [row()], status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    workerIdentityList: [{ workerId, workerName: "safe-worker" }], workerIdentityDetails: [{ workerId, workerName: "safe-worker" }],
    workerVersions: [{ scriptName: "safe-worker", versionIds: [version] }],
    workerAssetVersions: [{ scriptName: "safe-worker", versionIds: [version] }],
    ...(allowed ? { workerVersionLists: [worker()] } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource = "denied";
  try { resource = operation.prepare(args).resource.id; } catch {}
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, "urls", "created_on", "modules", "package_dependencies", "run_worker_first"])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare full Worker version-list scope snapshots immutable IDs and bounded requests", () => {
  const s = scope(), d = workerVersionListDescriptor(s);
  s.workers[0].versionIds[0] = otherVersion; s.workers[0].workerId = foreign; s.accountId = foreign;
  const p = d.prepare({ ...args, page: 2 });
  assert.equal(p.request.path, `/accounts/${account}/workers/workers/${workerId}/versions?page=2&per_page=10`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker-identity:${workerId}:versions`);
  assert.deepEqual(d.project(success([row()]), p).items, [{ id: version }]);
  for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success([row()]), { ...p }), /scope/);
  for (const workers of [undefined, [], [{ workerId, versionIds: [] }]])
    assert.throws(() => workerVersionListDescriptor({ ...scope(), workers }).prepare(args), /scope/);
});

test("Cloudflare full Worker version-list scope refuses duplicate malformed and oversized selections", () => {
  for (const workers of [null, Array(101).fill(worker()), [worker(), worker()], [{ workerId: "../escape", versionIds: [version] }],
    [{ workerId: `${workerId}\n`, versionIds: [version] }], [{ workerId, versionIds: [version, version] }],
    [{ workerId, versionIds: ["latest"] }], [{ workerId, versionIds: Array(101).fill(version) }]])
    assert.throws(() => workerVersionListDescriptor({ ...scope(), workers }), /schema|cap/);
  const d = workerVersionListDescriptor(scope());
  for (const input of [{ ...args, workerId: foreign }, { ...args, workerId: "safe-worker" }, { ...args, page: 0 },
    { ...args, page: 1001 }, { ...args, perPage: 101 }, { ...args, page: 1.5 }, { ...args, versionId: version }])
    assert.throws(() => d.prepare(input), /schema|scope/);
});

test("Cloudflare full Worker version-list projection returns selected IDs without content or serving claims", () => {
  const d = workerVersionListDescriptor(scope()), p = d.prepare(args);
  const out = d.project(success([row(), { ...row(), id: otherVersion }]), p);
  assert.deepEqual(out.items, [{ id: version }]);
  for (const value of [out, out.items, out.items[0]]) assert.ok(Object.isFrozen(value));
  assert.equal(out.complete, false); assert.equal(out.workerId, workerId);
  for (const key of ["servingDeployment", "productionConsumer"]) assert.equal(out[key], "not-established");
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
  assert.deepEqual(d.project(success([]), p).items, []);
  for (const rows of [[row(), row()], [{}], [{ ...row(), account_id: foreign }], [{ ...row(), worker_id: foreign }], Array(11).fill(row())])
    assert.throws(() => d.project(success(rows), p), /scope|upstream|cap/);
});

test("Cloudflare full Worker version-list refuses malformed envelopes foreign context and response caps", () => {
  const d = workerVersionListDescriptor(scope()), p = d.prepare(args);
  for (const raw of ["null", "not-json", "{}", success(null), success({}), JSON.stringify({ success: true, result: [row()] }),
    JSON.stringify({ success: true, errors: ["failure"], result: [row()] }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: [row()] }),
    JSON.stringify({ success: true, errors: [], worker_id: foreign, result: [row()] })])
    assert.throws(() => d.project(raw, p), /upstream|scope|cap/);
  assert.throws(() => d.project(success([{ ...row(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare full Worker version-list is independently denied before credentials despite identity and detail visibility", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { agentId: "other" }, { headers: {} }, { include: "modules" },
    { approval: "forged" }, { fields: ["assets"] }, { versionIds: [version] }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare full Worker version-list actual-core read retains fixed GET redaction audit cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, [{ id: version }]);
  assert.equal(p.plan.providerOperationId, "listWorkerVersions");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare full Worker version-list current agent resource binding and lease-time revocation deny network", async () => {
  for (const reason of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (reason === "agent") f.vector.policy.agents = ["other-agent"];
    if (reason === "resource") f.vector.policy.resources = ["other-resource"];
    if (reason === "binding") f.dependencies.host.revalidate = async () => false;
    if (reason === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    assert.equal((await f.invoke()).code, reason === "binding" ? "RESOURCE_CHANGED" : reason === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, reason === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare full Worker version-list upstream drift and audit outages preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: [{ ...row(), worker_id: foreign }] }, { auditFailure: true }]) {
    const f = fixture(options), append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});
