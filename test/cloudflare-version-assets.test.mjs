import assert from "node:assert/strict";
import test from "node:test";
import { versionAssetDescriptor } from "../dist/plugins/cloudflare-broker/src/version-assets.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const scriptName = "safe-worker";
const versionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const args = { scriptName, versionId };
const workers = () => [{ scriptName, versionIds: [versionId] }];
const scope = () => ({ accountId: account, revision: "resource-1", workers: workers() });
const success = result => JSON.stringify({ success: true, errors: [], result });
const row = (value = true) => ({ id: versionId, assets: { config: { run_worker_first: value,
  _headers: "never-return-private", _redirects: "never-return-private" }, jwt: "never-return-private" },
  modules: [{ content: "never-return-private" }], bindings: [{ text: "never-return-private" }],
  author_email: "never-return-private", package_dependencies: [{ name: "never-return-private" }] });
const expected = (workerFirst = { status: "configured", value: true }) => ({ id: versionId,
  subject: "version-configured-worker-first", workerFirst, activeDeployment: "not-established",
  effectiveRouting: "not-established", effectiveProtection: "not-established" });
function project(result, selected = scope()) {
  const d = versionAssetDescriptor(selected);
  return d.project(success(result), d.prepare(args));
}

test("Cloudflare version assets use full Worker-version schema without source include or effective-state claims", () => {
  const d = versionAssetDescriptor(scope());
  const prepared = d.prepare(args);
  assert.equal(d.providerOperationId, "getWorkerVersion");
  assert.equal(prepared.request.path, `/accounts/${account}/workers/workers/${scriptName}/versions/${versionId}`);
  assert.equal(prepared.resource.id, `cloudflare:account:${account}:worker:${scriptName}:asset-version:${versionId}`);
  assert.equal(prepared.request.maxResponseBytes, 131072);
  assert.deepEqual(project(row()), expected());
  assert.deepEqual(project(row(false)), expected({ status: "configured", value: false }));
  assert.ok(!JSON.stringify(project(row())).includes("never-return-private"));
  const output = project(row(["/api/*", "!/api/assets/*"]));
  assert.deepEqual(output, expected({ status: "configured", value: ["/api/*", "!/api/assets/*"] }));
  for (const value of [output, output.workerFirst, output.workerFirst.value]) assert.ok(Object.isFrozen(value));
});

test("Cloudflare version assets preserve rule order and report omitted fields unavailable without schema defaults", () => {
  const rules = ["!/api/assets/*", "/api/*", "/oauth/callback"];
  assert.deepEqual(project(row(rules)).workerFirst.value, rules);
  for (const assets of [undefined, {}, { config: {} }, { config: { serve_directly: false } }]) {
    assert.deepEqual(project({ id: versionId, assets, resources: { assets: { config: { run_worker_first: true } } } }),
      expected({ status: "unavailable", reason: "not-returned" }));
  }
});

test("Cloudflare version assets require separate copied exact worker-version scope and closed selectors", () => {
  const mutable = scope();
  const d = versionAssetDescriptor(mutable);
  mutable.workers[0].versionIds.length = 0;
  mutable.workers[0].scriptName = "foreign-worker";
  assert.deepEqual(d.project(success(row()), d.prepare(args)), expected());
  for (const selected of [undefined, [], [{ scriptName, versionIds: [] }], [{ scriptName: "foreign-worker", versionIds: [versionId] }]]) {
    assert.throws(() => versionAssetDescriptor({ ...scope(), workers: selected }).prepare(args), /scope/);
  }
  for (const version of ["latest", versionId.slice(0, 8), versionId.toUpperCase(), "../version", `${versionId}?include=modules`]) {
    assert.throws(() => d.prepare({ ...args, versionId: version }), /schema/);
  }
  for (const key of ["include", "accountId", "workerId", "url", "headers", "approval", "agentId", "workerAssetVersions"]) {
    assert.throws(() => d.prepare({ ...args, [key]: "modules" }), /schema/);
  }
  for (const selected of [{}, [null], [...workers(), ...workers()], [{ scriptName, versionIds: [versionId, versionId] }], Array(101).fill(workers()[0])]) {
    assert.throws(() => versionAssetDescriptor({ ...scope(), workers: selected }));
  }
  assert.throws(() => d.project(success(row()), versionAssetDescriptor(scope()).prepare(args)), /scope/);
});

