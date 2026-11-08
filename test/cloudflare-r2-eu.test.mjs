import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const args = { bucketName: "safe-eu-bucket" };
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
  euBucketNames: [args.bucketName], euBucketLocks: [{ bucketName: args.bucketName, prefixes: ["backups/"] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const rule = { id: "private-rule-label", prefix: "backups/", enabled: true, condition: { type: "Indefinite" } };
const bucketRow = { name: args.bucketName, jurisdiction: "eu", account_id: account, objects: credentialCanary, location: derivedCanary };
const lockRow = { rules: [rule, { ...rule, id: "unrelated", prefix: derivedCanary, condition: { type: credentialCanary } }] };
const get = "cloudflare.r2.get";
const locks = "cloudflare.r2.locks.get";
function fixture(name = locks, result = name === get ? bucketRow : lockRow, input = scope()) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations(input,
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(success(result), { headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === name);
  let resource;
  try { resource = operation.prepare(args).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (raw = args, key = "call-a") => broker.call(name, raw, "verified-runtime", key) };
}
function safe(f, result) {
  const value = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary, rule.id]) assert.ok(!value.includes(canary));
}

test("Cloudflare EU bucket and lock scope snapshots bind jurisdiction independently of model arguments", () => {
  const input = scope();
  const d = metadataDescriptors(input);
  input.euBucketNames.push("other-bucket");
  input.euBucketLocks[0].prefixes.push("private/");
  input.accountId = "f".repeat(32);
  for (const [descriptor, suffix] of [[d.r2Get, ""], [d.r2LocksGet, ":locks"]]) {
    const p = descriptor.prepare(args);
    assert.equal(p.resource.id, `cloudflare:account:${account}:r2:jurisdiction:eu:bucket:${args.bucketName}${suffix}`);
    assert.equal(p.request.r2Jurisdiction, "eu");
    assert.equal(p.request.path, `/accounts/${account}/r2/buckets/${args.bucketName}${suffix ? "/lock" : ""}`);
    for (const value of [p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.throws(() => descriptor.prepare({ bucketName: "other-bucket" }), /scope/);
  }
  assert.deepEqual(d.r2LocksGet.project(success({ rules: [{ ...rule, prefix: "private/" }] }), d.r2LocksGet.prepare(args)).rules, []);
  const overlap = { ...scope(), defaultBucketNames: [args.bucketName] };
  assert.throws(() => metadataDescriptors(overlap), /schema/);
  assert.throws(() => metadataDescriptors({ ...scope(), euBucketLocks: [scope().euBucketLocks[0], scope().euBucketLocks[0]] }), /schema/);
  assert.throws(() => metadataDescriptors({ ...scope(), euBucketLocks: [{ bucketName: "other-bucket", prefixes: [""] }] }), /scope/);
  assert.throws(() => metadataDescriptors({ ...scope(), euBucketLocks: [{ bucketName: args.bucketName, prefixes: ["backups/", "backups/"] }] }), /schema/);
  for (const field of ["euBucketNames", "euBucketLocks"]) assert.throws(() => metadataDescriptors({ ...scope(), [field]: Array(101).fill(scope()[field][0]) }), /cap/);
});

test("Cloudflare EU configured lock projection is prefix-limited, bounded and never effective custody proof", () => {
  const d = metadataDescriptors(scope()).r2LocksGet;
  const p = d.prepare(args);
  const out = d.project(success(lockRow), p);
  assert.deepEqual(out, { bucketName: args.bucketName, requestedJurisdiction: "eu", rules: [{ prefix: "backups/", enabled: true, condition: { type: "Indefinite" } }],
    complete: false, subject: "configured-prefix-locks", effectiveProtection: "not-established" });
  assert.ok(!JSON.stringify(out).includes(derivedCanary));
  for (const condition of [{ type: "Age", maxAgeSeconds: 0 }, { type: "Date", date: "2026-11-08T06:00:00Z" }, { type: "Indefinite" }]) {
    assert.deepEqual(d.project(success({ rules: [{ ...rule, enabled: false, condition }] }), p).rules[0].condition, condition);
  }
  assert.deepEqual(d.project(success({ rules: [{ ...rule, prefix: undefined }] }), p).rules, []);
  const all = metadataDescriptors({ ...scope(), euBucketLocks: [{ bucketName: args.bucketName, prefixes: [""] }] }).r2LocksGet;
  assert.equal(all.project(success({ rules: [{ ...rule, prefix: "" }] }), all.prepare(args)).rules[0].prefix, "");
  assert.throws(() => d.project(success({ rules: [rule, rule] }), p), /upstream/);
  assert.throws(() => d.project(success({ rules: Array(101).fill(rule) }), p), /cap/);
  assert.throws(() => d.project(success({ rules: [], padding: "x".repeat(131072) }), p), /cap/);
  for (const condition of [{ type: "Age", maxAgeSeconds: -1 }, { type: "Age", maxAgeSeconds: 1.5 }, { type: "Date", date: "2026-02-30T06:00:00Z" }, { type: "Indefinite", maxAgeSeconds: 0 }, { type: "Unknown" }]) {
    assert.throws(() => d.project(success({ rules: [{ ...rule, condition }] }), p));
  }
  for (const result of [null, {}, { rules: null }, { rules: [{ ...rule, enabled: "true" }] }]) assert.throws(() => d.project(success(result), p));
});

test("Cloudflare EU detail requires provider jurisdiction and foreign response associations refuse", () => {
  const d = metadataDescriptors(scope());
  assert.deepEqual(d.r2Get.project(success(bucketRow), d.r2Get.prepare(args)), { name: args.bucketName, jurisdiction: "eu" });
  for (const patch of [{ name: "other-bucket" }, { jurisdiction: "default" }, { jurisdiction: undefined }, { account_id: "f".repeat(32) }]) {
    assert.throws(() => d.r2Get.project(success({ ...bucketRow, ...patch }), d.r2Get.prepare(args)), /scope/);
  }
  for (const patch of [{ jurisdiction: "default" }, { bucket_name: "other-bucket" }, { account_id: "f".repeat(32) }]) {
    assert.throws(() => d.r2LocksGet.project(success({ ...lockRow, ...patch }), d.r2LocksGet.prepare(args)), /scope/);
  }
  const p = d.r2LocksGet.prepare(args);
  assert.throws(() => d.r2LocksGet.project(success(lockRow), { ...p, request: { ...p.request, r2Jurisdiction: undefined } }), /scope/);
});

test("Cloudflare EU empty scope and model jurisdiction/header/account/prefix overrides refuse before credentials", async () => {
  for (const name of [get, locks]) {
    const empty = fixture(name, undefined, { accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [] });
    assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(empty.calls.secret, 0);
    const defaultOnly = fixture(name, undefined, { accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [], defaultBucketNames: ["other-bucket"] });
    assert.equal((await defaultOnly.invoke()).code, "INVALID_ARGUMENTS");
    for (const patch of [{ jurisdiction: "default" }, { r2Jurisdiction: "default" }, { headers: { "cf-r2-jurisdiction": "default" } }, { accountId: "f".repeat(32) }, { prefix: "private/" }, { bucketName: "other-bucket" }]) {
      const f = fixture(name);
      assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
  const noLocks = fixture(locks, undefined, { ...scope(), euBucketLocks: undefined });
  assert.equal((await noLocks.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(noLocks.calls.secret, 0);
});

test("Cloudflare EU transport only admits pinned EU headers on exact bucket and lock paths", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { calls++; return new Response(success(bucketRow), { headers: { "content-type": "application/json" } }); });
  const descriptor = metadataDescriptors(scope()).r2Get;
  const p = descriptor.prepare(args);
  for (const patch of [{ r2Jurisdiction: "us" }, { path: `/accounts/${account}/workers/scripts` }, { path: p.request.path + "?jurisdiction=eu" }]) {
    const changed = { ...descriptor, prepare: () => ({ ...p, request: { ...p.request, ...patch } }) };
    await assert.rejects(read(changed, args, credentialCanary, new AbortController().signal));
    assert.equal(calls, 0);
  }
});

test("Cloudflare EU reads bind header into actual-core plans and preserve cleanup, safe audit and replay refusal", async () => {
  for (const name of [get, locks]) {
    const f = fixture(name);
    assert.equal(f.operation.prepare(args).plan.request.r2Jurisdiction, "eu");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(f.requests[0].init.headers["cf-r2-jurisdiction"], "eu");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${args.bucketName}${name === locks ? "/lock" : ""}`);
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

test("Cloudflare EU policy, resource and lease-time revocation remain pre-network gates", async () => {
  for (const name of [get, locks]) {
    for (const denied of ["agent", "resource", "binding"]) {
      const f = fixture(name);
      if (denied === "agent") f.vector.policy.agents = ["other-agent"];
      if (denied === "resource") f.vector.policy.resources = [`cloudflare:account:${account}:r2:jurisdiction:default:bucket:${args.bucketName}`];
      if (denied === "binding") f.dependencies.host.revalidate = async () => false;
      assert.equal((await f.invoke()).code, denied === "binding" ? "RESOURCE_CHANGED" : "POLICY_DENIED");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    const f = fixture(name);
    const resolve = f.dependencies.credentials.resolve;
    f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    assert.equal((await f.invoke()).code, "POLICY_CHANGED");
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.close, 1);
  }
});

test("Cloudflare EU changed jurisdiction refuses safely with uncertain-outcome replay protection", async () => {
  for (const name of [get, locks]) {
    const f = fixture(name, { ...(name === get ? bucketRow : lockRow), jurisdiction: "default" });
    const out = await f.invoke();
    assert.equal(out.code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});
