import assert from "node:assert/strict";
import test from "node:test";
import { accessApplicationMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const app = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const domain = "console.example.com/admin/*";
const scope = () => ({ accountId: account, revision: "resource-1", applications: [{ applicationId: app, primaryDomain: domain }] });
const row = { id: app, type: "self_hosted", domain, account_id: account };
const observed = { subject: "configured-access-applications", effectiveProtection: "not-established" };
const projected = { id: app, type: "self_hosted", primaryDomain: domain };
const list = "cloudflare.access.applications.list";
const detail = "cloudflare.access.applications.get";
const argsFor = name => name === list ? { page: 1, perPage: 10 } : { applicationId: app };
const success = result => JSON.stringify({ success: true, errors: [], result });

// Actual reviewed core with a synthetic process-local host, journal and lease.
function fixture(name = detail, result = name === list ? [row] : row, applications = scope().applications) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [], accessApplications: applications },
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      const sensitive = value => ({ ...value, name: derivedCanary, aud: credentialCanary,
        policies: [{ include: [{ email: credentialCanary }] }], destinations: [{ uri: derivedCanary }], credentials: credentialCanary });
      return new Response(success(Array.isArray(result) ? result.map(sensitive) : sensitive(result)), { headers: { "content-type": "application/json" } });
    });
  const operation = operations.find(op => op.name === name);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: applications.length ? [operation.prepare(argsFor(name)).resource.id] : [] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, invoke: (args = argsFor(name), key = "call-a") => broker.call(name, args, "verified-runtime", key) };
}
function safe(f, result) {
  const value = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary]) assert.ok(!value.includes(canary));
}

