import assert from "node:assert/strict";
import test from "node:test";
import { zoneListDescriptor } from "../dist/plugins/cloudflare-broker/src/zone-list.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), zone = "b".repeat(32), other = "c".repeat(32), foreign = "f".repeat(32);
const args = { page: 2, perPage: 5 }, tool = "cloudflare.zones.list";
const scope = () => ({ accountId: account, revision: "resource-1", zoneIds: [zone] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = (id = zone) => ({ id, account: { id: account, name: credentialCanary }, name: derivedCanary,
  plan: { name: credentialCanary }, owner: { email: derivedCanary }, name_servers: [credentialCanary] });
function fixture({ allowed = true, response = [row(), row(other)], status = 200 } = {}) {
  const f = providerFixture(), requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [] }, ...(allowed ? { zoneListIds: [zone] } : {}) },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
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
  for (const omitted of [credentialCanary, derivedCanary, '"name"', '"plan"', '"owner"', '"name_servers"', other])
    assert.ok(!serialized.includes(omitted));
}

test("Cloudflare zone list snapshots independent scope and exact trusted-account request", () => {
  const s = scope(), d = zoneListDescriptor(s); s.zoneIds.push(other); s.accountId = foreign; s.revision = "changed";
  const p = d.prepare(args);
  assert.equal(p.resource.id, `cloudflare:account:${account}:zones`); assert.equal(p.resource.revision, "resource-1");
  assert.equal(p.request.path, `/zones?account.id=${account}&page=2&per_page=5&match=all`);
  assert.equal(p.request.maxResponseBytes, 131072); assert.equal(p.request.maxRequests, 1); assert.equal(p.request.redirects, "deny");
  assert.deepEqual(d.project(success([row(), row(other)]), p).items, [{ id: zone }]);
  for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
  assert.throws(() => d.project(success([row()]), { ...p }), /scope/);
  for (const zoneIds of [undefined, []]) assert.throws(() => zoneListDescriptor({ ...scope(), zoneIds }).prepare(args), /scope/);
  for (const zoneIds of [null, [zone, zone], ["x"], [zone + "\n"], Array(101).fill(zone)])
    assert.throws(() => zoneListDescriptor({ ...scope(), zoneIds }), /schema|cap/);
});

test("Cloudflare zone list projects only selected IDs and always retains enumeration limitations", () => {
  const d = zoneListDescriptor(scope()), p = d.prepare(args);
  for (const values of [[], [row(other)], [row(), row(other)]]) {
    const out = d.project(success(values), p);
    assert.deepEqual(out.items, values.some(v => v.id === zone) ? [{ id: zone }] : []);
    assert.equal(out.complete, false); assert.equal(out.enumeration, "not-established");
    assert.equal(out.internalZones, "excluded-by-provider-default");
    for (const value of [out, out.items, ...out.items]) assert.ok(Object.isFrozen(value));
    assert.ok(!JSON.stringify(out).includes(credentialCanary)); assert.ok(!JSON.stringify(out).includes(derivedCanary));
  }
});

test("Cloudflare zone list refuses foreign or missing account identity duplicates malformed envelopes and caps", () => {
  const d = zoneListDescriptor(scope()), p = d.prepare(args);
  for (const values of [[{ ...row(), account: { id: foreign } }], [{ ...row(), account: {} }], [{ ...row(), account: null }],
    [{ ...row(), account: undefined }], [{ ...row(), account_id: foreign }], [row(), row()], [row(other), row(other)],
    [{ ...row(other), account: { id: foreign } }], [{ ...row(), id: "bad" }], [null], Array(6).fill(row())])
    assert.throws(() => d.project(success(values), p), /scope|schema|upstream|cap/);
  for (const raw of ["null", "bad-json", "{}", success(null), success({}), JSON.stringify({ success: true, result: [] }),
    JSON.stringify({ success: true, errors: ["failure"], result: [] }),
    JSON.stringify({ success: true, errors: [], account_id: foreign, result: [] })])
    assert.throws(() => d.project(raw, p), /upstream|scope|cap/);
  assert.throws(() => d.project(success([{ ...row(), padding: "x".repeat(131072) }]), p), /cap/);
});

test("Cloudflare zone list is denied before credentials despite ordinary zone visibility and rejects overrides", async () => {
  const denied = fixture({ allowed: false }); assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
  for (const input of [{ ...args, accountId: foreign }, { ...args, zoneId: other }, { ...args, match: "any" },
    { ...args, type: "internal" }, { ...args, name: "example.com" }, { ...args, headers: {} }, { ...args, approval: "forged" },
    { ...args, agentId: "other-agent" }, { ...args, page: 1001 }, { ...args, page: 0 }, { ...args, perPage: 4 },
    { ...args, perPage: 51 }, { ...args, page: 1.5 }]) {
    const f = fixture(); assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare zone list narrow transport accepts only the exact account-filtered bounded query", async () => {
  const d = zoneListDescriptor(scope()), paths = [];
  const read = metadataTransport(async url => { paths.push(url); return new Response(success([row()]), { headers: { "content-type": "application/json" } }); });
  assert.deepEqual((await read(d, args, credentialCanary, new AbortController().signal)).items, [{ id: zone }]);
  const path = d.prepare(args).request.path;
  for (const changed of ["/zones", "/zones?page=1", path.replace("match=all", "match=any"), path + "&name=example.com",
    path.replace("page=2", "page=1001"), path.replace("per_page=5", "per_page=4"), path.replace(account, "%61".repeat(32)),
    path + "#fragment", path.replace("/zones?", "/zones/?"), path.replace("account.id", "account.name")]) {
    const fake = { ...d, prepare: raw => { const p = d.prepare(raw); return { ...p, request: { ...p.request, path: changed } }; } };
    await assert.rejects(read(fake, args, credentialCanary, new AbortController().signal), /schema/);
  }
  assert.equal(paths.length, 1); assert.equal(paths[0], `https://api.cloudflare.com/client/v4${path}`);
});

test("Cloudflare zone list actual-core request target audit cleanup and replay remain bound and redacted", async () => {
  const f = fixture(), p = f.operation.prepare(args), out = await f.invoke();
  assert.equal(out.ok, true); assert.deepEqual(out.value.items, [{ id: zone }]);
  assert.equal(p.plan.providerOperationId, "zones-get"); assert.equal(p.plan.providerDryRun, false);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(r => r.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
});

test("Cloudflare zone list current agent resource ownership and lease-time revocation deny network", async () => {
  for (const reason of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
    if (reason === "agent") f.vector.policy.agents = ["other-agent"];
    if (reason === "resource") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}`];
    if (reason === "binding") f.dependencies.host.revalidate = async () => false;
    if (reason === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    assert.equal((await f.invoke()).code, reason === "binding" ? "RESOURCE_CHANGED" : reason === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, reason === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare zone list availability account drift and audit outages preserve uncertain replay tombstones", async () => {
  for (const options of [{ status: 403 }, { status: 404 }, { response: [{ ...row(), account: { id: foreign } }] }, { auditFailure: true }]) {
    const f = fixture(options), append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, 1);
    f.dependencies.audit.append = append;
    const journal = structuredClone([...f.journal]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1);
    assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
  }
});
