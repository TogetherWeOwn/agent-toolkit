import assert from "node:assert/strict";
import test from "node:test";
import { dispatchNamespaceDescriptors } from "../dist/plugins/cloudflare-broker/src/dispatch-namespaces.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32);
const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", otherId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const list = "cloudflare.workers.dispatch_namespaces.list", get = "cloudflare.workers.dispatch_namespaces.get";
const namespace = () => ({ namespaceId: id, namespaceName: "safe-namespace" });
const scope = () => ({ accountId: account, revision: "resource-1", listNamespaces: [namespace()], namespaces: [namespace()] });
const args = tool => tool === list ? {} : { namespaceName: "safe-namespace" };
const row = () => ({ namespace_id: id, namespace_name: "safe-namespace", created_by: credentialCanary,
  modified_by: derivedCanary, created_on: "2026-01-01", modified_on: "2026-01-02", script_count: 12,
  trusted_workers: true, scripts: [credentialCanary] });
const success = result => JSON.stringify({ success: true, errors: [], result });
function fixture(tool, { allowed = true, response = tool === list ? [row()] : row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-namespace"], hyperdriveIds: [],
    ...(allowed ? { dispatchNamespaceList: [namespace()], dispatchNamespaceDetails: [namespace()] } : {}) },
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
  for (const omitted of [credentialCanary, derivedCanary, "created_by", "modified_by", "created_on", "modified_on", "script_count", "trusted_workers"])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare dispatch namespace scopes snapshot independent list/detail identities and exact bounded requests", () => {
  const s = scope(), d = dispatchNamespaceDescriptors(s);
  s.listNamespaces[0].namespaceName = "foreign"; s.namespaces[0].namespaceId = otherId; s.accountId = foreign;
  const p = d.dispatchNamespacesList.prepare({});
  assert.equal(p.request.path, `/accounts/${account}/workers/dispatch/namespaces`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:dispatch-namespaces`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.maxRequests, 1); assert.equal(p.request.redirects, "deny");
  assert.equal(d.dispatchNamespaceGet.prepare(args(get)).request.path, `/accounts/${account}/workers/dispatch/namespaces/safe-namespace`);
  assert.equal(d.dispatchNamespaceGet.prepare(args(get)).resource.id, `cloudflare:account:${account}:dispatch-namespace:${id}`);
  assert.equal(d.dispatchNamespacesList.project(success([row()]), p).items[0].name, "safe-namespace");
  for (const key of ["listNamespaces", "namespaces"]) {
    for (const selection of [undefined, []]) {
      const denied = dispatchNamespaceDescriptors({ ...scope(), [key]: selection });
      assert.throws(() => key === "listNamespaces" ? denied.dispatchNamespacesList.prepare({}) : denied.dispatchNamespaceGet.prepare(args(get)), /scope/);
      assert.doesNotThrow(() => key === "listNamespaces" ? denied.dispatchNamespaceGet.prepare(args(get)) : denied.dispatchNamespacesList.prepare({}));
    }
  }
  for (const value of [d, d.dispatchNamespacesList, p, p.request, p.arguments, p.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.dispatchNamespacesList.project(success([row()]), { ...p }), /scope/);
});

test("Cloudflare dispatch namespaces reject malformed duplicate oversized aliases and name overrides", () => {
  for (const namespaces of [null, Array(101).fill(namespace()), [namespace(), namespace()],
    [namespace(), { namespaceId: otherId, namespaceName: "safe-namespace" }],
    [namespace(), { namespaceId: id, namespaceName: "other" }], [{ namespaceId: foreign, namespaceName: "safe-namespace" }],
    [{ namespaceId: id, namespaceName: "bad\n" }], [{ namespaceId: id, namespaceName: "x".repeat(64) }]])
    for (const key of ["namespaces", "listNamespaces"]) assert.throws(() => dispatchNamespaceDescriptors({ ...scope(), [key]: namespaces }), /schema|cap/);
  const d = dispatchNamespaceDescriptors(scope());
  for (const input of [{ namespaceName: id }, { namespaceName: "other" }, { namespaceName: "safe-namespace", namespaceId: id },
    { namespaceName: "safe-namespace\n" }, { namespaceName: "safe-namespace%2fscripts" }, { namespaceName: "../safe-namespace" }])
    assert.throws(() => d.dispatchNamespaceGet.prepare(input), /schema|scope/);
  for (const input of [{ page: 1 }, { perPage: 100 }, { tags: "safe:yes" }]) assert.throws(() => d.dispatchNamespacesList.prepare(input), /schema/);
});

test("Cloudflare dispatch namespace projection selects exact associations without script or serving claims", () => {
  const d = dispatchNamespaceDescriptors(scope()), p = d.dispatchNamespacesList.prepare({});
  const out = d.dispatchNamespacesList.project(success([row(), { namespace_id: otherId, namespace_name: credentialCanary }]), p);
  assert.deepEqual(out.items, [{ id, name: "safe-namespace" }]);
  for (const value of [out, out.items, out.items[0]]) assert.ok(Object.isFrozen(value));
  assert.equal(out.complete, false); assert.equal(out.servingDeployment, "not-established"); assert.equal(out.productionConsumer, "not-established");
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
  assert.equal(d.dispatchNamespacesList.project(success([]), p).complete, false);
  assert.deepEqual(d.dispatchNamespaceGet.project(success(row()), d.dispatchNamespaceGet.prepare(args(get))).namespace, { id, name: "safe-namespace" });
  for (const rows of [[row(), row()], [{ ...row(), namespace_name: "renamed" }], [{ ...row(), namespace_id: otherId }],
    [{ namespace_id: id }], [{ namespace_name: "safe-namespace" }], Array(101).fill(row())])
    assert.throws(() => d.dispatchNamespacesList.project(success(rows), p), /scope|upstream|cap/);
});

test("Cloudflare dispatch namespace reads refuse malformed foreign provider identity envelopes and caps", () => {
  const d = dispatchNamespaceDescriptors(scope()).dispatchNamespaceGet, p = d.prepare(args(get));
  for (const response of [{ ...row(), namespace_id: otherId }, { ...row(), namespace_name: "renamed" }, { namespace_id: id }, { ...row(), account_id: foreign }])
    assert.throws(() => d.project(success(response), p), /scope/);
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: ["error"], result: row() }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: row() })]) assert.throws(() => d.project(raw, p), /upstream|scope/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
  const l = dispatchNamespaceDescriptors(scope()).dispatchNamespacesList;
  assert.throws(() => l.project(success([{ ...row(), account_id: foreign }]), l.prepare({})), /scope/);
});

test("Cloudflare dispatch namespace empty scopes and model identity transport or authority fields refuse before credentials", async () => {
  for (const tool of [list, get]) {
    const denied = fixture(tool, { allowed: false });
    assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
    for (const extra of [{ accountId: foreign }, { agentId: "other" }, { headers: {} }, { page: 1 }, { approval: "forged" }, { include: "scripts" }]) {
      const f = fixture(tool);
      assert.equal((await f.invoke({ ...args(tool), ...extra })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare dispatch namespace actual-core GETs retain redaction audit cleanup and replay", async () => {
  for (const tool of [list, get]) {
    const f = fixture(tool), p = f.operation.prepare(args(tool)), out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(p.plan.providerOperationId, tool === list ? "namespace-worker-list" : "namespace-worker-get-namespace");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
  const reflected = fixture(get, { response: { ...row(), namespace_name: credentialCanary } });
  const out = await reflected.invoke(); assert.equal(out.ok, false); safe(reflected, out);
});

test("Cloudflare dispatch namespace current agent resource binding and lease-time revocation deny network", async () => {
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

test("Cloudflare dispatch namespace upstream drift and audit outages preserve uncertain replay tombstones", async () => {
  for (const tool of [list, get]) for (const options of [{ status: 403 }, { status: 404 },
    { response: tool === list ? [{ ...row(), namespace_id: otherId }] : { ...row(), namespace_id: otherId } }, { auditFailure: true }]) {
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
