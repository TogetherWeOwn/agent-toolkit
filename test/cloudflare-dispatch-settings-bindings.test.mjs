import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dispatchSettingsDescriptor } from "../dist/plugins/cloudflare-broker/src/dispatch-settings.js";
import { dispatchBindingTypes } from "../dist/plugins/cloudflare-broker/src/dispatch-bindings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32);
const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const args = { namespaceName: "safe-namespace", scriptName: "safe-worker" };
const tool = "cloudflare.workers.dispatch_script_settings.get";
const selection = () => ({ namespaceId: id, namespaceName: args.namespaceName,
  scripts: [{ scriptName: args.scriptName, bindings: [{ name: "TOKEN", type: "secret_text" }] }] });
const settings = () => ({ namespaceId: id, namespaceName: args.namespaceName, scriptNames: [args.scriptName] });
const scope = () => ({ accountId: account, revision: "resource-1", scripts: [settings()], bindingScripts: [selection()] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ logpush: false, bindings: [{ name: "TOKEN", type: "secret_text", text: credentialCanary,
  key: derivedCanary, namespace_id: id, script_name: args.scriptName }, { name: "UNSELECTED", type: "plain_text", text: derivedCanary }],
  observability: { enabled: true, logs: { destinations: [credentialCanary] } }, tags: [derivedCanary], source: credentialCanary });
function fixture({ expanded = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    dispatchScriptSettings: [settings()], dispatchScriptBindings: [selection()], dispatchScriptSecrets: [],
    ...(expanded ? { dispatchSettingsBindings: [selection()] } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(args).resource.id] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (input = args) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "UNSELECTED", '"text"', '"key"', "destinations", '"source"'])
    assert.ok(!serialized.includes(value));
}

test("Cloudflare dispatch settings bindings match official discriminator and response schema ledger", async () => {
  const ledger = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line)).find(op => op.typedTool === tool);
  assert.deepEqual(ledger.bindingIdentityTypes, [...dispatchBindingTypes].sort());
  assert.equal(ledger.bindingIdentityResponseSchema, "workers_namespace-script-and-version-settings-item");
  assert.equal(ledger.bindingIdentityResponsePath, "bindings");
  assert.equal(ledger.bindingIdentityItemSchema, "workers_binding_item");
  const s = scope(), bindings = dispatchBindingTypes.map((type, i) => ({ name: `B${i}`, type }));
  s.bindingScripts[0].scripts[0].bindings = bindings;
  const d = dispatchSettingsDescriptor(s), p = d.prepare(args);
  const out = d.project(success({ bindings: bindings.map(value => ({ ...value, text: credentialCanary, id: derivedCanary })) }), p);
  assert.deepEqual(out.bindings.items, bindings); assert.equal(out.bindings.complete, false);
  assert.equal(out.bindings.effectiveAvailability, "not-established");
  for (const value of [out, out.bindings, out.bindings.items, ...out.bindings.items]) assert.ok(Object.isFrozen(value));
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
});

test("Cloudflare dispatch settings bindings snapshot subset scope and isolate expanded resources and defaults", () => {
  const s = scope(), d = dispatchSettingsDescriptor(s), p = d.prepare(args);
  s.bindingScripts[0].namespaceId = other; s.bindingScripts[0].scripts[0].bindings[0].type = "plain_text";
  s.bindingScripts[0].scripts[0].bindings.push({ name: "UNSELECTED", type: "plain_text" }); s.scripts[0].scriptNames.push("extra");
  assert.match(p.resource.id, /:settings:binding-identities$/);
  assert.equal(p.request.path, `/accounts/${account}/workers/dispatch/namespaces/${args.namespaceName}/scripts/${args.scriptName}/settings`);
  assert.equal(p.request.maxRequests, 1); assert.equal(p.request.timeoutMs, 10000); assert.equal(p.request.redirects, "deny");
  assert.deepEqual(d.project(success(row()), p).bindings.items, [{ name: "TOKEN", type: "secret_text" }]);
  assert.throws(() => d.prepare({ ...args, scriptName: "extra" }), /scope/);
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  for (const bindingScripts of [undefined, []]) {
    const ordinary = dispatchSettingsDescriptor({ ...scope(), bindingScripts }), q = ordinary.prepare(args);
    assert.match(q.resource.id, /:settings$/); assert.equal(Object.hasOwn(ordinary.project(success(row()), q), "bindings"), false);
  }
});

