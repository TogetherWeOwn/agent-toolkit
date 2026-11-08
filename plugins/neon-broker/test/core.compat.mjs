import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { allCases as cases, cases as metadataCases, catalogCases, catalogFixture, catalogScopeAt, capabilityCases, capabilityFixture,
  capabilityScope, library, snapshot, schedule, branchFeatureCases, branchFeatureFixture, branchFeatureScope,
  authStatusCases, authStatusFixture, authStatusScope, authDomainCases, authDomainFixture, authDomainScope,
  authIntegrationCases, authIntegrationFixture, authIntegrationScope,
  functionCases, functionFixture, functionScope, neonFunction,
  triggerCases, triggerFixture, triggerScope, neonTrigger,
  authClientCases, authClientFixture, authClientScope, authClient,
  branchResourceCases, branchResourceFixture, branchResourceScope, bucket, customDomain,
  projectSecurityCases, projectSecurityFixture, projectSecurityScope, jwks, vpcEndpoint,
  projectAccessCases, projectAccessFixture, projectAccessScope, projectPermission, projectMember,
  organizationVPCCases, organizationVPCFixture, organizationVPCScope, organizationVPCEndpoint,
  fixture, scope, branch, operation, response } from './helpers.mjs';

// CI supplies an isolated, commit-pinned candidate checkout. No runtime/network
// fallback and no embedded replacement for the common authority/policy executor.
assert(process.env.PROVIDER_CORE_ROOT, 'PROVIDER_CORE_ROOT must name the pinned candidate checkout');
const root = resolve(process.env.PROVIDER_CORE_ROOT);
const { providerFixture, credentialCanary, derivedCanary } = await import(pathToFileURL(resolve(root, 'packages/core/testing/provider-fixture.mjs')));
const { validateOperationMap } = await import(pathToFileURL(resolve(root, 'dist/packages/core/src/provider/index.js')));

function brokerFixture(name, args, raw, overrides = {}, config) {
  const factory = organizationVPCCases.some(([operation]) => operation === name) ? organizationVPCFixture :
    projectAccessCases.some(([operation]) => operation === name) ? projectAccessFixture :
    projectSecurityCases.some(([operation]) => operation === name) ? projectSecurityFixture :
    branchResourceCases.some(([operation]) => operation === name) ? branchResourceFixture :
    authClientCases.some(([operation]) => operation === name) ? authClientFixture :
    triggerCases.some(([operation]) => operation === name) ? triggerFixture :
    functionCases.some(([operation]) => operation === name) ? functionFixture :
    authIntegrationCases.some(([operation]) => operation === name) ? authIntegrationFixture :
    authDomainCases.some(([operation]) => operation === name) ? authDomainFixture :
    authStatusCases.some(([operation]) => operation === name) ? authStatusFixture :
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
    const [name, args, raw] = metadataCases[index];
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = ['neon/projects/project-a'];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.provider.requests.length, 0);
  }
});

