import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { dispatchBindingTypes } from "../dist/plugins/cloudflare-broker/src/dispatch-bindings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32);
const versionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", otherVersion = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const args = { scriptName: "safe-worker", versionId }, tool = "cloudflare.workers.versions.get";
const identities = () => [{ name: "SECRET", type: "secret_text" }, { name: "DB", type: "d1" }];
const selection = () => [{ ...args, bindings: identities() }];
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: [args.scriptName], hyperdriveIds: [],
  workerVersions: [{ scriptName: args.scriptName, versionIds: [versionId, otherVersion] }], workerVersionBindings: selection() });
const success = result => JSON.stringify({ success: true, errors: [], result });
const bindings = () => [{ ...identities()[0], text: credentialCanary, key_jwk: { k: derivedCanary },
  algorithm: credentialCanary, usages: [derivedCanary] }, { ...identities()[1], database_id: foreign },
  { name: "UNSELECTED", type: "plain_text", text: credentialCanary }];
const row = () => ({ id: versionId, resources: { bindings: bindings(), script: { etag: foreign },
  script_runtime: { limits: { cpu_ms: 50 } }, source: credentialCanary }, metadata: { author_email: derivedCanary } });
function fixture({ selected = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [], s = scope();
  if (!selected) delete s.workerVersionBindings;
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
    "UNSELECTED", "database_id", "author_email", '"source"', "etag"])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare version binding types match the pinned full-version resources schema", async () => {
  const inventory = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  const entry = inventory.find(value => value.operationId === "worker-versions-get-version-detail");
  assert.equal(entry.typedTool, tool); assert.equal(entry.enablement, "disabled");
  assert.equal(entry.bindingIdentityResponseSchema, "workers_version-item-full");
  assert.equal(entry.bindingIdentityResponsePath, "resources.bindings");
  assert.deepEqual(entry.bindingIdentityTypes, [...dispatchBindingTypes].sort());
  const s = scope(), all = dispatchBindingTypes.map((type, i) => ({ name: `BINDING_${i}`, type }));
  s.workerVersionBindings[0].bindings = all;
  const d = metadataDescriptors(s).versionGet, p = d.prepare(args);
  assert.deepEqual(d.project(success({ id: versionId, resources: { bindings: all.map(value => ({ ...value,
    text: credentialCanary, json: derivedCanary, key_base64: credentialCanary, service: foreign, bucket_name: foreign })) } }), p).bindings.items, all);
});

