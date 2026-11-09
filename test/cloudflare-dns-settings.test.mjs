import assert from "node:assert/strict";
import test from "node:test";
import { dnsSettingsDescriptor } from "../dist/plugins/cloudflare-broker/src/dns-settings.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", readAllowed: true });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ flatten_all_cnames: false, multi_provider: true, secondary_overrides: false,
  zone_mode: "dns_only", ns_ttl: 86400, soa: { rname: credentialCanary, mname: derivedCanary },
  internal_dns: { reference_zone_id: foreign }, nameservers: { nameserver_set_id: foreign }, unrelated: credentialCanary });
const expected = { flattenAllCnames: false, multiProvider: true, secondaryOverrides: false,
  zoneMode: "dns_only", nameserverTtl: 86400, subject: "configured-zone-dns-settings", effectiveDnsBehavior: "not-established" };
function fixture({ readAllowed = true, response = row(), status = 200, noZone = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], dnsSettingsReadAllowed: readAllowed } }) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === "cloudflare.dns.settings.get");
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations,
    invoke: (args = {}, key = "call-a") => broker.call("cloudflare.dns.settings.get", args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, "reference_zone_id", "nameserver_set_id", "rname", "mname", "unrelated"]) assert.ok(!data.includes(value));
}

test("Cloudflare DNS settings snapshots independent trusted scope and authenticates prepared projections", () => {
  const s = scope();
  const d = dnsSettingsDescriptor(s);
  s.accountId = foreign; s.zoneId = foreign; s.readAllowed = false;
  const p = d.prepare({});
  assert.equal(p.request.path, `/zones/${zone}/dns_settings`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:dns-settings`);
  assert.equal(p.resource.revision, "resource-1");
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  assert.throws(() => dnsSettingsDescriptor(scope()).project(success(row()), p), /scope/);
  for (const readAllowed of [null, 1, "true", [], {}]) assert.throws(() => dnsSettingsDescriptor({ ...scope(), readAllowed }), /schema/);
  for (const field of ["accountId", "zoneId", "revision"]) assert.throws(() => dnsSettingsDescriptor({ ...scope(), [field]: "bad/identity" }), /schema/);
});

test("Cloudflare DNS settings projects configured values without names, fallback zones or defaults", () => {
  const d = dnsSettingsDescriptor(scope()); const p = d.prepare({});
  assert.deepEqual(d.project(success(row()), p), expected);
  assert.ok(Object.isFrozen(d.project(success(row()), p)));
  for (const mode of ["standard", "cdn_only", "dns_only"]) {
    assert.equal(d.project(success({ ...row(), zone_mode: mode }), p).zoneMode, mode);
  }
  for (const ns_ttl of [30, 30.5, 86400]) assert.equal(d.project(success({ ...row(), ns_ttl }), p).nameserverTtl, ns_ttl);
  assert.deepEqual(d.project(success({}), p), { flattenAllCnames: "unavailable", multiProvider: "unavailable",
    secondaryOverrides: "unavailable", zoneMode: "unavailable", nameserverTtl: "unavailable",
    subject: "configured-zone-dns-settings", effectiveDnsBehavior: "not-established" });
});

test("Cloudflare DNS settings rejects foreign context, malformed envelopes and selected values", () => {
  const d = dnsSettingsDescriptor(scope()); const p = d.prepare({});
  for (const patch of [{ account_id: foreign }, { zone_id: foreign }]) {
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: row(), ...patch }), p), /scope/);
    assert.throws(() => d.project(success({ ...row(), ...patch }), p), /scope/);
  }
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: [credentialCanary], result: row() })]) {
    assert.throws(() => d.project(raw, p), /upstream/);
  }
  for (const field of ["flatten_all_cnames", "multi_provider", "secondary_overrides"]) {
    for (const value of [null, 0, 1, "false", [], {}]) assert.throws(() => d.project(success({ ...row(), [field]: value }), p), /upstream/);
  }
  for (const value of [null, "other", "standard\n", 1, []]) assert.throws(() => d.project(success({ ...row(), zone_mode: value }), p), /upstream/);
  for (const value of [null, "30", 0, 29.9, 86400.1, 1e100, [], {}]) assert.throws(() => d.project(success({ ...row(), ns_ttl: value }), p), /upstream/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare DNS settings defaults denied and refuses model overrides before credentials", async () => {
  assert.ok(!fixture({ noZone: true }).operations.some(op => op.name === "cloudflare.dns.settings.get"));
  assert.throws(() => dnsSettingsDescriptor({ accountId: account, zoneId: zone, revision: "resource-1" }).prepare({}), /scope/);
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], zoneHoldReadAllowed: true, dnssecReadAllowed: true } },
  { accountId: account, revision: "resource-1" });
  assert.throws(() => operations.find(op => op.name === "cloudflare.dns.settings.get").prepare({}), /scope/);
  assert.throws(() => fixture().operations.find(op => op.name === "cloudflare.zones.hold.get").prepare({}), /scope/);
  const denied = fixture({ readAllowed: false });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const args of [{ accountId: foreign }, { zoneId: foreign }, { readAllowed: true }, { multi_provider: false },
    { headers: {} }, { page: 2 }, { approval: "forged" }]) {
    const f = fixture(); assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare DNS settings actual-core fixed GET preserves safe output, audit, cleanup and replay", async () => {
  const f = fixture(); const p = f.operation.prepare({});
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "dns-settings-for-a-zone-list-dns-settings");
  const out = await f.invoke(); assert.equal(out.ok, true); assert.deepEqual(out.value, expected);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/dns_settings`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare DNS settings current agent, resource, binding and lease-time revocation deny network", async () => {
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

test("Cloudflare DNS settings upstream and outcome audit failures preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: { ...row(), zone_id: foreign } }]) {
    const f = fixture(options); const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (options.auditFailure) {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal); f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});

test("Cloudflare DNS settings rejects prepared resource, revision, argument and plan swaps", async () => {
  for (const change of [p => ({ ...p, resource: { ...p.resource, id: `cloudflare:account:${account}:zone:${foreign}:dns-settings` } }),
    p => ({ ...p, resource: { ...p.resource, revision: "other-revision" } }),
    p => ({ ...p, arguments: { zoneId: foreign } }), p => ({ ...p, plan: { ...p.plan, providerOperationId: "zones-get" } })]) {
    const f = fixture(); const prepared = change(f.operation.prepare({}));
    await assert.rejects(f.operation.execute(prepared, credentialCanary, new AbortController().signal), /scope|schema/);
    assert.equal(f.requests.length, 0);
  }
});
