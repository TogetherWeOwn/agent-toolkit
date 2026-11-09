import assert from "node:assert/strict";
import test from "node:test";
import { workerDomainMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/worker-domains.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const domainId = "b".repeat(32);
const zoneId = "c".repeat(32);
const foreign = "d".repeat(32);
const args = { domainId };
const domains = () => [{ domainId, zoneId, hostname: "app.example.test", scriptName: "safe-worker", environment: "production" }];
const scope = () => ({ accountId: account, revision: "resource-1", domains: domains() });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = () => ({ id: domainId, zone_id: zoneId, hostname: "app.example.test", service: "safe-worker",
  environment: "production", enabled: true, previews_enabled: false, cert_id: "never-return-private",
  zone_name: "never-return-private", source: "never-return-private" });
const expected = () => ({ id: domainId, zoneId, hostname: "app.example.test", scriptName: "safe-worker",
  environment: "production", subject: "configured-worker-domain", enabled: true, previewsEnabled: false,
  effectiveRouting: "not-established", effectiveProtection: "not-established" });
const names = ["cloudflare.workers.domains.list", "cloudflare.workers.domains.get"];

test("Cloudflare Worker domains bind exact account endpoints and project configured associations only", () => {
  const d = workerDomainMetadataDescriptors(scope());
  const get = d.workerDomainGet.prepare(args);
  assert.equal(d.workerDomainGet.providerOperationId, "workers.domains.get");
  assert.equal(d.workerDomainsList.providerOperationId, "workers.domains.list");
  assert.equal(get.request.path, `/accounts/${account}/workers/domains/${domainId}`);
  assert.equal(get.resource.id, `cloudflare:account:${account}:worker-domains:${domainId}`);
  assert.equal(d.workerDomainsList.prepare({}).request.path, `/accounts/${account}/workers/domains`);
  const output = d.workerDomainGet.project(success(row()), get);
  assert.deepEqual(output, expected());
  assert.ok(Object.isFrozen(output));
  const list = d.workerDomainsList.project(success([{ ...row(), id: foreign }, row()]), d.workerDomainsList.prepare({}));
  assert.deepEqual(list, { items: [expected()], complete: false });
  for (const value of [list, list.items, ...list.items]) assert.ok(Object.isFrozen(value));
  assert.ok(!JSON.stringify(list).includes("never-return-private"));
  assert.deepEqual(d.workerDomainGet.project(success({ ...row(), enabled: false, previews_enabled: true }), get),
    { ...expected(), enabled: false, previewsEnabled: true });
});

test("Cloudflare Worker domain scope is independently copied, closed and empty by default", () => {
  const mutable = scope();
  const d = workerDomainMetadataDescriptors(mutable);
  mutable.domains[0].hostname = "foreign.example.test";
  mutable.domains[0].scriptName = "foreign-worker";
  mutable.domains.length = 0;
  mutable.accountId = foreign;
  assert.deepEqual(d.workerDomainGet.project(success(row()), d.workerDomainGet.prepare(args)), expected());
  const empty = workerDomainMetadataDescriptors({ accountId: account, revision: "resource-1" });
  assert.throws(() => empty.workerDomainsList.prepare({}), /scope/);
  assert.throws(() => empty.workerDomainGet.prepare(args), /scope/);
  assert.throws(() => d.workerDomainGet.prepare({ domainId: foreign }), /scope/);
  for (const key of ["accountId", "zoneId", "service", "hostname", "environment", "page", "perPage", "url", "headers", "approval", "agentId", "workerDomains"]) {
    assert.throws(() => d.workerDomainGet.prepare({ ...args, [key]: "forged" }), /schema/);
    assert.throws(() => d.workerDomainsList.prepare({ [key]: "forged" }), /schema/);
  }
  assert.throws(() => d.workerDomainGet.project(success(row()), workerDomainMetadataDescriptors(scope()).workerDomainGet.prepare(args)), /scope/);
});

test("Cloudflare Worker domains reject malformed or ambiguous trusted associations", () => {
  for (const domains of [{}, [null], [...scope().domains, ...scope().domains],
    [scope().domains[0], { ...scope().domains[0], domainId: foreign }], Array(101).fill(scope().domains[0])]) {
    assert.throws(() => workerDomainMetadataDescriptors({ ...scope(), domains }));
  }
  for (const hostname of ["https://app.example.test", "app.example.test/path", "*.example.test", "app.example.test\n", "UPPER.example.test", "a..example.test", "a".repeat(64) + ".test"]) {
    assert.throws(() => workerDomainMetadataDescriptors({ ...scope(), domains: [{ ...scope().domains[0], hostname }] }), /schema/);
  }
});

test("Cloudflare Worker domains refuse reassigned identity, missing flags, duplicates and oversized results", () => {
  const d = workerDomainMetadataDescriptors(scope());
  const input = d.workerDomainGet.prepare(args);
  for (const change of [{ id: foreign }, { account_id: foreign }, { zone_id: foreign }, { service: "foreign-worker" },
    { hostname: "foreign.example.test" }, { environment: "preview" }, { zone_id: undefined }]) {
    assert.throws(() => d.workerDomainGet.project(success({ ...row(), ...change }), input), /scope/);
    if (change.id === undefined) assert.throws(() => d.workerDomainsList.project(success([{ ...row(), ...change }]), d.workerDomainsList.prepare({})), /scope/);
  }
  for (const change of [{ enabled: undefined }, { previews_enabled: undefined }, { enabled: "true" }, { previews_enabled: null }]) {
    assert.throws(() => d.workerDomainGet.project(success({ ...row(), ...change }), input), /upstream/);
  }
  assert.throws(() => d.workerDomainsList.project(success([row(), row()]), d.workerDomainsList.prepare({})), /upstream/);
  assert.throws(() => d.workerDomainsList.project(success(Array(101).fill(row())), d.workerDomainsList.prepare({})), /cap/);
  for (const raw of ["null", "broken-json", success([]), JSON.stringify({ success: true, result: row() })]) {
    assert.throws(() => d.workerDomainGet.project(raw, input), /upstream/);
  }
  assert.throws(() => d.workerDomainGet.project(success({ ...row(), source: "s".repeat(131072) }), input), /cap/);
});

// Actual reviewed core with synthetic process-local host, policy and state only.
function fixture(name, change = () => {}, result) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"],
    hyperdriveIds: [], workerDomains: domains() }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    return new Response(success(result ?? (name === names[0] ? [row()] : row())), { headers: { "content-type": "application/json" } });
  });
  const raw = name === names[0] ? {} : args;
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operations.find(op => op.name === name).prepare(raw).resource.id] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  change(f);
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, invoke: (input = raw) => broker.call(name, input, "verified-runtime", "domain-call") };
}
function safe(f, result) {
  for (const canary of [credentialCanary, derivedCanary, "never-return-private"]) {
    assert.ok(!JSON.stringify({ result, audit: f.audit, journal: [...f.journal] }).includes(canary));
  }
}

