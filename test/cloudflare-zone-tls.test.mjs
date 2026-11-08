import assert from "node:assert/strict";
import test from "node:test";
import { zoneTlsDescriptor } from "../dist/plugins/cloudflare-broker/src/zone-tls.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const variants = { ssl: ["off", "flexible", "full", "strict"], min_tls_version: ["1.0", "1.1", "1.2", "1.3"],
  tls_1_3: ["on", "off", "zrt"], always_use_https: ["on", "off"], http2: ["on", "off"],
  ciphers: [[], ["ECDHE-RSA-AES128-GCM-SHA256", "AES128-SHA"]] };
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", settingIds: Object.keys(variants) });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = id => ({ id, value: variants[id][0], modified_on: credentialCanary, editable: derivedCanary, private: credentialCanary });
function fixture(settingId = "ssl", { settingIds = scope().settingIds, response = row(settingId), status = 200, noZone = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], tlsSettingIds: settingIds } }) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === "cloudflare.tls.zone.get");
  let resource;
  try { resource = operation.prepare({ settingId }).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations,
    invoke: (args = { settingId }, key = "call-a") => broker.call("cloudflare.tls.zone.get", args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "modified_on", "editable", "private"]) assert.ok(!data.includes(value));
}

test("Cloudflare zone TLS copies independent exact setting scope and authenticates prepared projections", () => {
  const s = { ...scope(), settingIds: ["ssl"] };
  const d = zoneTlsDescriptor(s);
  s.accountId = foreign;
  s.zoneId = foreign;
  s.settingIds.push("http2");
  const p = d.prepare({ settingId: "ssl" });
  assert.equal(p.request.path, `/zones/${zone}/settings/ssl`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:tls-setting:ssl`);
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.prepare({ settingId: "http2" }), /scope/);
  assert.throws(() => d.project(success(row("ssl")), { ...p }), /scope/);
  assert.throws(() => zoneTlsDescriptor(scope()).project(success(row("ssl")), p), /scope/);
  assert.throws(() => zoneTlsDescriptor({ ...scope(), settingIds: ["ssl", "ssl"] }), /schema/);
  assert.throws(() => zoneTlsDescriptor({ ...scope(), settingIds: Array(7).fill("ssl") }), /cap/);
  for (const id of ["security_header", "ssl/../http2", "SSL", "ssl\n", "ssl?x=1"]) {
    assert.throws(() => zoneTlsDescriptor({ ...scope(), settingIds: [id] }), /schema/);
  }
});

test("Cloudflare zone TLS validates all six pinned configured variants without defaults or effective claims", () => {
  const d = zoneTlsDescriptor(scope());
  for (const [settingId, values] of Object.entries(variants)) for (const value of values) {
    const out = d.project(success({ ...row(settingId), value }), d.prepare({ settingId }));
    assert.deepEqual(out, { settingId, value, subject: "configured-zone-tls", effectiveProtection: "not-established" });
    assert.ok(Object.isFrozen(out));
    if (Array.isArray(value)) assert.ok(Object.isFrozen(out.value));
    for (const canary of [credentialCanary, derivedCanary, "modified_on", "editable", "private"]) assert.ok(!JSON.stringify(out).includes(canary));
  }
});

test("Cloudflare zone TLS rejects foreign identities, malformed envelopes, missing values and bounds", () => {
  const d = zoneTlsDescriptor(scope());
  const p = d.prepare({ settingId: "ssl" });
  for (const patch of [{ account_id: foreign }, { zone_id: foreign }]) {
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: row("ssl"), ...patch }), p), /scope/);
    assert.throws(() => d.project(success({ ...row("ssl"), ...patch }), p), /scope/);
  }
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row("ssl") }),
    JSON.stringify({ success: false, errors: [], result: row("ssl") }), JSON.stringify({ success: true, errors: [credentialCanary], result: row("ssl") })]) {
    assert.throws(() => d.project(raw, p), /upstream/);
  }
  for (const response of [{ value: "off" }, { id: "http2", value: "off" }]) assert.throws(() => d.project(success(response), p), /scope/);
  for (const [settingId, value] of [["ssl", "origin_pull"], ["ssl", "on"], ["min_tls_version", "default"], ["tls_1_3", true],
    ["always_use_https", "zrt"], ["http2", ["on"]], ["ciphers", "AES128-SHA"], ["ciphers", ["AES128-SHA", "AES128-SHA"]],
    ["ciphers", [credentialCanary]], ["ciphers", Array(101).fill("AES128-SHA")]]) {
    assert.throws(() => d.project(success({ id: settingId, value }), d.prepare({ settingId })));
  }
  for (const settingId of Object.keys(variants)) assert.throws(() => d.project(success({ id: settingId }), d.prepare({ settingId })));
  assert.throws(() => d.project(success({ ...row("ssl"), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare zone TLS defaults empty, omits tools without zone and rejects model overrides before credentials", async () => {
  assert.ok(!fixture("ssl", { noZone: true }).operations.some(op => op.name === "cloudflare.tls.zone.get"));
  for (const settingIds of [[], ["http2"]]) {
    const f = fixture("ssl", { settingIds });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  const d = zoneTlsDescriptor({ accountId: account, zoneId: zone, revision: "resource-1" });
  assert.throws(() => d.prepare({ settingId: "ssl" }), /scope/);
  for (const args of [{}, { settingId: "security_header" }, { settingId: "ssl", accountId: foreign }, { settingId: "ssl", zoneId: foreign },
    { settingId: "ssl", value: "off" }, { settingId: "ssl", headers: {} }, { settingId: "ssl", page: 2 }, { settingId: "ssl", approval: "forged" }]) {
    const f = fixture();
    assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare zone TLS actual-core fixed GET preserves configured output, audit, cleanup and replay", async () => {
  for (const settingId of Object.keys(variants)) {
    const f = fixture(settingId);
    const p = f.operation.prepare({ settingId });
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, "zone-settings-get-single-setting");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.settingId, settingId);
    assert.deepEqual(out.value.value, variants[settingId][0]);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/settings/${settingId}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare zone TLS current agent, resource, binding and lease-time revocation deny network", async () => {
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

test("Cloudflare zone TLS upstream and outcome audit failures preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: { ...row("ssl"), zone_id: foreign } }]) {
    const f = fixture("ssl", options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (options.auditFailure) {
      assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE");
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      f.dependencies.audit.append = append;
    }
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, out);
  }
});
