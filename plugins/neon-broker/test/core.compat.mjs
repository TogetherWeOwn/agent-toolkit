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
  organizationCases, organizationFixture, organizationScope, organization,
  organizationMemberCases, organizationMemberFixture, organizationMemberScope, organizationMember,
  organizationInvitationCases, organizationInvitationFixture, organizationInvitationScope, organizationInvitation,
  dataAPICases, dataAPIFixture, dataAPIScope,
  regionCases, regionFixture, regionScope, region,
  projectCountCases, projectCountFixture, projectCountScope,
  authWebhookCases, authWebhookFixture, authWebhookScope,
  userProfileCases, userProfileFixture, userProfileScope,
  authEmailCases, authEmailFixture, authEmailScope,
  projectCases, projectFixture, projectScope,
  userOrganizationCases, userOrganizationFixture, userOrganizationScope,
  sharedProjectCases, sharedProjectFixture, sharedProjectScope,
  logFieldCases, logFieldFixture, logFieldScope,
  fixture, scope, branch, operation, response } from './helpers.mjs';

// CI supplies an isolated, commit-pinned candidate checkout. No runtime/network
// fallback and no embedded replacement for the common authority/policy executor.
assert(process.env.PROVIDER_CORE_ROOT, 'PROVIDER_CORE_ROOT must name the pinned candidate checkout');
const root = resolve(process.env.PROVIDER_CORE_ROOT);
const { providerFixture, credentialCanary, derivedCanary } = await import(pathToFileURL(resolve(root, 'packages/core/testing/provider-fixture.mjs')));
const { validateOperationMap } = await import(pathToFileURL(resolve(root, 'dist/packages/core/src/provider/index.js')));