test("Cloudflare version binding selection is a copied exact-version subset with distinct policy resource", () => {
  const s = scope(), d = metadataDescriptors(s), p = d.versionGet.prepare(args);
  s.workerVersionBindings[0].scriptName = "different"; s.workerVersionBindings[0].versionId = otherVersion;
  s.workerVersionBindings[0].bindings[0].type = "secret_key"; s.workerVersionBindings[0].bindings.push({ name: "EXTRA", type: "queue" });
  s.workerVersions[0].versionIds.length = 0;
  assert.deepEqual(d.versionGet.project(success(row()), p).bindings.items, identities());
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker:safe-worker:version:${versionId}:binding-identities`);
  assert.equal(p.resource.revision, "resource-1");
  assert.equal(p.request.path, `/accounts/${account}/workers/scripts/safe-worker/versions/${versionId}`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.timeoutMs, 10000);
  assert.equal(p.request.maxRequests, 1); assert.equal(p.request.redirects, "deny");
  assert.throws(() => d.versionGet.project(success(row()), { ...p }), /scope/);
  const other = { ...args, versionId: otherVersion }, otherRow = { ...row(), id: otherVersion };
  assert.deepEqual(d.versionGet.project(success(otherRow), d.versionGet.prepare(other)), { id: otherVersion });
  assert.equal(d.versionGet.prepare(other).resource.id, `cloudflare:account:${account}:worker:safe-worker:version:${otherVersion}`);
  const basic = metadataDescriptors({ ...scope(), workerVersionBindings: undefined,
    workerControlScriptNames: [args.scriptName], workerBindingScripts: [{ scriptName: args.scriptName, bindings: identities() }] });
  assert.deepEqual(basic.versionGet.project(success(row()), basic.versionGet.prepare(args)), { id: versionId });
  assert.deepEqual(d.versionsList.project(success({ items: [row()] }), d.versionsList.prepare({ scriptName: args.scriptName, page: 1, perPage: 10 })),
    { items: [{ id: versionId }], complete: false });
  assert.throws(() => metadataDescriptors({ ...scope(), workerVersions: [] }), /scope/);
  assert.throws(() => metadataDescriptors({ ...scope(), scriptNames: [] }), /scope/);
});

test("Cloudflare version binding selections reject invalid paired versions names types duplicates and bounds", () => {
  for (const workerVersionBindings of [null, [null], Array(101).fill(selection()[0]), [selection()[0], selection()[0]],
    [{ ...selection()[0], scriptName: "other-worker" }], [{ ...selection()[0], versionId: "latest" }],
    [{ ...selection()[0], versionId: "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa" }],
    ...[null, [], [null], Array(101).fill(identities()[0]), [identities()[0], identities()[0]],
      [{ name: "bad/name", type: "secret_text" }], [{ name: "SECRET\n", type: "secret_text" }],
      [{ name: "SECRET", type: "future-type" }]].map(bindings => [{ ...args, bindings }])])
    assert.throws(() => metadataDescriptors({ ...scope(), workerVersionBindings }), /scope|schema|cap/);
});

test("Cloudflare version binding projection uses only resources bindings and preserves unavailable and incomplete states", () => {
  const d = metadataDescriptors(scope()).versionGet, p = d.prepare(args), out = d.project(success(row()), p);
  assert.deepEqual(out, { id: versionId, bindings: { subject: "configured-worker-binding-identities", items: identities(),
    complete: false, effectiveAvailability: "not-established" } });
  for (const resources of [undefined, {}]) assert.equal(d.project(success({ id: versionId, resources, bindings: bindings() }), p).bindings, "unavailable");
  for (const bindings of [[], [{ name: "UNSELECTED", type: "future-type" }]]) {
    const value = d.project(success({ id: versionId, resources: { bindings } }), p).bindings;
    assert.deepEqual(value.items, []); assert.equal(value.complete, false);
  }
  for (const bindings of [null, {}, Array(101).fill({ name: "UNSELECTED" }), [null], [{}],
    [{ name: "SECRET" }], [{ name: "SECRET", type: "secret_key" }], [identities()[0], identities()[0]],
    [{ ...identities()[0], account_id: foreign }], [{ ...identities()[0], script_name: "different" }],
    [{ ...identities()[0], version_id: otherVersion }]])
    assert.throws(() => d.project(success({ id: versionId, resources: { bindings } }), p), /scope|upstream|cap/);
  for (const context of [{ account_id: foreign }, { script_name: "different" }, { version_id: otherVersion }])
    assert.throws(() => d.project(success({ id: versionId, resources: { ...context, bindings: bindings() } }), p), /scope/);
  for (const response of [{ ...row(), account_id: foreign }, { ...row(), script_name: "different" }, { ...row(), id: otherVersion },
    { id: versionId, resources: null }]) assert.throws(() => d.project(success(response), p), /scope|upstream/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
  for (const raw of ["null", "{}", "bad-json", JSON.stringify({ success: true, result: row() }), success(null)])
    assert.throws(() => d.project(raw, p), /upstream/);
  safe({ audit: [], journal: [] }, out);
});

test("Cloudflare version bindings compose with separately selected detail and attribution without widening lists", () => {
  const d = metadataDescriptors({ ...scope(), workerVersionDetailScriptNames: [args.scriptName], workerAttributionScriptNames: [args.scriptName] });
  const out = d.versionGet.project(success(row()), d.versionGet.prepare(args));
  assert.deepEqual(out.bindings.items, identities()); assert.equal(out.detail.cpuMs.value, 50);
  assert.equal(out.detail.historicalSourceBinding, "not-established"); assert.equal(out.detail.activeDeployment, "not-established");
  assert.deepEqual(out.attribution.createdOn, { status: "unavailable", reason: "not-returned" });
  const list = d.versionsList.project(success({ items: [row()] }), d.versionsList.prepare({ scriptName: args.scriptName, page: 1, perPage: 10 }));
  assert.ok(!Object.hasOwn(list.items[0], "bindings")); assert.ok(!Object.hasOwn(list.items[0], "detail"));
});

test("Cloudflare version bindings cannot reuse ordinary policy or model overrides", async () => {
  const f = fixture(); f.vector.policy.resources = [`cloudflare:account:${account}:worker:safe-worker:version:${versionId}`];
  assert.equal((await f.invoke()).code, "POLICY_DENIED"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  for (const extra of [{ accountId: foreign }, { agentId: "other" }, { bindings: identities() }, { include: "bindings" },
    { headers: {} }, { approval: "forged" }, { url_encoded: true }, { page: 1 }]) {
    const f = fixture(); assert.equal((await f.invoke({ ...args, ...extra })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
  const basic = fixture({ selected: false }), out = await basic.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value, { id: versionId }); safe(basic, out);
});

test("Cloudflare version bindings actual-core GET retains redaction audit cleanup and replay", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.bindings.items, identities());
  assert.equal(p.plan.providerOperationId, "worker-versions-get-version-detail");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(value => value.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare version bindings current policy ownership and lease-time revocation deny network", async () => {
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

test("Cloudflare version binding drift and audit outage suppress output preserve uncertain replay", async () => {
  for (const options of [{ status: 403 }, { status: 404 },
    { response: { id: versionId, resources: { bindings: [{ name: "SECRET", type: "secret_key" }] } } }, { auditFailure: true }]) {
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
