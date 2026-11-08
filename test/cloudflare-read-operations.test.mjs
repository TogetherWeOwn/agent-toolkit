import assert from "node:assert/strict";
import test from "node:test";
import { createProviderBroker, canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const args = { scriptName: "safe-worker" };
const list = "cloudflare.workers.list";
const secrets = "cloudflare.workers.secret_names";
const content = "cloudflare.workers.current_content.digest";
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker", "other-worker"], hyperdriveIds: [] });
const sourceScope = () => ({ accountId: account, revision: "resource-1", sourceDigestScriptNames: ["safe-worker"] });
const response = result => new Response(JSON.stringify({ success: true, errors: [], result }), { headers: { "content-type": "application/json" } });
const multipart = () => new Response('--fixture\r\nContent-Disposition: form-data; name="main.js"\r\n\r\nnever-return-source\r\n--fixture--\r\n', { headers: { "content-type": "multipart/form-data; boundary=fixture" } });

// Uses only the reviewed core's process-local synthetic fixture, not native host
// authentication, durable production state or an approval issuer implementation.
function fixture({ fetcher = async () => response([{ id: "safe-worker" }]), metadataScope = scope(), source = sourceScope(), authority } = {}) {
  const f = providerFixture(authority === undefined ? {} : { authority });
  const requests = [];
  const operations = cloudflareReadOperations(metadataScope, source, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return fetcher(url, init);
  });
  const prepared = operations.map(op => {
    try { return op.prepare(op.name === list ? {} : args).resource.id; } catch { return null; }
  }).filter(Boolean);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: prepared };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operations, requests, invoke: (tool = list, raw = {}, key = "call-a", context = "verified-runtime") => broker.call(tool, raw, context, key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary, "never-return-source", "never-return-provider-body"]) assert.ok(!serialized.includes(canary));
}
function noEffects(f) {
  assert.equal(f.calls.secret, 0);
  assert.equal(f.requests.length, 0);
}

test("Cloudflare read registry binds account metadata with empty optional family scopes and reserved content", () => {
  const f = fixture();
  assert.equal(f.operations.length, 37);
  assert.equal(new Set(f.operations.map(op => op.name)).size, 37);
  assert.ok(Object.isFrozen(f.operations));
  for (const operation of f.operations) {
    assert.ok(Object.isFrozen(operation));
    assert.equal(operation.lifecycle, "none");
    assert.equal(operation.timeoutMs, 10000);
    assert.equal(operation.tier, operation.name === content ? "reserved" : "read");
    assert.throws(() => operation.project({ items: [] }), /scope/);
  }
  const plan = f.operations.find(op => op.name === secrets).prepare(args);
  assert.equal(plan.plan.providerDryRun, false);
  assert.equal(plan.plan.providerRevisionFence, "not-established");
  assert.equal(plan.artifactDigest, null);
  assert.throws(() => cloudflareReadOperations(scope(), { ...sourceScope(), accountId: "b".repeat(32) }), /scope/);
  assert.throws(() => cloudflareReadOperations(scope(), { ...sourceScope(), revision: "resource-2" }), /scope/);
});

