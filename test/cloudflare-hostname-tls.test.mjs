import assert from "node:assert/strict";
import test from "node:test";
import { hostnameTlsDescriptors } from "../dist/plugins/cloudflare-broker/src/hostname-tls.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const host = "app.example.com";
const other = "unselected.example.com";
const variants = { ciphers: ["ECDHE-RSA-AES128-GCM-SHA256", "AES128-GCM-SHA256"], min_tls_version: "1.2", http2: "on" };
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1",
  settings: Object.keys(variants).map(settingId => ({ settingId, hostnames: [host] })) });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const row = settingId => ({ hostname: host, value: variants[settingId], status: credentialCanary,
  created_at: credentialCanary, updated_at: derivedCanary, private: derivedCanary });
const args = (settingId, detail) => ({ settingId, ...(detail ? { hostname: host } : {}) });
function fixture(settingId, detail, { settings = scope().settings, response, status = 200, noZone = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], hostnameTls: settings } }) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response ?? (detail ? row(settingId) : [row(settingId), { hostname: other, value: derivedCanary }])),
      { status, headers: { "content-type": "application/json" } });
  });
  const tool = `cloudflare.tls.hostnames.${detail ? "get" : "list"}`;
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(args(settingId, detail)).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations,
    invoke: (input = args(settingId, detail), key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, other, "created_at", "updated_at"]) assert.ok(!data.includes(value));
}

test("Cloudflare hostname TLS copies independent zone, setting and hostname scope", () => {
  const s = scope();
  const d = hostnameTlsDescriptors(s);
  s.accountId = foreign;
  s.zoneId = foreign;
  s.settings[0].hostnames.push(other);
  s.settings[0].settingId = "changed";
  const p = d.settingGet.prepare(args("ciphers", true));
  assert.equal(p.request.path, `/zones/${zone}/hostnames/settings/ciphers/${host}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:hostname-tls:ciphers:hostname:${host}`);
  for (const value of [d, d.settingGet, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.settingGet.prepare({ settingId: "ciphers", hostname: other }), /scope/);
  assert.throws(() => d.settingGet.project(success(row("ciphers")), { ...p }), /scope/);
  assert.throws(() => d.settingsList.project(success([row("ciphers")]), p), /scope/);
  assert.throws(() => hostnameTlsDescriptors(scope()).settingGet.project(success(row("ciphers")), p), /scope/);
});

test("Cloudflare hostname TLS validates construction, selectors and scope bounds", () => {
  for (const hostnames of [[host, host], ["*.example.com"], ["App.example.com"], ["app.example.com."], ["https://app.example.com"],
    ["app.example.com/path"], ["app.example.com\n"], ["app.%65xample.com"], [`${"a".repeat(64)}.example.com`]]) {
    assert.throws(() => hostnameTlsDescriptors({ ...scope(), settings: [{ settingId: "http2", hostnames }] }), /schema/);
  }
  assert.throws(() => hostnameTlsDescriptors({ ...scope(), settings: [{ settingId: "ssl", hostnames: [host] }] }), /schema/);
  assert.throws(() => hostnameTlsDescriptors({ ...scope(), settings: [scope().settings[0], scope().settings[0]] }), /schema/);
  assert.throws(() => hostnameTlsDescriptors({ ...scope(), settings: Array(4).fill(scope().settings[0]) }), /cap/);
  assert.throws(() => hostnameTlsDescriptors({ ...scope(), settings: [{ settingId: "http2", hostnames: Array(101).fill(host) }] }), /cap/);
});

test("Cloudflare hostname TLS projects all three configured variants without effective protection or status", () => {
  const d = hostnameTlsDescriptors(scope());
  for (const [settingId, value] of Object.entries(variants)) {
    for (const detail of [false, true]) {
      const descriptor = detail ? d.settingGet : d.settingsList;
      const input = descriptor.prepare(args(settingId, detail));
      const out = descriptor.project(success(detail ? row(settingId) : [row(settingId), { hostname: other, value: credentialCanary }]), input);
      assert.deepEqual(out, { settingId, items: [{ hostname: host, value }], subject: "configured-hostname-tls",
        complete: false, effectiveProtection: "not-established" });
      for (const entry of [out, out.items, out.items[0], ...(Array.isArray(value) ? [out.items[0].value] : [])]) assert.ok(Object.isFrozen(entry));
      for (const canary of [credentialCanary, derivedCanary, other, "status", "created_at", "updated_at"]) assert.ok(!JSON.stringify(out).includes(canary));
    }
  }
  for (const value of ["1.0", "1.1", "1.2", "1.3"]) assert.equal(d.settingGet.project(success({ hostname: host, value }), d.settingGet.prepare(args("min_tls_version", true))).items[0].value, value);
  for (const value of ["on", "off"]) assert.equal(d.settingGet.project(success({ hostname: host, value }), d.settingGet.prepare(args("http2", true))).items[0].value, value);
  assert.deepEqual(d.settingsList.project(success([]), d.settingsList.prepare(args("http2", false))).items, []);
});

test("Cloudflare hostname TLS rejects foreign associations, ambiguous values, malformed envelopes and bounds", () => {
  const d = hostnameTlsDescriptors(scope());
  const p = d.settingGet.prepare(args("http2", true));
  for (const patch of [{ account_id: foreign }, { zone_id: foreign }, { setting_id: "ciphers" }]) {
    assert.throws(() => d.settingGet.project(JSON.stringify({ success: true, errors: [], result: row("http2"), ...patch }), p), /scope/);
    assert.throws(() => d.settingGet.project(success({ ...row("http2"), ...patch }), p), /scope/);
    assert.throws(() => d.settingsList.project(success([{ ...row("http2"), ...patch }]), d.settingsList.prepare(args("http2", false))), /scope/);
  }
  assert.throws(() => d.settingGet.project(success({ ...row("http2"), hostname: other }), p), /scope/);
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row("http2") }),
    JSON.stringify({ success: false, errors: [], result: row("http2") }), JSON.stringify({ success: true, errors: [credentialCanary], result: row("http2") }),
    success({ hostname: host }), success({ hostname: host, value: true }), success({ hostname: host, value: "ON" })]) {
    assert.throws(() => d.settingGet.project(raw, p), /upstream/);
  }
  for (const [settingId, value] of [["ciphers", []], ["ciphers", ["AES128-GCM-SHA256", "AES128-GCM-SHA256"]], ["ciphers", [credentialCanary]],
    ["ciphers", "AES128-GCM-SHA256"], ["min_tls_version", "default"], ["http2", ["on"]]]) {
    assert.throws(() => d.settingGet.project(success({ hostname: host, value }), d.settingGet.prepare(args(settingId, true))));
  }
  const list = d.settingsList.prepare(args("http2", false));
  assert.throws(() => d.settingsList.project(success([row("http2"), row("http2")]), list), /upstream/);
  assert.throws(() => d.settingsList.project(success(Array(1001).fill({ hostname: other })), list), /cap/);
  assert.throws(() => d.settingGet.project(success({ ...row("http2"), padding: "x".repeat(131072) }), p), /cap/);
  const names = Array.from({ length: 100 }, (_, i) => `${String(i).padStart(3, "0")}${"a".repeat(60)}.example.com`);
  const wide = hostnameTlsDescriptors({ ...scope(), settings: [{ settingId: "ciphers", hostnames: names }] });
  const ciphers = Array.from({ length: 100 }, (_, i) => `CIPHER-${i}`);
  assert.throws(() => wide.settingsList.project(success(names.map(hostname => ({ hostname, value: ciphers }))), wide.settingsList.prepare(args("ciphers", false))), /cap/);
});

