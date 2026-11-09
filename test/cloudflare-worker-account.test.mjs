import assert from "node:assert/strict";
import test from "node:test";
import { workerAccountDescriptors } from "../dist/plugins/cloudflare-broker/src/worker-account.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const foreign = "f".repeat(32);
const settings = "cloudflare.workers.account_settings.get";
const domain = "cloudflare.workers.account_subdomain.get";
const tools = [settings, domain];
const scope = () => ({ accountId: account, revision: "resource-1", settingsReadAllowed: true, expectedSubdomain: "safe-account" });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = tool => tool === settings ? { default_usage_model: "standard", green_compute: false,
  token: credentialCanary, bindings: derivedCanary } : { subdomain: "safe-account", token: credentialCanary, names: derivedCanary };
function fixture(tool, { allowed = true, response = result(tool), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    ...(allowed ? { workerAccountSettingsReadAllowed: true, workerAccountExpectedSubdomain: "safe-account" } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (args = {}, key = "call-a") => broker.call(tool, args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "bindings", "token"]) assert.ok(!data.includes(value));
}

test("Cloudflare Worker account scopes are independent snapshots with exact distinct resources", () => {
  const s = scope();
  const d = workerAccountDescriptors(s);
  s.accountId = foreign;
  s.revision = "changed";
  s.settingsReadAllowed = false;
  s.expectedSubdomain = "other-account";
  for (const [key, suffix] of [["accountSettingsGet", "account-settings"], ["accountSubdomainGet", "subdomain"]]) {
    const p = d[key].prepare({});
    assert.equal(p.request.path, `/accounts/${account}/workers/${suffix}`);
    assert.deepEqual(p.resource, { id: `cloudflare:account:${account}:workers:${suffix}`, revision: "resource-1" });
    for (const value of [d, d[key], p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d[key].project(success(result(d[key].name)), { ...p }), /scope/);
    assert.throws(() => workerAccountDescriptors(scope())[key].project(success(result(d[key].name)), p), /scope/);
  }
  assert.throws(() => workerAccountDescriptors({ ...scope(), expectedSubdomain: undefined }).accountSubdomainGet.prepare({}), /scope/);
  assert.throws(() => workerAccountDescriptors({ ...scope(), settingsReadAllowed: false }).accountSettingsGet.prepare({}), /scope/);
  assert.equal(workerAccountDescriptors({ ...scope(), settingsReadAllowed: false }).accountSubdomainGet.prepare({}).request.method, "GET");
  assert.equal(workerAccountDescriptors({ ...scope(), expectedSubdomain: undefined }).accountSettingsGet.prepare({}).request.method, "GET");
  for (const expectedSubdomain of [null, "", "Safe", "a.b", "-bad", "bad-", "a".repeat(64), "safe\n", "../escape"]) {
    assert.throws(() => workerAccountDescriptors({ ...scope(), expectedSubdomain }), /schema/);
  }
  for (const settingsReadAllowed of [null, "true", 1]) assert.throws(() => workerAccountDescriptors({ ...scope(), settingsReadAllowed }), /schema/);
});

test("Cloudflare Worker account settings project configured optional fields without inferred models or limits", () => {
  const d = workerAccountDescriptors(scope()).accountSettingsGet;
  const p = d.prepare({});
  const out = d.project(success(result(settings)), p);
  assert.deepEqual(out, { subject: "configured-workers-account-settings", defaultUsageModel: "standard", greenCompute: false,
    effectivePlanAndLimits: "not-established" });
  assert.ok(Object.isFrozen(out));
  assert.deepEqual(d.project(success({}), p), { ...out, defaultUsageModel: "unavailable", greenCompute: "unavailable" });
  assert.equal(d.project(success({ default_usage_model: "future-model", green_compute: true }), p).defaultUsageModel, "future-model");
  for (const default_usage_model of [null, 1, "", "bad\n", "x".repeat(81)]) assert.throws(() => d.project(success({ default_usage_model }), p), /schema/);
  for (const green_compute of [null, 1, "false", {}]) assert.throws(() => d.project(success({ green_compute }), p), /upstream/);
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
});

test("Cloudflare Worker account subdomain requires exact selected identity and makes no reachability claim", () => {
  const d = workerAccountDescriptors(scope()).accountSubdomainGet;
  const p = d.prepare({});
  assert.deepEqual(d.project(success(result(domain)), p), { subject: "configured-workers-account-subdomain", subdomain: "safe-account",
    effectiveReachability: "not-established" });
  for (const subdomain of [undefined, null, "foreign", "safe-account.workers.dev", "safe-account\n", 1]) {
    assert.throws(() => d.project(success({ subdomain }), p), /scope/);
  }
});

test("Cloudflare Worker account reads refuse foreign context, malformed envelopes and oversize responses", () => {
  for (const d of Object.values(workerAccountDescriptors(scope()))) {
    const p = d.prepare({});
    for (const raw of [JSON.stringify({ success: true, errors: [], account_id: foreign, result: result(d.name) }),
      success({ ...result(d.name), account_id: foreign })]) assert.throws(() => d.project(raw, p), /scope/);
    for (const raw of ["not-json", "null", "{}", success(null), success([]),
      JSON.stringify({ success: false, errors: [], result: result(d.name) }),
      JSON.stringify({ success: true, result: result(d.name) }),
      JSON.stringify({ success: true, errors: [credentialCanary], result: result(d.name) })]) assert.throws(() => d.project(raw, p), /upstream/);
    assert.throws(() => d.project(success({ ...result(d.name), padding: "x".repeat(131072) }), p), /cap/);
  }
});

test("Cloudflare Worker account empty scopes and model overrides refuse before credentials", async () => {
  for (const tool of tools) {
    const denied = fixture(tool, { allowed: false });
    assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(denied.calls.secret, 0);
    assert.equal(denied.requests.length, 0);
    for (const args of [{ accountId: foreign }, { scriptName: "safe-worker" }, { subdomain: "safe-account" }, { green_compute: true },
      { headers: {} }, { page: 2 }, { approval: "forged" }, { agentId: "other" }]) {
      const f = fixture(tool);
      assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare Worker account actual-core GETs retain redaction, audit, cleanup and replay", async () => {
  for (const tool of tools) {
    const f = fixture(tool);
    const p = f.operation.prepare({});
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, tool === settings ? "worker-account-settings-fetch-worker-account-settings" : "worker-subdomain-get-subdomain");
    const out = await f.invoke();
    assert.equal(out.ok, true);
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

test("Cloudflare Worker account agent/resource/binding and lease-time revocation deny network", async () => {
  for (const tool of tools) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(tool);
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

test("Cloudflare Worker account drift, credential reflection, upstream and audit outages fail closed with replay tombstones", async () => {
  for (const tool of tools) for (const options of [{ response: { ...result(tool), account_id: foreign } }, { status: 403 }, { status: 404 },
    { response: tool === settings ? { default_usage_model: credentialCanary } : { subdomain: "foreign" } }, { auditFailure: true }]) {
    const f = fixture(tool, options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" :
      options.response?.default_usage_model === credentialCanary ? "OUTPUT_REFUSED" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
