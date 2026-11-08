import assert from "node:assert/strict";
import test from "node:test";
import { dispatchScriptDescriptor } from "../dist/plugins/cloudflare-broker/src/dispatch-scripts.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32), tag = "d".repeat(32);
const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const args = { namespaceName: "safe-namespace" }, tool = "cloudflare.workers.dispatch_scripts.list";
const selection = () => ({ namespaceId: id, namespaceName: args.namespaceName, scripts: [{ name: "safe-worker", tag }] });
const scope = () => ({ accountId: account, revision: "resource-1", namespaces: [selection()] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ dispatch_namespace: args.namespaceName, created_on: credentialCanary,
  script: { id: "safe-worker", tag, etag: derivedCanary, tags: [credentialCanary],
    handlers: [derivedCanary], tail_consumers: [{ service: credentialCanary }],
    observability: { destinations: [derivedCanary] }, bindings: [{ text: credentialCanary }], source: credentialCanary } });
function fixture({ allowed = true, response = [row()], status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    dispatchNamespaceDetails: [{ namespaceId: id, namespaceName: args.namespaceName }],
    dispatchScriptSettings: [{ namespaceId: id, namespaceName: args.namespaceName, scriptNames: ["safe-worker"] }],
    ...(allowed ? { dispatchScriptLists: [selection()] } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
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
  for (const omitted of [credentialCanary, derivedCanary, "destinations", "tail_consumers", '"tags"', '"source"', '"bindings"', '"etag"', '"created_on"'])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare dispatch scripts snapshots exact namespace/script identities and bounded request", () => {
  const s = scope(), d = dispatchScriptDescriptor(s);
  s.namespaces[0].namespaceId = other; s.namespaces[0].namespaceName = "other";
  s.namespaces[0].scripts[0].tag = "changed"; s.namespaces[0].scripts.push({ name: "extra", tag: "extra" }); s.accountId = foreign;
  const p = d.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/workers/dispatch/namespaces/safe-namespace/scripts`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:dispatch-namespace:${id}:scripts`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.timeoutMs, 10000);
  assert.equal(p.request.maxRequests, 1); assert.equal(p.request.redirects, "deny");
  assert.deepEqual(d.project(success([row()]), p).items, [{ name: "safe-worker", tag }]);
  for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success([row()]), { ...p }), /scope/);
  for (const namespaces of [undefined, [], [{ ...selection(), scripts: [] }]])
    assert.throws(() => dispatchScriptDescriptor({ ...scope(), namespaces }).prepare(args), /scope/);
});

test("Cloudflare dispatch scripts rejects malformed duplicate oversized and cross-paired scope", () => {
  for (const namespaces of [null, [selection(), selection()], Array(101).fill(selection()),
    [{ ...selection(), namespaceId: account }], [{ ...selection(), namespaceName: "../escape" }],
    [{ ...selection(), scripts: [null] }], [{ ...selection(), scripts: [{ name: "Uppercase", tag }] }],
    [{ ...selection(), scripts: [{ name: "safe-worker\n", tag }] }], [{ ...selection(), scripts: [{ name: "safe-worker", tag: "../escape" }] }],
    [{ ...selection(), scripts: Array(101).fill({ name: "safe-worker", tag }) }],
    [{ ...selection(), scripts: [{ name: "safe-worker", tag }, { name: "other", tag }] }],
    [{ ...selection(), scripts: [{ name: "safe-worker", tag }, { name: "safe-worker", tag: "other" }] }],
    [selection(), { namespaceId: id, namespaceName: "other", scripts: [] }]])
    assert.throws(() => dispatchScriptDescriptor({ ...scope(), namespaces }), /schema|cap/);
  const d = dispatchScriptDescriptor({ ...scope(), namespaces: [selection(), { namespaceId: other, namespaceName: "other", scripts: [{ name: "different", tag: "other" }] }] });
  assert.deepEqual(d.project(success([{ script: { id: "different", tag: "other" } }]), d.prepare(args)).items, []);
  assert.throws(() => d.prepare({ namespaceName: "absent" }), /scope/);
});

test("Cloudflare dispatch scripts selects exact nested identity and refuses recreation rename or duplicates", () => {
  const d = dispatchScriptDescriptor(scope()), p = d.prepare(args), out = d.project(success([row(), { script: { id: credentialCanary, tag: derivedCanary } }]), p);
  assert.deepEqual(out.items, [{ name: "safe-worker", tag }]); assert.equal(out.complete, false);
  assert.equal(out.servingDeployment, "not-established"); assert.equal(out.productionConsumer, "not-established");
  for (const value of [out, out.items, out.items[0]]) assert.ok(Object.isFrozen(value));
  assert.equal(d.project(success([]), p).complete, false);
  assert.ok(!JSON.stringify(out).includes(credentialCanary)); assert.ok(!JSON.stringify(out).includes(derivedCanary));
  for (const rows of [[{ script: { id: "safe-worker", tag: "recreated" } }], [{ script: { id: "renamed", tag } }],
    [row(), row()], [{ script: { id: "safe-worker" } }], [{ id: "safe-worker", tag }]])
    assert.throws(() => d.project(success(rows), p), /scope|upstream/);
});

test("Cloudflare dispatch scripts refuses foreign contexts malformed envelopes and bounds", () => {
  const d = dispatchScriptDescriptor(scope()), p = d.prepare(args);
  for (const value of [{ ...row(), account_id: foreign }, { ...row(), namespace_id: other },
    { ...row(), dispatch_namespace: "other" }, { script: { ...row().script, account_id: foreign } },
    { script: { ...row().script, namespace_id: other } }, { script: [] }, { script: { tag } }])
    assert.throws(() => d.project(success([value]), p), /scope|upstream/);
  for (const raw of ["null", "bad-json", "{}", success(null), success({}),
    JSON.stringify({ success: true, result: [] }), JSON.stringify({ success: true, errors: ["failure"], result: [] }),
    JSON.stringify({ success: true, errors: [], namespace_id: other, result: [] })])
    assert.throws(() => d.project(raw, p), /scope|upstream|cap/);
  assert.throws(() => d.project(success(Array(101).fill(row())), p), /cap/);
  assert.throws(() => d.project(success([{ ...row(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare dispatch script scope and closed arguments refuse before credentials", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS"); assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const input of [{ namespaceName: "other" }, { ...args, page: 1 }, { ...args, tags: "production:yes" },
    { ...args, namespaceId: id }, { ...args, accountId: foreign }, { ...args, agentId: "other" },
    { ...args, headers: {} }, { ...args, approval: "forged" }, { ...args, scriptName: "safe-worker" },
    { namespaceName: "safe%2fnamespace" }]) {
    const f = fixture(); assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare dispatch scripts actual-core GET retains redaction audit cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, [{ name: "safe-worker", tag }]);
  assert.equal(p.plan.providerOperationId, "namespace-worker-list-scripts");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare dispatch scripts current agent resource binding and lease-time revocation deny network", async () => {
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

test("Cloudflare dispatch scripts availability drift and audit outage preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: [{ ...row(), namespace_id: other }] },
    { response: [{ script: { id: "safe-worker", tag: "recreated" } }] }, { auditFailure: true }]) {
    const f = fixture(options), append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke(); assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});