test("Cloudflare hostname TLS default-empty and closed selectors deny before credentials; absent zone omits tools", async () => {
  assert.ok(!fixture("http2", false, { noZone: true }).operations.some(op => op.name.startsWith("cloudflare.tls.")));
  for (const detail of [false, true]) {
    for (const settings of [[], [{ settingId: "http2", hostnames: [] }], [{ settingId: "ciphers", hostnames: [host] }]]) {
      const f = fixture("http2", detail, { settings });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ settingId: "ssl" }, { accountId: foreign }, { zoneId: foreign }, { page: 2 }, { headers: {} },
      { approval: "forged" }, { value: "off" }, { hostname: detail ? other : host }]) {
      const f = fixture("http2", detail);
      assert.equal((await f.invoke({ ...args("http2", detail), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare hostname TLS actual-core fixed GETs preserve configured-only output, audit, cleanup and replay", async () => {
  for (const settingId of Object.keys(variants)) for (const detail of [false, true]) {
    const f = fixture(settingId, detail);
    const p = f.operation.prepare(args(settingId, detail));
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, detail ? "per-hostname-tls-settings-get" : "per-hostname-tls-settings-list");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.deepEqual(out.value.items, [{ hostname: host, value: variants[settingId] }]);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
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

test("Cloudflare hostname TLS current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const detail of [false, true]) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture("http2", detail);
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

test("Cloudflare hostname TLS upstream and audit failures preserve uncertain replay tombstones", async () => {
  for (const detail of [false, true]) for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true },
    { response: detail ? { ...row("http2"), zone_id: foreign } : [{ ...row("http2"), zone_id: foreign }] }]) {
    const f = fixture("http2", detail, options);
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