test('branch/endpoint resource binding and revocation are revalidated after credential resolution', async () => {
  for (const mode of ['resource', 'policy-revoked', 'policy-revision']) {
    const [name, args, raw] = metadataCases[4];
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
  const [name, args, raw] = metadataCases[0];
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
  const [name, args, raw] = metadataCases[0];
  const f = brokerFixture(name, args, raw);
  for (const tool of ['neon.startProjectEndpoint', 'neon.restartProjectEndpoint', 'neon.resume',
    'neon.suspendProjectEndpoint', 'neon.sql', 'neon.getConnectionURI', 'neon.getProjectBranchRolePassword']) {
    assert.equal((await f.broker.call(tool, args, 'verified-runtime', tool)).code, 'UNKNOWN_TOOL');
  }
  assert.equal(f.common.calls.secret, 0);
  assert.equal(f.provider.requests.length, 0);
});

test('reflected lease material in selected safe-looking fields is refused by the common core', async () => {
  const f = brokerFixture('getProjectBranch', metadataCases[2][1], { branch }, {
    credentials: { async resolve() { return { value: 'ready', redactions: [], async close() {} }; } },
  });
  assert.equal((await f.call()).code, 'OUTPUT_REFUSED');
});

for (const [name, args, raw] of [...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases, ...authDomainCases, ...authIntegrationCases, ...functionCases, ...triggerCases, ...authClientCases, ...branchResourceCases, ...projectSecurityCases, ...projectAccessCases, ...organizationVPCCases]) {
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

test('maximum auth-domain lists fit common budgets and legacy/branch grants never cross-authorize', async () => {
  const config = { ...authDomainScope, branchIds: Array.from({ length: 30 }, (_, n) => `br-${n}`) };
  const domains = Array.from({ length: 30 }, (_, n) => ({ domain: `domain-${n}.${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.invalid`, auth_provider: 'better_auth' }));
  for (const [name, original] of authDomainCases) {
    const args = 'branch_id' in original ? { ...original, branch_id: 'br-29' } : original;
    const f = brokerFixture(name, args, { domains }, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { domains });
    safeEnvelope(f, result);
    const ownResource = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/auth', 'neon/projects/project-a/auth/domains',
      'neon/projects/project-a/branches/br-0/auth/domains', 'neon/projects/project-a/branches/br-29/auth/domains'].filter(id => id !== ownResource)) {
      const other = brokerFixture(name, args, { domains }, {}, config);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const reflected = brokerFixture(name, args, { domains: [{ domain: credentialCanary, auth_provider: 'better_auth' }] }, {}, config);
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
    const unavailable = brokerFixture(name, args, () => response({ message: credentialCanary }, { status: 410 }), {}, config);
    assert.equal((await unavailable.call()).code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(unavailable.provider.requests.length, 1);
  }
});

test('auth integrations redact database/provider identities and URLs through the common broker', async () => {
  for (const [name, args, raw, expected] of authIntegrationCases) {
    const poison = row => ({ ...row, db_name: credentialCanary, auth_provider_project_id: derivedCanary,
      jwks_url: credentialCanary, base_url: derivedCanary, password: 'password-canary', name: credentialCanary });
    const poisoned = name === 'getNeonAuth' ? poison(raw) : { data: raw.data.map(poison) };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    for (const status of [404, 410]) {
      const unavailable = brokerFixture(name, args, () => response({ message: credentialCanary }, { status }));
      const refused = await unavailable.call();
      assert.equal(refused.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(unavailable.provider.requests.length, 1);
      safeEnvelope(unavailable, refused);
    }
    const reflectedArgs = name === 'getNeonAuth' ? { ...args, branch_id: credentialCanary } : args;
    const reflected = brokerFixture(name, reflectedArgs, name === 'getNeonAuth' ? { ...raw, branch_id: credentialCanary } :
      { data: raw.data.map(row => ({ ...row, branch_id: credentialCanary })) }, {},
      { ...authIntegrationScope, branchIds: [credentialCanary] });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum auth-integration scope/output fits common budgets and collection/branch grants remain distinct', async () => {
  const branchIds = Array.from({ length: 30 }, (_, n) => `br-${n}`);
  const config = { ...authIntegrationScope, branchIds };
  const data = branchIds.map(branch_id => ({ branch_id, auth_provider: 'better_auth', owned_by: 'neon', transfer_status: 'finished' }));
  for (const [name, original] of authIntegrationCases) {
    const args = name === 'getNeonAuth' ? { ...original, branch_id: 'br-29' } : original;
    const raw = name === 'getNeonAuth' ? data[29] : { data };
    const f = brokerFixture(name, args, raw, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, raw);
    safeEnvelope(f, result);
    const ownResource = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/auth', 'neon/projects/project-a/auth/integrations',
      'neon/projects/project-a/branches/br-0/auth', 'neon/projects/project-a/branches/br-29/auth'].filter(id => id !== ownResource)) {
      const other = brokerFixture(name, args, raw, {}, config);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
  }
});

test('function deployment diagnostics, locations and environment names never leave the common broker', async () => {
  for (const [name, args, raw, expected] of functionCases) {
    const poison = row => ({ ...row, name: credentialCanary, invocation_url: derivedCanary, created_at: credentialCanary,
      current_deployment: { ...row.current_deployment, environment: [derivedCanary], error: credentialCanary },
      active_deployment: { ...row.active_deployment, environment: [credentialCanary], error: derivedCanary } });
    const f = brokerFixture(name, args, name === 'getProjectBranchFunction' ? { function: poison(raw.function) } : { functions: raw.functions.map(poison) });
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
  }
});

test('maximum function selection/output fits common budgets and collection/detail resources stay separate', async () => {
  const functions = Array.from({ length: 16 }, (_, n) => ({ id: `fn-${n}`, slug: `fn${n}`, branchId: 'br-a' }));
  const config = { ...functionScope, branchIds: Array.from({ length: 16 }, (_, n) => `br-${n}`), functions };
  config.branchIds[0] = 'br-a';
  const values = functions.map(({ id, slug }) => ({ ...neonFunction, id, slug }));
  const f = brokerFixture('listProjectBranchFunctions', functionCases[0][1], (url, init, n) => response(n === 1 ?
    { functions: values.slice(0, 10), pagination: { next: 'page-2' } } : { functions: values.slice(10), pagination: {} }), {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { functions: values });
  assert.equal(f.provider.requests.length, 2);
  safeEnvelope(f, result);
  for (const [name, args, raw] of functionCases) {
    const own = brokerFixture(name, args, raw).provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/branches/br-a/functions', 'neon/projects/project-a/branches/br-a/functions/hello',
      'neon/projects/project-a/branches/br-b/functions'].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const binding = { id: credentialCanary, slug: 'hello', branchId: 'br-a' };
    const value = { ...neonFunction, id: credentialCanary };
    const reflected = brokerFixture(name, args, name === 'getProjectBranchFunction' ? { function: value } : { functions: [value] }, {},
      { ...functionScope, functions: [binding] });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('trigger metadata omits execution configuration and checks reflected lease material', async () => {
  for (const [name, args, raw, expected] of triggerCases) {
    const value = { ...neonTrigger, name: credentialCanary, function_path: derivedCanary,
      schedule: { cron: credentialCanary }, storage_object_created: { bucket_name: derivedCanary, prefix: credentialCanary }, next_run_at: derivedCanary };
    const wrap = value => name === 'getProjectBranchTrigger' ? { trigger: value } : { triggers: [value] };
    const f = brokerFixture(name, args, wrap(value));
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const reflectedArgs = name === 'getProjectBranchTrigger' ? { ...args, trigger_id: credentialCanary } : args;
    const reflected = brokerFixture(name, reflectedArgs, wrap({ ...neonTrigger, trigger_id: credentialCanary }), {},
      { ...triggerScope, triggers: [{ id: credentialCanary, branchId: 'br-a', functionSlug: 'hello' }] });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
    const unavailable = brokerFixture(name, args, () => response({ message: credentialCanary }, { status: 404 }));
    const refused = await unavailable.call();
    assert.equal(refused.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(unavailable.provider.requests.length, 1);
    safeEnvelope(unavailable, refused);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/branches/br-a/triggers', 'neon/projects/project-a/branches/br-a/triggers/tr-a',
      'neon/projects/project-a/branches/br-b/triggers/tr-a', 'neon/projects/project-a/branches/br-a/functions/hello'].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
  }
});

test('maximum trigger scope, safe versions and output fit real common-core budgets', async () => {
  const branchIds = Array.from({ length: 16 }, (_, n) => `br-${n}-${'a'.repeat(73)}`);
  const triggers = Array.from({ length: 16 }, (_, n) => ({ id: `tr-${n}-${'b'.repeat(73)}`, branchId: branchIds[0], functionSlug: 'a'.repeat(20) }));
  const config = { ...triggerScope, branchIds, triggers };
  const values = triggers.map(({ id, functionSlug }) => ({ ...neonTrigger, trigger_id: id, function_slug: functionSlug, version: Number.MAX_SAFE_INTEGER }));
  for (const [name] of triggerCases) {
    const args = { project_id: 'project-a', branch_id: branchIds[0], ...(name === 'getProjectBranchTrigger' ? { trigger_id: triggers[0].id } : {}) };
    const expected = name === 'getProjectBranchTrigger' ? { trigger: values[0] } : { triggers: values };
    const f = brokerFixture(name, args, expected, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, 1);
    safeEnvelope(f, result);
  }
});

test('OAuth-client metadata drops names, redirect/resource URLs and unexpected secrets through the common broker', async () => {
  for (const [name, args, raw, expected] of authClientCases) {
    const value = { ...authClient, name: credentialCanary, redirect_uris: [derivedCanary], resources: [credentialCanary],
      created_at: derivedCanary, client_secret: credentialCanary, password: 'password-canary' };
    const wrap = value => name === 'getNeonAuthOAuthClient' ? value : { clients: [value] };
    const f = brokerFixture(name, args, wrap(value));
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/branches/br-a/auth',
      'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients',
      'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients/ClientA',
      'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients/ClientC',
      'neon/projects/project-a/branches/br-b/auth/oauth-provider/clients/ClientA'].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    for (const status of [404, 410]) {
      const unavailable = brokerFixture(name, args, () => response({ message: credentialCanary }, { status }));
      const refused = await unavailable.call();
      assert.equal(refused.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(unavailable.provider.requests.length, 1);
      safeEnvelope(unavailable, refused);
    }
    const reflectedArgs = name === 'getNeonAuthOAuthClient' ? { ...args, client_id: 'ReflectedClient' } : args;
    const reflected = brokerFixture(name, reflectedArgs, wrap({ ...authClient, client_id: 'ReflectedClient' }),
      { credentials: { async resolve() { return { value: 'ReflectedClient', redactions: [], async close() {} }; } } },
      { ...authClientScope, clients: [{ id: 'ReflectedClient', branchId: 'br-a' }] });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum OAuth-client scope/output fits common budgets with pinned path-length limits', async () => {
  const branchIds = Array.from({ length: 16 }, (_, n) => `br-${n}-${'a'.repeat(54)}`);
  const clients = Array.from({ length: 16 }, (_, n) => ({ id: `Client${n}${'b'.repeat(56)}`, branchId: branchIds[0] }));
  const config = { ...authClientScope, branchIds, clients };
  const values = clients.map(({ id }) => ({ ...authClient, client_id: id }));
  for (const [name] of authClientCases) {
    const args = { project_id: 'project-a', branch_id: branchIds[0], ...(name === 'getNeonAuthOAuthClient' ? { client_id: clients[0].id } : {}) };
    const expected = name === 'getNeonAuthOAuthClient' ? values[0] : { clients: values };
    const f = brokerFixture(name, args, expected, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, 1);
    safeEnvelope(f, result);
  }
});

test('branch resource metadata drops activation/diagnostic fields and common policy separates sibling collections', async () => {
  for (const [name, args, raw, expected] of branchResourceCases) {
    const collection = name === 'listProjectBranchBuckets' ? 'buckets' : 'custom_domains';
    const poisoned = { [collection]: raw[collection].map(value => ({ ...value, created_at: credentialCanary,
      cname_target: derivedCanary, status_reason: credentialCanary, dns_status: derivedCanary, binding_status: credentialCanary })) };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/branches/br-a/buckets', 'neon/projects/project-a/branches/br-a/custom-domains',
      'neon/projects/project-a/branches/br-b/buckets', 'neon/projects/project-a/branches/br-b/custom-domains',
      'neon/projects/project-a/branches/br-a/functions/hello'].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const reflected = brokerFixture(name, args, raw,
      { credentials: { async resolve() { return { value: collection === 'buckets' ? 'private' : 'pending', redactions: [], async close() {} }; } } });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum branch resource scope/output fits common budgets including paginated domain output', async () => {
  const branchIds = Array.from({ length: 12 }, (_, n) => `br-${n}-${'a'.repeat(54)}`);
  const buckets = Array.from({ length: 12 }, (_, n) => ({ name: `bucket-${n}-${'b'.repeat(245)}`, branchId: branchIds[0] }));
  const domains = Array.from({ length: 12 }, (_, n) => ({ domain: `${String(n).padStart(2, '0')}${'a'.repeat(60)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
    branchId: branchIds[0], functionSlug: 'a'.repeat(20) }));
  const config = { ...branchResourceScope, branchIds, buckets, domains };
  for (const [name] of branchResourceCases) {
    const args = { project_id: 'project-a', branch_id: branchIds[0] };
    const values = name === 'listProjectBranchBuckets' ? buckets.map(({ name }) => ({ ...bucket, name })) :
      domains.map(({ domain, functionSlug }) => ({ ...customDomain, domain, entity_id: functionSlug }));
    const expected = name === 'listProjectBranchBuckets' ? { buckets: values } : { custom_domains: values };
    const f = brokerFixture(name, args, name === 'listProjectBranchBuckets' ? expected :
      (url, init, n) => response(n === 1 ? { custom_domains: values.slice(0, 10), pagination: { next: 'next' } } :
        { custom_domains: values.slice(10), pagination: {} }), {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, name === 'listProjectBranchBuckets' ? 1 : 2);
    safeEnvelope(f, result);
  }
});

test('project security metadata drops configuration and common policy separates project collections', async () => {
  for (const [name, args, raw, expected] of projectSecurityCases) {
    const collection = name === 'getProjectJWKS' ? 'jwks' : 'endpoints';
    const poisoned = { [collection]: raw[collection].map(value => ({ ...value, jwks_url: credentialCanary,
      provider_name: derivedCanary, jwt_audience: credentialCanary, role_names: [derivedCanary], label: credentialCanary,
      created_at: derivedCanary, updated_at: credentialCanary })) };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/jwks', 'neon/projects/project-a/vpc_endpoints',
      'neon/projects/project-a/branches/br-a', `${own}/child`, own.replace('project-a', 'project-b')].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const reflected = brokerFixture(name, args, raw,
      { credentials: { async resolve() { return { value: collection === 'jwks' ? 'jwks-a' : 'vpce-a', redactions: [], async close() {} }; } } });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum project security scope and selected output fit common configuration/output budgets', async () => {
  const branchIds = Array.from({ length: 16 }, (_, n) => `br-${n}-${'a'.repeat(54)}`);
  const bindings = Array.from({ length: 16 }, (_, n) => ({ id: `jwks-${n}-${'b'.repeat(71)}`, branchId: branchIds[n] }));
  const vpcEndpointIds = Array.from({ length: 16 }, (_, n) => `vpce-${n}-${'c'.repeat(71)}`);
  const config = { ...projectSecurityScope, branchIds, jwks: bindings, vpcEndpointIds };
  for (const [name, args] of projectSecurityCases) {
    const expected = name === 'getProjectJWKS' ? { jwks: bindings.map(({ id, branchId }) => ({ ...jwks, id, branch_id: branchId })) } :
      { endpoints: vpcEndpointIds.map(vpc_endpoint_id => ({ ...vpcEndpoint, vpc_endpoint_id })) };
    const f = brokerFixture(name, args, expected, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, 1);
    safeEnvelope(f, result);
  }
});

test('project access output drops personal data and common policy separates the two project collections', async () => {
  for (const [name, args, raw, expected] of projectAccessCases) {
    const collection = name === 'listProjectMembers' ? 'project_members' : 'project_permissions';
    const poisoned = { [collection]: raw[collection].map(value => ({ ...value, email: credentialCanary,
      name: derivedCanary, granted_to_email: credentialCanary, granted_at: derivedCanary, revoked_at: credentialCanary,
      project_role: derivedCanary, explicit_project_permission: credentialCanary })) };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/permissions', 'neon/projects/project-a/members',
      `${own}/child`, own.replace('project-a', 'project-b')].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const reflected = brokerFixture(name, args, raw,
      { credentials: { async resolve() { return { value: name === 'listProjectMembers' ? projectMember.user_id : projectPermission.id,
        redactions: [], async close() {} }; } } });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum access scope and member output fit real common-core budgets with next-page transport', async () => {
  const indices = Array.from({ length: 16 }, (_, n) => n);
  const uuid = n => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
  const config = { ...projectAccessScope, permissionIds: indices.map(n => `permission-${n}-${'a'.repeat(64)}`),
    members: indices.map(n => ({ memberId: uuid(n), userId: uuid(n + 16) })) };
  const members = config.members.map(({ memberId, userId }) => ({ ...projectMember, member_id: memberId, user_id: userId }));
  for (const [name, args] of projectAccessCases) {
    const expected = name === 'listProjectMembers' ? { project_members: members } :
      { project_permissions: config.permissionIds.map(id => ({ id })) };
    const raw = name === 'listProjectMembers' ? (url, init, n) => response(n === 1 ?
      { project_members: members.slice(0, 10), pagination: { next: 'page-2' } } : { project_members: members.slice(10) }) : expected;
    const f = brokerFixture(name, args, raw, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, name === 'listProjectMembers' ? 2 : 1);
    safeEnvelope(f, result);
  }
});

test('organization VPC policy separates organization, region, detail and project grants and redacts restricted-project metadata', async () => {
  const root = 'neon/organizations/org-a/vpc';
  for (const [name, args, raw, expected] of organizationVPCCases) {
    const poison = { label: credentialCanary, state: derivedCanary, num_restricted_projects: 100,
      example_restricted_projects: [credentialCanary], password: 'password-canary', message: derivedCanary };
    const poisoned = name === 'getOrganizationVPCEndpointDetails' ? { ...raw, ...poison } :
      { endpoints: raw.endpoints.map(value => ({ ...value, ...poison })) };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/organizations/org-a', root, `${root}/vpc_endpoints`,
      `${root}/region/aws-us-east-2/vpc_endpoints`, `${root}/region/aws-us-east-2/vpc_endpoints/vpce-a`,
      `${root}/region/aws-us-west-2/vpc_endpoints`, own.replace('org-a', 'org-b'), 'neon/projects/project-a/vpc_endpoints'].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const wrong = brokerFixture(name, args, raw);
    wrong.args = { ...args, org_id: 'org-b' };
    assert.equal((await wrong.call()).code, 'INVALID_ARGUMENTS');
    assert.equal(wrong.common.calls.secret, 0);
    assert.equal(wrong.provider.requests.length, 0);
    const reflected = brokerFixture(name, args, raw,
      { credentials: { async resolve() { return { value: organizationVPCEndpoint.vpc_endpoint_id, redactions: [], async close() {} }; } } });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum organization VPC selection and ID/region output fit real common-core budgets', async () => {
  const indices = Array.from({ length: 16 }, (_, n) => n);
  const config = { ...organizationVPCScope, regionIds: indices.map(n => `aws-region-${n}`),
    endpoints: indices.map(n => ({ id: `vpce-${n}-${'a'.repeat(64)}`, regionId: `aws-region-${n}` })) };
  const endpoints = config.endpoints.map(value => ({ vpc_endpoint_id: value.id, region_id: value.regionId }));
  const f = brokerFixture('listOrganizationVPCEndpointsAllRegions', { org_id: 'org-a' }, { endpoints }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { endpoints });
  safeEnvelope(f, result);
});

test('common operation-map validator confirms incomplete status for all unknown entitlements', () => {
  const map = JSON.parse(readFileSync(new URL('../operation-map.json', import.meta.url)));
  const result = validateOperationMap(map);
  assert.equal(result.complete, false);
  assert.equal(result.incomplete.length, 194);
  assert.equal(map.operations.filter(operation => operation.implemented).length, 42);
  assert.equal(map.operations.filter(operation => operation.enabled).length, 0);
});
