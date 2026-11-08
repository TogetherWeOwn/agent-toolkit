import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const own = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const tool = "cloudflare.d1.get";
const args = { databaseId: own };
const scope = () => ({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
  databaseIds: [own], databaseConfigurationIds: [own] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = () => ({ uuid: own, jurisdiction: "eu", read_replication: { mode: "auto", token: derivedCanary },
  name: credentialCanary, tables: [{ name: credentialCanary }], rows: [derivedCanary],
  created_at: credentialCanary, num_tables: 100, file_size: 200, running_in_region: "private-region" });
function fixture({ configurations = [own], allowed = true, response = result(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ ...scope(), databaseIds: allowed ? [own] : [], databaseConfigurationIds: configurations },
    { accountId: account, revision: "resource-1" }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      return new Response(success(response), { status, headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [`cloudflare:account:${account}:d1:${own}`] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "private-region", "num_tables", "file_size", "created_at", "tables"])
    assert.ok(!data.includes(value));
}

test("Cloudflare D1 configuration uses copied exact UUID scope and minimal fields without changing list output", () => {
  const s = scope();
  const d = metadataDescriptors(s);
  s.databaseConfigurationIds.length = 0;
  s.databaseIds.push(other);
  s.accountId = "f".repeat(32);
  s.revision = "changed";
  const p = d.d1Get.prepare(args);
  assert.deepEqual(p.resource, { id: `cloudflare:account:${account}:d1:${own}`, revision: "resource-1" });
  assert.equal(p.request.path, `/accounts/${account}/d1/database/${own}?fields=uuid,jurisdiction,read_replication`);
  assert.equal(d.d1Get.project(success(result()), p).configuration.readReplicationMode, "auto");
  assert.throws(() => d.d1Get.prepare({ databaseId: other }), /scope/);
  const basic = metadataDescriptors({ ...scope(), databaseConfigurationIds: [] }).d1Get;
  assert.equal(basic.prepare(args).request.path, `/accounts/${account}/d1/database/${own}?fields=uuid`);
  assert.deepEqual(basic.project(success(result()), basic.prepare(args)), { id: own });
  assert.deepEqual(d.d1List.project(success([result()]), d.d1List.prepare({ page: 1, perPage: 10 })), {
    items: [{ id: own }], complete: false });
  for (const databaseConfigurationIds of [[other], [own, own], ["invalid"], Array(101).fill(own), "invalid"])
    assert.throws(() => metadataDescriptors({ ...scope(), databaseConfigurationIds }));
});

test("Cloudflare D1 configuration preserves nullable jurisdiction and unavailable fields without effective placement inference", () => {
  const d = metadataDescriptors(scope()).d1Get;
  const p = d.prepare(args);
  for (const jurisdiction of ["eu", "fedramp", "us", null]) {
    for (const mode of ["auto", "disabled"]) {
      assert.deepEqual(d.project(success({ uuid: own, jurisdiction, read_replication: { mode } }), p), { id: own,
        configuration: { subject: "configured-d1-replication-and-jurisdiction", jurisdiction, readReplicationMode: mode,
          effectiveReplicationAndPlacement: "not-established" } });
    }
  }
  assert.deepEqual(d.project(success({ uuid: own }), p).configuration, {
    subject: "configured-d1-replication-and-jurisdiction", jurisdiction: "unavailable", readReplicationMode: "unavailable",
    effectiveReplicationAndPlacement: "not-established" });
});

test("Cloudflare D1 selected configuration rejects malformed variants foreign identity and oversized responses", () => {
  const d = metadataDescriptors(scope()).d1Get;
  const p = d.prepare(args);
  for (const jurisdiction of ["default", "EU", "", 0, false, [], {}])
    assert.throws(() => d.project(success({ ...result(), jurisdiction }), p), /upstream/);
  for (const read_replication of [null, [], true, "auto", {}, { mode: null }, { mode: "enabled" }, { mode: 1 }])
    assert.throws(() => d.project(success({ ...result(), read_replication }), p), /upstream/);
  for (const row of [{ ...result(), uuid: other }, { ...result(), account_id: "f".repeat(32) }])
    assert.throws(() => d.project(success(row), p), /scope/);
  assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], account_id: "f".repeat(32), result: result() }), p), /scope/);
  assert.throws(() => d.project(success({ ...result(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare D1 configuration cannot be requested through model fields or widen database scope", async () => {
  for (const input of [{ ...args, configuration: true }, { ...args, databaseConfigurationIds: [own] }, { ...args, accountId: account },
    { ...args, fields: "*" }, { ...args, headers: {} }, { ...args, approval: "forged" }, { databaseId: other }]) {
    const f = fixture();
    assert.equal((await f.invoke(input)).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  const denied = fixture({ allowed: false, configurations: [] });
  assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
  assert.equal(denied.calls.secret, 0);
  const basic = fixture({ configurations: [] });
  assert.deepEqual((await basic.invoke()).value, { id: own });
});

test("Cloudflare D1 configured detail uses actual core GET redaction cleanup audit and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerOperationId, "d1-get-database");
  assert.equal(p.plan.providerDryRun, false);
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.equal(out.value.configuration.readReplicationMode, "auto");
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

test("Cloudflare D1 configuration agent resource binding and lease-time policy revocation deny network", async () => {
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

test("Cloudflare D1 configuration corruption and audit outages fail closed and preserve uncertain replay", async () => {
  for (const options of [{ response: { ...result(), read_replication: { mode: credentialCanary } } },
    { response: { ...result(), uuid: other } }, { status: 403 }, { auditFailure: true }]) {
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
