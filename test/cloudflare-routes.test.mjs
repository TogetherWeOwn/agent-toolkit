import assert from "node:assert/strict";
import test from "node:test";
import { workerRouteMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const route = "c".repeat(32);
const other = "d".repeat(32);
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1", routes: [{ routeId: route, scriptName: "safe-worker" }] });
const row = { id: route, pattern: "https://*.example.com/api/*", script: "safe-worker", account_id: account, zone_id: zone };
const observed = { subject: "configured-worker-routes", effectiveMatching: "not-established" };
const projected = { id: route, pattern: row.pattern, scriptName: "safe-worker" };
const success = result => JSON.stringify({ success: true, errors: [], result });
const list = "cloudflare.workers.routes.list";
const detail = "cloudflare.workers.routes.get";
const argumentsFor = name => name === list ? {} : { routeId: route };

// Actual reviewed core, with process-local synthetic host/journal/credentials only.
function fixture(name = detail, result = name === list ? [row] : row, routes = scope().routes) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    zone: { zoneId: zone, dnsRecordIds: [], workerRoutes: routes } },
  { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    const sensitive = value => ({ ...value, token: credentialCanary, source: derivedCanary, settings: { password: credentialCanary } });
    return new Response(success(Array.isArray(result) ? result.map(sensitive) : sensitive(result)), { headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === name);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: routes.length ? [operation.prepare(argumentsFor(name)).resource.id] : [] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, invoke: (args = argumentsFor(name), key = "call-a") => broker.call(name, args, "verified-runtime", key) };
}
function safe(f, result) {
  const value = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const canary of [credentialCanary, derivedCanary]) assert.ok(!value.includes(canary));
}

