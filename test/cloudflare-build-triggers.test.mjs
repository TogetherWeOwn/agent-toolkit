import assert from "node:assert/strict";
import test from "node:test";
import { buildTriggerDescriptor } from "../dist/plugins/cloudflare-broker/src/build-triggers.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const scriptTag = "b".repeat(32);
const foreign = "f".repeat(32);
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const args = { scriptTag };
const tool = "cloudflare.workers.builds.triggers.list";
const repository = { provider: "github", owner: "example-owner", name: "safe-repo" };
const selected = () => ({ id, repository: { ...repository }, branchIncludes: ["main", "release/*"], branchExcludes: ["release/private-*"] });
const scope = () => ({ accountId: account, revision: "resource-1", workers: [{ scriptTag, triggers: [selected()] }] });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const triggerRow = () => ({ trigger_uuid: id, external_script_id: scriptTag,
  repo_connection: { provider_type: repository.provider, provider_account_name: repository.owner, repo_name: repository.name,
    repo_connection_uuid: credentialCanary, repo_id: derivedCanary, provider_account_id: credentialCanary },
  branch_includes: ["release/*", "main"], branch_excludes: ["release/private-*"], trigger_name: credentialCanary,
  build_command: credentialCanary, deploy_command: derivedCanary, root_directory: credentialCanary,
  build_token_uuid: credentialCanary, path_includes: [derivedCanary], environment_variables: { PRIVATE: credentialCanary } });
function fixture({ workers = scope().workers, response = [triggerRow()], status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    workerBuildConfigurations: [{ scriptTag, repository: { ...repository, branch: "main" } }], workerBuildTriggers: workers },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
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
  return { ...f, requests, operation, invoke: (value = args, key = "call-a") => broker.call(tool, value, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, other, "build_command", "deploy_command", "build_token_uuid", "environment_variables", "root_directory", "trigger_name", "repo_connection_uuid"])
    assert.ok(!data.includes(value), value);
}

test("Cloudflare build trigger scope snapshots independent tag, UUID, repository and patterns", () => {
  const s = scope();
  const d = buildTriggerDescriptor(s);
  s.accountId = foreign;
  s.workers[0].triggers[0].repository.owner = "changed";
  s.workers[0].triggers[0].branchIncludes.push("other");
  s.workers[0].triggers.push({ ...selected(), id: other });
  const p = d.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/builds/workers/${scriptTag}/triggers`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker-build:${scriptTag}:triggers`);
  assert.equal(p.resource.revision, "resource-1");
  assert.equal(d.providerOperationId, "listTriggersByScript");
  assert.equal(d.tier, "read");
  const out = d.project(success([triggerRow()]), p);
  assert.deepEqual(out.triggers[0], selected());
  for (const value of [d, p, p.arguments, p.resource, p.request, out, out.triggers, out.triggers[0], out.triggers[0].repository, out.triggers[0].branchIncludes]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.prepare({ scriptTag: foreign }), /scope/);
  assert.throws(() => d.project(success([]), { ...p }), /scope/);
  assert.throws(() => buildTriggerDescriptor(scope()).project(success([]), p), /scope/);
});

test("Cloudflare build trigger scope refuses ambiguous identities and malformed or oversized selections", () => {
  const worker = scope().workers[0];
  for (const workers of [[worker, worker], [null], [{ ...worker, scriptTag: "safe-worker" }],
    [{ ...worker, triggers: [selected(), selected()] }], [{ ...worker, triggers: [null] }],
    [{ ...worker, triggers: [{ ...selected(), repository: undefined }] }],
    [{ ...worker, triggers: [{ ...selected(), repository: { ...repository, provider: "unknown" } }] }]])
    assert.throws(() => buildTriggerDescriptor({ ...scope(), workers }), /schema/);
  for (const value of ["../main", "main//other", "main/", "main\n", "https://example.com", "x?", ""]) {
    assert.throws(() => buildTriggerDescriptor({ ...scope(), workers: [{ ...worker, triggers: [{ ...selected(), branchIncludes: [value] }] }] }), /schema/);
  }
  for (const branchIncludes of [undefined, ["main", "main"], Array(101).fill("main")])
    assert.throws(() => buildTriggerDescriptor({ ...scope(), workers: [{ ...worker, triggers: [{ ...selected(), branchIncludes }] }] }), /schema|cap/);
  assert.throws(() => buildTriggerDescriptor({ ...scope(), workers: Array(101).fill(worker) }), /cap/);
  assert.throws(() => buildTriggerDescriptor({ ...scope(), workers: [{ ...worker, triggers: Array(101).fill(selected()) }] }), /cap/);
});

