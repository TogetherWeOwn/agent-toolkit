import assert from "node:assert/strict";
import test from "node:test";
import { deployHookDescriptor } from "../dist/plugins/cloudflare-broker/src/deploy-hooks.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32), scriptTag = "b".repeat(32), foreign = "f".repeat(32);
const scriptName = "safe-worker", args = { scriptName };
const capability = "12345678-1234-4234-8234-123456789abc";
const hook = { name: "Selected Hook", branch: "main" };
const tool = "cloudflare.workers.builds.deploy_hooks.list";
const scope = () => ({ accountId, revision: "resource-1", workers: [{ scriptName, scriptTag, hooks: [{ ...hook }] }] });
const row = () => ({ deploy_hook_name: hook.name, branch: hook.branch, external_script_id: scriptTag,
  deploy_hook_uuid: capability, created_on: credentialCanary, modified_on: derivedCanary,
  latest_build: { created_on: credentialCanary }, url: `https://example.invalid/${capability}` });
const success = result => JSON.stringify({ success: true, errors: [], result });
function fixture({ workers = scope().workers, response = [row()], status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId, revision: "resource-1", scriptNames: [scriptName], hyperdriveIds: [],
    workerDeployHooks: workers }, { accountId, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(args).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (value = args) => broker.call(tool, value, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [capability, credentialCanary, derivedCanary, "deploy_hook_uuid", "latest_build", "created_on", "modified_on", "example.invalid"])
    assert.ok(!serialized.includes(value), value);
}

test("Cloudflare deploy-hook scope copies name/tag/selected hook bindings independently", () => {
  const s = scope(), d = deployHookDescriptor(s);
  s.accountId = foreign;
  s.workers[0].scriptTag = foreign;
  s.workers[0].hooks[0].branch = "other";
  s.workers[0].hooks.push({ name: "Unselected", branch: "main" });
  const p = d.prepare(args);
  assert.equal(p.request.path, `/accounts/${accountId}/builds/workers/${scriptName}/deploy_hooks`);
  assert.equal(p.resource.id, `cloudflare:account:${accountId}:worker:${scriptName}:deploy-hooks:${scriptTag}`);
  assert.equal(d.providerOperationId, "listDeployHooks");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.project(success([row()]), p).items, [hook]);
  assert.throws(() => d.project(success([row()]), { ...p }), /scope/);
  assert.throws(() => deployHookDescriptor(scope()).project(success([row()]), p), /scope/);
});

test("Cloudflare deploy-hook scopes refuse ambiguous malformed and oversized selections", () => {
  const worker = scope().workers[0];
  for (const workers of [[worker, worker], [null], [{ ...worker, scriptTag: scriptName }],
    [{ ...worker, hooks: [hook, hook] }], [{ ...worker, hooks: [null] }]])
    assert.throws(() => deployHookDescriptor({ ...scope(), workers }), /schema/);
  for (const branch of ["../main", "main//other", "main/", "main.lock", "main\n", "*"])
    assert.throws(() => deployHookDescriptor({ ...scope(), workers: [{ ...worker, hooks: [{ ...hook, branch }] }] }), /schema/);
  for (const name of ["", "a".repeat(59), "bad\n", "https://example.invalid"])
    assert.throws(() => deployHookDescriptor({ ...scope(), workers: [{ ...worker, hooks: [{ ...hook, name }] }] }), /schema/);
  assert.throws(() => deployHookDescriptor({ ...scope(), workers: Array(101).fill(worker) }), /cap/);
  assert.throws(() => deployHookDescriptor({ ...scope(), workers: [{ ...worker, hooks: Array(101).fill(hook) }] }), /cap/);
});

test("Cloudflare deploy-hook lists project names and branches without bearer UUIDs URLs or serving claims", () => {
  const d = deployHookDescriptor(scope()), p = d.prepare(args);
  const out = d.project(success([row(), { ...row(), deploy_hook_name: "Unselected", branch: "private" }]), p);
  assert.deepEqual(out, { items: [hook], complete: false, subject: "configured-worker-deploy-hooks",
    servingDeployment: "not-established", productionConsumer: "not-established" });
  for (const value of [out, out.items, out.items[0]]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.project(success([]), p).items, []);
  safe({ audit: [], journal: [] }, out);
  assert.ok(!JSON.stringify(out).includes("Unselected"));
  assert.equal(d.project(success([]), p).complete, false);
});

test("Cloudflare deploy-hook capability reflection into selected metadata refuses even across rows", () => {
  for (const field of ["name", "branch"]) {
    const selected = { ...hook, [field]: capability };
    const s = scope();
    s.workers[0].hooks = [selected];
    const d = deployHookDescriptor(s), p = d.prepare(args);
    const reflected = { ...row(), deploy_hook_name: selected.name, branch: selected.branch, deploy_hook_uuid: undefined };
    assert.throws(() => d.project(success([reflected, { ...row(), deploy_hook_name: "Unselected" }]), p), /scope/);
  }
});

test("Cloudflare deploy-hook malformed foreign changed duplicate and oversized responses refuse", () => {
  const d = deployHookDescriptor(scope()), p = d.prepare(args);
  for (const patch of [{ account_id: foreign }, { external_script_id: foreign }, { external_script_id: undefined },
    { branch: "other" }, { branch: undefined }, { deploy_hook_uuid: "invalid" }, { deploy_hook_name: null }])
    assert.throws(() => d.project(success([{ ...row(), ...patch }]), p), /scope|schema/);
  assert.throws(() => d.project(success([row(), row()]), p), /scope/);
  for (const raw of ["null", "bad-json", "{}", success(null), success({}), success([null]),
    JSON.stringify({ success: true, result: [] }), JSON.stringify({ success: false, errors: [], result: [] }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: [] })])
    assert.throws(() => d.project(raw, p), /scope|upstream/);
  assert.throws(() => d.project(success(Array(1001).fill({ deploy_hook_name: "Other" })), p), /cap/);
  assert.throws(() => d.project(success([{ ...row(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare deploy-hook default-empty scope and model overrides deny before credentials", async () => {
  for (const workers of [[], [{ ...scope().workers[0], hooks: [] }]]) {
    const f = fixture({ workers });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  for (const patch of [{ scriptName: "other" }, { scriptTag }, { deployHookUuid: capability }, { page: 2 }, { accountId: foreign },
    { headers: {} }, { approval: "forged" }, { agentId: "other-agent" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare deploy-hook actual-core GET retains redaction audit cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(p.plan.providerOperationId, "listDeployHooks");
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.items, [hook]);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(record => record.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
  assert.ok(!JSON.stringify(p).includes(capability));
});

test("Cloudflare deploy-hook current agent resource binding and lease-time policy deny before network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const out = await f.invoke();
    assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0);
    safe(f, out);
  }
});

test("Cloudflare deploy-hook upstream and audit outages preserve uncertain replay tombstones", async () => {
  for (const failure of ["foreign", "branch", "denied", "not-found", "audit"]) {
    const response = row();
    if (failure === "foreign") response.account_id = foreign;
    if (failure === "branch") response.branch = "other";
    const f = fixture({ response: [response], status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    if (failure === "audit") {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.requests.length, 1);
      f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});