test("Cloudflare version assets refuse foreign identity, malformed envelopes, nesting and unsupported rules", () => {
  for (const foreign of [{ id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" }, { account_id: "b".repeat(32) }, { script_name: "foreign-worker" }]) {
    assert.throws(() => project({ ...row(), ...foreign }), /scope/);
  }
  for (const value of [null, [], 5, "never-return-private"]) {
    for (const assets of [value, { config: value }]) assert.throws(() => project({ id: versionId, assets }), /upstream/);
  }
  for (const value of [null, "true", 1, [], ["!/private/*"], ["/api/*", "/api/*"], ["/api?token=x"],
    ["/a/../b"], ["/a//b"], ["/path\n"], ["https://example.test/*"], ["/foo#bar"], ["/a\\b"],
    ["/" + "a".repeat(256)], Array.from({ length: 33 }, (_, i) => `/${i}`), ["/api/*", 1]]) {
    assert.throws(() => project(row(value)), /upstream/);
  }
  const d = versionAssetDescriptor(scope());
  const prepared = d.prepare(args);
  for (const raw of ["null", "not-json", success([]), JSON.stringify({ success: false, errors: [], result: row() })]) {
    assert.throws(() => d.project(raw, prepared), /upstream/);
  }
  assert.throws(() => d.project(success({ ...row(), modules: "s".repeat(131072) }), prepared), /cap/);
});

const packageVersions = () => [{ scriptName, versionId, packageNames: ["example", "@example/library"] }];
const packageRow = () => ({ ...row(), package_dependencies: [
  { name: "example", installedVersion: "4.17.22", packageJsonVersion: "never-return-private" },
  { name: "never-return-private", installedVersion: "never-return-private" },
  { name: "@example/library", installedVersion: "1.2.3-beta.1+build", packageJsonVersion: "^1.0.0" },
] });
const expectedPackages = () => ({ subject: "provider-reported-installed-packages", status: "provider-reported",
  items: [{ name: "@example/library", installedVersion: "1.2.3-beta.1+build" }, { name: "example", installedVersion: "4.17.22" }],
  complete: false, embeddedBytes: "not-established" });
const packageScope = () => ({ ...scope(), packageVersions: packageVersions() });

test("Cloudflare package dependency projection selects exact allowed names and provider installedVersion only", () => {
  const output = project(packageRow(), packageScope());
  assert.deepEqual(output, { ...expected(), packageDependencies: expectedPackages() });
  assert.ok(!JSON.stringify(output).includes("never-return-private"));
  for (const value of [output.packageDependencies, output.packageDependencies.items, ...output.packageDependencies.items]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(project(packageRow()), expected());
  assert.deepEqual(project({ ...row(), package_dependencies: undefined }, packageScope()).packageDependencies,
    { subject: "provider-reported-installed-packages", status: "unavailable", reason: "not-returned", items: [], complete: false, embeddedBytes: "not-established" });
});

test("Cloudflare package scopes are copied, version-bound, default empty and never model-controlled", () => {
  const selected = packageScope();
  const d = versionAssetDescriptor(selected);
  selected.packageVersions[0].packageNames.length = 0;
  assert.deepEqual(d.project(success(packageRow()), d.prepare(args)).packageDependencies, expectedPackages());
  const otherVersion = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
  assert.equal(project(packageRow(), { ...scope(), workers: [{ scriptName, versionIds: [versionId, otherVersion] }],
    packageVersions: [{ scriptName, versionId: otherVersion, packageNames: ["example"] }] }).packageDependencies, undefined);
  for (const packageVersions of [null, {}, [null], [...packageScope().packageVersions, ...packageScope().packageVersions],
    [{ scriptName: "foreign-worker", versionId, packageNames: ["example"] }],
    [{ scriptName, versionId: otherVersion, packageNames: ["example"] }],
    [{ scriptName, versionId, packageNames: [] }], [{ scriptName, versionId, packageNames: ["example", "example"] }],
    [{ scriptName, versionId, packageNames: ["https://example.test/pkg"] }],
    [{ scriptName, versionId, packageNames: Array(101).fill("example") }]]) {
    if (packageVersions === null) continue; // nullish configuration is default-empty, not a grant.
    assert.throws(() => versionAssetDescriptor({ ...scope(), packageVersions }));
  }
  assert.equal(project(packageRow(), { ...scope(), packageVersions: null }).packageDependencies, undefined);
  assert.throws(() => d.prepare({ ...args, packageNames: ["never-return-private"] }), /schema/);
});

test("Cloudflare selected package metadata refuses malformed, ambiguous, missing and oversized installed versions", () => {
  for (const package_dependencies of [null, {}, [], [{ name: "example", installedVersion: "4.17.22" }],
    [...packageRow().package_dependencies, packageRow().package_dependencies[0]],
    Array(1001).fill({ name: "example", installedVersion: "1.2.3" })]) {
    assert.throws(() => project({ ...row(), package_dependencies }, packageScope()), /upstream/);
  }
  for (const installedVersion of [null, "", "^1.2.3", "latest", "git+https://secret.test", "1.2.3\n", "1.2.3/secret", "1." + "2".repeat(128) + ".3"]) {
    const result = packageRow();
    result.package_dependencies[0].installedVersion = installedVersion;
    assert.throws(() => project(result, packageScope()), /upstream/);
  }
  for (const foreign of [{ id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" }, { account_id: "b".repeat(32) }, { script_name: "foreign-worker" }]) {
    assert.throws(() => project({ ...packageRow(), ...foreign }, packageScope()), /scope/);
  }
});

// Actual reviewed core, synthetic process-local authority/host/audit/journal only.
function fixture(change = () => {}, result = row(), packageVersions = []) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [scriptName],
    hyperdriveIds: [], workerVersions: workers(), workerControlScriptNames: [scriptName], workerAssetVersions: workers(),
    workerPackageVersions: packageVersions },
  { accountId: account, revision: "resource-1", sourceDigestScriptNames: [] }, async (url, init) => {
    requests.push({ url, init });
    return new Response(success(result), { headers: { "content-type": "application/json" } });
  });
  const name = "cloudflare.workers.version_assets.get";
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operations.find(op => op.name === name).prepare(args).resource.id] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  change(f);
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, invoke: (raw = args, key = "version-assets-call") => broker.call(name, raw, "verified-runtime", key) };
}
test("Cloudflare installed-package projection traverses core without source fetch and retains replay and redaction", async () => {
  const f = fixture(() => {}, packageRow(), packageVersions());
  const result = await f.invoke();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.packageDependencies, expectedPackages());
  assert.equal(f.requests.length, 1);
  assert.ok(!f.requests[0].url.includes("include="));
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(item => item.phase), ["intent", "outcome"]);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  safe(f, result);
});