test("Cloudflare Worker domain bindings traverse core with exact GET, cleanup, audit and replay refusal", async () => {
  for (const name of names) {
    const f = fixture(name);
    const result = await f.invoke();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, name === names[0] ? { items: [expected()], complete: false } : expected());
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains${name === names[0] ? "" : `/${domainId}`}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(item => item.phase), ["intent", "outcome"]);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    safe(f, result);
  }
});

test("Cloudflare Worker domains deny agent, resource, binding, absent scope and lease-time revocation before GET", async () => {
  for (const name of names) for (const failure of ["agent", "resource", "binding", "scope", "revoked"]) {
    const f = fixture(name, f => {
      if (failure === "agent") f.vector.policy.agents = ["other-agent"];
      if (failure === "resource") f.vector.policy.resources = [];
      if (failure === "binding") f.dependencies.host.revalidate = async () => false;
      if (failure === "scope") f.dependencies.operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [] }, { accountId: account, revision: "resource-1" });
      if (failure === "revoked") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "policy-2"; return lease; };
      }
    });
    const result = await f.invoke();
    assert.equal(result.ok, false);
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.secret, failure === "revoked" ? 1 : 0);
    if (failure === "revoked") assert.equal(f.calls.close, 1);
    safe(f, result);
  }
});

test("Cloudflare Worker domains retain journal/audit gates and sanitize upstream or model failures", async () => {
  for (const name of names) for (const failure of ["audit", "journal", "projection", "model"]) {
    const invalid = { ...row(), service: "foreign-worker" };
    const f = fixture(name, f => {
      if (failure === "audit") f.dependencies.audit.append = async () => { throw new Error("never-return-private"); };
      if (failure === "journal") f.dependencies.journal.claim = async () => { throw new Error("never-return-private"); };
    }, failure === "projection" ? (name === names[0] ? [invalid] : invalid) : undefined);
    const result = await (failure === "model" ? f.invoke({ ...(name === names[0] ? {} : args), approval: true }) : f.invoke());
    assert.equal(result.ok, false);
    assert.equal(f.requests.length, failure === "projection" ? 1 : 0);
    if (failure === "projection") assert.equal(f.calls.close, 1);
    safe(f, result);
  }
});
