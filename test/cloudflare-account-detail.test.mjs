import assert from "node:assert/strict";
import test from "node:test";
import { accountDetailDescriptor } from "../dist/plugins/cloudflare-broker/src/account-detail.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash, createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32), tool = "cloudflare.accounts.get";
const scope = () => ({ accountId: account, revision: "resource-1", readAllowed: true });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = (type = "standard", enforce = false) => ({ id: account, type, name: credentialCanary,
  settings: { enforce_twofactor: enforce, abuse_contact_email: derivedCanary },
  managed_by: { parent_org_id: foreign, parent_org_name: credentialCanary },
  legacy_flags: { enterprise_zone_quota: { available: 5 } }, created_on: derivedCanary });
function fixture({ allowed = true, response = row(), status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    workerAccountSettingsReadAllowed: true, ...(allowed ? { accountDetailReadAllowed: true } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource = "denied";
  try { resource = operation.prepare({}).resource.id; } catch {}
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = {}) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, foreign, '"name"', '"managed_by"', '"legacy_flags"', '"abuse_contact_email"'])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare account detail snapshots default-denied permission and exact request", () => {
  const s = scope(), d = accountDetailDescriptor(s); s.accountId = foreign; s.revision = "changed"; s.readAllowed = false;
  const p = d.prepare({});
  assert.equal(p.resource.id, `cloudflare:account:${account}:details`); assert.equal(p.resource.revision, "resource-1");
  assert.deepEqual(p.request, { method: "GET", path: `/accounts/${account}`, maxResponseBytes: 131072,
    timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success(row()), { ...p }), /scope/);
  for (const readAllowed of [undefined, false]) {
    const deniedScope = { ...scope(), readAllowed }, denied = accountDetailDescriptor(deniedScope); deniedScope.readAllowed = true;
    assert.throws(() => denied.prepare({}), /scope/);
  }
  for (const readAllowed of [null, 1, "true", {}]) assert.throws(() => accountDetailDescriptor({ ...scope(), readAllowed }), /schema/);
  for (const accountId of ["x", account + "\n", account.toUpperCase()]) assert.throws(() => accountDetailDescriptor({ ...scope(), accountId }), /schema/);
});

test("Cloudflare account detail projects official type and configured two-factor states without defaults", () => {
  const d = accountDetailDescriptor(scope()), p = d.prepare({});
  for (const type of ["standard", "enterprise"]) for (const enforce of [true, false, undefined]) {
    const value = row(type, enforce);
    if (enforce === undefined) delete value.settings.enforce_twofactor;
    const out = d.project(success(value), p);
    assert.deepEqual(out, { subject: "provider-account-detail", id: account, type,
      configuredEnforceTwofactor: enforce ?? "unavailable", effectiveEnforcementAndMembership: "not-established" });
    assert.ok(Object.isFrozen(out)); assert.ok(!JSON.stringify(out).includes(credentialCanary));
  }
  assert.equal(d.project(success({ id: account, type: "standard" }), p).configuredEnforceTwofactor, "unavailable");
});

test("Cloudflare account detail refuses foreign identity invalid type settings envelope and byte bounds", () => {
  const d = accountDetailDescriptor(scope()), p = d.prepare({});
  for (const value of [{ ...row(), id: foreign }, { ...row(), id: undefined }, { ...row(), account_id: foreign },
    { ...row(), type: undefined }, { ...row(), type: "free" }, { ...row(), type: "standard\n" },
    { ...row(), settings: null }, { ...row(), settings: [] }, { ...row(), settings: { enforce_twofactor: null } },
    { ...row(), settings: { enforce_twofactor: "false" } }, [], null])
    assert.throws(() => d.project(success(value), p), /upstream|schema|scope/);
  for (const raw of ["null", "bad-json", "{}", JSON.stringify({ success: true, result: row() }),
    JSON.stringify({ success: true, errors: ["failed"], result: row() }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: row() })])
    assert.throws(() => d.project(raw, p), /upstream|scope/);
  assert.throws(() => d.project(success({ ...row(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare account detail rejects model overrides and other service visibility before credentials", async () => {
  const denied = fixture({ allowed: false }); assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const input of [null, [], { accountId: foreign }, { agentId: "other-agent" }, { approval: "forged" },
    { readAllowed: true }, { url: "/accounts" }, { headers: {} }, { include: "settings" }, { page: 1 }]) {
    const f = fixture(); assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare bare account transport accepts exact account path only without query or root expansion", async () => {
  const d = accountDetailDescriptor(scope()), paths = [];
  const read = metadataTransport(async url => { paths.push(url); return new Response(success(row()), { headers: { "content-type": "application/json" } }); });
  assert.equal((await read(d, {}, credentialCanary, new AbortController().signal)).id, account);
  for (const path of ["/accounts", "/accounts/", `/accounts/${account}/`, `/accounts/${account}?include=settings`,
    `/accounts/${account}#fragment`, `/accounts/${account.toUpperCase()}`, `/accounts/${"%61".repeat(32)}`]) {
    const fake = { ...d, prepare: raw => { const p = d.prepare(raw); return { ...p, request: { ...p.request, path } }; } };
    await assert.rejects(read(fake, {}, credentialCanary, new AbortController().signal), /schema/);
  }
  assert.deepEqual(paths, [`https://api.cloudflare.com/client/v4/accounts/${account}`]);
});

test("Cloudflare account detail actual-core target audit journal cleanup and replay stay bound and redacted", async () => {
  const f = fixture(), p = f.operation.prepare({}), out = await f.invoke();
  assert.equal(out.ok, true); assert.equal(out.value.configuredEnforceTwofactor, false);
  assert.equal(p.plan.providerOperationId, "accounts-account-details"); assert.equal(p.plan.providerDryRun, false);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare account detail current policy ownership lease-time revocation and resource tampering refuse", async () => {
  for (const reason of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (reason === "agent") f.vector.policy.agents = ["other-agent"];
    if (reason === "resource") f.vector.policy.resources = [`cloudflare:account:${account}:workers:settings`];
    if (reason === "binding") f.dependencies.host.revalidate = async () => false;
    if (reason === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    assert.equal((await f.invoke()).code, reason === "binding" ? "RESOURCE_CHANGED" : reason === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, reason === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0);
  }
  const f = fixture(), p = f.operation.prepare({});
  const tampered = { ...p, resource: { ...p.resource, id: `cloudflare:account:${foreign}:details` } };
  assert.notEqual(canonicalHash(p), canonicalHash(tampered));
  await assert.rejects(f.operation.execute(tampered, credentialCanary, new AbortController().signal), /scope/);
  assert.equal(f.requests.length, 0);
});

test("Cloudflare account detail unavailable provider account drift and audit outage preserve uncertain replay state", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: { ...row(), id: foreign } }, { auditFailure: true }]) {
    const f = fixture(options), append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append; const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});
