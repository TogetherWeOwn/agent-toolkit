import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { dispatchBindingTypes } from "../dist/plugins/cloudflare-broker/src/dispatch-bindings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32), args = { scriptName: "safe-worker" };
const tool = "cloudflare.workers.settings.get";
const identities = () => [{ name: "SECRET", type: "secret_text" }, { name: "DB", type: "d1" }];
const selection = () => [{ scriptName: args.scriptName, bindings: identities() }];
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: [args.scriptName], hyperdriveIds: [],
  workerControlScriptNames: [args.scriptName], workerBindingScripts: selection() });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ limits: { cpu_ms: 50 }, bindings: [{ ...identities()[0], text: credentialCanary,
  key_jwk: { k: derivedCanary }, algorithm: credentialCanary, usages: [derivedCanary] },
  { ...identities()[1], database_id: foreign }, { name: "UNSELECTED", type: "plain_text", text: credentialCanary }],
  tags: [credentialCanary], tail_consumers: [derivedCanary], annotations: { message: credentialCanary } });
function fixture({ selected = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [], s = scope();
  if (!selected) delete s.workerBindingScripts;
  const operations = cloudflareReadOperations(s, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(args).resource.id] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, operations, requests, invoke: (input = args) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, foreign, '"text"', '"key_jwk"', '"algorithm"', '"usages"',
    "UNSELECTED", "database_id", "tail_consumers", "annotations"])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare Worker settings binding types match the pinned general settings schema", async () => {
  const inventory = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  const entry = inventory.find(value => value.operationId === "worker-script-get-settings");
  assert.equal(entry.typedTool, tool); assert.equal(entry.enablement, "disabled");
  assert.equal(entry.bindingIdentityResponseSchema, "workers_script-and-version-settings-item");
  assert.deepEqual(entry.bindingIdentityTypes, [...dispatchBindingTypes].sort());
  const s = scope(), all = dispatchBindingTypes.map((type, i) => ({ name: `BINDING_${i}`, type }));
  s.workerBindingScripts[0].bindings = all;
  const d = metadataDescriptors(s).workerSettingsGet, p = d.prepare(args);
  assert.deepEqual(d.project(success({ bindings: all.map(value => ({ ...value, text: credentialCanary,
    json: derivedCanary, key_base64: credentialCanary, service: foreign, bucket_name: foreign })) }), p).bindings.items, all);
});

test("Cloudflare Worker binding selections are copied subsets with a distinct policy resource", () => {
  const s = scope(), d = metadataDescriptors(s).workerSettingsGet, p = d.prepare(args);
  s.workerBindingScripts[0].scriptName = "different"; s.workerBindingScripts[0].bindings[0].type = "secret_key";
  s.workerBindingScripts[0].bindings.push({ name: "EXTRA", type: "queue" });
  assert.deepEqual(d.project(success(row()), p).bindings.items, identities());
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker:safe-worker:controls:binding-identities`);
  assert.equal(p.resource.revision, "resource-1"); assert.equal(p.request.path, `/accounts/${account}/workers/scripts/safe-worker/settings`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.timeoutMs, 10000);
  assert.equal(p.request.maxRequests, 1); assert.equal(p.request.redirects, "deny");
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  const basic = metadataDescriptors({ ...scope(), workerBindingScripts: undefined });
  assert.equal(basic.workerSettingsGet.prepare(args).resource.id, basic.workerSubdomainGet.prepare(args).resource.id);
  assert.ok(!Object.hasOwn(basic.workerSettingsGet.project(success(row()), basic.workerSettingsGet.prepare(args)), "bindings"));
  assert.throws(() => metadataDescriptors({ ...scope(), workerControlScriptNames: [] }), /scope/);
  assert.throws(() => metadataDescriptors({ ...scope(), scriptNames: [] }), /scope/);
  assert.equal(metadataDescriptors(scope()).workerSubdomainGet.prepare(args).resource.id, basic.workerSubdomainGet.prepare(args).resource.id);
});

test("Cloudflare Worker binding selections reject invalid paired names types duplicates and bounds", () => {
  for (const workerBindingScripts of [null, [null], Array(101).fill(selection()[0]), [selection()[0], selection()[0]],
    [{ ...selection()[0], scriptName: "other-worker" }],
    ...[null, [], [null], Array(101).fill(identities()[0]), [identities()[0], identities()[0]],
      [{ name: "bad/name", type: "secret_text" }], [{ name: "SECRET\n", type: "secret_text" }],
      [{ name: "SECRET", type: "future-type" }]].map(bindings => [{ scriptName: args.scriptName, bindings }])])
    assert.throws(() => metadataDescriptors({ ...scope(), workerBindingScripts }), /scope|schema|cap/);
});

test("Cloudflare Worker binding output preserves unavailable empty and incomplete states", () => {
  const d = metadataDescriptors(scope()).workerSettingsGet, p = d.prepare(args);
  const out = d.project(success(row()), p);
  assert.deepEqual(out.bindings, { subject: "configured-worker-binding-identities", items: identities(), complete: false,
    effectiveAvailability: "not-established" });
  assert.equal(out.cpuMs.value, 50);
  assert.equal(d.project(success({}), p).bindings, "unavailable");
  for (const bindings of [[], [{ name: "UNSELECTED", type: "future-type" }]]) {
    const value = d.project(success({ bindings }), p).bindings;
    assert.deepEqual(value.items, []); assert.equal(value.complete, false);
  }
  for (const bindings of [null, {}, Array(101).fill({ name: "UNSELECTED" }), [null], [{}],
    [{ name: "SECRET" }], [{ name: "SECRET", type: "secret_key" }], [identities()[0], identities()[0]],
    [{ ...identities()[0], account_id: foreign }], [{ ...identities()[0], script_name: "different" }]])
    assert.throws(() => d.project(success({ bindings }), p), /scope|upstream|cap/);
  for (const response of [{ ...row(), account_id: foreign }, { ...row(), script_name: "different" }])
    assert.throws(() => d.project(success(response), p), /scope/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
  for (const raw of ["null", "{}", "bad-json", JSON.stringify({ success: true, result: row() }), success(null)])
    assert.throws(() => d.project(raw, p), /upstream/);
  safe({ audit: [], journal: [] }, out);
});

test("Cloudflare Worker binding projection cannot reuse ordinary control policy or model overrides", async () => {
  const f = fixture(); f.vector.policy.resources = [`cloudflare:account:${account}:worker:safe-worker:controls`];
  assert.equal((await f.invoke()).code, "POLICY_DENIED"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { agentId: "other" }, { bindings: identities() }, { include: "bindings" },
    { headers: {} }, { approval: "forged" }, { url_encoded: true }, { page: 1 }]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  const basic = fixture({ selected: false }), out = await basic.invoke();
  assert.equal(out.ok, true); assert.ok(!Object.hasOwn(out.value, "bindings")); safe(basic, out);
});

test("Cloudflare Worker binding actual-core GET retains redaction audit cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.bindings.items, identities());
  assert.equal(p.plan.providerOperationId, "worker-script-get-settings");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(value => value.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare Worker bindings current policy ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare Worker binding drift and audit outage suppress output preserve uncertain replay", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: { bindings: [{ name: "SECRET", type: "secret_key" }] } },
    { auditFailure: true }]) {
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