test("Cloudflare build triggers filter exact selections and preserve unavailable linkage without absence claims", () => {
  for (const provider of ["github", "gitlab", "gitlab_internal", "origin"]) {
    const s = scope();
    s.workers[0].triggers[0].repository.provider = provider;
    const d = buildTriggerDescriptor(s);
    const row = triggerRow();
    row.repo_connection.provider_type = provider;
    const out = d.project(success([{ trigger_uuid: other, external_script_id: scriptTag, trigger_name: credentialCanary }, row]), d.prepare(args));
    assert.deepEqual(out, { scriptTag, triggers: [{ ...selected(), repository: { ...repository, provider } }], complete: false,
      subject: "configured-worker-build-triggers", servingDeployment: "not-established", productionConsumer: "not-established" });
    safe({ audit: [], journal: [] }, out);
  }
  const d = buildTriggerDescriptor(scope());
  const p = d.prepare(args);
  assert.equal(d.project(success([]), p).complete, false);
  assert.deepEqual(d.project(success([{ trigger_uuid: id, external_script_id: scriptTag }]), p).triggers,
    [{ id, repository: "unavailable", branchIncludes: "unavailable", branchExcludes: "unavailable" }]);
  for (const field of ["provider_type", "provider_account_name", "repo_name"]) {
    const row = triggerRow(); delete row.repo_connection[field];
    assert.equal(d.project(success([row]), p).triggers[0].repository, "unavailable");
  }
  const emptyScope = scope(); emptyScope.workers[0].triggers[0].branchIncludes = []; emptyScope.workers[0].triggers[0].branchExcludes = [];
  const empty = buildTriggerDescriptor(emptyScope);
  assert.deepEqual(empty.project(success([{ ...triggerRow(), branch_includes: [], branch_excludes: [] }]), empty.prepare(args)).triggers[0].branchIncludes, []);
});

test("Cloudflare build triggers refuse changed associations, duplicates, malformed envelopes and bounds", () => {
  const d = buildTriggerDescriptor(scope());
  const p = d.prepare(args);
  for (const patch of [{ external_script_id: foreign }, { external_script_id: undefined }, { account_id: foreign },
    { repo_connection: null }, { branch_includes: ["other"] }, { branch_excludes: [] }, { branch_includes: null },
    { branch_includes: ["main", "main"] }, { trigger_uuid: undefined }, { trigger_uuid: "bad" }])
    assert.throws(() => d.project(success([{ ...triggerRow(), ...patch }]), p), /scope|upstream|schema|cap/);
  for (const field of ["provider_type", "provider_account_name", "repo_name"]) {
    const row = triggerRow(); row.repo_connection[field] = "changed";
    assert.throws(() => d.project(success([row]), p), /scope/);
    delete row.repo_connection[field === "repo_name" ? "provider_type" : "repo_name"];
    assert.throws(() => d.project(success([row]), p), /scope/);
  }
  assert.throws(() => d.project(success([triggerRow(), triggerRow()]), p), /scope/);
  assert.throws(() => d.project(success(Array(1001).fill({})), p), /cap/);
  for (const raw of ["null", "bad-json", "{}", success(null), success({}), success([null]),
    JSON.stringify({ success: true, result: [] }), JSON.stringify({ success: false, errors: [], result: [] }),
    JSON.stringify({ success: true, errors: [credentialCanary], result: [] }),
    JSON.stringify({ success: true, errors: [], result: [], account_id: foreign }),
    JSON.stringify({ success: true, errors: [], result: [], external_script_id: foreign })])
    assert.throws(() => d.project(raw, p), /scope|upstream/);
  assert.throws(() => d.project(success([{ ...triggerRow(), padding: "x".repeat(131072) }]), p), /cap/);
  const big = scope();
  big.workers[0].triggers[0].branchIncludes = Array.from({ length: 100 }, (_, i) => `${i}${"x".repeat(250)}`);
  big.workers[0].triggers[0].branchExcludes = [...big.workers[0].triggers[0].branchIncludes];
  const bounded = buildTriggerDescriptor(big);
  assert.throws(() => bounded.project(success([{ ...triggerRow(), branch_includes: big.workers[0].triggers[0].branchIncludes,
    branch_excludes: big.workers[0].triggers[0].branchExcludes }]), bounded.prepare(args)), /cap/);
});

test("Cloudflare build trigger independent default-empty scope and closed overrides deny before credentials", async () => {
  for (const workers of [[], [{ scriptTag, triggers: [] }]]) {
    const f = fixture({ workers });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  for (const patch of [{ scriptTag: foreign }, { scriptTag: "safe-worker" }, { scriptTag: `${scriptTag}\n` },
    { scriptName: "safe-worker" }, { accountId: foreign }, { page: 2 }, { headers: {} }, { agentId: "other" },
    { repository }, { approval: "forged" }, { triggerId: id }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare build trigger actual-core fixed GET retains redaction, audit, cleanup and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "listTriggersByScript");
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.triggers, [selected()]);
  assert.equal(out.value.complete, false);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare build trigger current agent, resource, binding and lease-time policy revoke before network", async () => {
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

test("Cloudflare build trigger upstream and audit failures preserve uncertain replay tombstones", async () => {
  for (const failure of ["foreign", "repository", "denied", "not-found", "audit"]) {
    const row = triggerRow();
    if (failure === "foreign") row.account_id = foreign;
    if (failure === "repository") row.repo_connection.repo_name = "other";
    const f = fixture({ response: [row], status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      f.dependencies.audit.append = append;
    }
    const replay = await f.invoke();
    assert.equal(replay.code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, replay); safe(f, out);
  }
});
