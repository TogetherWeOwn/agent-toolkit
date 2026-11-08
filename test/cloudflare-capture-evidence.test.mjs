import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32);
const content = "cloudflare.workers.current_content.digest";
const list = "cloudflare.workers.list";
const args = { scriptName: "safe-worker" };
const scripts = ["safe-worker", "other-worker"];
const body = value => new Response(`--fixture\r\nContent-Disposition: form-data; name="main.js"\r\n\r\n${value}\r\n--fixture--\r\n`,
  { headers: { "content-type": "multipart/form-data; boundary=fixture" } });

// In-memory sink and native dependencies are synthetic only; these assertions
// establish source composition, not host durability or provider qualification.
function fixture({ names = scripts, authority = true, fetcher, sink } = {}) {
  const f = providerFixture({ authority: authority === false ? null : authority });
  const scope = { accountId, revision: "resource-1", scriptNames: names, hyperdriveIds: [] };
  const source = { accountId, revision: "resource-1", sourceDigestScriptNames: names,
    moduleDigestNamesByScript: names.map(scriptName => ({ scriptName, moduleNames: ["main.js"] })) };
  const operations = cloudflareReadOperations(scope, source);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [
    operations.find(op => op.name === list).prepare({}).resource.id,
    ...names.map(scriptName => operations.find(op => op.name === content).prepare({ scriptName }).resource.id),
  ] };
  const receipts = [], requests = [], order = [];
  const append = f.dependencies.audit.append;
  f.dependencies.audit.append = async record => { order.push(`audit:${record.phase}:${record.decision}`); await append(record); };
  const captureEvidence = { async append(record) {
    order.push("capture");
    assert.ok(Object.isFrozen(record));
    assert.ok(f.calls.close > 0);
    if (sink) await sink(record);
    receipts.push(record);
  } };
  const broker = createCloudflareReadBroker(scope, source, f.dependencies, captureEvidence, async (url, init) => {
    requests.push(url);
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return fetcher ? fetcher(url, init) : body("never-return-source");
  });
  return { ...f, scope, source, receipts, requests, order,
    invoke: (tool = content, raw = args, key = "call-a", context = "verified-runtime") => broker.call(tool, raw, context, key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, receipts: f.receipts, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary, "never-return-source", "never-return-provider-body"]) assert.ok(!serialized.includes(canary));
}

test("Cloudflare capture composition requires an explicit evidence sink with no production default", () => {
  const f = fixture();
  for (const sink of [undefined, null, {}, { append: true }]) {
    assert.throws(() => createCloudflareReadBroker(f.scope, f.source, f.dependencies, sink), /schema/);
  }
  assert.equal(f.requests.length, 0);
  assert.equal(f.calls.secret, 0);
});

test("Cloudflare capture receipt binds exact credential-filtered projection, core event and authorization target", async () => {
  const f = fixture();
  const result = await f.invoke();
  assert.equal(result.ok, true);
  assert.equal(f.receipts.length, 1);
  assert.deepEqual(f.receipts[0], {
    contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-current-content-projection",
    event: result.event, targetHash: f.audit[0].targetHash, valueHash: canonicalHash(result.value),
  });
  assert.equal(f.receipts[0].targetHash, [...f.journal.values()][0].target);
  assert.equal(result.value.capture.provenance, "internal-transport-observation");
  assert.equal(result.value.moduleAttribution.complete, false);
  assert.deepEqual(f.order, ["audit:intent:ALLOW", "capture", "audit:outcome:ALLOW"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal(f.calls.consumed, 1);
  assert.equal(f.calls.close, 1);
  safe(f, result);
});

test("Cloudflare capture does not return success or ALLOW outcome before evidence persistence resolves", async () => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const persisted = new Promise(resolve => { release = resolve; });
  const f = fixture({ sink: async () => { enter(); await persisted; } });
  const pending = f.invoke();
  await Promise.race([entered, pending.then(result => assert.fail(`returned before capture: ${JSON.stringify(result)}`))]);
  assert.deepEqual(f.audit.map(record => record.phase), ["intent"]);
  assert.equal(f.receipts.length, 0);
  assert.equal(f.calls.close, 1);
  release();
  assert.equal((await pending).ok, true);
  assert.equal(f.receipts.length, 1);
});

test("Cloudflare missing identity, policy, binding or source authority cannot persist a capture receipt", async () => {
  for (const denied of ["identity", "policy", "binding", "authority"]) {
    const f = fixture({ authority: denied !== "authority" });
    if (denied === "policy") f.vector.policy.agents = ["foreign-agent"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    const result = await f.invoke(content, args, "call-a", denied === "identity" ? {} : "verified-runtime");
    assert.equal(result.ok, false);
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.receipts.length, 0);
    safe(f, result);
  }
});

test("Cloudflare evidence sink failure suppresses output, preserves uncertain tombstone and refuses replay", async () => {
  const f = fixture({ sink: async () => { throw Error("never-return-provider-body"); } });
  const result = await f.invoke();
  assert.deepEqual({ ok: result.ok, code: result.code, value: result.value },
    { ok: false, code: "OUTCOME_UNCERTAIN", value: undefined });
  assert.equal(f.receipts.length, 0);
  assert.equal(f.calls.close, 1);
  assert.equal([...f.journal.values()][0].outcome, "uncertain");
  assert.deepEqual(f.audit.map(record => record.decision), ["ALLOW", "OUTCOME_UNCERTAIN"]);
  f.vector.principal.run = "new-run";
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, result);
});

