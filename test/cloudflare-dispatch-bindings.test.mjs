import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dispatchBindingsDescriptor, dispatchBindingTypes } from "../dist/plugins/cloudflare-broker/src/dispatch-bindings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32);
const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const args = { namespaceName: "safe-namespace", scriptName: "safe-worker" };
const tool = "cloudflare.workers.dispatch_bindings.get";
const binding = () => ({ name: "SECRET", type: "secret_text" });
const selection = () => ({ namespaceId: id, namespaceName: args.namespaceName,
  scripts: [{ scriptName: args.scriptName, bindings: [binding(), { name: "DB", type: "d1" }] }] });
const scope = () => ({ accountId: account, revision: "resource-1", namespaces: [selection()] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const rows = () => [{ ...binding(), text: credentialCanary, key_jwk: { k: derivedCanary }, algorithm: credentialCanary,
  usages: [derivedCanary], source: credentialCanary }, { name: "DB", type: "d1", database_id: foreign },
  { name: "UNSELECTED", type: "plain_text", text: credentialCanary }];
function fixture({ allowed = true, response = rows(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const secrets = [{ namespaceId: id, namespaceName: args.namespaceName,
    scripts: [{ scriptName: args.scriptName, secrets: [binding()] }] }];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [args.scriptName], hyperdriveIds: [],
    dispatchNamespaceDetails: [{ namespaceId: id, namespaceName: args.namespaceName }],
    dispatchScriptSettings: [{ namespaceId: id, namespaceName: args.namespaceName, scriptNames: [args.scriptName] }],
    dispatchScriptLists: [{ namespaceId: id, namespaceName: args.namespaceName, scripts: [{ name: args.scriptName, tag: "safe-tag" }] }],
    dispatchScriptSecrets: secrets, dispatchScriptSecretLists: secrets,
    ...(allowed ? { dispatchScriptBindings: [selection()] } : {}) },
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
  return { ...f, operation, operations, requests, invoke: (input = args) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, foreign, '"text"', '"key_jwk"', '"algorithm"', '"usages"', '"source"', "UNSELECTED", "database_id"])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare dispatch binding discriminators match the pinned complete operation shape", async () => {
  const inventory = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  const row = inventory.find(row => row.operationId === "namespace-worker-get-script-bindings");
  assert.equal(row.typedTool, tool); assert.equal(row.tier, "read"); assert.equal(row.enablement, "disabled");
  // These are identity-only variants, not validators/grants for their target payloads.
  assert.equal(dispatchBindingTypes.length, 39); assert.equal(new Set(dispatchBindingTypes).size, 39);
  assert.deepEqual([...dispatchBindingTypes].sort(), row.bindingIdentityTypes);
  const values = dispatchBindingTypes.map((type, i) => ({ name: `BINDING_${i}`, type }));
  const s = scope(); s.namespaces[0].scripts[0].bindings = values;
  const d = dispatchBindingsDescriptor(s), p = d.prepare(args);
  assert.deepEqual(d.project(success(values.map(value => ({ ...value, text: credentialCanary,
    json: derivedCanary, key_base64: credentialCanary, service: foreign, bucket_name: foreign }))), p).items, values);
});

test("Cloudflare dispatch bindings snapshot exact paired scopes and bind a distinct capped request", () => {
  const s = scope(), d = dispatchBindingsDescriptor(s);
  s.accountId = foreign; s.namespaces[0].namespaceId = other; s.namespaces[0].namespaceName = "other";
  s.namespaces[0].scripts[0].scriptName = "other"; s.namespaces[0].scripts[0].bindings[0].type = "secret_key";
  s.namespaces[0].scripts[0].bindings.push({ name: "EXTRA", type: "secret_text" });
  const p = d.prepare(args), out = d.project(success(rows()), p);
  assert.deepEqual(out.items, [binding(), { name: "DB", type: "d1" }]);
  assert.equal(p.request.path, `/accounts/${account}/workers/dispatch/namespaces/safe-namespace/scripts/safe-worker/bindings`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:dispatch-namespace:${id}:script:safe-worker:bindings`);
  assert.equal(p.resource.revision, "resource-1"); assert.equal(p.request.maxResponseBytes, 131072);
  assert.equal(p.request.maxRequests, 1); assert.equal(p.request.timeoutMs, 10000); assert.equal(p.request.redirects, "deny");
  for (const value of [dispatchBindingTypes, d, p, p.arguments, p.request, p.resource, out, out.items, ...out.items]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(rows()), { ...p }), /scope/);
  for (const namespaces of [undefined, [], [{ ...selection(), scripts: [] }],
    [{ ...selection(), scripts: [{ scriptName: args.scriptName, bindings: [] }] }]])
    assert.throws(() => dispatchBindingsDescriptor({ ...scope(), namespaces }).prepare(args), /scope/);
});

test("Cloudflare dispatch bindings reject invalid scopes and do not grant other dispatch reads", () => {
  for (const namespaces of [null, [null], [selection(), selection()], Array(101).fill(selection()),
    [{ ...selection(), namespaceId: account }], [{ ...selection(), namespaceName: "../escape" }],
    [selection(), { ...selection(), namespaceName: "other" }],
    [{ ...selection(), scripts: null }], [{ ...selection(), scripts: [null] }],
    [{ ...selection(), scripts: Array(101).fill(selection().scripts[0]) }],
    [{ ...selection(), scripts: [selection().scripts[0], selection().scripts[0]] }],
    ...[null, [null], [binding(), binding()], Array(101).fill(binding()), [{ name: "bad/name", type: "secret_text" }],
      [{ name: "SECRET", type: "future-type" }]].map(bindings => [{ ...selection(), scripts: [{ scriptName: args.scriptName, bindings }] }])])
    assert.throws(() => dispatchBindingsDescriptor({ ...scope(), namespaces }), /schema|cap/);
  const d = dispatchBindingsDescriptor({ ...scope(), namespaces: [selection(), { namespaceId: other, namespaceName: "other",
    scripts: [{ scriptName: "different", bindings: [binding()] }] }] });
  for (const input of [{ ...args, namespaceName: "other" }, { ...args, scriptName: "different" }])
    assert.throws(() => d.prepare(input), /scope/);
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    dispatchScriptBindings: [selection()] }, { accountId: account, revision: "resource-1" });
  for (const name of ["dispatch_secret_metadata.list", "dispatch_secret_metadata.get", "dispatch_script_settings.get"])
    assert.throws(() => operations.find(op => op.name === `cloudflare.workers.${name}`)
      .prepare(name.endsWith("metadata.get") ? { ...args, secretName: "SECRET" } : args), /scope/);
});

test("Cloudflare dispatch bindings expose configured identities only with incomplete empty results", () => {
  const d = dispatchBindingsDescriptor(scope()), p = d.prepare(args), out = d.project(success(rows()), p);
  assert.deepEqual(out, { ...args, items: [binding(), { name: "DB", type: "d1" }],
    subject: "configured-dispatch-script-binding-identities", complete: false, effectiveAvailability: "not-established" });
  for (const result of [[], [{ name: "UNSELECTED", type: "future-type" }]]) {
    const empty = d.project(success(result), p); assert.deepEqual(empty.items, []); assert.equal(empty.complete, false);
  }
  for (const result of [[{ ...binding(), type: "secret_key" }], [binding(), binding()], [{ name: "SECRET" }], [{}], [null]])
    assert.throws(() => d.project(success(result), p), /scope|upstream/);
  safe({ audit: [], journal: [] }, out);
});

test("Cloudflare dispatch bindings refuse foreign context malformed envelopes and response bounds", () => {
  const d = dispatchBindingsDescriptor(scope()), p = d.prepare(args);
  for (const context of [{ account_id: foreign }, { namespace_id: other }, { namespace_name: "other" }, { script_name: "different" }]) {
    assert.throws(() => d.project(success([{ ...binding(), ...context }]), p), /scope/);
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: rows(), ...context }), p), /scope/);
  }
  for (const raw of ["null", "bad-json", "{}", JSON.stringify({ success: true, result: rows() }),
    JSON.stringify({ success: false, errors: [], result: rows() }), JSON.stringify({ success: true, errors: ["failure"], result: rows() })])
    assert.throws(() => d.project(raw, p), /upstream/);
  for (const result of [null, {}, Array(101).fill({ name: "UNSELECTED" })]) assert.throws(() => d.project(success(result), p), /cap/);
  assert.throws(() => d.project(success([{ ...binding(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare dispatch bindings independently refuse before credentials despite all other visibility", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { agentId: "other" }, { headers: {} }, { approval: "forged" },
    { namespaceId: id }, { url_encoded: true }, { include: "text" }, { bindingName: "SECRET" }, { page: 1 }]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  for (const scriptName of ["safe-worker\n", "a/b", "a%2fb", "é", "x".repeat(64)]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, scriptName })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare dispatch bindings actual-core GET retains redaction audit cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, [binding(), { name: "DB", type: "d1" }]);
  assert.equal(p.plan.providerOperationId, "namespace-worker-get-script-bindings");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare dispatch bindings current policy ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare dispatch bindings upstream drift and audit outage preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: [{ ...binding(), namespace_id: other }] },
    { response: [{ ...binding(), type: "secret_key" }] }, { auditFailure: true }]) {
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
