import assert from "node:assert/strict";
import test from "node:test";
import { workerBuildDescriptor } from "../dist/plugins/cloudflare-broker/src/worker-builds.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const scriptTag = "b".repeat(32);
const foreign = "f".repeat(32);
const args = { scriptTag };
const tool = "cloudflare.workers.builds.configuration.get";
const repository = { provider: "github", owner: "example-owner", name: "safe-repo", branch: "main" };
const scope = () => ({ accountId: account, revision: "resource-1", workers: [{ scriptTag, repository: { ...repository } }] });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const buildRow = () => ({ script_tag: scriptTag, git_repository: { provider_type: repository.provider,
  provider_account_name: repository.owner, repo_name: repository.name, branch: repository.branch,
  grant_id: credentialCanary, repo_id: derivedCanary, provider_account_id: credentialCanary }, previews_enabled: false,
  production_settings: { build_command: credentialCanary, deploy_command: derivedCanary, build_token_uuid: credentialCanary,
    environment_variables: { PRIVATE: { value: derivedCanary } }, root_directory: credentialCanary },
  previews_base_config: { proposed_deploy_command: credentialCanary } });
function fixture({ workers = scope().workers, response = buildRow(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    workerBuildConfigurations: workers }, { accountId: account, revision: "resource-1" }, async (url, init) => {
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
  for (const value of [credentialCanary, derivedCanary, foreign, "build_command", "deploy_command", "build_token_uuid", "environment_variables", "grant_id", "repo_id", "root_directory"]) assert.ok(!data.includes(value), value);
}

test("Cloudflare Worker build configuration snapshots tag and independent repository scope", () => {
  const s = scope();
  const d = workerBuildDescriptor(s);
  s.accountId = foreign;
  s.workers[0].repository.owner = "changed";
  s.workers.push({ scriptTag: foreign, repository });
  const p = d.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/builds/workers/${scriptTag}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker-build:${scriptTag}`);
  assert.equal(p.resource.revision, "resource-1");
  assert.equal(d.providerOperationId, "getWorkerBuild");
  assert.equal(d.tier, "read");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.project(success(buildRow()), p).repository, repository);
  assert.throws(() => d.prepare({ scriptTag: foreign }), /scope/);
  assert.throws(() => d.project(success(buildRow()), { ...p }), /scope/);
  assert.throws(() => workerBuildDescriptor(scope()).project(success(buildRow()), p), /scope/);
});

test("Cloudflare Worker build scope refuses invalid, ambiguous or oversized selections", () => {
  const selected = scope().workers[0];
  for (const workers of [[selected, selected], [null], [{ ...selected, scriptTag: "safe-worker" }],
    [{ ...selected, repository: undefined }], [{ ...selected, repository: { ...repository, provider: "unknown" } }]]) {
    assert.throws(() => workerBuildDescriptor({ ...scope(), workers }), /schema/);
  }
  for (const branch of ["../main", "main//other", "main/", "main.lock", "main.", "main\n", "*"])
    assert.throws(() => workerBuildDescriptor({ ...scope(), workers: [{ scriptTag, repository: { ...repository, branch } }] }), /schema/);
  for (const owner of ["../owner", "bad\n", "https://example.com", "owner/group"])
    assert.throws(() => workerBuildDescriptor({ ...scope(), workers: [{ scriptTag, repository: { ...repository, owner } }] }), /schema/);
  assert.throws(() => workerBuildDescriptor({ ...scope(), workers: Array(101).fill(selected) }), /cap/);
});

test("Cloudflare Worker builds project selected configured linkage without serving or consumer inference", () => {
  for (const provider of ["github", "gitlab", "gitlab_internal", "origin"]) {
    const s = scope();
    s.workers[0].repository.provider = provider;
    const d = workerBuildDescriptor(s);
    for (const previews of [false, true, undefined]) {
      const row = buildRow();
      row.git_repository.provider_type = provider;
      row.previews_enabled = previews;
      const out = d.project(success(row), d.prepare(args));
      assert.deepEqual(out, { scriptTag, repository: { ...repository, provider }, previewsEnabled: previews ?? "unavailable",
        subject: "configured-worker-build", servingDeployment: "not-established", productionConsumer: "not-established" });
      assert.ok(Object.isFrozen(out));
      assert.ok(Object.isFrozen(out.repository));
      safe({ audit: [], journal: [] }, out);
    }
  }
  const d = workerBuildDescriptor(scope());
  const p = d.prepare(args);
  assert.equal(d.project(success({ script_tag: scriptTag }), p).repository, "unavailable");
  for (const field of ["provider_type", "provider_account_name", "repo_name", "branch"]) {
    const row = buildRow();
    delete row.git_repository[field];
    assert.equal(d.project(success(row), p).repository, "unavailable");
  }
});

test("Cloudflare Worker builds refuse foreign associations, malformed envelopes and byte bounds", () => {
  const d = workerBuildDescriptor(scope());
  const p = d.prepare(args);
  for (const patch of [{ script_tag: foreign }, { script_tag: undefined }, { account_id: foreign }])
    assert.throws(() => d.project(success({ ...buildRow(), ...patch }), p), /scope/);
  for (const field of ["provider_type", "provider_account_name", "repo_name", "branch"]) {
    for (const value of [null, credentialCanary, "different", 7]) {
      const row = buildRow();
      row.git_repository[field] = value;
      assert.throws(() => d.project(success(row), p), /scope/);
    }
  }
  for (const git_repository of [null, [], false]) assert.throws(() => d.project(success({ ...buildRow(), git_repository }), p), /upstream/);
  for (const previews_enabled of [null, "false", 1]) assert.throws(() => d.project(success({ ...buildRow(), previews_enabled }), p), /upstream/);
  for (const raw of ["null", "bad-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: buildRow() }),
    JSON.stringify({ success: false, errors: [], result: buildRow() }), JSON.stringify({ success: true, errors: [credentialCanary], result: buildRow() })])
    assert.throws(() => d.project(raw, p), /scope|upstream/);
  assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: buildRow(), account_id: foreign }), p), /scope/);
  assert.throws(() => d.project(success({ ...buildRow(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare Worker build default-empty independent scope and closed overrides deny before credentials", async () => {
  const empty = fixture({ workers: [] });
  assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(empty.calls.secret, 0);
  assert.equal(empty.requests.length, 0);
  for (const patch of [{ scriptTag: foreign }, { scriptTag: "safe-worker" }, { scriptTag: `${scriptTag}\n` },
    { scriptName: "safe-worker" }, { accountId: foreign }, { page: 2 }, { headers: {} }, { agentId: "other" },
    { repository }, { approval: "forged" }, { environment: "production" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare Worker build actual-core fixed GET retains redaction, audit, cleanup and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "getWorkerBuild");
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.repository, repository);
  assert.equal(out.value.servingDeployment, "not-established");
  assert.equal(out.value.productionConsumer, "not-established");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare Worker build current agent, resource, binding and lease-time policy revoke before network", async () => {
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

test("Cloudflare Worker build upstream and audit failures preserve uncertain replay tombstones", async () => {
  for (const failure of ["foreign", "repository", "denied", "not-found", "audit"]) {
    const response = buildRow();
    if (failure === "foreign") response.account_id = foreign;
    if (failure === "repository") response.git_repository.repo_name = "other";
    const f = fixture({ response, status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      f.dependencies.audit.append = append;
    }
    const replay = await f.invoke();
    assert.equal(replay.code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, replay);
    safe(f, out);
  }
});
