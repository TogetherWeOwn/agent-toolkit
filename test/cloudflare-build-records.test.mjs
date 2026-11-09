import assert from "node:assert/strict";
import test from "node:test";
import { buildRecordDescriptors } from "../dist/plugins/cloudflare-broker/src/build-records.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const scriptTag = "b".repeat(32);
const foreign = "f".repeat(32);
const buildId = "11111111-1111-4111-8111-111111111111";
const triggerId = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const scope = () => ({ accountId: account, revision: "resource-1", workers: [{ scriptTag, builds: [{ buildId, triggerId }] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const buildRow = () => ({ build_uuid: buildId, status: "stopped", build_outcome: "success",
  trigger: { trigger_uuid: triggerId, external_script_id: scriptTag, build_command: credentialCanary,
    deploy_command: derivedCanary, repo_connection: { repo_name: credentialCanary }, root_directory: credentialCanary },
  build_trigger_metadata: { author: credentialCanary, commit_message: derivedCanary, commit_hash: credentialCanary,
    branch: credentialCanary, environment_variables: { PRIVATE: derivedCanary }, build_token_uuid: credentialCanary },
  preview_url: credentialCanary, created_on: derivedCanary, pull_request: { pull_request_url: credentialCanary } });
const cases = [
  ["buildsList", { scriptTag }, "listBuildsByScript", `/accounts/${account}/builds/workers/${scriptTag}/builds?page=1&per_page=100`],
  ["buildGet", { scriptTag, buildId }, "getBuildByUuid", `/accounts/${account}/builds/builds/${buildId}`],
];
function result(key, row = buildRow()) { return key === "buildsList" ? [row] : row; }
function fixture(key, { workers = scope().workers, response = result(key), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const args = cases.find(item => item[0] === key)[1];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    workerBuildConfigurations: [{ scriptTag, repository: { provider: "github", owner: "example", name: "safe-repo", branch: "main" } }],
    workerBuildRecords: workers }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const tool = `cloudflare.workers.builds.records.${key === "buildsList" ? "list" : "get"}`;
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
  for (const value of [credentialCanary, derivedCanary, foreign, other, "build_command", "deploy_command", "build_token_uuid", "environment_variables", "root_directory", "preview_url", "commit_message", "repo_connection"])
    assert.ok(!data.includes(value), value);
}

test("Cloudflare build records snapshot independent tag/build/trigger scope and fixed requests", () => {
  const s = scope();
  const descriptors = buildRecordDescriptors(s);
  s.accountId = foreign; s.workers[0].builds[0].triggerId = other; s.workers[0].builds.push({ buildId: other, triggerId });
  for (const [key, args, operation, path] of cases) {
    const d = descriptors[key];
    const p = d.prepare(args);
    assert.equal(p.request.path, path);
    assert.equal(p.resource.id, `cloudflare:account:${account}:worker-build:${scriptTag}:${key === "buildsList" ? "builds" : `build:${buildId}`}`);
    assert.equal(p.resource.revision, "resource-1");
    assert.equal(d.providerOperationId, operation); assert.equal(d.tier, "read");
    const out = d.project(success(result(key)), p);
    assert.deepEqual(out.builds, [{ buildId, triggerId, status: "stopped", outcome: "success" }]);
    for (const value of [d, p, p.arguments, p.resource, p.request, out, out.builds, out.builds[0]]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d.project(success(result(key)), { ...p }), /scope/);
    assert.throws(() => buildRecordDescriptors(scope())[key].project(success(result(key)), p), /scope/);
  }
  assert.throws(() => descriptors.buildGet.prepare({ scriptTag, buildId: other }), /scope/);
});

test("Cloudflare build record scope rejects ambiguous or malformed associations and caps", () => {
  const worker = scope().workers[0];
  for (const workers of [[worker, worker], [null], [{ ...worker, scriptTag: "safe-worker" }],
    [{ ...worker, builds: [worker.builds[0], worker.builds[0]] }], [{ ...worker, builds: [null] }],
    [{ ...worker, builds: [{ buildId, triggerId: "bad" }] }],
    [worker, { scriptTag: foreign, builds: worker.builds }]])
    assert.throws(() => buildRecordDescriptors({ ...scope(), workers }), /schema/);
  assert.throws(() => buildRecordDescriptors({ ...scope(), workers: Array(101).fill(worker) }), /cap/);
  assert.throws(() => buildRecordDescriptors({ ...scope(), workers: [{ ...worker, builds: Array(101).fill(worker.builds[0]) }] }), /cap/);
});

test("Cloudflare build records preserve provider statuses, null and unavailable without serving claims", () => {
  const descriptors = buildRecordDescriptors(scope());
  for (const [key, args] of cases) {
    const d = descriptors[key]; const p = d.prepare(args);
    for (const status of ["queued", "initializing", "running", "stopped", undefined]) {
      for (const build_outcome of ["success", "fail", "skipped", "cancelled", "terminated", null, undefined]) {
        const out = d.project(success(result(key, { ...buildRow(), status, build_outcome })), p);
        assert.deepEqual(out.builds[0], { buildId, triggerId, status: status ?? "unavailable", outcome: build_outcome === undefined ? "unavailable" : build_outcome });
        assert.equal(out.complete, false); assert.equal(out.servingDeployment, "not-established"); assert.equal(out.productionConsumer, "not-established");
        safe({ audit: [], journal: [] }, out);
      }
    }
  }
  const d = descriptors.buildsList; const p = d.prepare({ scriptTag });
  assert.deepEqual(d.project(success([{ build_uuid: other, trigger: null }, buildRow()]), p).builds,
    [{ buildId, triggerId, status: "stopped", outcome: "success" }]);
  assert.equal(d.project(success([]), p).complete, false);
});

test("Cloudflare build records refuse mismatched identity, drift, malformed envelopes and bounds", () => {
  const descriptors = buildRecordDescriptors(scope());
  for (const [key, args] of cases) {
    const d = descriptors[key]; const p = d.prepare(args);
    for (const patch of [{ account_id: foreign }, { external_script_id: foreign }, { build_uuid: "bad" }, { build_uuid: undefined },
      { status: null }, { status: "unknown" }, { build_outcome: false }, { build_outcome: "unknown" }, { trigger: null },
      { trigger: {} }, { trigger: { external_script_id: foreign, trigger_uuid: triggerId } },
      { trigger: { external_script_id: scriptTag, trigger_uuid: other } },
      { trigger: { external_script_id: scriptTag, trigger_uuid: triggerId, account_id: foreign } }])
      assert.throws(() => d.project(success(result(key, { ...buildRow(), ...patch })), p), /scope|schema|upstream/);
    for (const raw of ["null", "bad-json", "{}", success(null), success([null]), JSON.stringify({ success: true, result: result(key) }),
      JSON.stringify({ success: false, errors: [], result: result(key) }), JSON.stringify({ success: true, errors: [credentialCanary], result: result(key) }),
      JSON.stringify({ success: true, errors: [], account_id: foreign, result: result(key) })])
      assert.throws(() => d.project(raw, p), /scope|schema|upstream/);
    assert.throws(() => d.project(success(result(key, { ...buildRow(), padding: "x".repeat(131072) })), p), /cap/);
  }
  const list = descriptors.buildsList; const p = list.prepare({ scriptTag });
  assert.throws(() => list.project(success([buildRow(), buildRow()]), p), /scope/);
  assert.throws(() => list.project(success(Array(101).fill(buildRow())), p), /cap/);
  assert.throws(() => descriptors.buildGet.project(success({ ...buildRow(), build_uuid: other }), descriptors.buildGet.prepare({ scriptTag, buildId })), /scope/);
});

test("Cloudflare build record independent default-empty scope and closed overrides deny before credentials", async () => {
  for (const [key, args] of cases) {
    for (const workers of [[], [{ scriptTag, builds: [] }]]) {
      const f = fixture(key, { workers });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ scriptTag: foreign }, { scriptTag: "safe-worker" }, { accountId: foreign }, { headers: {} }, { agentId: "other" },
      { approval: "forged" }, { page: 2 }, { perPage: 200 }, { triggerId }, ...(key === "buildGet" ? [{ buildId: other }] : [{ buildId }])]) {
      const f = fixture(key);
      assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare build records actual-core fixed GET retains redaction, audit, cleanup and replay", async () => {
  for (const [key, args, operation, path] of cases) {
    const f = fixture(key); const p = f.operation.prepare(args);
    assert.equal(p.plan.providerDryRun, false); assert.equal(p.plan.providerOperationId, operation);
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.deepEqual(out.value.builds, [{ buildId, triggerId, status: "stopped", outcome: "success" }]);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${path}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  }
});

test("Cloudflare build records current agent, resource, binding and lease-time policy revoke before network", async () => {
  for (const [key] of cases) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(key);
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const out = await f.invoke();
    assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0); assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0); safe(f, out);
  }
});

test("Cloudflare build records upstream and audit failures preserve uncertain replay tombstones", async () => {
  for (const [key] of cases) for (const failure of ["foreign", "trigger", "denied", "not-found", "audit"]) {
    const row = buildRow();
    if (failure === "foreign") row.account_id = foreign;
    if (failure === "trigger") row.trigger.trigger_uuid = other;
    const f = fixture(key, { response: result(key, row), status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal); f.dependencies.audit.append = append;
    }
    const replay = await f.invoke(); assert.equal(replay.code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal);
    safe(f, replay); safe(f, out);
  }
});
