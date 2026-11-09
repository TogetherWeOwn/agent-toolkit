import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { currentContentDescriptor } from "../dist/plugins/cloudflare-broker/src/current-content.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const accountId = "a".repeat(32);
const tool = "cloudflare.workers.current_content.digest";
const args = { scriptName: "safe-worker" };
const basicId = `cloudflare:account:${accountId}:worker:safe-worker:current-content`;
const expandedId = `${basicId}:module-digests`;
const scope = { accountId, revision: "resource-1", scriptNames: [args.scriptName], hyperdriveIds: [] };
const source = (expanded = true) => ({ accountId, revision: "resource-1", sourceDigestScriptNames: [args.scriptName, "other-worker"],
  moduleDigestNamesByScript: expanded ? [{ scriptName: args.scriptName, moduleNames: ["main.js"] }] : [] });
const content = "--fixture\r\nContent-Disposition: form-data; name=\"main.js\"\r\n\r\nnever-return-source\r\n--fixture--\r\n";
const operation = selected => cloudflareReadOperations(scope, selected).find(item => item.name === tool);

// Synthetic ports verify source binding only, not native authority or durability.
function fixture(expanded = true, policyId = expanded ? expandedId : basicId) {
  const f = providerFixture({ authority: true });
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [policyId] };
  const receipts = [], requests = [], targets = [];
  const verify = f.dependencies.authority.verify;
  f.dependencies.authority.verify = async target => { targets.push(target); return verify(target); };
  const broker = createCloudflareReadBroker(scope, source(expanded), f.dependencies,
    { async append(record) { receipts.push(record); } }, async (url, init) => {
      requests.push(url);
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(content, { headers: { "content-type": "multipart/form-data; boundary=fixture" } });
    });
  return { ...f, receipts, requests, targets, invoke: () => broker.call(tool, args, "verified-runtime", "call-a") };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, receipts: f.receipts, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary, "never-return-source"]) assert.ok(!serialized.includes(canary));
}

test("Cloudflare content module policy identity snapshots nonempty per-script selection without changing requests or tier", () => {
  const mutable = source();
  const descriptor = currentContentDescriptor(mutable);
  mutable.moduleDigestNamesByScript[0].moduleNames.length = 0;
  mutable.moduleDigestNamesByScript[0].scriptName = "other-worker";
  const expanded = descriptor.prepare(args);
  assert.equal(expanded.resource.id, expandedId);
  assert.equal(descriptor.prepare({ scriptName: "other-worker" }).resource.id, basicId.replace("safe-worker", "other-worker"));
  const basic = currentContentDescriptor(source(false)).prepare(args);
  assert.equal(basic.resource.id, basicId);
  assert.equal(expanded.resource.revision, basic.resource.revision);
  assert.deepEqual(expanded.request, basic.request);
  assert.deepEqual(expanded.arguments, basic.arguments);
  assert.equal(descriptor.tier, "reserved");
  for (const moduleDigestNamesByScript of [undefined, [], [{ scriptName: args.scriptName, moduleNames: [] }]]) {
    const selected = { ...source(), moduleDigestNamesByScript };
    assert.equal(currentContentDescriptor(selected).prepare(args).resource.id, basicId);
  }
  const empty = source(false);
  const capturedEmpty = currentContentDescriptor(empty);
  empty.moduleDigestNamesByScript.push({ scriptName: args.scriptName, moduleNames: ["main.js"] });
  assert.equal(capturedEmpty.prepare(args).resource.id, basicId);
});

test("Cloudflare content policies refuse mismatched basic and module projections before authority or credentials", async () => {
  for (const [expanded, policyId] of [[true, basicId], [false, expandedId]]) {
    const f = fixture(expanded, policyId);
    const result = await f.invoke();
    assert.equal(result.ok, false);
    assert.equal(f.targets.length, 0);
    assert.equal(f.calls.secret, 0);
    assert.equal(f.calls.consumed, 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.receipts.length, 0);
    safe(f, result);
  }
});

test("Cloudflare module content binds exact reserved target, capture, audit, journal, cleanup and replay", async () => {
  for (const expanded of [false, true]) {
    const f = fixture(expanded);
    const result = await f.invoke();
    assert.equal(result.ok, true);
    const target = f.targets[0];
    assert.equal(target.resource.id, expanded ? expandedId : basicId);
    assert.equal(result.value.capture.resource.id, target.resource.id);
    assert.equal(f.receipts[0].targetHash, canonicalHash(target));
    assert.equal(f.receipts[0].valueHash, canonicalHash(result.value));
    assert.ok(f.audit.every(record => record.targetHash === canonicalHash(target)));
    assert.equal([...f.journal.values()][0].target, canonicalHash(target));
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal(f.calls.consumed, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.equal(result.value.moduleAttribution === "not-parsed", !expanded);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare module content rejects authority for the other projection before credentials", async () => {
  for (const expanded of [false, true]) {
    const f = fixture(expanded);
    f.dependencies.authority.verify = async target => ({ reference: "wrong-projection",
      targetHash: canonicalHash({ ...target, resource: { ...target.resource, id: expanded ? basicId : expandedId } }),
      issuedAt: 1000, expiresAt: 2000 });
    const result = await f.invoke();
    assert.equal(result.ok, false);
    assert.equal(f.calls.secret, 0);
    assert.equal(f.calls.consumed, 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.receipts.length, 0);
    safe(f, result);
  }
});

test("Cloudflare content operation rejects swapped prepared projection identities before network", async () => {
  for (const expanded of [false, true]) {
    const op = operation(source(expanded));
    const prepared = op.prepare(args);
    const swapped = { ...prepared, resource: { ...prepared.resource, id: expanded ? basicId : expandedId } };
    await assert.rejects(op.execute(swapped, credentialCanary, new AbortController().signal), /scope/);
  }
});