test("Cloudflare Access copies independent application/domain scope and binds exact bounded requests", () => {
  const input = scope();
  const descriptors = accessApplicationMetadataDescriptors(input);
  input.applications[0].primaryDomain = "foreign.example.com";
  input.applications.push({ applicationId: other, primaryDomain: domain });
  input.accountId = "d".repeat(32);
  const prepared = descriptors.accessApplicationGet.prepare({ applicationId: app });
  assert.equal(prepared.resource.id, `cloudflare:account:${account}:access-applications:${app}`);
  assert.equal(prepared.resource.revision, "resource-1");
  assert.deepEqual(prepared.request, { method: "GET", path: `/accounts/${account}/access/apps/${app}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
  assert.equal(descriptors.accessApplicationsList.prepare({ page: 2, perPage: 10 }).request.path, `/accounts/${account}/access/apps?page=2&per_page=10`);
  assert.deepEqual(descriptors.accessApplicationGet.project(success(row), prepared), { ...projected, ...observed });
  assert.throws(() => descriptors.accessApplicationGet.prepare({ applicationId: other }), /scope/);
  for (const value of [prepared, prepared.arguments, prepared.request, prepared.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => accessApplicationMetadataDescriptors({ ...scope(), applications: [scope().applications[0], scope().applications[0]] }), /schema/);
  assert.throws(() => accessApplicationMetadataDescriptors({ ...scope(), applications: Array(101).fill(scope().applications[0]) }), /cap/);
  const hex = "d".repeat(32);
  assert.equal(accessApplicationMetadataDescriptors({ ...scope(), applications: [{ applicationId: hex, primaryDomain: domain }] }).accessApplicationGet.prepare({ applicationId: hex }).arguments.applicationId, hex);
});

test("Cloudflare Access lists only scoped primary domains and never claims effective or complete protection", () => {
  const descriptor = accessApplicationMetadataDescriptors(scope()).accessApplicationsList;
  const input = descriptor.prepare(argsFor(list));
  const output = descriptor.project(success([{ id: other, domain: credentialCanary }, { ...row, policies: credentialCanary, destinations: derivedCanary }]), input);
  assert.deepEqual(output, { items: [projected], complete: false, ...observed });
  assert.deepEqual(descriptor.project(success([]), input), { items: [], complete: false, ...observed });
  assert.throws(() => descriptor.project(success([row, row]), input), /upstream/);
  assert.throws(() => descriptor.project(success([row, row]), descriptor.prepare({ page: 1, perPage: 1 })), /cap/);
  assert.throws(() => descriptor.project(success(Array(101).fill(row)), input), /cap/);
});

test("Cloudflare Access refuses reassigned domains, non-self-hosted apps, foreign accounts and malformed envelopes", () => {
  for (const descriptor of Object.values(accessApplicationMetadataDescriptors(scope()))) {
    const input = descriptor.prepare(argsFor(descriptor.name));
    const wrap = value => success(descriptor.name === list ? [value] : value);
    for (const patch of [{ domain: "foreign.example.com" }, { domain: undefined }, { type: "saas" }, { type: undefined }, { account_id: "d".repeat(32) }]) {
      assert.throws(() => descriptor.project(wrap({ ...row, ...patch }), input));
    }
    for (const raw of ["{", "null", success(null), JSON.stringify({ success: false, errors: [], result: row }), JSON.stringify({ success: true, errors: [{}], result: row }), "x".repeat(131073)]) assert.throws(() => descriptor.project(raw, input));
  }
  const descriptor = accessApplicationMetadataDescriptors(scope()).accessApplicationGet;
  assert.throws(() => descriptor.project(success({ ...row, id: other }), descriptor.prepare(argsFor(detail))), /scope/);
  for (const primaryDomain of ["https://example.com", "example.com/?token=value", "user:password@example.com", "example.com\n", "a".repeat(1025), ""]) {
    assert.throws(() => accessApplicationMetadataDescriptors({ ...scope(), applications: [{ applicationId: app, primaryDomain }] }), /schema/);
  }
});

test("Cloudflare Access defaults empty and refuses model overrides before credentials", async () => {
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [] },
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] });
  for (const name of [list, detail]) {
    assert.throws(() => operations.find(op => op.name === name).prepare(argsFor(name)), /scope/);
    const empty = fixture(name, undefined, []);
    assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(empty.calls.secret, 0);
    assert.equal(empty.requests.length, 0);
    for (const patch of [{ applicationId: other }, { accountId: "d".repeat(32) }, { domain }, { search: "anything" }, { url: "https://example.com" }, { agentId: "forged" }, { approval: true }, { perPage: 101 }]) {
      const f = fixture(name);
      assert.equal((await f.invoke({ ...argsFor(name), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare Access executes through reviewed core with safe projection, cleanup, audit and replay refusal", async () => {
  for (const name of [list, detail]) {
    const f = fixture(name);
    const result = await f.invoke();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, name === list ? { items: [projected], complete: false, ...observed } : { ...projected, ...observed });
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/access/apps${name === list ? "?page=1&per_page=10" : `/${app}`}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});

test("Cloudflare Access policy and trusted binding denials precede credentials; lease-time revocation precedes network", async () => {
  for (const name of [list, detail]) {
    for (const denied of ["agent", "resource", "binding"]) {
      const f = fixture(name);
      if (denied === "agent") f.vector.policy.agents = ["foreign-agent"];
      if (denied === "resource") f.vector.policy.resources = ["foreign-resource"];
      if (denied === "binding") f.dependencies.host.revalidate = async () => false;
      assert.equal((await f.invoke()).code, denied === "binding" ? "RESOURCE_CHANGED" : "POLICY_DENIED");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    const f = fixture(name);
    const resolve = f.dependencies.credentials.resolve;
    f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    assert.equal((await f.invoke()).code, "POLICY_CHANGED");
    assert.equal(f.requests.length, 0);
    assert.equal(f.calls.close, 1);
  }
});

test("Cloudflare Access sanitizes changed domain refusal and retains uncertain replay protection", async () => {
  for (const name of [list, detail]) {
    const changed = { ...row, domain: "foreign.example.com" };
    const f = fixture(name, name === list ? [changed] : changed);
    const result = await f.invoke();
    assert.equal(result.code, "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, result);
  }
});
