import assert from "node:assert/strict";
import test from "node:test";
import { accountListDescriptor } from "../dist/plugins/cloudflare-broker/src/account-list.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash, createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), foreign = "f".repeat(32), tool = "cloudflare.accounts.list";
const args = { page: 2, perPage: 5 };
const scope = () => ({ accountId: account, revision: "resource-1", readAllowed: true });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = (id = account) => ({ id, name: credentialCanary, type: "enterprise",
  settings: { enforce_twofactor: true, abuse_contact_email: derivedCanary }, managed_by: { parent_org_id: foreign },
  legacy_flags: { enterprise_zone_quota: { maximum: 100 } }, created_on: derivedCanary });
function fixture({ allowed = true, response = [row(), row(foreign)], status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [],
    accountDetailReadAllowed: true, workerAccountSettingsReadAllowed: true, ...(allowed ? { accountListReadAllowed: true } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource = "denied";
  try { resource = operation.prepare(args).resource.id; } catch {}
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args) => broker.call(tool, input, "verified-runtime", "call-a") };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const omitted of [credentialCanary, derivedCanary, foreign, '"settings"', '"name"', '"managed_by"', '"legacy_flags"'])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare account list snapshots independent default-denied authority and bounded request", () => {
  const s = scope(), d = accountListDescriptor(s); s.accountId = foreign; s.revision = "changed"; s.readAllowed = false;
  const p = d.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${account}:account-list`); assert.equal(p.resource.revision, "resource-1");
  assert.deepEqual(p.request, { method: "GET", path: "/accounts?page=2&per_page=5", maxResponseBytes: 131072,
    timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success([row()]), { ...p }), /scope/);
  for (const readAllowed of [undefined, false]) {
    const deniedScope = { ...scope(), readAllowed }, denied = accountListDescriptor(deniedScope); deniedScope.readAllowed = true;
    assert.throws(() => denied.prepare(args), /scope/);
  }
  for (const readAllowed of [null, 1, "true", {}]) assert.throws(() => accountListDescriptor({ ...scope(), readAllowed }), /schema/);
  for (const accountId of ["x", account + "\n", account.toUpperCase()]) assert.throws(() => accountListDescriptor({ ...scope(), accountId }), /schema/);
  for (const input of [{ page: 0, perPage: 5 }, { page: 1001, perPage: 5 }, { page: 1.5, perPage: 5 },
    { page: 1, perPage: 4 }, { page: 1, perPage: 51 }, { page: 1, perPage: 5.5 }]) assert.throws(() => d.prepare(input), /schema/);
  assert.equal(d.prepare({ page: 1000, perPage: 50 }).request.path, "/accounts?page=1000&per_page=50");
});

test("Cloudflare account list returns only trusted identity and never establishes enumeration or membership", () => {
  const d = accountListDescriptor(scope()), p = d.prepare(args);
  for (const result of [[row(), row(foreign)], [row(foreign)], []]) {
    const out = d.project(success(result), p);
    assert.deepEqual(out, { subject: "provider-account-identities", items: result.some(r => r.id === account) ? [{ id: account }] : [],
      complete: false, enumeration: "not-established", effectiveMembership: "not-established" });
    for (const value of [out, out.items, ...out.items]) assert.ok(Object.isFrozen(value));
    assert.ok(!JSON.stringify(out).includes(credentialCanary)); assert.ok(!JSON.stringify(out).includes(foreign));
  }
});

test("Cloudflare account list refuses malformed duplicate contradictory identity envelopes and byte bounds", () => {
  const d = accountListDescriptor(scope()), p = d.prepare(args);
  for (const result of [[row(), row()], [row(foreign), row(foreign)], [{ ...row(), id: undefined }],
    [{ ...row(), id: foreign + "\n" }], [{ ...row(), account_id: foreign }], [null], {}, null, Array(6).fill(row())])
    assert.throws(() => d.project(success(result), p), /schema|upstream|scope|cap/);
  for (const raw of ["null", "bad-json", "{}", JSON.stringify({ success: true, result: [] }),
    JSON.stringify({ success: true, errors: ["failed"], result: [] }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: [] })])
    assert.throws(() => d.project(raw, p), /upstream|scope/);
  assert.throws(() => d.project(success([{ ...row(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare account list refuses model overrides and detail-only authority before credentials", async () => {
  const denied = fixture({ allowed: false }); assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const input of [null, [], {}, { ...args, accountId: foreign }, { ...args, name: "account-name" }, { ...args, direction: "asc" },
    { ...args, agentId: "other-agent" }, { ...args, readAllowed: true }, { ...args, headers: {} }, { ...args, approval: "forged" }]) {
    const f = fixture(); assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare account collection transport accepts only exact bounded pagination grammar", async () => {
  const d = accountListDescriptor(scope()), paths = [];
  const read = metadataTransport(async url => { paths.push(url); return new Response(success([row()]), { headers: { "content-type": "application/json" } }); });
  assert.equal((await read(d, args, credentialCanary, new AbortController().signal)).items[0].id, account);
  for (const path of ["/accounts", "/accounts/", "/accounts?page=0&per_page=5", "/accounts?page=1001&per_page=5",
    "/accounts?page=1&per_page=4", "/accounts?page=1&per_page=51", "/accounts?page=01&per_page=5",
    "/accounts?per_page=5&page=1", "/accounts?page=1&per_page=5&name=hidden", "/accounts?page=1&per_page=5#fragment"]) {
    const fake = { ...d, prepare: raw => { const p = d.prepare(raw); return { ...p, request: { ...p.request, path } }; } };
    await assert.rejects(read(fake, args, credentialCanary, new AbortController().signal), /schema/);
  }
  assert.deepEqual(paths, ["https://api.cloudflare.com/client/v4/accounts?page=2&per_page=5"]);
});

test("Cloudflare account list actual-core target audit journal cleanup replay remain bound and redacted", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, [{ id: account }]);
  assert.equal(p.plan.providerOperationId, "accounts-list-accounts"); assert.equal(p.plan.providerDryRun, false);
  assert.equal(f.requests[0].url, "https://api.cloudflare.com/client/v4/accounts?page=2&per_page=5");
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare account list current ownership agent policy lease-time revocation and tampering refuse", async () => {
  for (const reason of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (reason === "agent") f.vector.policy.agents = ["other-agent"];
    if (reason === "resource") f.vector.policy.resources = [`cloudflare:account:${account}:details`];
    if (reason === "binding") f.dependencies.host.revalidate = async () => false;
    if (reason === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    assert.equal((await f.invoke()).code, reason === "binding" ? "RESOURCE_CHANGED" : reason === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, reason === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0);
  }
  const f = fixture(), p = f.operation.prepare(args);
  for (const tampered of [{ ...p, resource: { ...p.resource, id: `cloudflare:account:${foreign}:account-list` } },
    { ...p, arguments: { page: 3, perPage: 5 } }]) {
    assert.notEqual(canonicalHash(p), canonicalHash(tampered));
    await assert.rejects(f.operation.execute(tampered, credentialCanary, new AbortController().signal), /scope/);
  }
  assert.equal(f.requests.length, 0);
});

test("Cloudflare account list unavailable provider malformed rows and audit outage retain uncertain replay state", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: [row(), row()] }, { auditFailure: true }]) {
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