test("Cloudflare installed-package projection preserves current-policy, audit, journal and malformed-output refusals", async () => {
  for (const failure of ["agent", "resource", "binding", "revoked", "audit", "journal", "projection", "model"]) {
    const f = fixture(f => {
      if (failure === "agent") f.vector.policy.agents = ["other-agent"];
      if (failure === "resource") f.vector.policy.resources = [];
      if (failure === "binding") f.dependencies.host.revalidate = async () => false;
      if (failure === "audit") f.dependencies.audit.append = async () => { throw new Error("never-return-private"); };
      if (failure === "journal") f.dependencies.journal.claim = async () => { throw new Error("never-return-private"); };
      if (failure === "revoked") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "policy-2"; return lease; };
      }
    }, failure === "projection" ? { ...row(), package_dependencies: [] } : packageRow(), packageVersions());
    const result = await f.invoke(failure === "model" ? { ...args, workerPackageVersions: packageVersions() } : args);
    assert.equal(result.ok, false);
    assert.equal(f.requests.length, failure === "projection" ? 1 : 0);
    if (["projection", "revoked"].includes(failure)) assert.equal(f.calls.close, 1);
    safe(f, result);
  }
});

function safe(f, result) {
  for (const canary of [credentialCanary, derivedCanary, "never-return-private"]) {
    assert.ok(!JSON.stringify({ result, audit: f.audit, journal: [...f.journal] }).includes(canary));
  }
}

test("Cloudflare version assets traverse reviewed core with exact GET, safe output, cleanup and replay refusal", async () => {
  const f = fixture();
  const result = await f.invoke();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected());
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/workers/${scriptName}/versions/${versionId}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(item => item.phase), ["intent", "outcome"]);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  safe(f, result);
});

test("Cloudflare version assets deny agent, resource, binding drift, empty scope and lease-time revocation before GET", async () => {
  for (const failure of ["agent", "resource", "binding", "scope", "revoked"]) {
    const f = fixture(f => {
      if (failure === "agent") f.vector.policy.agents = ["other-agent"];
      if (failure === "resource") f.vector.policy.resources = [];
      if (failure === "binding") f.dependencies.host.revalidate = async () => false;
      if (failure === "scope") f.dependencies.operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [scriptName], hyperdriveIds: [], workerVersions: workers(), workerControlScriptNames: [scriptName] }, { accountId: account, revision: "resource-1" });
      if (failure === "revoked") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => {
          const lease = await resolve(target);
          f.vector.policy.revision = "policy-2";
          return lease;
        };
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

test("Cloudflare version assets retain audit and journal gates and sanitize projection failures", async () => {
  for (const failure of ["audit", "journal", "projection", "model"]) {
    const f = fixture(f => {
      if (failure === "audit") f.dependencies.audit.append = async () => { throw new Error("never-return-private"); };
      if (failure === "journal") f.dependencies.journal.claim = async () => { throw new Error("never-return-private"); };
    }, failure === "projection" ? row(["!/only-negative"]) : row());
    const result = await f.invoke(failure === "model" ? { ...args, include: "modules" } : args);
    assert.equal(result.ok, false);
    assert.equal(f.requests.length, failure === "projection" ? 1 : 0);
    if (failure === "projection") assert.equal(f.calls.close, 1);
    safe(f, result);
  }
});
