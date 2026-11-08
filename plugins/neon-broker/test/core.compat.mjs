import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { allCases as cases, catalogCases, catalogFixture, catalogScopeAt, capabilityCases, capabilityFixture,
  capabilityScope, library, snapshot, schedule, branchFeatureCases, branchFeatureFixture, branchFeatureScope,
  authStatusCases, authStatusFixture, authStatusScope, fixture, scope, branch, operation, response } from './helpers.mjs';

// CI supplies an isolated, commit-pinned candidate checkout. No runtime/network
// fallback and no embedded replacement for the common authority/policy executor.
assert(process.env.PROVIDER_CORE_ROOT, 'PROVIDER_CORE_ROOT must name the pinned candidate checkout');
const root = resolve(process.env.PROVIDER_CORE_ROOT);
const { providerFixture, credentialCanary, derivedCanary } = await import(pathToFileURL(resolve(root, 'packages/core/testing/provider-fixture.mjs')));
const { validateOperationMap } = await import(pathToFileURL(resolve(root, 'dist/packages/core/src/provider/index.js')));

function brokerFixture(name, args, raw, overrides = {}, config) {
  const factory = authStatusCases.some(([operation]) => operation === name) ? authStatusFixture :
    branchFeatureCases.some(([operation]) => operation === name) ? branchFeatureFixture :
    capabilityCases.some(([operation]) => operation === name) ? capabilityFixture :
    catalogCases.some(([operation]) => operation === name) ? catalogFixture : fixture;
  const provider = factory(raw, config);
  const operation = provider.operation(name);
  const common = providerFixture(overrides);
  common.vector.policy.resources = [operation.prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  return { provider, common, broker: common.broker(), args, tool: `neon.${name}`,
    call(context = 'verified-runtime', key = 'request-a') { return this.broker.call(this.tool, this.args, context, key); } };
}
function safeEnvelope(f, result) {
  const serialized = JSON.stringify([result, f.common.audit, [...f.common.journal]]);
  for (const secret of [credentialCanary, derivedCanary, 'postgres://user:password-canary@example.invalid/db', 'password-canary']) {
    assert(!serialized.includes(secret), `secret in output/audit/journal: ${secret}`);
  }
}

function compareDeclarations(source, local) {
  for (const name of ['Json', 'Tier']) {
    const pattern = new RegExp(`export type ${name} = [^\\n]+`);
    const expected = source.match(pattern)?.[0];
    assert.ok(expected, `${name} not found in pinned contracts.ts`);
    assert.equal(local.match(pattern)?.[0], expected);
  }
  for (const name of ['Resource', 'Prepared', 'ProviderOperation']) {
    const pattern = new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`);
    const expected = source.match(pattern)?.[0];
    assert.ok(expected, `${name} not found in pinned contracts.ts`);
    assert.equal(local.match(pattern)?.[0], expected);
  }
}

test('type-only declarations match the pinned common contract rather than inventing an interface', () => {
  const source = readFileSync(resolve(root, 'packages/core/src/provider/contracts.ts'), 'utf8');
  const local = readFileSync(new URL('../compat/provider-contracts.d.ts', import.meta.url), 'utf8');
  compareDeclarations(source, local);
});

test('declaration comparison refuses absent or unmatched declarations instead of comparing undefined', () => {
  const declarations = [
    'export type Json = string;', 'export type Tier = "read";',
    'export interface Resource {\n}', 'export interface Prepared {\n}', 'export interface ProviderOperation {\n}',
  ];
  const complete = declarations.join('\n');
  compareDeclarations(complete, complete);
  for (const declaration of declarations) {
    const missing = complete.replace(declaration, '');
    assert.throws(() => compareDeclarations(missing, missing), /not found in pinned contracts.ts/);
    assert.throws(() => compareDeclarations(complete, missing));
  }
});

for (const [name, args, raw, expected] of cases) {
  test(`${name}: real common prepare/execute/project flow and trusted runtime identity`, async () => {
    const f = brokerFixture(name, args, raw);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, 1);
    assert.equal(f.common.calls.secret, 1);
    assert.equal(f.common.calls.close, 1);
    assert.equal(f.common.audit.filter(record => record.phase === 'intent').length, 1);
    safeEnvelope(f, result);
  });

  test(`${name}: identity claims, cross-agent and missing resource policy refuse before credential/network`, async () => {
    for (const scenario of ['untrusted-runtime', 'cross-agent', 'cross-resource']) {
      const f = brokerFixture(name, args, raw);
      let context = 'verified-runtime';
      if (scenario === 'untrusted-runtime') context = { ...f.common.vector.principal, authenticated: true };
      if (scenario === 'cross-agent') f.common.vector.policy.agents = ['agent-other'];
      if (scenario === 'cross-resource') f.common.vector.policy.resources = ['neon/projects/project-other'];
      const result = await f.call(context);
      assert.equal(result.ok, false);
      assert.equal(result.code, scenario === 'untrusted-runtime' ? 'IDENTITY_UNAVAILABLE' : 'POLICY_DENIED');
      assert.equal(f.common.calls.secret, 0);
      assert.equal(f.provider.requests.length, 0);
      safeEnvelope(f, result);
    }
  });

  test(`${name}: caller identity extras and wrong project cannot bind a request`, async () => {
    for (const changed of [{ ...args, agent: 'agent-a' }, { ...args, approved: true }, { ...args, project_id: 'project-other' }]) {
      const f = brokerFixture(name, args, raw);
      f.args = changed;
      const result = await f.call();
      assert.equal(result.code, 'INVALID_ARGUMENTS');
      assert.equal(f.common.calls.secret, 0);
      assert.equal(f.provider.requests.length, 0);
    }
  });

  test(`${name}: credentials, passwords and connection strings never escape success/error/audit`, async () => {
    for (const mode of ['success', 'error']) {
      const poisoned = structuredClone(raw);
      for (const value of Object.values(poisoned).flat()) Object.assign(value, {
        password: 'password-canary', connection_uri: 'postgres://user:password-canary@example.invalid/db',
        ...(!Object.hasOwn(value, 'name') ? { name: credentialCanary } : {}), credentials: derivedCanary,
      });
      const f = brokerFixture(name, args, mode === 'success' ? poisoned : () => response({
        message: credentialCanary, password: 'password-canary', connection_uri: 'postgres://user:password-canary@example.invalid/db',
      }, { status: 500 }));
      const result = await f.call();
      assert.equal(result.ok, mode === 'success');
      if (mode === 'error') assert.equal(result.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(f.provider.requests.length, 1);
      safeEnvelope(f, result);
    }
  });
}

test('project-only policy cannot authorize collection reads or child endpoints', async () => {
  for (const index of [1, 2, 3, 4]) {
    const [name, args, raw] = cases[index];
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = ['neon/projects/project-a'];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.provider.requests.length, 0);
  }
});

test('branch/endpoint resource binding and revocation are revalidated after credential resolution', async () => {
  for (const mode of ['resource', 'policy-revoked', 'policy-revision']) {
    const [name, args, raw] = cases[4];
    const f = brokerFixture(name, args, raw);
    const original = f.common.dependencies.credentials.resolve;
    f.common.dependencies.credentials.resolve = async (...parameters) => {
      const lease = await original(...parameters);
      if (mode === 'resource') f.common.dependencies.host.revalidate = async () => false;
      else if (mode === 'policy-revoked') f.common.vector.policy.agents = [];
      else f.common.vector.policy.revision = 'policy-v2';
      return lease;
    };
    // Broker snapshots operation descriptors, not the implementations of trusted
    // host/policy adapters. Recreate to make the changed resolver explicit.
    f.broker = f.common.broker();
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(result.code, mode === 'resource' ? 'RESOURCE_CHANGED' :
      mode === 'policy-revoked' ? 'POLICY_DENIED' : 'POLICY_CHANGED');
    assert.equal(f.provider.requests.length, 0);
    assert.equal(f.common.calls.close, 1);
  }
});

test('audit outage refuses before credentials/network; request replay never retries', async () => {
  const [name, args, raw] = cases[0];
  const unavailable = brokerFixture(name, args, raw, { audit: { async append() { throw Error(credentialCanary); } } });
  assert.equal((await unavailable.call()).code, 'AUDIT_UNAVAILABLE');
  assert.equal(unavailable.provider.requests.length, 0);
  assert.equal(unavailable.common.calls.secret, 0);
  const f = brokerFixture(name, args, raw);
  assert.equal((await f.call()).ok, true);
  assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
  assert.equal(f.provider.requests.length, 1);
});

test('no start/restart/resume/suspend, secret, SQL or connection lookup fallback exists', async () => {
  const [name, args, raw] = cases[0];
  const f = brokerFixture(name, args, raw);
  for (const tool of ['neon.startProjectEndpoint', 'neon.restartProjectEndpoint', 'neon.resume',
    'neon.suspendProjectEndpoint', 'neon.sql', 'neon.getConnectionURI', 'neon.getProjectBranchRolePassword']) {
    assert.equal((await f.broker.call(tool, args, 'verified-runtime', tool)).code, 'UNKNOWN_TOOL');
  }
  assert.equal(f.common.calls.secret, 0);
  assert.equal(f.provider.requests.length, 0);
});

test('reflected lease material in selected safe-looking fields is refused by the common core', async () => {
  const f = brokerFixture('getProjectBranch', cases[2][1], { branch }, {
    credentials: { async resolve() { return { value: 'ready', redactions: [], async close() {} }; } },
  });
  assert.equal((await f.call()).code, 'OUTPUT_REFUSED');
});

for (const [name, args, raw] of [...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases]) {
  test(`${name}: replay and TOCTOU policy/resource changes refuse without a second request`, async () => {
    const replay = brokerFixture(name, args, raw);
    assert.equal((await replay.call()).ok, true);
    assert.equal((await replay.call()).code, 'REPLAY_CONFLICT');
    assert.equal(replay.provider.requests.length, 1);
    for (const mode of ['resource', 'policy-revoked', 'policy-revision']) {
      const f = brokerFixture(name, args, raw);
      const resolve = f.common.dependencies.credentials.resolve;
      f.common.dependencies.credentials.resolve = async (...parameters) => {
        const lease = await resolve(...parameters);
        if (mode === 'resource') f.common.dependencies.host.revalidate = async () => false;
        else if (mode === 'policy-revoked') f.common.vector.policy.agents = [];
        else f.common.vector.policy.revision = 'policy-v2';
        return lease;
      };
      f.broker = f.common.broker();
      const result = await f.call();
      assert.equal(result.code, mode === 'resource' ? 'RESOURCE_CHANGED' : mode === 'policy-revoked' ? 'POLICY_DENIED' : 'POLICY_CHANGED');
      assert.equal(f.provider.requests.length, 0);
      assert.equal(f.common.calls.close, 1);
      safeEnvelope(f, result);
    }
  });

  test(`${name}: project, branch and sibling grants do not imply catalog or count authority`, async () => {
    for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
      'neon/projects/project-a/branches', 'neon/projects/project-a/branches/br-a/roles/other']) {
      const f = brokerFixture(name, args, raw);
      f.common.vector.policy.resources = [resource];
      assert.equal((await f.call()).code, 'POLICY_DENIED');
      assert.equal(f.common.calls.secret, 0);
      assert.equal(f.provider.requests.length, 0);
    }
  });
}

test('maximum supported catalog scope and paginated operation output fit real common-core budgets', async () => {
  const config = catalogScopeAt(16);
  const operations = config.operations.map(binding => ({ ...operation, id: binding.id, branch_id: binding.branchId, endpoint_id: binding.endpointId }));
  const f = brokerFixture('listProjectOperations', { project_id: 'project-a' }, (url, init, n) => response(n === 1 ?
    { operations: operations.slice(0, 10), pagination: { cursor: 'page-2' } } : { operations: operations.slice(10) }), {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { operations });
  assert.equal(f.provider.requests.length, 2);
  safeEnvelope(f, result);
});

test('maximum capability selections and projected metadata fit real common-core budgets', async () => {
  const indices = Array.from({ length: 30 }, (_, index) => index);
  const config = { ...capabilityScope, branchIds: indices.map(n => `br-${n}`),
    snapshots: indices.map(n => ({ id: `snap-${n}`, branchId: `br-${n}` })) };
  const snapshots = config.snapshots.map(binding => ({ ...snapshot, id: binding.id, source_branch_id: binding.branchId }));
  const values = [
    ['listSnapshots', { snapshots }],
    ['getAvailablePreloadLibraries', { libraries: indices.map(n => ({ ...library, library_name: `library_${n}` })) }],
    ['getSnapshotSchedule', { schedule: indices.map(() => ({ ...schedule })) }],
  ];
  for (const [name, raw] of values) {
    const args = name === 'getSnapshotSchedule' ? { project_id: 'project-a', branch_id: 'br-0' } : { project_id: 'project-a' };
    const f = brokerFixture(name, args, raw, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, raw);
    safeEnvelope(f, result);
  }
});

test('anonymization diagnostics and snapshot labels do not escape through the common broker', async () => {
  for (const [name, args, raw, expected] of capabilityCases) {
    const poisoned = { ...structuredClone(raw), status_message: credentialCanary, last_run: { triggered_by: derivedCanary } };
    for (const value of Object.values(poisoned).filter(Array.isArray).flat()) Object.assign(value, {
      name: credentialCanary, description: derivedCanary, password: 'password-canary',
    });
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
  }
});

test('branch feature status drops data-plane locations, origins and secrets through the common broker', async () => {
  for (const [name, args, raw, expected] of branchFeatureCases) {
    const poisoned = { ...raw, password: 'password-canary', secret: credentialCanary, base_url: derivedCanary,
      s3_endpoint: credentialCanary, invocation_url: derivedCanary, allowed_origins: [credentialCanary],
      region: credentialCanary, reason: derivedCanary, message: credentialCanary };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const unavailable = brokerFixture(name, args, () => response(poisoned, { status: 404 }));
    const refused = await unavailable.call();
    assert.equal(refused.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(unavailable.provider.requests.length, 1);
    safeEnvelope(unavailable, refused);
  }
});

test('maximum branch feature scope fits common configuration limits and scopes do not cross-authorize', async () => {
  const config = { ...branchFeatureScope, branchIds: Array.from({ length: 30 }, (_, n) => `br-${n}`) };
  for (const [name, , raw, expected] of branchFeatureCases) {
    const args = { project_id: 'project-a', branch_id: 'br-29' };
    const f = brokerFixture(name, args, raw, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    for (const resource of ['neon/projects/project-a/branches/br-0/realtime',
      ...['realtime', 'storage', 'ai_gateway'].map(suffix => `neon/projects/project-a/branches/br-29/${suffix}`)
        .filter(resource => resource !== f.provider.operation(name).prepare(args).resource.id)]) {
      const other = brokerFixture(name, args, raw, {}, config);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
  }
});

test('auth status omits OAuth locations and nested credentials through the common broker', async () => {
  for (const [name, args, raw, expected] of authStatusCases) {
    const poisoned = { ...raw, client_secret: credentialCanary, password: 'password-canary', login_page: derivedCanary,
      consent_page: credentialCanary, mcp: { resource: derivedCanary }, resources: [{ identifier: credentialCanary }],
      email_provider: { host: derivedCanary, username: credentialCanary, password: 'password-canary' }, message: credentialCanary };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const unavailable = brokerFixture(name, args, () => response(poisoned, { status: 404 }));
    const refused = await unavailable.call();
    assert.equal(refused.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(unavailable.provider.requests.length, 1);
    safeEnvelope(unavailable, refused);
  }
});

test('maximum auth status scope fits common budgets and no sibling status resource cross-authorizes', async () => {
  const config = { ...authStatusScope, branchIds: Array.from({ length: 30 }, (_, n) => `br-${n}`) };
  const args = { project_id: 'project-a', branch_id: 'br-29' };
  const resources = authStatusCases.map(([name, , raw]) => brokerFixture(name, args, raw, {}, config).provider.operation(name).prepare(args).resource.id);
  for (const [name, , raw, expected] of authStatusCases) {
    const f = brokerFixture(name, args, raw, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    for (const resource of ['neon/projects/project-a/branches/br-29/auth',
      'neon/projects/project-a/branches/br-0/auth/allow_localhost', ...resources.filter(id => id !== f.provider.operation(name).prepare(args).resource.id)]) {
      const other = brokerFixture(name, args, raw, {}, config);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
  }
});

test('common operation-map validator confirms incomplete status for all unknown entitlements', () => {
  const map = JSON.parse(readFileSync(new URL('../operation-map.json', import.meta.url)));
  const result = validateOperationMap(map);
  assert.equal(result.complete, false);
  assert.equal(result.incomplete.length, 194);
  assert.equal(map.operations.filter(operation => operation.implemented).length, 23);
  assert.equal(map.operations.filter(operation => operation.enabled).length, 0);
});
