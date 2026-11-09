import assert from "node:assert/strict";
import test from "node:test";
import { accountDnsDescriptor } from "../dist/plugins/cloudflare-broker/src/account-dns.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const foreign = "f".repeat(32);
const scope = () => ({ accountId: account, revision: "resource-1", readAllowed: true });
const success = result => JSON.stringify({ success: true, errors: [], result });
const defaults = () => ({ flatten_all_cnames: false, multi_provider: true, secondary_overrides: false,
  zone_mode: "dns_only", ns_ttl: 86400, soa: { rname: credentialCanary, mname: derivedCanary },
  internal_dns: { reference_zone_id: foreign }, nameservers: { nameserver_set_id: foreign }, unrelated: credentialCanary });
const row = () => ({ enforce_dns_only: false, zone_defaults: defaults(), unrelated: credentialCanary });
const expectedDefaults = { flattenAllCnames: false, multiProvider: true, secondaryOverrides: false,
  zoneMode: "dns_only", nameserverTtl: 86400 };
const expected = { enforceDnsOnly: false, newZoneDefaults: expectedDefaults,
  subject: "configured-account-dns-settings", effectiveDnsBehavior: "not-established" };
function fixture({ readAllowed = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(); const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountDnsReadAllowed: readAllowed }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === "cloudflare.dns.account_settings.get");
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations,
    invoke: (args = {}, key = "call-a") => broker.call("cloudflare.dns.account_settings.get", args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, "reference_zone_id", "nameserver_set_id", "rname", "mname", "unrelated"]) assert.ok(!data.includes(value));
}

test("Cloudflare account DNS snapshots independent scope and authenticates prepared projections", () => {
  const s = scope(); const d = accountDnsDescriptor(s); s.accountId = foreign; s.readAllowed = false;
  const p = d.prepare({});
  assert.equal(p.request.path, `/accounts/${account}/dns_settings`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:dns-settings`);
  assert.equal(p.resource.revision, "resource-1");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  assert.throws(() => accountDnsDescriptor(scope()).project(success(row()), p), /scope/);
  for (const readAllowed of [null, 1, "true", [], {}]) assert.throws(() => accountDnsDescriptor({ ...scope(), readAllowed }), /schema/);
  for (const field of ["accountId", "revision"]) assert.throws(() => accountDnsDescriptor({ ...scope(), [field]: "bad/identity" }), /schema/);
});

test("Cloudflare account DNS distinguishes configured enforcement and new-zone defaults from effective state", () => {
  const d = accountDnsDescriptor(scope()); const p = d.prepare({});
  const out = d.project(success(row()), p); assert.deepEqual(out, expected);
  assert.ok(Object.isFrozen(out)); assert.ok(Object.isFrozen(out.newZoneDefaults));
  assert.equal(d.project(success({ ...row(), enforce_dns_only: true }), p).enforceDnsOnly, true);
  assert.equal(d.project(success({ zone_defaults: {} }), p).enforceDnsOnly, "unavailable");
  assert.deepEqual(d.project(success({ zone_defaults: {} }), p).newZoneDefaults,
    { flattenAllCnames: "unavailable", multiProvider: "unavailable", secondaryOverrides: "unavailable", zoneMode: "unavailable", nameserverTtl: "unavailable" });
  for (const ns_ttl of [30, 30.5, 86400]) assert.equal(d.project(success({ zone_defaults: { ns_ttl } }), p).newZoneDefaults.nameserverTtl, ns_ttl);
  for (const zone_mode of ["standard", "cdn_only", "dns_only"]) assert.equal(d.project(success({ zone_defaults: { zone_mode } }), p).newZoneDefaults.zoneMode, zone_mode);
});

test("Cloudflare account DNS rejects foreign context, malformed defaults and selected values", () => {
  const d = accountDnsDescriptor(scope()); const p = d.prepare({});
  for (const raw of [JSON.stringify({ success: true, errors: [], account_id: foreign, result: row() }),
    success({ ...row(), account_id: foreign }), success({ ...row(), zone_defaults: { account_id: foreign } })]) assert.throws(() => d.project(raw, p), /scope/);
  for (const raw of ["null", "not-json", "{}", success(null), success([]), success({}), success({ zone_defaults: null }), success({ zone_defaults: [] }),
    JSON.stringify({ success: true, result: row() }), JSON.stringify({ success: false, errors: [], result: row() }),
    JSON.stringify({ success: true, errors: [credentialCanary], result: row() })]) assert.throws(() => d.project(raw, p), /upstream/);
  for (const value of [null, 0, 1, "false", [], {}]) {
    assert.throws(() => d.project(success({ ...row(), enforce_dns_only: value }), p), /upstream/);
    for (const field of ["flatten_all_cnames", "multi_provider", "secondary_overrides"]) assert.throws(() => d.project(success({ zone_defaults: { [field]: value } }), p), /upstream/);
  }
  for (const value of [null, "other", "standard\n", 1, []]) assert.throws(() => d.project(success({ zone_defaults: { zone_mode: value } }), p), /upstream/);
  for (const value of [null, "30", 0, 29.9, 86400.1, 1e100, [], {}]) assert.throws(() => d.project(success({ zone_defaults: { ns_ttl: value } }), p), /upstream/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare account DNS defaults denied and zone or account-detail visibility grants none", async () => {
  assert.throws(() => accountDnsDescriptor({ accountId: account, revision: "resource-1" }).prepare({}), /scope/);
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountDetailReadAllowed: true, zone: { zoneId: foreign, dnsRecordIds: [], dnsSettingsReadAllowed: true } },
  { accountId: account, revision: "resource-1" });
  assert.throws(() => operations.find(op => op.name === "cloudflare.dns.account_settings.get").prepare({}), /scope/);
  const denied = fixture({ readAllowed: false }); assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const args of [{ accountId: foreign }, { zoneId: foreign }, { readAllowed: true }, { enforce_dns_only: true }, { headers: {} }, { approval: "forged" }]) {
    const f = fixture(); assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare account DNS actual-core fixed GET preserves safe output, audit, cleanup and replay", async () => {
  const f = fixture(); const p = f.operation.prepare({});
  assert.equal(p.plan.providerDryRun, false); assert.equal(p.plan.providerOperationId, "dns-settings-for-an-account-list-dns-settings");
  const out = await f.invoke(); assert.equal(out.ok, true); assert.deepEqual(out.value, expected);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/dns_settings`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare account DNS current agent, resource, binding and lease-time revocation deny network", async () => {
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
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0); assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0); safe(f, out);
  }
});

test("Cloudflare account DNS upstream and outcome audit failures preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: { ...row(), account_id: foreign } }]) {
    const f = fixture(options); const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke(); assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1); const journal = structuredClone([...f.journal]);
    if (options.auditFailure) {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal); f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});

test("Cloudflare account DNS rejects prepared resource, revision, argument and plan swaps", async () => {
  for (const change of [p => ({ ...p, resource: { ...p.resource, id: `cloudflare:account:${foreign}:dns-settings` } }),
    p => ({ ...p, resource: { ...p.resource, revision: "other-revision" } }), p => ({ ...p, arguments: { accountId: foreign } }),
    p => ({ ...p, plan: { ...p.plan, providerOperationId: "zones-get" } })]) {
    const f = fixture(); const prepared = change(f.operation.prepare({}));
    await assert.rejects(f.operation.execute(prepared, credentialCanary, new AbortController().signal), /scope|schema/); assert.equal(f.requests.length, 0);
  }
});