test("Cloudflare metadata executes through core identity, policy, lease, audit and replay boundaries", async () => {
  const f = fixture();
  const result = await f.invoke();
  assert.deepEqual(result.value, { items: [{ id: "safe-worker" }], complete: false });
  assert.equal(f.calls.secret, 1);
  assert.equal(f.calls.close, 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`);
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal(f.audit[0].event, result.event);
  assert.equal(f.audit[1].targetHash, f.audit[0].targetHash);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  f.vector.principal.run = "new-run";
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, result);
});

test("Cloudflare model identity/account/approval/transport overrides and foreign resources never reach credentials", async () => {
  for (const field of ["accountId", "agentId", "approval", "credential", "url", "headers", "versionId"]) {
    const f = fixture();
    assert.equal((await f.invoke(secrets, { ...args, [field]: "forged" })).code, "INVALID_ARGUMENTS");
    noEffects(f);
  }
  const f = fixture();
  assert.equal((await f.invoke(secrets, { scriptName: "foreign-worker" })).code, "INVALID_ARGUMENTS");
  assert.equal((await f.invoke(list, {}, "call-b", { agentId: f.vector.principal.agent })).code, "IDENTITY_UNAVAILABLE");
  assert.equal((await f.invoke("cloudflare.workers.delete", args)).code, "UNKNOWN_TOOL");
  noEffects(f);
});

test("Cloudflare requires both agent and exact resource policy and current host binding", async () => {
  for (const denied of ["agent", "resource", "binding"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["different-agent"];
    if (denied === "resource") f.vector.policy.resources = [`cloudflare:account:${"b".repeat(32)}:workers`];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    assert.equal((await f.invoke()).code, denied === "binding" ? "RESOURCE_CHANGED" : "POLICY_DENIED");
    noEffects(f);
  }
});

test("Cloudflare policy or binding revocation during credential resolution prevents the GET and closes the lease", async () => {
  for (const changed of ["policy", "binding", "identity"]) {
    const f = fixture();
    const resolve = f.dependencies.credentials.resolve;
    f.dependencies.credentials.resolve = async target => {
      const lease = await resolve(target);
      if (changed === "policy") f.vector.policy.revision = "policy-2";
      if (changed === "binding") f.dependencies.host.revalidate = async () => false;
      if (changed === "identity") f.vector.principal.agent = "different-agent";
      return lease;
    };
    assert.equal((await f.invoke()).code, { policy: "POLICY_CHANGED", binding: "RESOURCE_CHANGED", identity: "IDENTITY_UNAVAILABLE" }[changed]);
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.close, 1);
    assert.equal([...f.journal.values()][0].outcome, "refused");
  }
});

test("Cloudflare read output refuses exact and encoded credential reflection even through an allowed ID", async () => {
  for (const reflected of [credentialCanary, Buffer.from(derivedCanary).toString("base64url")]) {
    const f = fixture({ metadataScope: { ...scope(), scriptNames: [reflected] }, fetcher: async () => response([{ id: reflected }]) });
    const result = await f.invoke();
    assert.equal(result.code, "OUTPUT_REFUSED");
    assert.equal(f.calls.close, 1);
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    safe(f, result);
  }
});

test("Cloudflare audit and journal outages refuse before credentials; outcome outage remains uncertain", async () => {
  for (const failed of ["intent", "journal", "outcome"]) {
    const f = fixture();
    const append = f.dependencies.audit.append;
    if (failed === "journal") f.dependencies.journal.claim = async () => { throw Error("never-return-provider-body"); };
    else {
      f.dependencies.audit.append = async record => {
        if (record.phase === failed) throw Error("never-return-provider-body");
        return append(record);
      };
    }
    const result = await f.invoke();
    assert.equal(result.code, { intent: "AUDIT_UNAVAILABLE", journal: "DEPENDENCY_UNAVAILABLE", outcome: "OUTCOME_UNCERTAIN" }[failed]);
    if (failed !== "outcome") noEffects(f);
    else {
      assert.equal(f.requests.length, 1);
      assert.equal([...f.journal.values()][0].outcome, "uncertain");
      f.dependencies.audit.append = append;
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    }
    safe(f, result);
  }
});

test("Cloudflare concurrent responses retain their own prepared request and opaque projection receipt", async () => {
  const waiting = new Map();
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const f = fixture({ fetcher: url => new Promise(resolve => {
    waiting.set(new URL(url).pathname.split("/").at(-2), resolve);
    if (waiting.size === 2) ready();
  }) });
  f.vector.policy.resources.push(f.operations.find(op => op.name === secrets).prepare({ scriptName: "other-worker" }).resource.id);
  const first = f.invoke(secrets, args, "first");
  const second = f.invoke(secrets, { scriptName: "other-worker" }, "second");
  await Promise.race([started,
    first.then(result => assert.fail(`first call completed before both fetches: ${JSON.stringify(result)}`)),
    second.then(result => assert.fail(`second call completed before both fetches: ${JSON.stringify(result)}`))]);
  assert.equal(waiting.size, 2);
  waiting.get("other-worker")(response([{ name: "OTHER_SECRET", type: "secret_text" }]));
  waiting.get("safe-worker")(response([{ name: "SAFE_SECRET", type: "secret_text" }]));
  assert.deepEqual((await first).value.items, [{ name: "SAFE_SECRET", type: "secret_text" }]);
  assert.deepEqual((await second).value.items, [{ name: "OTHER_SECRET", type: "secret_text" }]);
  assert.equal(f.calls.close, 2);
});

test("Cloudflare response receipts reject forgery, cross-operation projection and reuse", async () => {
  const f = fixture({ fetcher: async () => response([{ name: "SAFE_SECRET", type: "secret_text" }]) });
  const op = f.operations.find(op => op.name === secrets);
  const receipt = await op.execute(op.prepare(args), credentialCanary, new AbortController().signal);
  assert.throws(() => op.project({ ...receipt }), /scope/);
  assert.throws(() => f.operations[0].project(receipt), /scope/);
  assert.deepEqual(op.project(receipt).items, [{ name: "SAFE_SECRET", type: "secret_text" }]);
  assert.throws(() => op.project(receipt), /scope/);
});

test("Cloudflare execute refuses substituted prepared resource, arguments or plan before networking", async () => {
  const f = fixture();
  const op = f.operations.find(op => op.name === secrets);
  const prepared = op.prepare(args);
  for (const forged of [{ ...prepared, resource: { ...prepared.resource, revision: "stale" } },
    { ...prepared, plan: { ...prepared.plan, providerDryRun: true } },
    { ...prepared, arguments: { scriptName: "other-worker" } }]) {
    await assert.rejects(op.execute(forged, credentialCanary, new AbortController().signal), /scope/);
  }
  assert.equal(f.requests.length, 0);
});

test("Cloudflare content source scope and missing native authority refuse before credential resolution", async () => {
  const f = fixture({ fetcher: async () => multipart() });
  assert.equal((await f.invoke(content, args)).code, "AUTHORIZATION_UNAVAILABLE");
  noEffects(f);
  const denied = fixture({ source: { ...sourceScope(), sourceDigestScriptNames: [] }, authority: true });
  assert.equal((await denied.invoke(content, args)).code, "INVALID_ARGUMENTS");
  noEffects(denied);
});

test("Cloudflare content rejects stale, target-mismatched and unconsumable synthetic authority", async () => {
  for (const kind of ["stale", "target", "consume"]) {
    const f = fixture({ fetcher: async () => multipart(), authority: true });
    const verify = f.dependencies.authority.verify;
    f.dependencies.authority.verify = async (target, context) => {
      const evidence = await verify(target, context);
      return kind === "stale" ? { ...evidence, expiresAt: 999 } : kind === "target" ? { ...evidence, targetHash: canonicalHash({ ...target, resource: { ...target.resource, revision: "foreign" } }) } : evidence;
    };
    if (kind === "consume") f.dependencies.authority.consume = async () => false;
    assert.equal((await f.invoke(content, args)).code, "AUTHORIZATION_DENIED");
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.secret, kind === "consume" ? 1 : 0);
    assert.equal(f.calls.close, kind === "consume" ? 1 : 0);
  }
});

test("Cloudflare module projection through actual core retains source authority, policy and replay gates", async () => {
  const source = { ...sourceScope(), moduleDigestNamesByScript: [{ scriptName: "safe-worker", moduleNames: ["main.js"] }] };
  const missing = fixture({ source, fetcher: async () => multipart() });
  assert.equal((await missing.invoke(content, args)).code, "AUTHORIZATION_UNAVAILABLE");
  noEffects(missing);
  const denied = fixture({ source, fetcher: async () => multipart(), authority: true });
  denied.vector.policy.agents = ["different-agent"];
  assert.equal((await denied.invoke(content, args)).ok, false);
  noEffects(denied);
  const f = fixture({ source, fetcher: async () => multipart(), authority: true });
  const result = await f.invoke(content, args);
  assert.equal(result.ok, true);
  assert.equal(result.value.moduleAttribution.modules[0].name, "main.js");
  assert.equal(result.value.moduleAttribution.modules[0].subject, "captured-module-part-bytes");
  assert.equal(result.value.libraryVersions, "unavailable");
  assert.equal(f.calls.consumed, 1);
  assert.equal(f.calls.close, 1);
  assert.equal((await f.invoke(content, args)).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, result);
});

test("Cloudflare module projection failure cleans the lease and does not expose malformed source", async () => {
  const source = { ...sourceScope(), moduleDigestNamesByScript: [{ scriptName: "safe-worker", moduleNames: ["missing.js"] }] };
  const f = fixture({ source, fetcher: async () => multipart(), authority: true });
  const result = await f.invoke(content, args);
  assert.equal(result.ok, false);
  assert.equal(f.requests.length, 1);
  assert.equal(f.calls.close, 1);
  assert.equal((await f.invoke(content, args)).code, "REPLAY_CONFLICT");
  safe(f, result);
});

test("Cloudflare authorized synthetic content call returns digest/capture only and consumes exact source target once", async () => {
  const f = fixture({ fetcher: async () => multipart(), authority: true });
  const result = await f.invoke(content, args);
  assert.equal(result.ok, true);
  assert.equal(result.value.semantics, "current-only");
  assert.equal(result.value.digest.subject, "captured-response-body");
  assert.equal(result.value.historicalBinding, "not-established");
  assert.equal(result.value.capture.provenance, "internal-transport-observation");
  assert.equal(f.calls.consumed, 1);
  assert.equal(f.calls.close, 1);
  assert.equal((await f.invoke(content, args)).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, result);
});
