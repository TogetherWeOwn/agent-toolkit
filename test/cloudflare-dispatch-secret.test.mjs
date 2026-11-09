import assert from "node:assert/strict";
import test from "node:test";
import { dispatchSecretDescriptor } from "../dist/plugins/cloudflare-broker/src/dispatch-secret.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32);
const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const args = { namespaceName: "safe-namespace", scriptName: "safe-worker", secretName: "SECRET" };
const tool = "cloudflare.workers.dispatch_secret_metadata.get";
const secret = () => ({ name: args.secretName, type: "secret_text" });
const selection = () => ({ namespaceId: id, namespaceName: args.namespaceName,
  scripts: [{ scriptName: args.scriptName, secrets: [secret()] }] });
const scope = () => ({ accountId: account, revision: "resource-1", namespaces: [selection()] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ ...secret(), text: credentialCanary, key: { k: derivedCanary }, algorithm: { name: credentialCanary },
  usages: [derivedCanary], source: credentialCanary });
function fixture({ allowed = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [args.scriptName], hyperdriveIds: [],
    workerSecrets: [{ scriptName: args.scriptName, secrets: [secret()] }],
    dispatchNamespaceDetails: [{ namespaceId: id, namespaceName: args.namespaceName }],
    dispatchScriptSettings: [{ namespaceId: id, namespaceName: args.namespaceName, scriptNames: [args.scriptName] }],
    dispatchScriptLists: [{ namespaceId: id, namespaceName: args.namespaceName, scripts: [{ name: args.scriptName, tag: "safe-tag" }] }],
    ...(allowed ? { dispatchScriptSecrets: [selection()] } : {}) },
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
  for (const omitted of [credentialCanary, derivedCanary, '"text"', '"key"', '"algorithm"', '"usages"', '"source"'])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare dispatch secret snapshots exact namespace script name and type with bounded identity", () => {
  const s = scope(), d = dispatchSecretDescriptor(s);
  s.accountId = foreign; s.namespaces[0].namespaceId = other; s.namespaces[0].namespaceName = "other";
  s.namespaces[0].scripts[0].scriptName = "other"; s.namespaces[0].scripts[0].secrets[0].type = "secret_key";
  s.namespaces[0].scripts[0].secrets.push({ name: "EXTRA", type: "secret_text" });
  const p = d.prepare(args), out = d.project(success(row()), p);
  assert.equal(out.type, "secret_text"); assert.equal(out.effectiveAvailability, "not-established");
  assert.equal(p.request.path, `/accounts/${account}/workers/dispatch/namespaces/safe-namespace/scripts/safe-worker/secrets/SECRET`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:dispatch-namespace:${id}:script:safe-worker:secret:SECRET`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.maxRequests, 1); assert.equal(p.request.timeoutMs, 10000);
  assert.equal(p.request.redirects, "deny");
  for (const value of [d, p, p.arguments, p.request, p.resource, out]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  assert.throws(() => d.prepare({ ...args, secretName: "EXTRA" }), /scope/);
  for (const namespaces of [undefined, []]) assert.throws(() => dispatchSecretDescriptor({ ...scope(), namespaces }).prepare(args), /scope/);
});

test("Cloudflare dispatch secret refuses duplicate malformed oversized and cross-paired scopes", () => {
  for (const namespaces of [null, [null], [selection(), selection()], Array(101).fill(selection()),
    [{ ...selection(), namespaceId: account }], [{ ...selection(), namespaceName: "../escape" }],
    [selection(), { ...selection(), namespaceName: "other" }],
    [{ ...selection(), scripts: null }], [{ ...selection(), scripts: [null] }],
    [{ ...selection(), scripts: Array(101).fill(selection().scripts[0]) }],
    [{ ...selection(), scripts: [selection().scripts[0], selection().scripts[0]] }],
    ...[null, [null], [secret(), secret()], Array(101).fill(secret()), [{ name: "bad/name", type: "secret_text" }],
      [{ name: "SECRET", type: "plain_text" }]].map(secrets => [{ ...selection(), scripts: [{ scriptName: args.scriptName, secrets }] }])])
    assert.throws(() => dispatchSecretDescriptor({ ...scope(), namespaces }), /schema|cap/);
  const d = dispatchSecretDescriptor({ ...scope(), namespaces: [selection(), { namespaceId: other, namespaceName: "other",
    scripts: [{ scriptName: "different", secrets: [{ name: "OTHER", type: "secret_key" }] }] }] });
  for (const input of [{ ...args, namespaceName: "other" }, { ...args, scriptName: "different" }, { ...args, secretName: "OTHER" }])
    assert.throws(() => d.prepare(input), /scope/);
});

test("Cloudflare dispatch secret projects both value-omitting variants and refuses name or type drift", () => {
  for (const type of ["secret_text", "secret_key"]) {
    const s = scope(); s.namespaces[0].scripts[0].secrets[0].type = type;
    const d = dispatchSecretDescriptor(s), p = d.prepare(args), out = d.project(success({ ...row(), type }), p);
    assert.deepEqual(out, { namespaceName: args.namespaceName, scriptName: args.scriptName, name: "SECRET", type,
      subject: "configured-dispatch-script-secret-binding", effectiveAvailability: "not-established" });
    assert.deepEqual(d.project(success({ name: "SECRET", type }), p), out);
    for (const response of [{ ...row(), name: "OTHER", type }, { ...row(), type: type === "secret_text" ? "secret_key" : "secret_text" },
      {}, { name: "SECRET", type: "plain_text" }]) assert.throws(() => d.project(success(response), p), /scope/);
  }
});

test("Cloudflare dispatch secret refuses malformed envelopes foreign context and response caps", () => {
  const d = dispatchSecretDescriptor(scope()), p = d.prepare(args);
  for (const context of [{ account_id: foreign }, { namespace_id: other }, { namespace_name: "other" }, { script_name: "different" }]) {
    assert.throws(() => d.project(success({ ...row(), ...context }), p), /scope/);
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: row(), ...context }), p), /scope/);
  }
  for (const raw of ["null", "bad-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: ["failure"], result: row() })])
    assert.throws(() => d.project(raw, p), /upstream/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare dispatch secret is independently denied before credentials despite other visibility", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { agentId: "other" }, { headers: {} }, { approval: "forged" },
    { namespaceId: id }, { url_encoded: true }, { include: "text" }, { page: 1 }]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  for (const secretName of ["SECRET\n", "a/b", "a%2fb", "$SECRET", "é", "x".repeat(129)]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, secretName })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare dispatch secret actual-core GET retains redaction audit lease cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.equal(out.value.name, "SECRET"); assert.equal(out.value.type, "secret_text");
  assert.equal(p.plan.providerOperationId, "namespace-worker-get-script-secrets");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare dispatch secret current policy ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare dispatch secret upstream drift and audit outage preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: { ...row(), namespace_id: other } },
    { response: { ...row(), type: "secret_key" } }, { auditFailure: true }]) {
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
