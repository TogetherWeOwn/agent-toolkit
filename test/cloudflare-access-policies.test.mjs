import assert from "node:assert/strict";
import test from "node:test";
import { accessPolicyMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const app = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const policy = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const other = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const scope = () => ({ accountId: account, revision: "resource-1", applications: [{ applicationId: app, policyIds: [policy] }] });
const row = { id: policy, decision: "bypass", precedence: 1, account_id: account, app_id: app };
const observed = { subject: "configured-access-policies", effectiveProtection: "not-established" };
const projected = { id: policy, decision: "bypass", precedence: { status: "configured", value: 1 } };
const list = "cloudflare.access.policies.list";
const detail = "cloudflare.access.policies.get";
const argsFor = name => name === list ? { applicationId: app, page: 1, perPage: 10 } : { applicationId: app, policyId: policy };
const success = result => JSON.stringify({ success: true, errors: [], result });

// Actual reviewed core with synthetic process-local host, journal and lease.
function fixture(name = detail, result = name === list ? [row] : row, applications = scope().applications) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [], accessPolicies: applications },
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
      const sensitive = value => ({ ...value, name: derivedCanary, include: [{ email: credentialCanary }],
        exclude: [{ ip: derivedCanary }], require: [{ service_token: { token_id: credentialCanary } }],
        approval_groups: [{ email_addresses: [credentialCanary] }], connection_rules: derivedCanary });
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

test("Cloudflare Access policy scope copies per-application IDs and binds exact bounded requests", () => {
  const input = scope();
  const descriptors = accessPolicyMetadataDescriptors(input);
  input.applications[0].policyIds.push(other);
  input.applications[0].applicationId = other;
  input.accountId = "e".repeat(32);
  const prepared = descriptors.accessPolicyGet.prepare(argsFor(detail));
  assert.equal(prepared.resource.id, `cloudflare:account:${account}:access-application:${app}:policies:${policy}`);
  assert.equal(prepared.resource.revision, "resource-1");
  assert.deepEqual(prepared.request, { method: "GET", path: `/accounts/${account}/access/apps/${app}/policies/${policy}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
  assert.equal(descriptors.accessPoliciesList.prepare({ applicationId: app, page: 2, perPage: 10 }).request.path, `/accounts/${account}/access/apps/${app}/policies?page=2&per_page=10`);
  for (const value of [prepared, prepared.arguments, prepared.request, prepared.resource]) assert.ok(Object.isFrozen(value));
  assert.throws(() => descriptors.accessPolicyGet.prepare({ applicationId: app, policyId: other }), /scope/);
  assert.throws(() => descriptors.accessPoliciesList.prepare({ applicationId: other, page: 1, perPage: 10 }), /scope/);
  const reused = accessPolicyMetadataDescriptors({ ...scope(), applications: [...scope().applications, { applicationId: other, policyIds: [] }] });
  assert.throws(() => reused.accessPolicyGet.prepare({ applicationId: other, policyId: policy }), /scope/);
  for (const applications of [[scope().applications[0], scope().applications[0]], [{ applicationId: app, policyIds: [policy, policy] }]]) {
    assert.throws(() => accessPolicyMetadataDescriptors({ ...scope(), applications }), /schema/);
  }
  for (const applications of [Array(101).fill(scope().applications[0]), [{ applicationId: app, policyIds: Array(101).fill(policy) }]]) {
    assert.throws(() => accessPolicyMetadataDescriptors({ ...scope(), applications }), /cap/);
  }
});

test("Cloudflare Access policy projections preserve configured decisions but omit all identity rules", () => {
  const descriptors = accessPolicyMetadataDescriptors(scope());
  const input = descriptors.accessPoliciesList.prepare(argsFor(list));
  const output = descriptors.accessPoliciesList.project(success([{ id: other, decision: credentialCanary }, { ...row, include: credentialCanary }]), input);
  assert.deepEqual(output, { items: [projected], complete: false, ...observed });
  assert.deepEqual(descriptors.accessPoliciesList.project(success([]), input), { items: [], complete: false, ...observed });
  const prepared = descriptors.accessPolicyGet.prepare(argsFor(detail));
  for (const decision of ["allow", "deny", "non_identity", "bypass"]) {
    assert.deepEqual(descriptors.accessPolicyGet.project(success({ ...row, decision }), prepared), { ...projected, decision, ...observed });
  }
  assert.deepEqual(descriptors.accessPolicyGet.project(success({ ...row, precedence: undefined }), prepared).precedence, { status: "unavailable", reason: "not-returned" });
  assert.equal(descriptors.accessPolicyGet.project(success({ ...row, precedence: 0 }), prepared).precedence.value, 0);
  for (const rows of [[row, row], Array(101).fill(row)]) assert.throws(() => descriptors.accessPoliciesList.project(success(rows), input));
  assert.throws(() => descriptors.accessPoliciesList.project(success([row, row]), descriptors.accessPoliciesList.prepare({ applicationId: app, page: 1, perPage: 1 })), /cap/);
});

test("Cloudflare Access policy projections refuse foreign bindings and malformed action/order without defaults", () => {
  for (const descriptor of Object.values(accessPolicyMetadataDescriptors(scope()))) {
    const input = descriptor.prepare(argsFor(descriptor.name));
    const wrap = value => success(descriptor.name === list ? [value] : value);
    for (const patch of [{ account_id: "e".repeat(32) }, { app_id: other }, { application_id: other },
      ...[undefined, null, "Allow", "unknown", 0].map(decision => ({ decision })),
      ...[null, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1].map(precedence => ({ precedence }))]) {
      assert.throws(() => descriptor.project(wrap({ ...row, ...patch }), input));
    }
    for (const raw of ["{", "null", success(null), JSON.stringify({ success: false, errors: [], result: row }), JSON.stringify({ success: true, errors: [{}], result: row }), "x".repeat(131073)]) assert.throws(() => descriptor.project(raw, input));
  }
  const descriptor = accessPolicyMetadataDescriptors(scope()).accessPolicyGet;
  assert.throws(() => descriptor.project(success({ ...row, id: other }), descriptor.prepare(argsFor(detail))), /scope/);
});

test("Cloudflare Access application visibility never grants policy visibility and model overrides refuse before credentials", async () => {
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [], accessApplications: [{ applicationId: app, primaryDomain: "example.com" }] },
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] });
  for (const name of [list, detail]) {
    assert.throws(() => operations.find(op => op.name === name).prepare(argsFor(name)), /scope/);
    const empty = fixture(name, undefined, []);
    assert.equal((await empty.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(empty.calls.secret, 0);
    assert.equal(empty.requests.length, 0);
    for (const patch of [{ applicationId: other }, { policyId: other }, { accountId: "e".repeat(32) }, { decision: "allow" }, { include: [] }, { url: "https://example.com" }, { approval: true }, { perPage: 101 }]) {
      const f = fixture(name);
      assert.equal((await f.invoke({ ...argsFor(name), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare Access policies execute through reviewed core with safe projection, cleanup, audit and replay refusal", async () => {
  for (const name of [list, detail]) {
    const f = fixture(name);
    const result = await f.invoke();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, name === list ? { items: [projected], complete: false, ...observed } : { ...projected, ...observed });
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/access/apps/${app}/policies${name === list ? "?page=1&per_page=10" : `/${policy}`}`);
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

test("Cloudflare Access policy agent/resource and binding denials precede credentials; lease-time revocation precedes network", async () => {
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

test("Cloudflare Access policy foreign responses sanitize and retain uncertain-outcome replay protection", async () => {
  for (const name of [list, detail]) {
    const changed = { ...row, app_id: other };
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
