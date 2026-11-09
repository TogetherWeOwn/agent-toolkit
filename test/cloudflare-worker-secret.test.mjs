import assert from "node:assert/strict";
import test from "node:test";
import { workerSecretDescriptor } from "../dist/plugins/cloudflare-broker/src/worker-secret.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const foreign = "f".repeat(32);
const tool = "cloudflare.workers.secret_metadata.get";
const args = { scriptName: "safe-worker", secretName: "API_SECRET" };
const scope = () => ({ accountId: account, revision: "resource-1", workers: [
  { scriptName: "safe-worker", secrets: [{ name: "API_SECRET", type: "secret_text" }, { name: "KEY", type: "secret_key" }] },
  { scriptName: "other-worker", secrets: [{ name: "OTHER", type: "secret_text" }] },
] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = (name = "API_SECRET", type = "secret_text") => ({ name, type, text: credentialCanary,
  key_base64: derivedCanary, key_jwk: { k: credentialCanary }, algorithm: { name: derivedCanary }, usages: [credentialCanary] });
function fixture({ allowed = true, response = result(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    ...(allowed ? { workerSecrets: scope().workers } : {}) }, { accountId: account, revision: "resource-1" }, async (url, init) => {
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
  return { ...f, operation, requests, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "key_base64", "key_jwk", "algorithm", "usages"]) assert.ok(!data.includes(value));
}

test("Cloudflare Worker secret detail uses copied independent exact script/name/type scope", () => {
  const s = scope();
  const d = workerSecretDescriptor(s);
  s.accountId = foreign;
  s.revision = "changed";
  s.workers[0].secrets[0].name = "CHANGED";
  s.workers[0].secrets[1].type = "secret_text";
  s.workers.length = 0;
  const p = d.prepare(args);
  assert.deepEqual(p.resource, { id: `cloudflare:account:${account}:worker:safe-worker:secret:API_SECRET`, revision: "resource-1" });
  assert.deepEqual(p.request, { method: "GET", path: `/accounts/${account}/workers/scripts/safe-worker/secrets/API_SECRET`,
    maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
  for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.equal(d.project(success(result("KEY", "secret_key")), d.prepare({ ...args, secretName: "KEY" })).type, "secret_key");
  for (const input of [{ ...args, secretName: "OTHER" }, { ...args, scriptName: "other-worker" }]) assert.throws(() => d.prepare(input), /scope/);
  for (const workers of [undefined, [], [{ scriptName: "safe-worker", secrets: [] }]]) {
    assert.throws(() => workerSecretDescriptor({ accountId: account, revision: "resource-1", workers }).prepare(args), /scope/);
  }
  assert.throws(() => d.project(success(result()), { ...p }), /scope/);
  assert.throws(() => workerSecretDescriptor(scope()).project(success(result()), p), /scope/);
});

test("Cloudflare Worker secret detail returns only exact selected name and type for both official variants", () => {
  const d = workerSecretDescriptor(scope());
  for (const [name, type] of [["API_SECRET", "secret_text"], ["KEY", "secret_key"]]) {
    const p = d.prepare({ ...args, secretName: name });
    const expected = { scriptName: "safe-worker", name, type, subject: "configured-worker-secret-binding", effectiveAvailability: "not-established" };
    assert.deepEqual(d.project(success(result(name, type)), p), expected);
    assert.deepEqual(d.project(success({ name, type }), p), expected);
    assert.ok(Object.isFrozen(d.project(success(result(name, type)), p)));
    for (const row of [{ name: "OTHER", type }, { name, type: type === "secret_text" ? "secret_key" : "secret_text" },
      { type }, { name }, { name, type: null }, { name, type: "plain_text" }]) assert.throws(() => d.project(success(row), p), /scope/);
  }
});

test("Cloudflare Worker secret detail rejects unsupported selectors and duplicate or over-limit scopes", () => {
  for (const secretName of ["", "../escape", "A/B", "A%2FB", "A?x", "A#x", "A\n", "A-B", "$KEY", "1BAD", "x".repeat(129)]) {
    assert.throws(() => workerSecretDescriptor(scope()).prepare({ ...args, secretName }), /schema/);
  }
  for (const workers of [null, [scope().workers[0], scope().workers[0]], [{ scriptName: "safe-worker", secrets: [
    { name: "X", type: "secret_text" }, { name: "X", type: "secret_key" }] }],
    [{ scriptName: "safe-worker", secrets: [{ name: "X", type: "plain_text" }] }]]) {
    assert.throws(() => workerSecretDescriptor({ ...scope(), workers }));
  }
  assert.throws(() => workerSecretDescriptor({ ...scope(), workers: Array(101).fill(scope().workers[0]) }), /cap/);
  assert.throws(() => workerSecretDescriptor({ ...scope(), workers: [{ scriptName: "safe-worker", secrets: Array(101).fill({ name: "X", type: "secret_text" }) }] }), /cap/);
});

test("Cloudflare Worker secret detail refuses foreign context, invalid envelopes and oversized responses", () => {
  const d = workerSecretDescriptor(scope());
  const p = d.prepare(args);
  for (const raw of [JSON.stringify({ success: true, errors: [], account_id: foreign, result: result() }),
    success({ ...result(), account_id: foreign }), success({ ...result(), script_name: "other-worker" })]) assert.throws(() => d.project(raw, p), /scope/);
  for (const raw of ["not-json", "null", "{}", success(null), success([]),
    JSON.stringify({ success: false, errors: [], result: result() }), JSON.stringify({ success: true, result: result() }),
    JSON.stringify({ success: true, errors: [credentialCanary], result: result() })]) assert.throws(() => d.project(raw, p), /upstream/);
  assert.throws(() => d.project(success({ ...result(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare Worker secret detail default-empty scope and model overrides refuse before credentials", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  assert.equal(denied.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { type: "secret_text" }, { text: credentialCanary }, { url_encoded: true },
    { urlEncoded: true }, { headers: {} }, { page: 2 }, { approval: "forged" }, { agentId: "other" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare Worker secret detail actual-core GET retains redaction, cleanup, audit and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerOperationId, "worker-get-script-secret");
  assert.equal(p.plan.providerDryRun, false);
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
});

test("Cloudflare Worker secret detail refuses credential-derived metadata reflection", async () => {
  const f = fixture();
  const resolve = f.dependencies.credentials.resolve;
  f.dependencies.credentials.resolve = async target => {
    const lease = await resolve(target);
    return { ...lease, redactions: [...lease.redactions, "secret_text"] };
  };
  const out = await f.invoke();
  assert.equal(out.code, "OUTPUT_REFUSED");
  assert.equal(f.calls.close, 1);
  assert.equal([...f.journal.values()][0].outcome, "uncertain");
  assert.ok(!JSON.stringify({ out, audit: f.audit, journal: [...f.journal] }).includes("secret_text"));
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare Worker secret detail denies agent/resource/binding drift and lease-time revocation", async () => {
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

test("Cloudflare Worker secret detail drift, upstream and audit outages preserve uncertain replay tombstones", async () => {
  for (const options of [{ response: { ...result(), account_id: foreign } }, { response: result("OTHER") },
    { response: result("API_SECRET", "secret_key") }, { status: 403 }, { status: 404 }, { auditFailure: true }]) {
    const f = fixture(options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
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
