import assert from "node:assert/strict";
import test from "node:test";
import { scriptSettingsDescriptors } from "../dist/plugins/cloudflare-broker/src/script-settings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const foreign = "f".repeat(32);
const args = { scriptName: "safe-worker" };
const tools = ["cloudflare.workers.script_settings.get", "cloudflare.workers.usage_model.get"];
const scope = () => ({ accountId: account, revision: "resource-1", observabilityScriptNames: [args.scriptName], usageModelScriptNames: [args.scriptName] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = () => ({ logpush: false, observability: { enabled: true, head_sampling_rate: 0.25, redact_query_string: true,
  issues: { enabled: false }, logs: { enabled: true, head_sampling_rate: null, invocation_logs: false, persist: true, destinations: [credentialCanary] },
  traces: { enabled: false, head_sampling_rate: 0, persist: false, propagation_policy: "authenticated", destinations: [derivedCanary] } },
  tags: [credentialCanary], tail_consumers: [{ service: derivedCanary }], usage_model: "standard", user_limits: { cpu_ms: 50 },
  source: credentialCanary, logs: [derivedCanary] });
function fixture({ tool = tools[0], observability = [args.scriptName], usage = [args.scriptName], response = result(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [args.scriptName], hyperdriveIds: [],
    workerObservabilityScriptNames: observability, workerUsageModelScriptNames: usage }, { accountId: account, revision: "resource-1" }, async (url, init) => {
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
  return { ...f, requests, operation, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "destinations", "tail_consumers", '"tags"', '"source"']) assert.ok(!data.includes(value));
}

test("Cloudflare script settings scopes snapshot independently and bind exact request resources", () => {
  const s = scope();
  const d = scriptSettingsDescriptors(s);
  s.accountId = foreign;
  s.revision = "changed";
  s.observabilityScriptNames.push("other-worker");
  s.usageModelScriptNames.push("other-worker");
  for (const [descriptor, suffix] of [[d.scriptSettingsGet, "script-settings"], [d.usageModelGet, "usage-model"]]) {
    const p = descriptor.prepare(args);
    assert.equal(p.request.path, `/accounts/${account}/workers/scripts/safe-worker/${suffix}`);
    assert.equal(p.resource.id, `cloudflare:account:${account}:worker:safe-worker:${suffix}`);
    assert.equal(p.resource.revision, "resource-1");
    for (const value of [descriptor, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
    assert.throws(() => descriptor.prepare({ scriptName: "other-worker" }), /scope/);
    assert.throws(() => descriptor.project(success(result()), { ...p }), /scope/);
  }
  assert.throws(() => d.usageModelGet.project(success(result()), d.scriptSettingsGet.prepare(args)), /scope/);
  assert.throws(() => scriptSettingsDescriptors(scope()).scriptSettingsGet.project(success(result()), d.scriptSettingsGet.prepare(args)), /scope/);
  for (const key of ["observabilityScriptNames", "usageModelScriptNames"]) {
    for (const names of [[args.scriptName, args.scriptName], ["../escape"], ["worker\n"], ["x".repeat(64)]]) {
      assert.throws(() => scriptSettingsDescriptors({ ...scope(), [key]: names }), /schema/);
    }
    assert.throws(() => scriptSettingsDescriptors({ ...scope(), [key]: Array(101).fill(args.scriptName) }), /cap/);
  }
});

test("Cloudflare script observability returns configured flags only without destination or log data", () => {
  const d = scriptSettingsDescriptors(scope()).scriptSettingsGet;
  const out = d.project(success(result()), d.prepare(args));
  assert.deepEqual(out, { scriptName: args.scriptName, logpush: false,
    observability: { enabled: true, headSamplingRate: 0.25, redactQueryString: true, issues: { enabled: false },
      logs: { enabled: true, headSamplingRate: null, invocationLogs: false, persist: true },
      traces: { enabled: false, headSamplingRate: 0, persist: false, propagationPolicy: "authenticated" } },
    subject: "configured-worker-script-settings", effectiveCollection: "not-established" });
  for (const value of [out, out.observability, out.observability.issues, out.observability.logs, out.observability.traces]) assert.ok(Object.isFrozen(value));
  for (const policy of ["accept", null]) assert.equal(d.project(success({ observability: { traces: { propagation_policy: policy } } }), d.prepare(args)).observability.traces.propagationPolicy, policy);
});

test("Cloudflare script settings preserve omitted, null and configured zero or false without defaults", () => {
  const { scriptSettingsGet: d, usageModelGet: u } = scriptSettingsDescriptors(scope());
  assert.deepEqual(d.project(success({}), d.prepare(args)), { scriptName: args.scriptName, logpush: "unavailable", observability: "unavailable",
    subject: "configured-worker-script-settings", effectiveCollection: "not-established" });
  assert.equal(d.project(success({ observability: null }), d.prepare(args)).observability, null);
  const out = d.project(success({ observability: { head_sampling_rate: null, issues: null, logs: null, traces: {} } }), d.prepare(args)).observability;
  assert.equal(out.enabled, "unavailable");
  assert.equal(out.headSamplingRate, null);
  assert.equal(out.issues, null);
  assert.equal(out.logs, null);
  assert.equal(out.traces.persist, "unavailable");
  assert.equal(out.traces.propagationPolicy, "unavailable");
  assert.deepEqual(u.project(success({}), u.prepare(args)), { scriptName: args.scriptName, usageModel: "unavailable", userLimits: "unavailable",
    subject: "configured-worker-usage-model", effectiveLimits: "not-established", planEntitlement: "not-established" });
  assert.equal(u.project(success({ user_limits: null }), u.prepare(args)).userLimits, null);
  assert.equal(u.project(success({ user_limits: {} }), u.prepare(args)).userLimits.cpuMs, "unavailable");
  assert.equal(u.project(success({ user_limits: { cpu_ms: null } }), u.prepare(args)).userLimits.cpuMs, null);
  for (const usage_model of ["standard", "bundled", "unbound"]) {
    const value = u.project(success({ usage_model, user_limits: { cpu_ms: 0 } }), u.prepare(args));
    assert.equal(value.usageModel, usage_model);
    assert.equal(value.userLimits.cpuMs, 0);
    assert.equal(value.effectiveLimits, "not-established");
    assert.equal(value.planEntitlement, "not-established");
  }
});

test("Cloudflare settings refuse malformed selected values, foreign context and oversized envelopes", () => {
  const descriptors = Object.values(scriptSettingsDescriptors(scope()));
  for (const d of descriptors) {
    const p = d.prepare(args);
    for (const patch of [{ account_id: foreign }, { script_name: "other-worker" }]) {
      for (const raw of [JSON.stringify({ success: true, errors: [], result: result(), ...patch }), success({ ...result(), ...patch })]) {
        assert.throws(() => d.project(raw, p), /scope/);
      }
    }
    for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: result() }),
      JSON.stringify({ success: false, errors: [], result: result() }), JSON.stringify({ success: true, errors: [credentialCanary], result: result() })]) {
      assert.throws(() => d.project(raw, p), /upstream/);
    }
    assert.throws(() => d.project(success({ padding: "x".repeat(131072) }), p), /cap/);
  }
  const [d, u] = descriptors;
  for (const row of [{ logpush: null }, { logpush: "true" }, { observability: [] }, { observability: { enabled: null } },
    { observability: { issues: false } }, { observability: { logs: { persist: 1 } } }, { observability: { traces: { propagation_policy: "unknown" } } }]) {
    assert.throws(() => d.project(success(row), d.prepare(args)), /upstream/);
  }
  for (const value of [-0.1, 1.1, "0.5", true, {}]) {
    for (const row of [{ observability: { head_sampling_rate: value } }, { observability: { logs: { head_sampling_rate: value } } },
      { observability: { traces: { head_sampling_rate: value } } }]) assert.throws(() => d.project(success(row), d.prepare(args)), /upstream/);
  }
  for (const row of [{ usage_model: null }, { usage_model: "paid" }, { user_limits: [] }, { user_limits: { cpu_ms: -1 } },
    { user_limits: { cpu_ms: 1.5 } }, { user_limits: { cpu_ms: Number.MAX_SAFE_INTEGER + 1 } }, { user_limits: { cpu_ms: "50" } }]) {
    assert.throws(() => u.project(success(row), u.prepare(args)), /upstream/);
  }
});

test("Cloudflare settings default-empty and distinct per-operation scopes deny before credentials", async () => {
  for (const tool of tools) {
    const f = fixture({ tool, observability: tool === tools[0] ? [] : [args.scriptName], usage: tool === tools[1] ? [] : [args.scriptName] });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
    for (const patch of [{ scriptName: "other-worker" }, { accountId: foreign }, { observability: {} }, { usage_model: "standard" },
      { headers: {} }, { page: 2 }, { approval: "forged" }, { agentId: "other" }, { scriptName: "../escape" }]) {
      const allowed = fixture({ tool });
      assert.equal((await allowed.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(allowed.calls.secret, 0);
      assert.equal(allowed.requests.length, 0);
    }
  }
});

test("Cloudflare settings actual-core fixed GETs retain redaction, cleanup, audit and replay", async () => {
  for (const tool of tools) {
    const f = fixture({ tool });
    const p = f.operation.prepare(args);
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, tool === tools[0] ? "worker-script-settings-get-settings" : "worker-script-fetch-usage-model");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.scriptName, args.scriptName);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare settings current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const tool of tools) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture({ tool });
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

test("Cloudflare settings foreign, malformed, denied and audit failures retain uncertain replay state", async () => {
  for (const tool of tools) for (const options of [{ response: { ...result(), account_id: foreign } },
    { response: tool === tools[0] ? { logpush: null } : { usage_model: null } }, { status: 403 }, { status: 404 }, { auditFailure: true }]) {
    const f = fixture({ tool, ...options });
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    f.dependencies.audit.append = append;
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
