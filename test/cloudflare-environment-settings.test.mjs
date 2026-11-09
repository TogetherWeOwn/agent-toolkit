import assert from "node:assert/strict";
import test from "node:test";
import { environmentSettingsDescriptor } from "../dist/plugins/cloudflare-broker/src/environment-settings.js";
import { scriptSettingsDescriptors } from "../dist/plugins/cloudflare-broker/src/script-settings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32);
const args = { serviceName: "safe-worker", environmentName: "production" };
const tool = "cloudflare.workers.environment_settings.get";
const scope = () => ({ accountId: account, revision: "resource-1", environments: [{ ...args }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ logpush: false, observability: { enabled: true, head_sampling_rate: 0,
  logs: { enabled: true, head_sampling_rate: null, invocation_logs: false, persist: true, destinations: [credentialCanary] },
  traces: { enabled: false, head_sampling_rate: 1, persist: false, propagation_policy: "authenticated", destinations: [derivedCanary] } },
  tags: [credentialCanary], tail_consumers: [{ service: derivedCanary }], source: credentialCanary });
function fixture({ allowed = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [args.serviceName], hyperdriveIds: [],
    workerObservabilityScriptNames: [args.serviceName], ...(allowed ? { workerEnvironmentSettings: [{ ...args }] } : {}) },
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
  for (const omitted of [credentialCanary, derivedCanary, "destinations", "tail_consumers", "tags", '"source"'])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare environment settings scope snapshots exact pairs and bounded request identity", () => {
  const s = scope(), d = environmentSettingsDescriptor(s);
  s.environments[0].serviceName = "other"; s.environments[0].environmentName = "preview"; s.accountId = foreign;
  const p = d.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/workers/services/safe-worker/environments/production/settings`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker-service:safe-worker:environment:production:settings`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.maxRequests, 1); assert.equal(p.request.redirects, "deny");
  for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  for (const environments of [undefined, []]) assert.throws(() => environmentSettingsDescriptor({ ...scope(), environments }).prepare(args), /scope/);
});

test("Cloudflare environment settings rejects malformed duplicate oversized and cross-paired scope", () => {
  for (const environments of [null, [args, args], Array(101).fill(args), [{ ...args, serviceName: "../escape" }],
    [{ ...args, environmentName: "production\n" }], [{ ...args, serviceName: "x".repeat(64) }]])
    assert.throws(() => environmentSettingsDescriptor({ ...scope(), environments }), /schema|cap/);
  const d = environmentSettingsDescriptor({ ...scope(), environments: [args, { serviceName: "other", environmentName: "preview" }] });
  for (const input of [{ ...args, serviceName: "other" }, { ...args, environmentName: "preview" },
    { ...args, environmentName: "production%2fsettings" }, { ...args, page: 1 }]) assert.throws(() => d.prepare(input), /scope|schema/);
});

test("Cloudflare environment settings reuses the identical configured-only script projection without destinations", () => {
  const d = environmentSettingsDescriptor(scope()), p = d.prepare(args), out = d.project(success(row()), p);
  const script = scriptSettingsDescriptors({ accountId: account, revision: "resource-1", observabilityScriptNames: [args.serviceName] }).scriptSettingsGet;
  const existing = script.project(success(row()), script.prepare({ scriptName: args.serviceName }));
  assert.deepEqual(out.observability, existing.observability); assert.equal(out.logpush, false);
  assert.equal(out.observability.headSamplingRate, 0); assert.equal(out.observability.logs.headSamplingRate, null);
  assert.equal(out.observability.traces.propagationPolicy, "authenticated");
  assert.equal(out.effectiveCollection, "not-established"); assert.equal(out.subject, "configured-worker-environment-settings");
  for (const value of [out, out.observability, out.observability.logs, out.observability.traces]) assert.ok(Object.isFrozen(value));
  assert.ok(!JSON.stringify(out).includes(credentialCanary)); assert.ok(!JSON.stringify(out).includes(derivedCanary));
  assert.equal(d.project(success({}), p).observability, "unavailable");
  assert.equal(d.project(success({ observability: null }), p).observability, null);
  assert.equal(d.project(success({ observability: { issues: null, logs: null, traces: null } }), p).observability.logs, null);
  for (const rate of [null, 0, 0.5, 1])
    assert.equal(d.project(success({ observability: { head_sampling_rate: rate } }), p).observability.headSamplingRate, rate);
});

test("Cloudflare environment settings refuses malformed values envelopes explicit foreign context and caps", () => {
  const d = environmentSettingsDescriptor(scope()), p = d.prepare(args);
  for (const value of [{ logpush: null }, { logpush: "false" }, { observability: [] }, { observability: { logs: true } },
    { observability: { head_sampling_rate: -1 } }, { observability: { head_sampling_rate: 1.1 } },
    { observability: { traces: { propagation_policy: "arbitrary" } } }, { account_id: foreign },
    { service_name: "other" }, { environment_name: "preview" }]) assert.throws(() => d.project(success(value), p), /upstream|scope/);
  for (const raw of ["null", "bad-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: {} }),
    JSON.stringify({ success: true, errors: ["failure"], result: {} }),
    JSON.stringify({ success: true, errors: [], environment_name: "preview", result: {} })])
    assert.throws(() => d.project(raw, p), /upstream|scope/);
  assert.throws(() => d.project(success({ padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare environment settings is independently denied before credentials despite script visibility", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { agentId: "other" }, { headers: {} }, { approval: "forged" },
    { scriptName: args.serviceName }, { include: "source" }, { observability: true }]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare environment settings actual-core GET retains redaction audit lease cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.equal(out.value.logpush, false);
  assert.equal(p.plan.providerOperationId, "worker-script-environment-get-settings");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare environment settings current agent resource ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare environment settings drift availability and audit outages preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: { ...row(), environment_name: "preview" } }, { auditFailure: true }]) {
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
