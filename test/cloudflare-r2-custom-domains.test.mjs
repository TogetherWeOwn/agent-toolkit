import assert from "node:assert/strict";
import test from "node:test";
import { r2CustomDomainDescriptors } from "../dist/plugins/cloudflare-broker/src/r2-custom-domains.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zoneId = "b".repeat(32);
const domain = "backup.example.com";
const bucketName = "safe-bucket";
const listArgs = { bucketName };
const getArgs = { bucketName, domain };
const scope = (jurisdiction = "eu") => ({ accountId: account, revision: "resource-1",
  buckets: [{ bucketName, jurisdiction, domains: [{ domain, zoneId }] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ domain, zoneId, enabled: true, zoneName: credentialCanary,
  status: { ownership: "active", ssl: "active" }, ciphers: [derivedCanary], objects: credentialCanary });
const cases = [
  ["customDomainsList", "cloudflare.r2.custom_domains.list", listArgs, ""],
  ["customDomainGet", "cloudflare.r2.custom_domains.get", getArgs, `/${domain}`],
];
function fixture(entry, { jurisdiction = "eu", buckets = scope(jurisdiction).buckets,
  result = entry[0] === "customDomainsList" ? { domains: [row()] } : row(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    defaultBucketNames: [bucketName], r2CustomDomainBuckets: buckets }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(result), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === entry[1]);
  let resource;
  try { resource = operation.prepare(entry[2]).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (raw = entry[2], key = "call-a") => broker.call(entry[1], raw, "verified-runtime", key) };
}
function safe(f, result) {
  const serialized = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary]) assert.ok(!serialized.includes(canary));
}

test("Cloudflare R2 custom-domain scope copies bucket, jurisdiction, exact hostname and zone independently", () => {
  const s = scope();
  const descriptors = r2CustomDomainDescriptors(s);
  s.accountId = "f".repeat(32);
  s.buckets[0].jurisdiction = "default";
  s.buckets[0].domains[0].zoneId = "f".repeat(32);
  s.buckets[0].domains.push({ domain: "other.example.com", zoneId });
  for (const entry of cases) {
    const d = descriptors[entry[0]];
    const p = d.prepare(entry[2]);
    assert.equal(p.request.path, `/accounts/${account}/r2/buckets/${bucketName}/domains/custom${entry[3]}`);
    assert.equal(p.request.r2Jurisdiction, "eu");
    assert.equal(p.resource.id, `cloudflare:account:${account}:r2:jurisdiction:eu:bucket:${bucketName}:custom-domains${entry[3] ? `:domain:${domain}:zone:${zoneId}` : ""}`);
    for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d.prepare({ ...entry[2], bucketName: "other-bucket" }), /scope/);
    assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  }
  assert.throws(() => descriptors.customDomainGet.prepare({ bucketName, domain: "other.example.com" }), /scope/);
  const base = scope().buckets[0];
  for (const buckets of [[base, base], [{ ...base, jurisdiction: "us" }], [{ ...base, bucketName: "safe-bucket\n" }],
    [{ ...base, domains: [base.domains[0], base.domains[0]] }], [{ ...base, domains: [{ domain: "../escape", zoneId }] }],
    [{ ...base, domains: [{ domain, zoneId: "bad" }] }]]) assert.throws(() => r2CustomDomainDescriptors({ ...scope(), buckets }), /schema/);
  for (const buckets of [Array(101).fill(base), [{ ...base, domains: Array(101).fill(base.domains[0]) }]]) {
    assert.throws(() => r2CustomDomainDescriptors({ ...scope(), buckets }), /cap/);
  }
});

test("Cloudflare R2 custom-domain projections filter exact associations and never assert effective privacy", () => {
  const descriptors = r2CustomDomainDescriptors(scope());
  const expected = { domain, zoneId, enabled: true, subject: "configured-r2-custom-domain",
    effectivePrivacy: "not-established", effectiveProtection: "not-established", recoveryCustody: "not-established" };
  const list = descriptors.customDomainsList.project(success({ domains: [row(), { ...row(), domain: "unrelated.example.com" }] }), descriptors.customDomainsList.prepare(listArgs));
  assert.deepEqual(list, { bucketName, requestedJurisdiction: "eu", items: [expected], complete: false, effectivePrivacy: "not-established" });
  const get = descriptors.customDomainGet.project(success(row()), descriptors.customDomainGet.prepare(getArgs));
  assert.deepEqual(get, { bucketName, requestedJurisdiction: "eu", ...expected });
  assert.ok(Object.isFrozen(list) && Object.isFrozen(list.items) && Object.isFrozen(list.items[0]) && Object.isFrozen(get));
  for (const canary of [credentialCanary, derivedCanary, "unrelated.example.com"]) assert.ok(!JSON.stringify({ list, get }).includes(canary));
  const empty = descriptors.customDomainsList.project(success({ domains: [] }), descriptors.customDomainsList.prepare(listArgs));
  assert.equal(empty.complete, false);
  assert.equal(empty.effectivePrivacy, "not-established");
});