test("Cloudflare route descriptors copy independent route/script scope and build exact zone-bound GETs", () => {
  const input = scope();
  const descriptors = workerRouteMetadataDescriptors(input);
  input.routes[0].scriptName = "foreign-worker";
  input.routes.push({ routeId: other, scriptName: "safe-worker" });
  input.zoneId = other;
  input.accountId = other;
  const prepared = descriptors.workerRouteGet.prepare({ routeId: route });
  assert.equal(prepared.resource.id, `cloudflare:account:${account}:zone:${zone}:worker-routes:${route}`);
  assert.equal(prepared.resource.revision, "resource-1");
  assert.deepEqual(prepared.request, { method: "GET", path: `/zones/${zone}/workers/routes/${route}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
  assert.equal(descriptors.workerRoutesList.prepare({}).request.path, `/zones/${zone}/workers/routes`);
  assert.deepEqual(descriptors.workerRouteGet.project(success(row), prepared), { ...projected, ...observed });
  assert.throws(() => descriptors.workerRouteGet.prepare({ routeId: other }), /scope/);
  assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared.arguments) && Object.isFrozen(prepared.request) && Object.isFrozen(prepared.resource));
  assert.throws(() => workerRouteMetadataDescriptors({ ...scope(), routes: [scope().routes[0], scope().routes[0]] }), /schema/);
  assert.throws(() => workerRouteMetadataDescriptors({ ...scope(), routes: Array(101).fill(scope().routes[0]) }), /cap/);
});

test("Cloudflare route list projects authorized configured routes only and never claims complete effective routing", () => {
  const { workerRoutesList } = workerRouteMetadataDescriptors(scope());
  const result = workerRoutesList.project(success([{ id: other, pattern: credentialCanary, script: "foreign-worker" }, { ...row, token: credentialCanary, settings: { password: derivedCanary } }]), workerRoutesList.prepare({}));
  assert.deepEqual(result, { items: [projected], complete: false, ...observed });
  assert.ok(!JSON.stringify(result).includes(credentialCanary));
  assert.ok(!JSON.stringify(result).includes(derivedCanary));
  assert.deepEqual(workerRoutesList.project(success([]), workerRoutesList.prepare({})), { items: [], complete: false, ...observed });
  assert.throws(() => workerRoutesList.project(success([row, row]), workerRoutesList.prepare({})), /upstream/);
  for (const pattern of ["example.com/*", "*.example.com/*", "http://example.com/path/*", "example.com"]) {
    assert.equal(workerRoutesList.project(success([{ ...row, pattern }]), workerRoutesList.prepare({})).items[0].pattern, pattern);
  }
});

test("Cloudflare route projections refuse changed script bindings, foreign context, invalid patterns and bounds", () => {
  const descriptors = workerRouteMetadataDescriptors(scope());
  for (const descriptor of Object.values(descriptors)) {
    const input = descriptor.prepare(descriptor === descriptors.workerRoutesList ? {} : { routeId: route });
    const project = value => descriptor.project(success(descriptor === descriptors.workerRoutesList ? [value] : value), input);
    for (const patch of [{ script: "foreign-worker" }, { script: null }, { script: undefined }, { account_id: other }, { zone_id: other },
      ...[null, "", "example.com/\ncredential", "https://user:password@example.com/*", "example.com/?key=value", "x".repeat(1025)].map(pattern => ({ pattern }))]) assert.throws(() => project({ ...row, ...patch }));
    for (const raw of ["{", JSON.stringify({ success: false, errors: [], result: row }), JSON.stringify({ success: true, errors: [{}], result: row }), "x".repeat(131073)]) assert.throws(() => descriptor.project(raw, input));
  }
  const { workerRouteGet, workerRoutesList } = descriptors;
  assert.throws(() => workerRouteGet.project(success({ ...row, id: other }), workerRouteGet.prepare({ routeId: route })), /scope/);
  assert.throws(() => workerRoutesList.project(success(Array(101).fill(row)), workerRoutesList.prepare({})), /cap/);
  const routes = Array.from({ length: 40 }, (_, i) => ({ routeId: i.toString(16).padStart(32, "0"), scriptName: "safe-worker" }));
  const large = workerRouteMetadataDescriptors({ ...scope(), routes }).workerRoutesList;
  assert.throws(() => large.project(success(routes.map(({ routeId }) => ({ ...row, id: routeId, pattern: `example.com/${"a".repeat(900)}` }))), large.prepare({})), /cap/);
});

test("Cloudflare routes default empty, omit zone-less bindings and refuse scope overrides before credentials", async () => {
  const empty = workerRouteMetadataDescriptors({ ...scope(), routes: [] });
  assert.throws(() => empty.workerRoutesList.prepare({}), /scope/);
  assert.throws(() => empty.workerRouteGet.prepare({ routeId: route }), /scope/);
  const noZone = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [] },
    { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] });
  assert.ok(!noZone.some(op => op.name.startsWith("cloudflare.workers.routes.")));
  for (const name of [list, detail]) {
    const denied = fixture(name, undefined, []);
    assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(denied.calls.secret, 0);
    assert.equal(denied.requests.length, 0);
    for (const patch of [{ routeId: other }, { accountId: other }, { zoneId: other }, { scriptName: "safe-worker" }, { page: 1 }, { url: "https://example.com" }, { agentId: "forged" }, { approval: true }]) {
      const f = fixture(name);
      assert.equal((await f.invoke({ ...argumentsFor(name), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
});

test("Cloudflare routes execute through reviewed core with exact paths, safe projection, audit and replay refusal", async () => {
  for (const name of [list, detail]) {
    const f = fixture(name);
    const result = await f.invoke();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, name === list ? { items: [projected], complete: false, ...observed } : { ...projected, ...observed });
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/workers/routes${name === detail ? `/${route}` : ""}`);
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

test("Cloudflare route policy and trusted relationship denial precede credentials; lease-time revocation precedes request", async () => {
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

test("Cloudflare routes sanitize changed association refusal and do not retry uncertain outcomes", async () => {
  for (const name of [list, detail]) {
    const changed = { ...row, script: "foreign-worker" };
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
