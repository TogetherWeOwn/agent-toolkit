import assert from "node:assert/strict";
import test from "node:test";
import { workerIdentityDescriptors } from "../dist/plugins/cloudflare-broker/src/worker-identities.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), id = "b".repeat(30), foreign = "f".repeat(32);
const list = "cloudflare.workers.identities.list", get = "cloudflare.workers.identities.get";
const worker = () => ({ workerId: id, workerName: "safe-worker" });
const scope = () => ({ accountId: account, revision: "resource-1", listWorkers: [worker()], workers: [worker()] });
const args = tool => tool === list ? { page: 1, perPage: 10 } : { workerId: id };
const row = () => ({ id, name: "safe-worker", tags: [credentialCanary], references: { workers: [derivedCanary] },
  subdomain: { url: credentialCanary }, tail_consumers: [derivedCanary], deployed_on: null });
const success = result => JSON.stringify({ success: true, errors: [], result });
function fixture(tool, { allowed = true, response = tool === list ? [row()] : row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    ...(allowed ? { workerIdentityList: [worker()], workerIdentityDetails: [worker()] } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource = "denied";
  try { resource = operation.prepare(args(tool)).resource.id; } catch {}
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args(tool)) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, "references", "subdomain", "tail_consumers", "tags", "deployed_on"])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare Worker identity scopes snapshot separate list/detail associations and exact bounded requests", () => {
  const s = scope(), d = workerIdentityDescriptors(s);
  s.listWorkers[0].workerName = "foreign"; s.workers[0].workerId = foreign; s.accountId = foreign;
  const p = d.identitiesList.prepare({ page: 2, perPage: 10 });
  assert.equal(p.request.path, `/accounts/${account}/workers/workers?page=2&per_page=10`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker-identities`);
  assert.equal(d.identityGet.prepare({ workerId: id }).request.path, `/accounts/${account}/workers/workers/${id}`);
  assert.equal(d.identityGet.prepare({ workerId: id }).resource.id, `cloudflare:account:${account}:worker-identity:${id}`);
  assert.equal(d.identitiesList.project(success([row()]), p).items[0].name, "safe-worker");
  for (const key of ["listWorkers", "workers"]) {
    const selected = scope(); selected[key] = [];
    const denied = workerIdentityDescriptors(selected);
    assert.throws(() => key === "listWorkers" ? denied.identitiesList.prepare(args(list)) : denied.identityGet.prepare(args(get)), /scope/);
    assert.doesNotThrow(() => key === "listWorkers" ? denied.identityGet.prepare(args(get)) : denied.identitiesList.prepare(args(list)));
  }
  for (const value of [d, d.identitiesList, p, p.request, p.arguments, p.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.identitiesList.project(success([row()]), { ...p }), /scope/);
});

test("Cloudflare Worker identity scopes reject duplicate aliases malformed selectors and bounds", () => {
  for (const workers of [null, Array(101).fill(worker()), [worker(), worker()], [worker(), { workerId: foreign, workerName: "safe-worker" }],
    [{ workerId: "../escape", workerName: "safe-worker" }], [{ workerId: id, workerName: "bad\n" }]])
    assert.throws(() => workerIdentityDescriptors({ ...scope(), workers }), /schema|cap/);
  const d = workerIdentityDescriptors(scope());
  for (const input of [{ workerId: "safe-worker" }, { workerId: foreign }, { workerId: id, name: "safe-worker" }, { workerId: `${id}\n` }])
    assert.throws(() => d.identityGet.prepare(input), /schema|scope/);
  for (const input of [{ page: 0, perPage: 10 }, { page: 1001, perPage: 10 }, { page: 1, perPage: 101 }, { page: 1.5, perPage: 1 }])
    assert.throws(() => d.identitiesList.prepare(input), /schema/);
});

test("Cloudflare Worker identity projection filters unselected rows and never establishes serving or tag joins", () => {
  const d = workerIdentityDescriptors(scope()), p = d.identitiesList.prepare(args(list));
  const out = d.identitiesList.project(success([row(), { id: foreign, name: credentialCanary }]), p);
  assert.deepEqual(out.items, [{ id, name: "safe-worker" }]);
  for (const value of [out, out.items, out.items[0]]) assert.ok(Object.isFrozen(value));
  assert.equal(out.complete, false);
  for (const key of ["servingDeployment", "productionConsumer", "buildSystemTagBinding"]) assert.equal(out[key], "not-established");
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
  assert.equal(d.identitiesList.project(success([]), p).complete, false);
  assert.deepEqual(d.identityGet.project(success(row()), d.identityGet.prepare(args(get))).worker, { id, name: "safe-worker" });
  for (const rows of [[row(), row()], [{ ...row(), name: "renamed" }], [{ id }], [{ name: "safe-worker" }], Array(11).fill(row())])
    assert.throws(() => d.identitiesList.project(success(rows), p), /scope|upstream|cap/);
});

test("Cloudflare Worker identity reads refuse missing foreign and malformed provider identity and envelopes", () => {
  const d = workerIdentityDescriptors(scope()).identityGet, p = d.prepare(args(get));
  for (const response of [{ ...row(), id: foreign }, { ...row(), name: "renamed" }, { id }, { ...row(), account_id: foreign }])
    assert.throws(() => d.project(success(response), p), /scope/);
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: row() })])
    assert.throws(() => d.project(raw, p), /upstream|scope/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare Worker identity empty scopes and model transport identity or authority overrides refuse before credentials", async () => {
  for (const tool of [list, get]) {
    const denied = fixture(tool, { allowed: false });
    assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
    for (const extra of [{ accountId: foreign }, { agentId: "other" }, { headers: {} }, { order_by: "name" }, { approval: "forged" }, { fields: ["references"] }]) {
      const f = fixture(tool);
      assert.equal((await f.invoke({ ...args(tool), ...extra })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare Worker identity actual-core reads retain fixed GET redaction audit cleanup and replay", async () => {
  for (const tool of [list, get]) {
    const f = fixture(tool), p = f.operation.prepare(args(tool)), out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(p.plan.providerOperationId, tool === list ? "listWorkers" : "getWorker");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
});

test("Cloudflare Worker identity current agent resource binding and lease-time revocation deny network", async () => {
  for (const tool of [list, get]) for (const reason of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(tool);
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

test("Cloudflare Worker identity upstream drift and audit outages preserve uncertain replay tombstones", async () => {
  for (const tool of [list, get]) for (const options of [{ status: 403 }, { status: 404 },
    { response: tool === list ? [{ ...row(), name: "renamed" }] : { ...row(), name: "renamed" } }, { auditFailure: true }]) {
    const f = fixture(tool, options), append = f.dependencies.audit.append;
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