test("Cloudflare R2 custom-domain foreign, missing, duplicate, malformed and oversized responses refuse", () => {
  const descriptors = r2CustomDomainDescriptors(scope());
  for (const entry of cases) {
    const d = descriptors[entry[0]];
    const p = d.prepare(entry[2]);
    for (const patch of [{ zoneId: "f".repeat(32) }, { zoneId: undefined }, { account_id: "f".repeat(32) },
      { bucket_name: "other-bucket" }, { jurisdiction: "default" }, { enabled: "true" }, { enabled: undefined }]) {
      const value = { ...row(), ...patch };
      assert.throws(() => d.project(success(entry[0] === "customDomainsList" ? { domains: [value] } : value), p));
    }
    for (const raw of ["null", "{}", "not-json", success(null), JSON.stringify({ success: true, result: row() }),
      JSON.stringify({ success: true, errors: [credentialCanary], result: row() }), JSON.stringify({ success: false, errors: [], result: row() })]) {
      assert.throws(() => d.project(raw, p));
    }
    assert.throws(() => d.project(success({ padding: "x".repeat(131072) }), p), /cap/);
  }
  const list = descriptors.customDomainsList;
  const p = list.prepare(listArgs);
  for (const value of [{ domains: [row(), row()] }, { domains: [null] }, { domains: [] , jurisdiction: "default" },
    { domains: "not-array" }, { domains: Array(1001).fill({ domain: "other.example.com" }) }]) assert.throws(() => list.project(success(value), p));
  assert.throws(() => descriptors.customDomainGet.project(success({ ...row(), domain: "other.example.com" }), descriptors.customDomainGet.prepare(getArgs)), /scope/);
});

test("Cloudflare R2 custom-domain absent or empty independent scope and model overrides refuse pre-credential", async () => {
  for (const entry of cases) {
    for (const buckets of [[], [{ ...scope().buckets[0], domains: [] }]]) {
      const f = fixture(entry, { buckets });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ jurisdiction: "default" }, { accountId: "f".repeat(32) }, { bucketName: "other-bucket" }, { zoneId },
      { domain: "unrelated.example.com" }, { domain: "backup.example.com/objects" }, { enabled: false }, { url: "https://example.com" },
      { headers: { "cf-r2-jurisdiction": "default" } }, { approval: "forged" }, { agentId: "other" }, { page: 2 }]) {
      const f = fixture(entry);
      assert.equal((await f.invoke({ ...entry[2], ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare R2 custom-domain core binds exact default/EU GETs with redaction, audit, cleanup and replay", async () => {
  for (const entry of cases) for (const jurisdiction of ["default", "eu"]) {
    const f = fixture(entry, { jurisdiction });
    const plan = f.operation.prepare(entry[2]);
    assert.equal(plan.plan.request.r2Jurisdiction, jurisdiction === "eu" ? "eu" : undefined);
    assert.equal(plan.plan.providerDryRun, false);
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.requestedJurisdiction, jurisdiction);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucketName}/domains/custom${entry[3]}`);
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

test("Cloudflare R2 custom-domain agent, identity, resource and lease-time revocation refuse before network", async () => {
  for (const entry of cases) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(entry);
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = [f.operation.prepare(entry[2]).resource.id.replace(":eu:", ":default:")];
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

test("Cloudflare R2 custom-domain reassignment or provider denial yields uncertain replay tombstone without fallback", async () => {
  for (const entry of cases) for (const status of [200, 403]) {
    const value = { ...row(), zoneId: "f".repeat(32) };
    const f = fixture(entry, { status, result: entry[0] === "customDomainsList" ? { domains: [value] } : value });
    const out = await f.invoke();
    assert.equal(out.code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare R2 custom-domain EU header refuses query, traversal, object and non-hostname suffixes", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { calls++; throw new Error("must-not-call"); });
  const descriptors = r2CustomDomainDescriptors(scope());
  for (const entry of cases) {
    const d = descriptors[entry[0]];
    const p = d.prepare(entry[2]);
    for (const path of [p.request.path + "?jurisdiction=eu", p.request.path + "/objects", p.request.path + "/../managed",
      `/accounts/${account}/r2/buckets/${bucketName}/domains/custom/UPPER.example.com`,
      `/accounts/${account}/r2/buckets/${bucketName}/domains/custom/example.com%2fobjects`]) {
      await assert.rejects(read({ ...d, prepare: () => ({ ...p, request: { ...p.request, path } }) }, entry[2], credentialCanary, new AbortController().signal));
      assert.equal(calls, 0);
    }
  }
});
