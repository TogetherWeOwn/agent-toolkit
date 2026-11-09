import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const own = "b".repeat(32);
const other = "c".repeat(32);
const tool = "cloudflare.hyperdrive.get";
const args = { hyperdriveId: own };
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [own], hyperdriveConfigurationIds: [own] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = () => ({ id: own, caching: { disabled: false, max_age: 60, stale_while_revalidate: 15 }, origin_connection_limit: 60,
  name: credentialCanary, origin: { password: credentialCanary, access_client_secret: derivedCanary, host: "private.invalid" },
  mtls: { certificate_id: derivedCanary }, integration: { token: credentialCanary } });
function fixture({ configurations = [own], allowed = true, response = result(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ ...scope(), hyperdriveIds: allowed ? [own] : [], hyperdriveConfigurationIds: configurations },
    { accountId: account, revision: "resource-1" }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(success(response), { status, headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [`cloudflare:account:${account}:hyperdrive:${own}${configurations.includes(own) ? ":configuration" : ""}`] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "private.invalid", "password", "access_client_secret", "certificate_id"]) assert.ok(!data.includes(value));
}

test("Cloudflare Hyperdrive configuration projection has independent copied exact-ID scope and leaves lists unchanged", () => {
  const s = scope();
  const d = metadataDescriptors(s);
  s.hyperdriveConfigurationIds.length = 0;
  s.hyperdriveIds.push(other);
  s.accountId = "f".repeat(32);
  s.revision = "changed";
  const p = d.hyperdriveGet.prepare(args);
  assert.deepEqual(p.resource, { id: `cloudflare:account:${account}:hyperdrive:${own}:configuration`, revision: "resource-1" });
  assert.equal(p.request.path, `/accounts/${account}/hyperdrive/configs/${own}`);
  assert.equal(d.hyperdriveGet.project(success(result()), p).configuration.originConnectionLimit, 60);
  assert.throws(() => d.hyperdriveGet.prepare({ hyperdriveId: other }), /scope/);
  const basic = metadataDescriptors({ ...scope(), hyperdriveConfigurationIds: [] });
  assert.deepEqual(basic.hyperdriveGet.project(success(result()), basic.hyperdriveGet.prepare(args)), { id: own, cachingDisabled: false });
  const list = d.hyperdriveList;
  assert.deepEqual(list.project(success([result()]), list.prepare({ page: 1, perPage: 100 })), {
    items: [{ id: own, cachingDisabled: false }], complete: false });
  for (const hyperdriveConfigurationIds of [[other], [own, own], ["invalid"], Array(101).fill(own), "invalid"]) {
    assert.throws(() => metadataDescriptors({ ...scope(), hyperdriveConfigurationIds }));
  }
});

test("Cloudflare Hyperdrive cache and pool values preserve absence without default or effective-limit inference", () => {
  const d = metadataDescriptors(scope()).hyperdriveGet;
  const p = d.prepare(args);
  const out = d.project(success(result()), p);
  assert.deepEqual(out, { id: own, cachingDisabled: false, configuration: { subject: "configured-hyperdrive-cache-and-pool",
    maxAgeSeconds: 60, staleWhileRevalidateSeconds: 15, originConnectionLimit: 60, effectiveCachingAndPooling: "not-established" } });
  assert.deepEqual(d.project(success({ id: own, caching: { disabled: true } }), p), { ...out, cachingDisabled: true,
    configuration: { ...out.configuration, maxAgeSeconds: "unavailable", staleWhileRevalidateSeconds: "unavailable", originConnectionLimit: "unavailable" } });
  // The soft limit has no schema maximum; do not substitute a plan-dependent cap.
  assert.deepEqual(d.project(success({ id: own, caching: { disabled: true, max_age: 3600, stale_while_revalidate: 0 },
    origin_connection_limit: 500 }), p).configuration, { ...out.configuration, maxAgeSeconds: 3600, staleWhileRevalidateSeconds: 0, originConnectionLimit: 500 });
  assert.ok(!JSON.stringify(out).includes(credentialCanary));
});

test("Cloudflare Hyperdrive configuration rejects malformed selected numbers and foreign identity", () => {
  const d = metadataDescriptors(scope()).hyperdriveGet;
  const p = d.prepare(args);
  for (const field of ["max_age", "stale_while_revalidate", "origin_connection_limit"]) {
    const invalid = [null, "60", true, {}, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];
    if (field === "max_age") invalid.push(0, 3601);
    if (field === "origin_connection_limit") invalid.push(0, 4);
    for (const value of invalid) {
      const row = result();
      if (field === "origin_connection_limit") row[field] = value;
      else row.caching[field] = value;
      assert.throws(() => d.project(success(row), p), /upstream/);
    }
  }
  for (const row of [{ ...result(), id: other }, { ...result(), account_id: "f".repeat(32) }]) assert.throws(() => d.project(success(row), p), /scope/);
  assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], account_id: "f".repeat(32), result: result() }), p), /scope/);
  assert.throws(() => d.project(success({ ...result(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare Hyperdrive configuration scope cannot be selected through model arguments or widen resource access", async () => {
  for (const input of [{ ...args, configuration: true }, { ...args, hyperdriveConfigurationIds: [own] }, { ...args, accountId: account },
    { ...args, headers: {} }, { ...args, origin_connection_limit: 100 }, { ...args, approval: "forged" }, { hyperdriveId: other }]) {
    const f = fixture();
    assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  const denied = fixture({ allowed: false, configurations: [] });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  const basic = fixture({ configurations: [] });
  assert.deepEqual((await basic.invoke()).value, { id: own, cachingDisabled: false });
});

test("Cloudflare Hyperdrive configured detail uses actual core GET redaction cleanup audit and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerOperationId, "get-hyperdrive");
  assert.equal(p.plan.providerDryRun, false);
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.equal(out.value.configuration.originConnectionLimit, 60);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare Hyperdrive configuration agent resource binding and lease-time policy revocation deny network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
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

test("Cloudflare Hyperdrive selected-value corruption and audit outages fail closed and preserve uncertain replay", async () => {
  for (const options of [{ response: { ...result(), origin_connection_limit: credentialCanary } },
    { response: { ...result(), id: other } }, { status: 403 }, { auditFailure: true }]) {
    const f = fixture(options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    assert.equal(f.calls.secret, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