function brokerFixture(name, args, raw, overrides = {}, config) {
  const factory = logFieldCases.some(([operation]) => operation === name) ? logFieldFixture :
    sharedProjectCases.some(([operation]) => operation === name) ? sharedProjectFixture :
    userOrganizationCases.some(([operation]) => operation === name) ? userOrganizationFixture :
    projectCases.some(([operation]) => operation === name) ? projectFixture :
    authEmailCases.some(([operation]) => operation === name) ? authEmailFixture :
    userProfileCases.some(([operation]) => operation === name) ? userProfileFixture :
    authWebhookCases.some(([operation]) => operation === name) ? authWebhookFixture :
    projectCountCases.some(([operation]) => operation === name) ? projectCountFixture :
    regionCases.some(([operation]) => operation === name) ? regionFixture :
    dataAPICases.some(([operation]) => operation === name) ? dataAPIFixture :
    organizationInvitationCases.some(([operation]) => operation === name) ? organizationInvitationFixture :
    organizationMemberCases.some(([operation]) => operation === name) ? organizationMemberFixture :
    organizationCases.some(([operation]) => operation === name) ? organizationFixture :
    organizationVPCCases.some(([operation]) => operation === name) ? organizationVPCFixture :
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
    assert.equal(f.provider.requests.length, ['getCurrentUserOrganizations', 'listSharedProjects'].includes(name) ? 2 : 1);
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
      assert.equal(f.provider.requests.length, ['getCurrentUserOrganizations', 'listSharedProjects'].includes(name) && mode === 'success' ? 2 : 1);
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

for (const [name, args, raw] of [...logFieldCases, ...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases, ...authDomainCases, ...authIntegrationCases, ...functionCases, ...triggerCases, ...authClientCases, ...branchResourceCases, ...projectSecurityCases, ...projectAccessCases, ...organizationVPCCases, ...organizationCases, ...organizationMemberCases, ...organizationInvitationCases, ...dataAPICases, ...regionCases, ...projectCountCases, ...authWebhookCases, ...userProfileCases, ...authEmailCases, ...projectCases, ...userOrganizationCases, ...sharedProjectCases]) {
  test(`${name}: replay and TOCTOU policy/resource changes refuse without a second request`, async () => {
    const replay = brokerFixture(name, args, raw);
    assert.equal((await replay.call()).ok, true);
    assert.equal((await replay.call()).code, 'REPLAY_CONFLICT');
    assert.equal(replay.provider.requests.length, ['getCurrentUserOrganizations', 'listSharedProjects'].includes(name) ? 2 : 1);
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

test('organization VPC detail at the composed 256-character boundary executes through the common broker', async () => {
  const config = { organizationId: 'a'.repeat(60), revision: 'scope-v1', regionIds: ['aws-' + 'a'.repeat(66)],
    endpoints: [{ id: 'v'.repeat(80), regionId: 'aws-' + 'a'.repeat(66) }] };
  const args = { org_id: config.organizationId, region_id: config.regionIds[0], vpc_endpoint_id: config.endpoints[0].id };
  const raw = { vpc_endpoint_id: args.vpc_endpoint_id };
  const f = brokerFixture('getOrganizationVPCEndpointDetails', args, raw, {}, config);
  assert.equal(f.provider.operation('getOrganizationVPCEndpointDetails').prepare(args).resource.id.length, 256);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { ...raw, region_id: args.region_id });
  safeEnvelope(f, result);
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

test('organization detail and spending metadata require separate exact grants and omit personal/billing diagnostics', async () => {
  for (const [name, args, raw, expected] of organizationCases) {
    const poison = { name: credentialCanary, handle: derivedCanary, plan: credentialCanary, managed_by: derivedCanary,
      created_at: credentialCanary, updated_at: derivedCanary, password: 'password-canary', message: derivedCanary };
    const f = brokerFixture(name, args, { ...raw, ...poison });
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/organizations/org-a', 'neon/organizations/org-a/billing',
      'neon/organizations/org-a/billing/spending_limit', 'neon/organizations/org-a/vpc/vpc_endpoints',
      'neon/organizations/org-b', 'neon/projects/project-a'].filter(id => id !== own)) {
      const other = brokerFixture(name, args, raw);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
    const wrong = brokerFixture(name, args, raw);
    wrong.args = { org_id: 'org-b' };
    assert.equal((await wrong.call()).code, 'INVALID_ARGUMENTS');
    assert.equal(wrong.common.calls.secret, 0);
    assert.equal(wrong.provider.requests.length, 0);
  }
  const [name, args, raw] = organizationCases[0];
  const reflected = brokerFixture(name, args, raw,
    { credentials: { async resolve() { return { value: organization.id, redactions: [], async close() {} }; } } });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('organization nullable spending limit and maximum scope/output fit real common-core budgets', async () => {
  const config = { ...organizationScope, organizationId: 'a'.repeat(60) };
  const args = { org_id: config.organizationId };
  for (const [name, raw] of [['getOrganization', { id: config.organizationId, require_mfa: true, allow_hipaa_projects: false }],
    ...[null, 0, Number.MAX_SAFE_INTEGER].map(spending_limit_cents => ['getOrganizationSpendingLimit', { spending_limit_cents }])]) {
    const f = brokerFixture(name, args, raw, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, raw);
    safeEnvelope(f, result);
  }
  for (const spending_limit_cents of [-1, Number.MAX_SAFE_INTEGER + 1, '100']) {
    const f = brokerFixture('getOrganizationSpendingLimit', args, { spending_limit_cents }, {}, config);
    assert.equal((await f.call()).code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(f.provider.requests.length, 1);
  }
});

test('organization membership grants separate collection/detail and omit user profiles from result, audit and journal', async () => {
  const root = 'neon/organizations/org-a/members';
  for (const [name, args, raw, expected] of organizationMemberCases) {
    const poisoned = name === 'getOrganizationMember' ? { ...raw, email: credentialCanary, joined_at: derivedCanary } :
      { members: [{ member: { ...organizationMember, joined_at: derivedCanary }, user: { email: credentialCanary, has_mfa: derivedCanary } }] };
    const f = brokerFixture(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const own = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/organizations/org-a', root, `${root}/${organizationMember.id}`, `${root}/other`,
      'neon/organizations/org-b/members', 'neon/projects/project-a/members'].filter(id => id !== own)) {
      const denied = brokerFixture(name, args, raw);
      denied.common.vector.policy.resources = [resource];
      assert.equal((await denied.call()).code, 'POLICY_DENIED');
      assert.equal(denied.common.calls.secret, 0);
      assert.equal(denied.provider.requests.length, 0);
    }
    const reflected = brokerFixture(name, args, raw, {
      credentials: { async resolve() { return { value: organizationMember.user_id, redactions: [], async close() {} }; } },
    });
    assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  }
});

test('maximum organization member bindings and two-page output fit the real common broker', async () => {
  const config = { ...organizationMemberScope, organizationId: 'a'.repeat(60), members: Array.from({ length: 16 }, (_, n) => ({
    memberId: `00000000-0000-0000-0000-${(n + 1).toString(16).padStart(12, '0')}`,
    userId: `10000000-0000-0000-0000-${(n + 1).toString(16).padStart(12, '0')}`,
  })) };
  const members = config.members.map(binding => ({ member: { id: binding.memberId, user_id: binding.userId, org_id: config.organizationId, role: 'collaborator' } }));
  const f = brokerFixture('getOrganizationMembers', { org_id: config.organizationId }, (url, init, n) => response(n === 1 ?
    { members: members.slice(0, 10), pagination: { next: 'page-2', sort_by: 'joined_at', sort_order: 'desc' } } : { members: members.slice(10) }), {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { members });
  assert.equal(f.provider.requests.length, 2);
  safeEnvelope(f, result);
});

test('invitation collection grants remain exact and omitted personal data never reaches result, audit or journal', async () => {
  const [name, args, raw, expected] = organizationInvitationCases[0];
  const poisoned = { invitations: [{ ...organizationInvitation, email: credentialCanary, invited_by: derivedCanary,
    invited_at: derivedCanary, status: credentialCanary }] };
  const f = brokerFixture(name, args, poisoned);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/organizations/org-a', 'neon/organizations/org-a/members',
    `neon/organizations/org-a/invitations/${organizationInvitation.id}`, 'neon/organizations/org-b/invitations', 'neon/projects/project-a']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: organizationInvitation.id, redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('maximum invitation selection and 30-row input fit common budgets without inferring status', async () => {
  const ids = Array.from({ length: 30 }, (_, n) => `00000000-0000-0000-0000-${(n + 1).toString(16).padStart(12, '0')}`);
  const config = { ...organizationInvitationScope, organizationId: 'a'.repeat(60), invitationIds: ids.slice(0, 16) };
  const rows = ids.map(id => ({ id, org_id: config.organizationId, role: 'collaborator', email: credentialCanary }));
  const f = brokerFixture('getOrganizationInvitations', { org_id: config.organizationId }, { invitations: rows }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { invitations: rows.slice(0, 16).map(({ email, ...row }) => row) });
  assert.equal(f.provider.requests.length, 1);
  safeEnvelope(f, result);
});

test('Data API status drops URLs/settings and requires its own exact database configuration grant', async () => {
  const [name, args, raw, expected] = dataAPICases[0];
  const f = brokerFixture(name, args, { ...raw, url: credentialCanary, jwks_url: derivedCanary,
    settings: { password: credentialCanary }, available_schemas: [derivedCanary], observed_at: credentialCanary,
    auth_provider: derivedCanary, provider_name: credentialCanary, jwt_audience: derivedCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-a/data-api', 'neon/projects/project-a/branches/br-a/databases/main',
    'neon/projects/project-a/branches/br-a/data-api/other', 'neon/projects/project-a/branches/br-b/data-api/main']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'running', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('maximum Data API binding scope and resource lengths fit common configuration/output budgets', async () => {
  const config = { ...dataAPIScope, projectId: 'p'.repeat(60), revision: 'r'.repeat(80),
    databases: Array.from({ length: 30 }, (_, n) => ({ branchId: `b${String(n).padStart(59, '0')}`, name: 'd'.repeat(63) })) };
  const args = { project_id: config.projectId, branch_id: config.databases[29].branchId, database_name: config.databases[29].name };
  const raw = { status: 's'.repeat(64) };
  const f = brokerFixture('getProjectBranchDataAPI', args, raw, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, raw);
  assert.equal(f.provider.requests.length, 1);
  safeEnvelope(f, result);
});

test('organization-filtered region catalog drops names/coordinates and requires its exact collection grant', async () => {
  const [name, args, raw, expected] = regionCases[0];
  const f = brokerFixture(name, args, { regions: [{ ...region, name: credentialCanary, geo_lat: derivedCanary, geo_long: credentialCanary }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/regions', 'neon/organizations/org-a', 'neon/organizations/org-b/regions',
    'neon/organizations/org-a/regions/aws-us-east-1', 'neon/projects/project-a']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: region.region_id, redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('maximum region selection and output fit common budgets without filtering away invalid rows', async () => {
  const config = { ...regionScope, organizationId: 'o'.repeat(60), revision: 'r'.repeat(80),
    regionIds: Array.from({ length: 30 }, (_, n) => `aws-${String(n).padStart(76, '0')}`) };
  const args = { org_id: config.organizationId };
  const raw = { regions: config.regionIds.map(region_id => ({ region_id, default: false })) };
  const f = brokerFixture('getActiveRegions', args, raw, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, raw);
  assert.equal(f.provider.requests.length, 1);
  safeEnvelope(f, result);
  const invalid = brokerFixture('getActiveRegions', args, { regions: [...raw.regions, { region_id: 'aws-unselected', default: false }] }, {}, config);
  assert.equal((await invalid.call()).code, 'UPSTREAM_UNAVAILABLE');
});

test('organization-filtered project count needs its exact aggregate grant and drops diagnostic fields', async () => {
  const [name, args, raw, expected] = projectCountCases[0];
  const f = brokerFixture(name, args, { ...raw, projects: [{ name: credentialCanary }], owner: derivedCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/count', 'neon/organizations/org-a', 'neon/organizations/org-a/projects',
    'neon/organizations/org-b/projects/count', 'neon/organizations/org-a/regions', 'neon/projects/project-a/branches/count']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const invalid = brokerFixture(name, args, { count: Number.MAX_SAFE_INTEGER + 1 });
  const refusal = await invalid.call();
  assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
  safeEnvelope(invalid, refusal);
  for (const count of [0, Number.MAX_SAFE_INTEGER]) {
    const config = { ...projectCountScope, organizationId: 'o'.repeat(60), revision: 'r'.repeat(80) };
    const maximum = brokerFixture(name, { org_id: config.organizationId }, { count }, {}, config);
    const value = await maximum.call();
    assert.equal(value.ok, true);
    assert.deepEqual(value.value, { count });
    safeEnvelope(maximum, value);
  }
});

test('auth webhook needs its exact grant, drops destination/secrets and refuses cross-branch responses', async () => {
  const [name, args, raw, expected] = authWebhookCases[0];
  const f = brokerFixture(name, args, { ...raw, webhook_url: credentialCanary, secret: derivedCanary, signing_key: 'password-canary' });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a/branches/br-a/auth', 'neon/projects/project-a/branches/br-b/auth/webhooks',
    'neon/projects/project-a/branches/br-a/auth/plugins/phone-number']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, branch_id: 'br-b' }, { ...raw, enabled_events: [credentialCanary] }, { ...raw, timeout_seconds: 11 }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
});

test('maximum webhook scope, exact resource and event projection fit common-core budgets', async () => {
  const config = { ...authWebhookScope, projectId: 'p'.repeat(60), revision: 'r'.repeat(80),
    branchIds: Array.from({ length: 30 }, (_, n) => `b${String(n).padStart(59, '0')}`) };
  const raw = { enabled: true, enabled_events: ['user.before_create', 'user.created', 'send.otp', 'send.magic_link',
    'organization.invitation.created', 'organization.invitation.accepted', 'phone_number.verified'], timeout_seconds: 10 };
  const maximum = brokerFixture(authWebhookCases[0][0], { project_id: config.projectId, branch_id: config.branchIds[0] }, raw, {}, config);
  const result = await maximum.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, raw);
  safeEnvelope(maximum, result);
});

test('current-user profile requires its exact user grant and omits personal/account/credential metadata', async () => {
  const [name, args, raw, expected] = userProfileCases[0];
  const f = brokerFixture(name, args, { ...raw, email: credentialCanary, login: derivedCanary,
    image: credentialCanary, auth_accounts: [{ secret: credentialCanary }], billing_account: { key: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/users/user-a', 'neon/users/other/profile', 'neon/users/user-a/organizations',
    'neon/projects/project-a', 'neon/organizations/org-a']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, id: 'other' }, { ...raw, projects_limit: Number.MAX_SAFE_INTEGER + 1 }, { ...raw, pagination: {} }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...userProfileScope, userId: 'u'.repeat(80), revision: 'r'.repeat(80) };
  const maximumRaw = { id: config.userId, projects_limit: Number.MAX_SAFE_INTEGER, branches_limit: Number.MAX_SAFE_INTEGER };
  const maximum = brokerFixture(name, { user_id: config.userId }, maximumRaw, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, maximumRaw);
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'user-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('email-auth configuration uses its exact grant without changing auth or session state', async () => {
  const [name, args, raw, expected] = authEmailCases[0];
  const f = brokerFixture(name, args, { ...raw, password: credentialCanary, smtp_password: derivedCanary, message: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a/branches/br-a/auth',
    'neon/projects/project-a/branches/br-b/auth/email_and_password',
    'neon/projects/project-a/branches/br-a/auth/email_provider',
    'neon/projects/project-a/branches/br-a/auth/webhooks']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, branch_id: 'br-b' }, { ...raw, email_verification_method: credentialCanary },
    { ...raw, revoke_sessions_on_password_reset: null }, { ...raw, pagination: {} }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...authEmailScope, projectId: 'p'.repeat(60), revision: 'r'.repeat(80),
    branchIds: Array.from({ length: 30 }, (_, n) => `b${String(n).padStart(59, '0')}`) };
  const maximum = brokerFixture(name, { project_id: config.projectId, branch_id: config.branchIds[0] }, raw, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, expected);
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'false', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  assert.equal(reflected.provider.requests.length, 1);
});

test('project catalog needs an exact organization collection grant and never emits unselected metadata', async () => {
  const [name, args, raw, expected] = projectCases[0];
  for (const resource of ['neon/organizations/org-a', 'neon/organizations/other/projects',
    'neon/organizations/org-a/projects/count', 'neon/projects/project-a']) {
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const value = raw.projects[0];
  const f = brokerFixture(name, args, { projects: [{ ...value, name: credentialCanary, proxy_host: derivedCanary },
    { ...value, id: 'unselected' }], applications: { secret: credentialCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const invalid of [{ projects: [{ ...value, org_id: 'other' }] }, { ...raw, pagination: { next: 'wrong' } },
    { projects: [], unavailable_project_ids: ['project-a'] }, { projects: [value, value] }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const id = 'p'.repeat(60);
  const config = { ...projectScope, organizationId: 'o'.repeat(60), revision: 'r'.repeat(80), projectIds: [id] };
  const maxRaw = { projects: [{ ...value, id, org_id: config.organizationId, region_id: 'r'.repeat(80), pg_version: 19 }] };
  const maximum = brokerFixture(name, { org_id: config.organizationId }, maxRaw, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { projects: [{ id, region_id: 'r'.repeat(80), pg_version: 19 }] });
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'project-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  assert.equal(reflected.provider.requests.length, 1);
});

test('user organization catalog requires its exact collection grant, proves user and omits account metadata', async () => {
  const [name, args, raw, expected] = userOrganizationCases[0];
  for (const resource of ['neon/users/user-a', 'neon/users/user-a/profile', 'neon/users/other/organizations', 'neon/organizations/org-a']) {
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = brokerFixture(name, args, { user: { ...raw.user, email: credentialCanary }, catalog: { organizations: [
    { id: 'org-a', name: credentialCanary, plan: derivedCanary }, { id: 'unselected', handle: credentialCanary }] } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  assert.equal(f.provider.requests.length, 2);
  assert.equal(f.common.calls.secret, 1);
  safeEnvelope(f, result);
  for (const invalid of [{ ...raw, user: { id: 'other' } }, { ...raw, catalog: { organizations: [{ id: 'org-a', user_id: 'other' }] } },
    { ...raw, catalog: { ...raw.catalog, pagination: {} } }, { ...raw, catalog: { organizations: [{ id: 'org-a' }, { id: 'org-a' }] } }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...userOrganizationScope, userId: 'u'.repeat(80), revision: 'r'.repeat(80),
    organizationIds: Array.from({ length: 30 }, (_, n) => `o${String(n).padStart(59, '0')}`) };
  const organizations = config.organizationIds.map(id => ({ id }));
  const maximum = brokerFixture(name, { user_id: config.userId }, { user: { id: config.userId }, catalog: { organizations } }, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { organizations });
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'org-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  assert.equal(reflected.provider.requests.length, 2);
});

test('shared projects require exact-user collection grant, selected output and same-credential identity proof', async () => {
  const [name, args, raw, expected] = sharedProjectCases[0];
  for (const resource of ['neon/users/user-a', 'neon/users/user-a/profile', 'neon/users/user-a/organizations',
    'neon/users/other/shared_projects', 'neon/organizations/org-a/projects']) {
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = brokerFixture(name, args, { user: { ...raw.user, email: credentialCanary }, catalog: { projects: [
    { ...raw.catalog.projects[0], name: credentialCanary, owner: { email: derivedCanary } },
    { ...raw.catalog.projects[0], id: 'unselected', settings: { password: credentialCanary } }] } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  assert.equal(f.common.calls.secret, 1);
  assert.equal(f.provider.requests.length, 2);
  safeEnvelope(f, result);
  for (const invalid of [{ ...raw, user: { id: 'other' } }, { ...raw, catalog: { projects: [], unavailable_project_ids: ['project-a'] } },
    { ...raw, catalog: { projects: [raw.catalog.projects[0], raw.catalog.projects[0]] } }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...sharedProjectScope, userId: 'u'.repeat(80), revision: 'r'.repeat(80),
    projectIds: Array.from({ length: 30 }, (_, n) => `p${String(n).padStart(59, '0')}`) };
  const projects = config.projectIds.map(id => ({ id, region_id: 'r'.repeat(80), pg_version: 19 }));
  const maximum = brokerFixture(name, { user_id: config.userId }, (url, init, n) => response(n === 1 ? { id: config.userId } :
    { projects: projects.slice((n - 2) * 10, (n - 1) * 10), ...(n < 4 ? { pagination: { cursor: `page-${n}` } } : {}) }), {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { projects });
  assert.equal(maximum.provider.requests.length, 4);
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'project-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  assert.equal(reflected.provider.requests.length, 2);
});

test('log-field catalog requires its exact branch grant without authorizing log content or value discovery', async () => {
  const [name, args, raw, expected] = logFieldCases[0];
  const f = brokerFixture(name, args, { ...raw, fields: [...raw.fields, credentialCanary],
    logs: [{ message: credentialCanary }], values: [derivedCanary], message: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-a/logs', 'neon/projects/project-a/branches/br-b/logs/fields',
    'neon/projects/project-a/branches/br-a/logs/fields/level/values']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, branch_id: 'br-b' }, { ...raw, fields: ['unselected', 'unselected'] },
    { ...raw, fields: Array.from({ length: 31 }, (_, n) => `field-${n}`) }, { ...raw, pagination: {} }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const fields = Array.from({ length: 30 }, (_, n) => `field-${String(n).padStart(74, '0')}`);
  const config = { ...logFieldScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80), fieldNames: fields };
  const maximum = brokerFixture(name, { project_id: config.projectId, branch_id: config.branchId }, { fields }, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { fields });
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, { fields: ['level'] }, {
    credentials: { async resolve() { return { value: 'level', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('common operation-map validator confirms incomplete status for all unknown entitlements', () => {
  const map = JSON.parse(readFileSync(new URL('../operation-map.json', import.meta.url)));
  const result = validateOperationMap(map);
  assert.equal(result.complete, false);
  assert.equal(result.incomplete.length, 194);
  assert.deepEqual(map.operations.filter(operation => operation.implemented).map(operation => operation.id).sort(), cases.map(([name]) => name).sort());
  assert.equal(map.operations.filter(operation => operation.enabled).length, 0);
});
