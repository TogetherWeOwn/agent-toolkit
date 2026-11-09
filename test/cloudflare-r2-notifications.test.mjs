import assert from "node:assert/strict";
import test from "node:test";
import { r2NotificationDescriptors } from "../dist/plugins/cloudflare-broker/src/r2-notifications.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const queueId = "b".repeat(32);
const ruleId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const foreign = "d".repeat(32);
const args = { bucketName: "safe-bucket" };
const scope = (jurisdiction = "eu") => ({ accountId: account, revision: "resource-1",
  buckets: [{ bucketName: args.bucketName, jurisdiction, queues: [{ queueId, ruleIds: [ruleId] }] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const rule = () => ({ ruleId, actions: ["PutObject", "LifecycleDeletion"], description: credentialCanary, prefix: derivedCanary, suffix: credentialCanary });
const queue = () => ({ queueId, queueName: derivedCanary, rules: [rule(), { ruleId: foreign, actions: ["DeleteObject"] }] });
const row = () => ({ bucketName: args.bucketName, queues: [queue(), { queueId: foreign, queueName: credentialCanary }], objects: credentialCanary });
const cases = [
  ["notificationsList", "cloudflare.r2.notifications.list", args, "", row],
  ["notificationGet", "cloudflare.r2.notifications.get", { ...args, queueId }, `/queues/${queueId}`, queue],
];
function fixture({ tool, input, result, jurisdiction = "eu", buckets = scope(jurisdiction).buckets, status = 200 }) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    defaultBucketNames: [args.bucketName], queueIds: [queueId], r2NotificationBuckets: buckets },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(result), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(input).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (raw = input, key = "call-a") => broker.call(tool, raw, "verified-runtime", key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign]) assert.ok(!serialized.includes(value));
}

test("Cloudflare notification scope copies bucket/jurisdiction/queue/rule associations independently", () => {
  const s = scope();
  const descriptors = r2NotificationDescriptors(s);
  s.buckets[0].jurisdiction = "default";
  s.buckets[0].queues[0].ruleIds.push(foreign);
  s.buckets[0].queues.push({ queueId: foreign, ruleIds: [ruleId] });
  s.buckets.push({ bucketName: "other-bucket", jurisdiction: "eu", queues: [] });
  s.accountId = foreign;
  for (const [key, , input, suffix, result] of cases) {
    const d = descriptors[key];
    const p = d.prepare(input);
    assert.equal(p.request.path, `/accounts/${account}/event_notifications/r2/${args.bucketName}/configuration${suffix}`);
    assert.equal(p.request.r2Jurisdiction, "eu");
    assert.ok(p.resource.id.includes(":jurisdiction:eu:"));
    for (const v of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(v));
    assert.throws(() => d.prepare({ ...input, bucketName: "other-bucket" }), /scope/);
    assert.throws(() => d.project(success(result()), { ...p }), /scope/);
    assert.equal(d.project(success(result()), p).queues[0].rules.length, 1);
  }
  assert.throws(() => descriptors.notificationGet.prepare({ ...args, queueId: foreign }), /scope/);
  const entry = scope().buckets[0];
  for (const buckets of [[entry, { ...entry }], [{ ...entry, jurisdiction: "us" }],
    [{ ...entry, queues: [entry.queues[0], entry.queues[0]] }],
    [{ ...entry, queues: [{ queueId, ruleIds: [ruleId, ruleId] }] }]]) {
    assert.throws(() => r2NotificationDescriptors({ ...scope(), buckets }), /schema/);
  }
  for (const buckets of [Array(101).fill(entry), [{ ...entry, queues: Array(101).fill(entry.queues[0]) }],
    [{ ...entry, queues: [{ queueId, ruleIds: Array(101).fill(ruleId) }] }],
    [{ ...entry, queues: [{ queueId, ruleIds: [] }] }]]) {
    assert.throws(() => r2NotificationDescriptors({ ...scope(), buckets }), /cap/);
  }
});

test("Cloudflare notification projection returns only selected IDs and configured actions", () => {
  const descriptors = r2NotificationDescriptors(scope());
  for (const [key, , input, , result] of cases) {
    const d = descriptors[key];
    const out = d.project(success(result()), d.prepare(input));
    assert.deepEqual(out, { bucketName: args.bucketName, requestedJurisdiction: "eu", queues: [{ queueId,
      rules: [{ ruleId, actions: ["PutObject", "LifecycleDeletion"] }], complete: false }],
    subject: "configured-selected-event-notifications", complete: false,
    effectiveDelivery: "not-established", recoveryCustody: "not-established" });
    for (const value of [out, out.queues, out.queues[0], out.queues[0].rules, out.queues[0].rules[0], out.queues[0].rules[0].actions]) assert.ok(Object.isFrozen(value));
    safe({ audit: [], journal: [] }, out);
  }
  const d = descriptors.notificationsList;
  assert.deepEqual(d.project(success({ bucketName: args.bucketName, queues: [] }), d.prepare(args)).queues, []);
});

test("Cloudflare notification malformed, duplicate, foreign and oversized responses refuse", () => {
  const descriptors = r2NotificationDescriptors(scope());
  for (const [key, , input, , result] of cases) {
    const d = descriptors[key];
    const p = d.prepare(input);
    for (const patch of [{ account_id: foreign }, { bucketName: "other-bucket" }, { jurisdiction: "default" }]) {
      assert.throws(() => d.project(success({ ...result(), ...patch }), p), /scope/);
    }
    const wrap = q => key === "notificationGet" ? q : { bucketName: args.bucketName, queues: [q] };
    for (const actions of [undefined, null, [], ["Unknown"], ["PutObject", "PutObject"], [credentialCanary]]) {
      assert.throws(() => d.project(success(wrap({ ...queue(), rules: [{ ...rule(), actions }] })), p), /upstream/);
    }
    assert.throws(() => d.project(success(wrap({ ...queue(), rules: [rule(), rule()] })), p), /upstream/);
    assert.throws(() => d.project(success(wrap({ ...queue(), rules: Array(101).fill(rule()) })), p), /cap/);
    for (const raw of ["null", "{}", "not-json", success(null), success({}), JSON.stringify({ success: true, result: result() }),
      JSON.stringify({ success: false, errors: [], result: result() }), JSON.stringify({ success: true, errors: [credentialCanary], result: result() })]) assert.throws(() => d.project(raw, p));
    assert.throws(() => d.project(success({ ...result(), padding: "x".repeat(131072) }), p), /cap/);
  }
  const d = descriptors.notificationsList;
  assert.throws(() => d.project(success({ queues: [queue()] }), d.prepare(args)), /scope/);
  assert.throws(() => d.project(success({ bucketName: args.bucketName, queues: [queue(), queue()] }), d.prepare(args)), /upstream/);
  assert.throws(() => d.project(success({ bucketName: args.bucketName, queues: Array(101).fill(queue()) }), d.prepare(args)), /cap/);
  const get = descriptors.notificationGet;
  assert.throws(() => get.project(success({ ...queue(), queueId: foreign }), get.prepare({ ...args, queueId })), /scope/);
});

test("Cloudflare notification default-empty scopes and model overrides refuse before credentials", async () => {
  for (const [, tool, input, , result] of cases) {
    for (const buckets of [[], [{ ...scope().buckets[0], queues: [] }]]) {
      const f = fixture({ tool, input, result: result(), buckets });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ jurisdiction: "default" }, { ruleIds: [foreign] }, { accountId: foreign }, { bucketName: "other-bucket" },
      { headers: { "cf-r2-jurisdiction": "default" } }, { approval: "forged" }, { agentId: "other" }, { prefix: "" }]) {
      const f = fixture({ tool, input, result: result() });
      assert.equal((await f.invoke({ ...input, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare notification actual-core plans bind fixed default/EU requests, redaction and replay", async () => {
  for (const [, tool, input, suffix, result] of cases) for (const jurisdiction of ["default", "eu"]) {
    const f = fixture({ tool, input, result: result(), jurisdiction });
    const prepared = f.operation.prepare(input);
    assert.equal(prepared.plan.request.r2Jurisdiction, jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(prepared.plan.providerDryRun, false);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.requestedJurisdiction, jurisdiction);
    assert.equal(out.value.queues[0].rules[0].ruleId, ruleId);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/event_notifications/r2/${args.bucketName}/configuration${suffix}`);
    assert.equal(f.requests[0].init.headers["cf-r2-jurisdiction"], jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare notification current agent/resource/binding and lease-time revocation deny", async () => {
  for (const [, tool, input, , result] of cases) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture({ tool, input, result: result() });
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = [f.operation.prepare(input).resource.id.replace(":eu:", ":default:")];
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

test("Cloudflare notification foreign responses and provider 404 retain uncertain replay tombstones", async () => {
  for (const [, tool, input, , result] of cases) for (const status of [200, 404]) {
    const f = fixture({ tool, input, result: { ...result(), account_id: foreign }, status });
    assert.equal((await f.invoke()).code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
  }
});

test("Cloudflare notification EU header stays on exact paths without denial fallback", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { calls++; throw new Error("must-not-call"); });
  const descriptors = r2NotificationDescriptors(scope());
  for (const [key, , input] of cases) {
    const d = descriptors[key];
    const p = d.prepare(input);
    for (const path of [p.request.path + "?jurisdiction=eu", p.request.path + "/rules", p.request.path.replace("configuration", "objects"),
      p.request.path.replace("event_notifications", "queues")]) {
      await assert.rejects(read({ ...d, prepare: () => ({ ...p, request: { ...p.request, path } }) }, input, credentialCanary, new AbortController().signal));
      assert.equal(calls, 0);
    }
  }
  const unavailable = metadataTransport(async (_url, init) => {
    calls++;
    assert.equal(init.headers["cf-r2-jurisdiction"], "eu");
    return new Response("denied", { status: 403 });
  });
  await assert.rejects(unavailable(descriptors.notificationsList, args, credentialCanary, new AbortController().signal));
  assert.equal(calls, 1);
});