test("Cloudflare dispatch settings bindings reject invalid duplicates cross-pairs empty and oversized scope", () => {
  for (const bindingScripts of [null, [selection(), selection()], Array(101).fill(selection()),
    [{ ...selection(), namespaceId: other }], [{ ...selection(), namespaceName: "other" }],
    [{ ...selection(), scripts: [] }], [{ ...selection(), scripts: [{ scriptName: "other", bindings: [{ name: "TOKEN", type: "secret_text" }] }] }]])
    assert.throws(() => dispatchSettingsDescriptor({ ...scope(), bindingScripts }), /schema|scope|cap/);
  for (const bindings of [null, [], [{ name: "bad-name", type: "secret_text" }], [{ name: "TOKEN", type: "unknown" }],
    [{ name: "TOKEN", type: "secret_text" }, { name: "TOKEN", type: "secret_text" }], Array(101).fill({ name: "TOKEN", type: "secret_text" })]) {
    const s = scope(); s.bindingScripts[0].scripts[0].bindings = bindings;
    assert.throws(() => dispatchSettingsDescriptor(s), /schema|scope|cap/);
  }
  assert.throws(() => dispatchSettingsDescriptor({ ...scope(), scripts: [] }), /scope/);
});

test("Cloudflare dispatch settings bindings retain unavailable incomplete drift context and bounds semantics", () => {
  const d = dispatchSettingsDescriptor(scope()), p = d.prepare(args);
  assert.equal(d.project(success({}), p).bindings, "unavailable");
  assert.deepEqual(d.project(success({ bindings: [] }), p).bindings.items, []);
  for (const bindings of [null, {}, [null], [{}], [{ name: "TOKEN", type: "secret_key" }],
    [{ name: "TOKEN", type: "secret_text" }, { name: "TOKEN", type: "secret_text" }],
    [{ name: "TOKEN", type: "secret_text", account_id: foreign }],
    [{ name: "TOKEN", type: "secret_text", namespace_id: other }], Array(101).fill({ name: "other" })])
    assert.throws(() => d.project(success({ bindings }), p), /scope|upstream|cap/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
  assert.throws(() => d.project(success({ ...row(), observability: null }), p), /upstream/);
  const s = scope(); s.bindingScripts[0].scripts[0].bindings = Array.from({ length: 100 }, (_, i) =>
    ({ name: `B${i}${"x".repeat(120)}`, type: "durable_object_namespace" }));
  const capped = dispatchSettingsDescriptor(s), q = capped.prepare(args);
  assert.throws(() => capped.project(success({ bindings: s.bindingScripts[0].scripts[0].bindings,
    observability: { head_sampling_rate: 0.123456789012345 } , logpush: false,
    padding: "x".repeat(131072) }), q), /cap/);
});

test("Cloudflare dispatch settings binding expansion requires distinct policy and rejects model overrides before credentials", async () => {
  const ordinary = fixture({ expanded: false }), plain = await ordinary.invoke();
  assert.equal(plain.ok, true); assert.equal(Object.hasOwn(plain.value, "bindings"), false); safe(ordinary, plain);
  const denied = fixture(); denied.vector.policy.resources = [ordinary.operation.prepare(args).resource.id];
  assert.equal((await denied.invoke()).code, "POLICY_DENIED"); assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { bindings: true }, { include: "bindings" }, { headers: {} }, { namespaceId: id }, { approval: "forged" }]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare dispatch settings binding actual-core projection preserves redaction audit cleanup and replay", async () => {
  const f = fixture(), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.bindings.items, [{ name: "TOKEN", type: "secret_text" }]);
  assert.equal(out.value.logpush, false); assert.equal(f.calls.close, 1);
  assert.equal(f.operation.prepare(args).plan.providerOperationId, "namespace-worker-get-script-settings");
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].init.method, "GET");
  assert.deepEqual(f.audit.map(record => record.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare dispatch settings binding current policy ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare dispatch settings binding drift upstream and audit outages preserve uncertain replay", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: { bindings: [{ name: "TOKEN", type: "secret_key" }] } }, { auditFailure: true }]) {
    const f = fixture(options), append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});
