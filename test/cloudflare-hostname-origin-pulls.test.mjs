import assert from "node:assert/strict";
import test from "node:test";
import { hostnameOriginPullsDescriptor } from "../dist/plugins/cloudflare-broker/src/hostname-origin-pulls.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const name = "app.example.com";
const args = () => ({ hostname: name });
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", hostnames: [name] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ hostname: name, enabled: true, certificate: credentialCanary, private_key: derivedCanary,
  cert_id: credentialCanary, status: "active", updated_at: credentialCanary, unrelated: { token: credentialCanary } });
function fixture({ hostnames = [name], response = row(), status = 200, noZone = false } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], originPullHostnames: hostnames } }) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === "cloudflare.tls.hostname_origin_pulls.get");
  let resource;
  try { resource = operation.prepare(args()).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations,
    invoke: (raw = args(), key = "call-a") => broker.call("cloudflare.tls.hostname_origin_pulls.get", raw, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "certificate", "private_key", "cert_id", "updated_at", "unrelated"]) assert.ok(!data.includes(value));
}

test("Cloudflare hostname origin pulls copies exact scope and authenticates prepared projections", () => {
  const s = scope();
  const d = hostnameOriginPullsDescriptor(s);
  s.accountId = foreign;
  s.zoneId = foreign;
  s.revision = "changed";
  s.hostnames[0] = "other.example.com";
  s.hostnames.push("new.example.com");
  const p = d.prepare(args());
  assert.equal(p.request.path, `/zones/${zone}/origin_tls_client_auth/hostnames/${name}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:hostname-origin-pulls:${name}`);
  assert.equal(p.resource.revision, "resource-1");
  assert.throws(() => d.prepare({ hostname: "new.example.com" }), /scope/);
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  assert.throws(() => hostnameOriginPullsDescriptor(scope()).project(success(row()), p), /scope/);
});

test("Cloudflare hostname origin pulls validates bounded canonical hostname selections", () => {
  for (const hostnames of [null, {}, "app.example.com", Array(101).fill(name)]) {
    assert.throws(() => hostnameOriginPullsDescriptor({ ...scope(), hostnames }), /cap/);
  }
  assert.throws(() => hostnameOriginPullsDescriptor({ ...scope(), hostnames: [name, name] }), /schema/);
  for (const invalid of ["*.example.com", "App.example.com", "app.example.com.", "https://app.example.com", "app%2eexample.com",
    "app.example.com/other", "app.example.com?x=1", "app.example.com\n", "аpp.example.com", `${"a".repeat(64)}.example.com`, `${"a.".repeat(125)}test`]) {
    assert.throws(() => hostnameOriginPullsDescriptor({ ...scope(), hostnames: [invalid] }), /schema/);
    assert.throws(() => hostnameOriginPullsDescriptor(scope()).prepare({ hostname: invalid }), /schema/);
  }
  for (const field of ["accountId", "zoneId", "revision"]) assert.throws(() => hostnameOriginPullsDescriptor({ ...scope(), [field]: "bad/identity" }), /schema/);
});

test("Cloudflare hostname origin pulls preserves configured boolean, void null and unavailable distinctly", () => {
  const d = hostnameOriginPullsDescriptor(scope());
  const p = d.prepare(args());
  for (const enabled of [false, true, null]) {
    const out = d.project(success({ ...row(), enabled }), p);
    assert.deepEqual(out, { hostname: name, enabled, subject: "configured-hostname-origin-pulls", effectiveProtection: "not-established" });
    assert.ok(Object.isFrozen(out));
    safe({ audit: [], journal: [] }, out);
  }
  assert.deepEqual(d.project(success({ hostname: name }), p), { hostname: name, enabled: "unavailable",
    subject: "configured-hostname-origin-pulls", effectiveProtection: "not-established" });
});

test("Cloudflare hostname origin pulls rejects foreign context, malformed envelopes, values and bounds", () => {
  const d = hostnameOriginPullsDescriptor(scope());
  const p = d.prepare(args());
  for (const patch of [{ account_id: foreign }, { zone_id: foreign }]) {
    assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], result: row(), ...patch }), p), /scope/);
    assert.throws(() => d.project(success({ ...row(), ...patch }), p), /scope/);
  }
  for (const hostname of [null, "other.example.com", undefined]) assert.throws(() => d.project(success({ ...row(), hostname }), p), /scope/);
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: false, errors: [], result: row() }), JSON.stringify({ success: true, errors: [credentialCanary], result: row() })]) {
    assert.throws(() => d.project(raw, p), /upstream/);
  }
  for (const enabled of [0, 1, "false", "true", [], {}]) assert.throws(() => d.project(success({ ...row(), enabled }), p), /upstream/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare hostname origin pulls defaults denied, isolates family scopes and refuses overrides before credentials", async () => {
  assert.ok(!fixture({ noZone: true }).operations.some(op => op.name === "cloudflare.tls.hostname_origin_pulls.get"));
  assert.throws(() => hostnameOriginPullsDescriptor({ accountId: account, zoneId: zone, revision: "resource-1" }).prepare(args()), /scope/);
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], originPullsReadAllowed: true, universalSslReadAllowed: true,
      automaticSslReadAllowed: true, hostnameTls: [{ settingId: "http2", hostnames: [name] }] } },
  { accountId: account, revision: "resource-1" });
  assert.throws(() => operations.find(op => op.name === "cloudflare.tls.hostname_origin_pulls.get").prepare(args()), /scope/);
  assert.throws(() => fixture().operations.find(op => op.name === "cloudflare.tls.origin_pulls.get").prepare({}), /scope/);
  for (const hostnames of [[], ["other.example.com"]]) {
    const f = fixture({ hostnames });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  for (const raw of [{}, { ...args(), accountId: foreign }, { ...args(), zoneId: foreign }, { ...args(), enabled: false },
    { ...args(), headers: {} }, { ...args(), page: 2 }, { ...args(), approval: "forged" }, { ...args(), certificateId: "forged" }]) {
    const f = fixture();
    assert.equal((await f.invoke(raw)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare hostname origin pulls actual-core fixed GET preserves safe output, audit, cleanup and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args());
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "per-hostname-authenticated-origin-pull-get-the-hostname-status-for-client-authentication");
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.equal(out.value.enabled, true);
  assert.equal(out.value.effectiveProtection, "not-established");
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/origin_tls_client_auth/hostnames/${name}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare hostname origin pulls current agent, resource, binding and lease-time revocation deny network", async () => {
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

test("Cloudflare hostname origin pulls upstream and outcome audit failures preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { auditFailure: true }, { response: { ...row(), zone_id: foreign } },
    { response: { ...row(), hostname: "other.example.com" } }, { response: { ...row(), enabled: "false" } }]) {
    const f = fixture(options);
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
