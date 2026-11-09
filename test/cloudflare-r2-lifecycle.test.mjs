import assert from "node:assert/strict";
import test from "node:test";
import { r2LifecycleDescriptor } from "../dist/plugins/cloudflare-broker/src/r2-lifecycle.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const args = { bucketName: "safe-bucket" };
const tool = "cloudflare.r2.lifecycle.get";
const scope = (jurisdiction = "eu") => ({ accountId: account, revision: "resource-1",
  buckets: [{ bucketName: args.bucketName, jurisdiction, prefixes: ["backups/"] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const age = { type: "Age", maxAge: 86400 };
const date = { type: "Date", date: "2026-11-09T06:00:00.123456789Z" };
const rule = () => ({ id: "private-rule-label", enabled: true, conditions: { prefix: "backups/" },
  deleteObjectsTransition: { condition: age }, abortMultipartUploadsTransition: { condition: { ...age, maxAge: 0 } },
  storageClassTransitions: [{ condition: date, storageClass: "InfrequentAccess" }], objects: credentialCanary });
const row = () => ({ rules: [rule(), { ...rule(), id: "unrelated", conditions: { prefix: "private/" },
  deleteObjectsTransition: { condition: { type: derivedCanary } } }], objects: credentialCanary });
function fixture({ jurisdiction = "eu", buckets = scope(jurisdiction).buckets, result = row() } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [], r2LifecycleBuckets: buckets },
    { accountId: account, revision: "resource-1" }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(success(result), { headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(args).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (raw = args, key = "call-a") => broker.call(tool, raw, "verified-runtime", key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "private-rule-label", "private/"]) assert.ok(!serialized.includes(value));
}

test("Cloudflare lifecycle scope copies independent bucket/prefix/jurisdiction snapshots", () => {
  const s = scope();
  const descriptor = r2LifecycleDescriptor(s);
  s.buckets[0].jurisdiction = "default";
  s.buckets[0].prefixes.push("private/");
  s.buckets.push({ bucketName: "other-bucket", jurisdiction: "eu", prefixes: [""] });
  s.accountId = "f".repeat(32);
  const p = descriptor.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${account}:r2:jurisdiction:eu:bucket:${args.bucketName}:lifecycle`);
  assert.equal(p.request.path, `/accounts/${account}/r2/buckets/${args.bucketName}/lifecycle`);
  assert.equal(p.request.r2Jurisdiction, "eu");
  for (const value of [p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => descriptor.prepare({ bucketName: "other-bucket" }), /scope/);
  assert.equal(descriptor.project(success(row()), p).rules.length, 1);
  assert.throws(() => descriptor.project(success(row()), { ...p }), /scope/);
  for (const buckets of [[scope().buckets[0], scope("default").buckets[0]], [{ ...scope().buckets[0], prefixes: ["x", "x"] }],
    [{ ...scope().buckets[0], jurisdiction: "us" }]]) assert.throws(() => r2LifecycleDescriptor({ ...scope(), buckets }), /schema/);
  for (const value of ["safe-bucket\n", "../safe-bucket", "safe-bucket?jurisdiction=eu"]) assert.throws(() => r2LifecycleDescriptor({ ...scope(), buckets: [{ ...scope().buckets[0], bucketName: value }] }));
});

test("Cloudflare lifecycle projects configured selected transitions, never deletion or custody guarantees", () => {
  const d = r2LifecycleDescriptor(scope());
  const p = d.prepare(args);
  const out = d.project(success(row()), p);
  assert.deepEqual(out, { bucketName: args.bucketName, requestedJurisdiction: "eu", rules: [{ prefix: "backups/", enabled: true,
    deleteObjects: age, abortMultipartUploads: { type: "Age", maxAge: 0 }, storageClassTransitions: [{ condition: date, storageClass: "InfrequentAccess" }] }],
    subject: "configured-prefix-lifecycle", complete: false, effectiveDeletion: "not-established", recoveryCustody: "not-established" });
  for (const value of [out, out.rules, out.rules[0], out.rules[0].deleteObjects, out.rules[0].storageClassTransitions, out.rules[0].storageClassTransitions[0]]) assert.ok(Object.isFrozen(value));
  const omitted = { ...rule(), enabled: false, deleteObjectsTransition: undefined, abortMultipartUploadsTransition: undefined, storageClassTransitions: undefined };
  const projected = d.project(success({ rules: [omitted] }), p).rules[0];
  for (const key of ["deleteObjects", "abortMultipartUploads", "storageClassTransitions"]) assert.deepEqual(projected[key], { status: "unavailable", reason: "not-returned" });
  assert.deepEqual(d.project(success({ rules: [] }), p).rules, []);
  const all = r2LifecycleDescriptor({ ...scope(), buckets: [{ ...scope().buckets[0], prefixes: [""] }] });
  assert.equal(all.project(success({ rules: [{ ...rule(), conditions: { prefix: "" } }] }), all.prepare(args)).rules[0].prefix, "");
  assert.deepEqual(d.project(success({ rules: [{ ...rule(), conditions: { prefix: "" } }] }), p).rules, []);
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
});

test("Cloudflare lifecycle malformed transitions, duplicate IDs and excessive results refuse", () => {
  const d = r2LifecycleDescriptor(scope());
  const p = d.prepare(args);
  for (const condition of [{ type: "Age", maxAge: -1 }, { type: "Age", maxAge: 1.5 }, { type: "Age", maxAge: Number.MAX_SAFE_INTEGER + 1 },
    { type: "Age", maxAge: 1, date: date.date }, { type: "Date", date: "2026-02-30T06:00:00Z" }, { type: "Date", date: date.date + "\n" }, { type: "Indefinite" }]) {
    assert.throws(() => d.project(success({ rules: [{ ...rule(), deleteObjectsTransition: { condition } }] }), p), /upstream/);
  }
  for (const patch of [{ enabled: "true" }, { conditions: {} }, { deleteObjectsTransition: {} }, { abortMultipartUploadsTransition: { condition: date } },
    { storageClassTransitions: [{ condition: age, storageClass: "Standard" }] }, { deleteObjectsTransition: null }]) {
    assert.throws(() => d.project(success({ rules: [{ ...rule(), ...patch }] }), p));
  }
  assert.throws(() => d.project(success({ rules: [rule(), rule()] }), p), /upstream/);
  assert.throws(() => d.project(success({ rules: Array(101).fill(rule()) }), p), /cap/);
  assert.throws(() => d.project(success({ rules: [{ ...rule(), storageClassTransitions: Array(11).fill({ condition: age, storageClass: "InfrequentAccess" }) }] }), p), /cap/);
  assert.throws(() => d.project(success({ rules: [], padding: "x".repeat(131072) }), p), /cap/);
  for (const raw of ["null", "{}", "not-json", JSON.stringify({ success: true, result: { rules: [] } }), success({})]) assert.throws(() => d.project(raw, p));
  for (const patch of [{ account_id: "f".repeat(32) }, { bucket_name: "other-bucket" }, { jurisdiction: "default" }]) assert.throws(() => d.project(success({ ...row(), ...patch }), p), /scope/);
});

test("Cloudflare lifecycle missing independent scope and model overrides refuse before credentials", async () => {
  for (const buckets of [[], [{ ...scope().buckets[0], prefixes: [] }]]) {
    const f = fixture({ buckets });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  for (const patch of [{ jurisdiction: "default" }, { prefix: "private/" }, { accountId: "f".repeat(32) }, { bucketName: "other-bucket" },
    { headers: { "cf-r2-jurisdiction": "default" } }, { approval: "forged" }, { agentId: "other" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare lifecycle core plan binds default/EU transport, safe output, cleanup and replay", async () => {
  for (const jurisdiction of ["default", "eu"]) {
    const f = fixture({ jurisdiction });
    const plan = f.operation.prepare(args);
    assert.equal(plan.plan.request.r2Jurisdiction, jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(plan.plan.providerDryRun, false);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.requestedJurisdiction, jurisdiction);
    assert.equal(f.requests[0].init.headers["cf-r2-jurisdiction"], jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${args.bucketName}/lifecycle`);
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

test("Cloudflare lifecycle agent/resource/binding and lease-time revocation deny before network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = [f.operation.prepare(args).resource.id.replace(":eu:", ":default:")];
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

test("Cloudflare lifecycle malformed/foreign responses preserve uncertain replay tombstones", async () => {
  for (const result of [{ ...row(), jurisdiction: "default" }, { ...row(), account_id: "f".repeat(32) }, { rules: [{ ...rule(), enabled: "yes" }] }]) {
    const f = fixture({ result });
    const out = await f.invoke();
    assert.equal(out.code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare lifecycle EU header refuses unsupported path suffixes and query overrides", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { calls++; throw new Error("must-not-call"); });
  const d = r2LifecycleDescriptor(scope());
  const p = d.prepare(args);
  for (const path of [p.request.path + "?jurisdiction=eu", p.request.path + "/objects", p.request.path.replace("lifecycle", "objects")]) {
    await assert.rejects(read({ ...d, prepare: () => ({ ...p, request: { ...p.request, path } }) }, args, credentialCanary, new AbortController().signal));
    assert.equal(calls, 0);
  }
});