test("Cloudflare persisted observation is not success when the subsequent core outcome audit fails", async () => {
  const f = fixture();
  const append = f.dependencies.audit.append;
  f.dependencies.audit.append = async record => {
    if (record.phase === "outcome" && record.decision === "ALLOW") throw Error("never-return-provider-body");
    return append(record);
  };
  const result = await f.invoke();
  assert.equal(result.code, "OUTCOME_UNCERTAIN");
  assert.equal(result.value, undefined);
  assert.equal(f.receipts.length, 1);
  assert.equal(f.receipts[0].event, result.event);
  assert.equal([...f.journal.values()][0].outcome, "uncertain");
  assert.equal(f.audit.some(record => record.phase === "outcome" && record.decision === "ALLOW"), false);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.receipts.length, 1);
  safe(f, result);
});

test("Cloudflare malformed and credential-reflecting content never reaches the evidence sink", async () => {
  for (const kind of ["malformed", "reflection", "cleanup"]) {
    const f = fixture({ names: kind === "reflection" ? [credentialCanary] : scripts,
      fetcher: kind === "malformed" ? async () => new Response("never-return-provider-body") : undefined });
    if (kind === "cleanup") f.dependencies.credentials.resolve = async () => ({
      value: credentialCanary, redactions: [derivedCanary], async close() { throw Error("never-return-provider-body"); },
    });
    const result = await f.invoke(content, kind === "reflection" ? { scriptName: credentialCanary } : args);
    assert.equal(result.ok, false);
    assert.equal(f.receipts.length, 0);
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare ordinary metadata reads do not write source evidence or need source authority", async () => {
  const f = fixture({ authority: false, sink: async () => { throw Error("unavailable"); },
    fetcher: async () => new Response(JSON.stringify({ success: true, result: [{ id: "safe-worker" }] }),
      { headers: { "content-type": "application/json" } }) });
  const result = await f.invoke(list, {});
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.items, [{ id: "safe-worker" }]);
  assert.equal(f.receipts.length, 0);
  assert.equal(f.calls.consumed, 0);
  safe(f, result);
});

test("Cloudflare concurrent out-of-order captures retain independent event, target and projection bindings", async () => {
  const waiting = new Map();
  let enter;
  const entered = new Promise(resolve => { enter = resolve; });
  const f = fixture({ fetcher: url => new Promise(resolve => {
    waiting.set(new URL(url).pathname.split("/").at(-3), resolve);
    if (waiting.size === 2) enter();
  }) });
  // Independent synthetic grants per target, not the fixture's single grant slot.
  const grants = new Set();
  f.dependencies.authority = {
    async verify(target) {
      const targetHash = canonicalHash(target);
      grants.add(targetHash);
      return { reference: `grant-${targetHash.slice(0, 16)}`, targetHash, issuedAt: 1000, expiresAt: 2000 };
    },
    async consume(evidence, target) { return evidence.targetHash === canonicalHash(target) && grants.delete(evidence.targetHash); },
  };
  const first = f.invoke(content, args, "first");
  const second = f.invoke(content, { scriptName: "other-worker" }, "second");
  await Promise.race([entered,
    first.then(result => assert.fail(`first returned early: ${JSON.stringify(result)}`)),
    second.then(result => assert.fail(`second returned early: ${JSON.stringify(result)}`))]);
  waiting.get("other-worker")(body("other-source"));
  const other = await second;
  waiting.get("safe-worker")(body("safe-source"));
  const safeResult = await first;
  assert.equal(other.ok, true);
  assert.equal(safeResult.ok, true);
  assert.equal(f.receipts.length, 2);
  assert.notEqual(other.event, safeResult.event);
  assert.notEqual(canonicalHash(other.value), canonicalHash(safeResult.value));
  for (const result of [other, safeResult]) {
    const receipt = f.receipts.find(record => record.event === result.event);
    assert.equal(receipt.valueHash, canonicalHash(result.value));
    assert.equal(receipt.targetHash, f.audit.find(record => record.event === result.event).targetHash);
  }
  assert.notEqual(f.receipts[0].targetHash, f.receipts[1].targetHash);
  safe(f, { other, safeResult });
});
