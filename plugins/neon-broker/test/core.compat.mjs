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
  logValueCases, logValueFixture, logValueScope,
  logQueryCases, logQueryFixture, logQueryScope, logRecord,
  bucketObjectCases, bucketObjectFixture, bucketObjectScope, bucketObject,
  consumptionCases, consumptionFixture, consumptionScope, consumptionFrame, consumptionPeriod,
  branchConsumptionCases, branchConsumptionFixture, branchConsumptionScope,
  legacyConsumptionCases, legacyConsumptionFixture, legacyConsumptionFrame, legacyConsumptionPeriod,
  maskingRuleCases, maskingRuleFixture, maskingRuleScope, maskingRule,
  authDetailsCases, authDetailsFixture, authDetailsScope, authDetails,
  credentialMetadataCases, credentialMetadataFixture, credentialMetadataScope, credentialMetadata,
  organizationKeyCases, organizationKeyFixture, organizationKeyScope,
  userKeyCases, userKeyFixture, userKeyScope,
  advisorCases, advisorFixture, advisorScope, advisorIssue,
  branchSchemaCases, branchSchemaFixture, branchSchemaScope, schemaColumn, schemaTable,
  schemaComparisonCases, schemaComparisonFixture, schemaComparisonScope,
  oauthProviderCases, oauthProviderFixture, oauthProviderScope, oauthProvider,
  objectDownloadCases, objectDownloadFixture, objectDownloadScope, binaryResponse,
  endpointDeleteFixture, endpointDeleteArgs, endpointDeleteScope, endpointDeleteReceipt,
  projectDeleteFixture, projectDeleteArgs, projectDeleteScope, projectDeleteReceipt,
  databaseDeleteFixture, databaseDeleteArgs, databaseDeleteScope, databaseDeleteReceipt,
  userKeyRevokeFixture, userKeyRevokeArgs, userKeyRevokeScope, userKeyRevokeReceipt,
  organizationKeyRevokeFixture, organizationKeyRevokeArgs, organizationKeyRevokeScope, organizationKeyRevokeReceipt,
  credentialRevokeFixture, credentialRevokeArgs, credentialRevokeScope, credentialRevokeMetadata,
  projectMemberRoleRemoveFixture, projectMemberRoleRemoveArgs, projectMemberRoleRemoveScope, projectMemberRoleRemoveMetadata, projectMemberRoleRemoveReceipt,
  organizationMemberRemoveFixture, organizationMemberRemoveArgs, organizationMemberRemoveScope, organizationMemberRemoveMetadata,
  authClientDeleteFixture, authClientDeleteArgs, authClientDeleteScope, authClientDeleteMetadata,
  jwksDeleteFixture, jwksDeleteArgs, jwksDeleteScope, jwksDeleteMetadata,
  triggerDeleteFixture, triggerDeleteArgs, triggerDeleteScope, triggerDeleteMetadata,
  customDomainDeleteFixture, customDomainDeleteArgs, customDomainDeleteScope, customDomainDeleteMetadata,
  objectDeleteFixture, objectDeleteArgs, objectDeleteScope, objectDeleteMetadata,
  authDomainDeleteFixture, authDomainDeleteArgs, authDomainDeleteScope, authDomainDeleteMetadata,
  legacyAuthDomainDeleteFixture, legacyAuthDomainDeleteArgs, legacyAuthDomainDeleteScope,
  oauthProviderDeleteFixture, oauthProviderDeleteArgs, oauthProviderDeleteScope, oauthProviderDeleteMetadata,
  dataAPIDeleteFixture, dataAPIDeleteArgs, dataAPIDeleteScope,
  legacyOAuthProviderDeleteFixture, legacyOAuthProviderDeleteArgs, legacyOAuthProviderDeleteScope,
  bucketDeleteFixture, bucketDeleteArgs, bucketDeleteScope, bucketDeleteMetadata,
  functionDeleteFixture, functionDeleteArgs, functionDeleteScope, functionDeleteMetadata,
  permissionRevokeFixture, permissionRevokeArgs, permissionRevokeScope, permissionRevokeReceipt,
  roleDeleteFixture, roleDeleteArgs, roleDeleteScope, roleDeleteReceipt,
  branchDeleteFixture, branchDeleteArgs, branchDeleteScope, branchDeleteReceipt,
  endpointStartFixture, endpointStartArgs, endpointStartScope, endpointStartReceipt,
  endpointRestartFixture, endpointRestartArgs, endpointRestartScope, endpointRestartReceipt,
  endpointSuspendFixture, endpointSuspendArgs, endpointSuspendScope, endpointSuspendReceipt,
  endpointUpdateFixture, endpointUpdateArgs, endpointUpdateScope, endpointUpdateReceipt,
  projectUpdateFixture, projectUpdateArgs, projectUpdateScope, projectUpdateReceipt,
  branchUpdateFixture, branchUpdateArgs, branchUpdateScope, branchUpdateReceipt,
  snapshotUpdateFixture, snapshotUpdateArgs, snapshotUpdateScope, snapshotUpdateReceipt,
  sourceNames, snapshotDeleteFixture, snapshotDeleteArgs, snapshotDeleteScope, snapshotDeleteReceipt,
  fixture, scope, branch, operation, response } from './helpers.mjs';

// CI supplies an isolated, commit-pinned candidate checkout. No runtime/network
// fallback and no embedded replacement for the common authority/policy executor.
assert(process.env.PROVIDER_CORE_ROOT, 'PROVIDER_CORE_ROOT must name the pinned candidate checkout');
const root = resolve(process.env.PROVIDER_CORE_ROOT);
const { providerFixture, credentialCanary, derivedCanary } = await import(pathToFileURL(resolve(root, 'packages/core/testing/provider-fixture.mjs')));
const { validateOperationMap } = await import(pathToFileURL(resolve(root, 'dist/packages/core/src/provider/index.js')));

function brokerFixture(name, args, raw, overrides = {}, config) {
  const factory = objectDownloadCases.some(([operation]) => operation === name) ? objectDownloadFixture :
    oauthProviderCases.some(([operation]) => operation === name) ? oauthProviderFixture :
    logQueryCases.some(([operation]) => operation === name) ? logQueryFixture :
    schemaComparisonCases.some(([operation]) => operation === name) ? schemaComparisonFixture :
    logValueCases.some(([operation]) => operation === name) ? logValueFixture :
    branchSchemaCases.some(([operation]) => operation === name) ? branchSchemaFixture :
    advisorCases.some(([operation]) => operation === name) ? advisorFixture :
    userKeyCases.some(([operation]) => operation === name) ? userKeyFixture :
    organizationKeyCases.some(([operation]) => operation === name) ? organizationKeyFixture :
    credentialMetadataCases.some(([operation]) => operation === name) ? credentialMetadataFixture :
    authDetailsCases.some(([operation]) => operation === name) ? authDetailsFixture :
    maskingRuleCases.some(([operation]) => operation === name) ? maskingRuleFixture :
    legacyConsumptionCases.some(([operation]) => operation === name) ? legacyConsumptionFixture :
    branchConsumptionCases.some(([operation]) => operation === name) ? branchConsumptionFixture :
    consumptionCases.some(([operation]) => operation === name) ? consumptionFixture :
    bucketObjectCases.some(([operation]) => operation === name) ? bucketObjectFixture :
    logFieldCases.some(([operation]) => operation === name) ? logFieldFixture :
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

function customDomainDeletionBroker(value = null, overrides = {}, config = customDomainDeleteScope) {
  const provider = customDomainDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, domain: config.domain };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchCustomDomain').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchCustomDomain', args, context, key);
  } };
}

test('Custom domain delete: reserved authority and exact domain/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = customDomainDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/custom-domains/app.example.invalid';
  for (const resource of [target, target + '/reveal', target.replace('br-a', 'other') + '/delete',
    target.replace('project-a', 'other') + '/delete', target.replace('app.example.invalid', 'other.invalid') + '/delete',
    'neon/projects/project-a/branches/br-a/credentials']) {
    const f = customDomainDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = customDomainDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = customDomainDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('Custom domain delete: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = customDomainDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchCustomDomain', customDomainDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Custom domain delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = customDomainDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = customDomainDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchCustomDomain', customDomainDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { domain: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = customDomainDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchCustomDomain', { ...customDomainDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Custom domain delete: permanent journal blocks complete and uncertain replay after restart without claiming independent deletion', async () => {
  for (const ambiguous of [false, true]) {
    const f = customDomainDeletionBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response({ custom_domains: [customDomainDeleteMetadata] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Custom domain delete: malformed/foreign list refuses before deletion; secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { domain: credentialCanary }, { pagination: {} }]) {
    const f = customDomainDeletionBroker(() => response({ custom_domains: [{ ...customDomainDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = customDomainDeletionBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ custom_domains: [{ ...customDomainDeleteMetadata, cname_target: derivedCanary, status_reason: credentialCanary, error: credentialCanary }] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('Custom domain delete: schema-backed pagination sort metadata reaches acknowledgement without weakening late-page checks', async () => {
  for (const drift of [false, true]) {
    const f = customDomainDeletionBroker((url, init, n) => init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({
      custom_domains: n === 1 ? [customDomainDeleteMetadata] : [], pagination: { sort_by: 'domain', sort_order: drift && n === 2 ? 'desc' : 'asc',
        ...(n === 1 ? { next: 'next' } : {}) } }));
    const result = await f.call();
    assert.equal(result.ok, !drift);
    if (!drift) assert.deepEqual(result.value, { acknowledged: true });
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, drift ? 0 : 1);
    safeEnvelope(f, result);
  }
});

test('Custom domain delete: maximum copied project/branch/domain names fit common budgets', async () => {
  const config = { ...customDomainDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), domain: 's'.repeat(63) + '.invalid', revision: 'r'.repeat(80) };
  const f = customDomainDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function legacyAuthDomainDeletionBroker(value = null, overrides = {}, config = legacyAuthDomainDeleteScope) {
  const provider = legacyAuthDomainDeleteFixture(value, config);
  const args = { project_id: config.projectId, auth_provider: config.authProvider, domain: config.domain };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteNeonAuthDomainFromRedirectURIWhitelist').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteNeonAuthDomainFromRedirectURIWhitelist', args, context, key);
  } };
}
const legacyAuthDomainDeletionList = { domains: [authDomainDeleteMetadata] };

test('Legacy auth domain delete: reserved exact-plan authority and exact provider/origin/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = legacyAuthDomainDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/auth/legacy/domains/better_auth/app.example.invalid/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('/auth/legacy/domains', '/branches/br-a/auth/domains'), target.replace('project-a', 'other'),
    target.replace('better_auth', 'stack'), target.replace('app.example.invalid', 'other.invalid'), 'neon/projects/project-a/auth/legacy/domains']) {
    const f = legacyAuthDomainDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = legacyAuthDomainDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = legacyAuthDomainDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Legacy auth domain delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = legacyAuthDomainDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteNeonAuthDomainFromRedirectURIWhitelist', legacyAuthDomainDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Legacy auth domain delete: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = legacyAuthDomainDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = legacyAuthDomainDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { auth_provider: 'stack' },
    { domain: 'https://other.invalid' }, { domains: [] }, { retry: true }]) {
    const g = legacyAuthDomainDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteNeonAuthDomainFromRedirectURIWhitelist', { ...legacyAuthDomainDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Legacy auth domain delete: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = legacyAuthDomainDeletionBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(ambiguous && n > 2 ? { domains: [] } : legacyAuthDomainDeletionList);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Legacy auth domain delete: malformed/foreign/provider drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: 'other' }, { domain: credentialCanary },
    { auth_provider: 'stack' }, { pagination: {} }]) {
    const f = legacyAuthDomainDeletionBroker(() => response({ domains: [{ ...authDomainDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = legacyAuthDomainDeletionBroker((url, init) => init.method === 'DELETE' ? response({ acknowledged: true, error: credentialCanary }) : response(legacyAuthDomainDeletionList));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Legacy auth domain delete: maximum origin and identity selection fits actual common prepared budgets', async () => {
  const config = { ...legacyAuthDomainDeleteScope, projectId: 'p'.repeat(60),
    domain: 'https://' + 'a'.repeat(60) + '.' + 'b'.repeat(59), revision: 'r'.repeat(80) };
  const f = legacyAuthDomainDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function oauthProviderDeletionBroker(value = null, overrides = {}, config = oauthProviderDeleteScope) {
  const provider = oauthProviderDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, oauth_provider_id: config.oauthProviderId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteBranchNeonAuthOauthProvider').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteBranchNeonAuthOauthProvider', args, context, key);
  } };
}
const oauthProviderDeletionList = { providers: [oauthProviderDeleteMetadata] };

test('OAuth provider delete: reserved exact-plan authority and exact provider/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = oauthProviderDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/auth/oauth_providers/google/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('br-a', 'other'), target.replace('project-a', 'other'),
    target.replace('google', 'github'), target.replace('/branches/br-a', '/legacy'), 'neon/projects/project-a/branches/br-a/auth/oauth_providers']) {
    const f = oauthProviderDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = oauthProviderDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = oauthProviderDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('OAuth provider delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = oauthProviderDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteBranchNeonAuthOauthProvider', oauthProviderDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('OAuth provider delete: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = oauthProviderDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = oauthProviderDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { oauth_provider_id: 'github' },
    { expectedType: 'shared' }, { retry: true }]) {
    const g = oauthProviderDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteBranchNeonAuthOauthProvider', { ...oauthProviderDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('OAuth provider delete: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = oauthProviderDeletionBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(ambiguous && n > 2 ? { providers: [] } : oauthProviderDeletionList);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('OAuth provider delete: malformed/foreign/type drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: 'other' }, { id: credentialCanary },
    { type: 'shared' }, { pagination: {} }]) {
    const f = oauthProviderDeletionBroker(() => response({ providers: [{ ...oauthProviderDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = oauthProviderDeletionBroker((url, init) => init.method === 'DELETE' ? response({ acknowledged: true, error: credentialCanary }) : response(oauthProviderDeletionList));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('OAuth provider delete: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...oauthProviderDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60),
    oauthProviderId: 'microsoft', revision: 'r'.repeat(80) };
  const f = oauthProviderDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

import { organizationVPCDeleteFixture, organizationVPCDeleteScope, organizationVPCDeleteArgs, organizationVPCDeleteMetadata } from './helpers.mjs';
function organizationVPCDeleteBroker(value = null, overrides = {}, config = organizationVPCDeleteScope) {
  const provider = organizationVPCDeleteFixture(value, config);
  const args = { org_id: config.organizationId, region_id: config.regionId, vpc_endpoint_id: config.vpcEndpointId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteOrganizationVPCEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteOrganizationVPCEndpoint', args, context, key);
  } };
}

test('Organization VPC delete: reserved exact-plan authority and exact restriction AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = organizationVPCDeleteBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/organizations/org-a/vpc/region/aws-us-east-1/vpc_endpoints/vpce-a/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('vpce-a', 'other'), target.replace('org-a', 'other'), target.replace('aws-us-east-1', 'aws-other'),
    target.replace('/delete', '/assign'), 'neon/organizations/org-a/vpc/region/aws-us-east-1/vpc_endpoints', 'neon/projects/project-a/vpc_endpoints/vpce-a/remove']) {
    const f = organizationVPCDeleteBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = organizationVPCDeleteBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = organizationVPCDeleteBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Organization VPC delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = organizationVPCDeleteBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteOrganizationVPCEndpoint', organizationVPCDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Organization VPC delete: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = organizationVPCDeleteBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = organizationVPCDeleteBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { org_id: 'other' }, { vpc_endpoint_id: 'other' }, { project_id: 'project-a' }, { region_id: 'azure-eastus' }, { retry: true }]) {
    const g = organizationVPCDeleteBroker();
    assert.equal((await g.common.broker().call('neon.deleteOrganizationVPCEndpoint', { ...organizationVPCDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Organization VPC delete: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = organizationVPCDeleteBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(n > 2 ? {} : organizationVPCDeleteMetadata);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Organization VPC delete: foreign/absent restrictions and reflected lease strings cannot enter safe envelopes', async () => {
  for (const raw of [{ ...organizationVPCDeleteMetadata, org_id: 'other' }, { ...organizationVPCDeleteMetadata, pagination: {} },
    {}, { vpc_endpoint_id: credentialCanary },
    { vpc_endpoint_id: 'vpce-a', region_id: credentialCanary }]) {
    const f = organizationVPCDeleteBroker(() => response(raw));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = organizationVPCDeleteBroker((url, init) => response(init.method === 'DELETE' ? { error: credentialCanary } : organizationVPCDeleteMetadata));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Organization VPC delete: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...organizationVPCDeleteScope, organizationId: 'o'.repeat(60), regionId: 'aws-' + 'r'.repeat(76), vpcEndpointId: 'v'.repeat(63), revision: 'r'.repeat(80) };
  const f = organizationVPCDeleteBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

import { projectVPCRemoveFixture, projectVPCRemoveScope, projectVPCRemoveArgs, projectVPCRemoveMetadata } from './helpers.mjs';
function projectVPCRemoveBroker(value = null, overrides = {}, config = projectVPCRemoveScope) {
  const provider = projectVPCRemoveFixture(value, config);
  const args = { project_id: config.projectId, vpc_endpoint_id: config.vpcEndpointId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectVPCEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectVPCEndpoint', args, context, key);
  } };
}

test('Project VPC removal: reserved exact-plan authority and exact restriction AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = projectVPCRemoveBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/vpc_endpoints/vpce-a/remove';
  for (const resource of [target.replace('/remove', ''), target.replace('vpce-a', 'other'), target.replace('project-a', 'other'),
    target.replace('/remove', '/assign'), 'neon/projects/project-a/vpc_endpoints', 'neon/organizations/org-a/vpc_endpoints/vpce-a/delete']) {
    const f = projectVPCRemoveBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = projectVPCRemoveBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = projectVPCRemoveBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Project VPC removal: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = projectVPCRemoveBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectVPCEndpoint', projectVPCRemoveArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Project VPC removal: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = projectVPCRemoveBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = projectVPCRemoveBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { vpc_endpoint_id: 'other' }, { org_id: 'org-a' }, { retry: true }]) {
    const g = projectVPCRemoveBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectVPCEndpoint', { ...projectVPCRemoveArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Project VPC removal: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = projectVPCRemoveBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(n > 2 ? { endpoints: [] } : projectVPCRemoveMetadata);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Project VPC removal: foreign/absent restrictions and reflected lease strings cannot enter safe envelopes', async () => {
  for (const raw of [{ ...projectVPCRemoveMetadata, project_id: 'other' }, { ...projectVPCRemoveMetadata, pagination: {} },
    { endpoints: [] }, { endpoints: [{ vpc_endpoint_id: credentialCanary }] },
    { endpoints: [{ vpc_endpoint_id: 'vpce-a', project_id: credentialCanary }] }]) {
    const f = projectVPCRemoveBroker(() => response(raw));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = projectVPCRemoveBroker((url, init) => response(init.method === 'DELETE' ? { error: credentialCanary } : projectVPCRemoveMetadata));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Project VPC removal: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...projectVPCRemoveScope, projectId: 'p'.repeat(60), vpcEndpointId: 'v'.repeat(80), revision: 'r'.repeat(80) };
  const f = projectVPCRemoveBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

import { authIntegrationDeleteFixture, authIntegrationDeleteScope, authIntegrationDeleteArgs, authIntegrationDeleteMetadata } from './helpers.mjs';
function authIntegrationDeleteBroker(value = null, overrides = {}, config = authIntegrationDeleteScope) {
  const provider = authIntegrationDeleteFixture(value, config);
  const args = { project_id: config.projectId, auth_provider: config.authProvider };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteNeonAuthIntegration').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteNeonAuthIntegration', args, context, key);
  } };
}

test('Legacy integration delete: reserved exact-plan authority and exact legacy delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = authIntegrationDeleteBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/auth/integration/better_auth/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('better_auth', 'stack'), target.replace('project-a', 'other'),
    target.replace('/delete', '/create'), 'neon/projects/project-a/branches/br-a/auth/disable', 'neon/projects/project-a/auth/integrations']) {
    const f = authIntegrationDeleteBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = authIntegrationDeleteBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = authIntegrationDeleteBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { accepted: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Legacy integration delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = authIntegrationDeleteBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteNeonAuthIntegration', authIntegrationDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Legacy integration delete: host identity/resource TOCTOU and data-erasure overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = authIntegrationDeleteBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = authIntegrationDeleteBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { auth_provider: 'stack' }, { branch_id: 'br-a' }, { delete_data: true }, { delete_data: false }, { retry: true }]) {
    const g = authIntegrationDeleteBroker();
    assert.equal((await g.common.broker().call('neon.deleteNeonAuthIntegration', { ...authIntegrationDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Legacy integration delete: complete/uncertain permanent journal blocks restart replay without completion proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = authIntegrationDeleteBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(n > 2 ? { data: [] } : authIntegrationDeleteMetadata, { status: n > 2 ? 404 : 200 });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Legacy integration delete: integration drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ branch_id: credentialCanary }, { auth_provider: 'stack' },
    { owned_by: 'user' }, { transfer_status: 'initiated' }, { pagination: {} }]) {
    const f = authIntegrationDeleteBroker(() => response({ data: [{ ...authIntegrationDeleteMetadata.data[0], ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = authIntegrationDeleteBroker((url, init) => response(init.method === 'DELETE' ? { error: credentialCanary } : authIntegrationDeleteMetadata));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Legacy integration delete: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...authIntegrationDeleteScope, projectId: 'p'.repeat(60), expectedBranchId: 'b'.repeat(60), revision: 'r'.repeat(80) };
  const f = authIntegrationDeleteBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

import { authLocalhostDisableFixture, authLocalhostDisableScope, authLocalhostDisableArgs } from './helpers.mjs';
function authLocalhostDisableBroker(value = null, overrides = {}, config = authLocalhostDisableScope) {
  const provider = authLocalhostDisableFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('updateNeonAuthAllowLocalhost').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.updateNeonAuthAllowLocalhost', args, context, key);
  } };
}

test('Localhost disable: reserved exact-plan authority and exact disable AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = authLocalhostDisableBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/auth/allow_localhost/disable';
  for (const resource of [target.replace('/disable', ''), target.replace('br-a', 'other'), target.replace('project-a', 'other'),
    target.replace('/disable', '/enable'), target.replace('/allow_localhost/disable', '/disable'), 'neon/projects/project-a/branches/br-a']) {
    const f = authLocalhostDisableBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = authLocalhostDisableBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = authLocalhostDisableBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { accepted: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Localhost disable: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = authLocalhostDisableBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.updateNeonAuthAllowLocalhost', authLocalhostDisableArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Localhost disable: host identity/resource TOCTOU and enable/body overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = authLocalhostDisableBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = authLocalhostDisableBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { allow_localhost: true }, { allow_localhost: false }, { retry: true }]) {
    const g = authLocalhostDisableBroker();
    assert.equal((await g.common.broker().call('neon.updateNeonAuthAllowLocalhost', { ...authLocalhostDisableArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Localhost disable: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = authLocalhostDisableBroker((url, init, n) => {
      if (init.method === 'PATCH') { if (ambiguous) throw Error(credentialCanary); return response({ allow_localhost: false }); }
      return response({ allow_localhost: n === 1 });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    safeEnvelope(f, result);
  }
});

test('Localhost disable: status drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: credentialCanary }, { allow_localhost: false },
    { allow_localhost: credentialCanary }, { pagination: {} }]) {
    const f = authLocalhostDisableBroker(() => response({ allow_localhost: true, ...change }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'PATCH').length, 0);
    safeEnvelope(f, result);
  }
  const f = authLocalhostDisableBroker((url, init) => response(init.method === 'PATCH' ? { allow_localhost: credentialCanary } : { allow_localhost: true }));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Localhost disable: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...authLocalhostDisableScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80) };
  const f = authLocalhostDisableBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

import { authDisableFixture, authDisableScope, authDisableArgs, authDisableMetadata } from './helpers.mjs';
function authDisableBroker(value = null, overrides = {}, config = authDisableScope) {
  const provider = authDisableFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('disableNeonAuth').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.disableNeonAuth', args, context, key);
  } };
}

test('Auth disable: reserved exact-plan authority and exact disable AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = authDisableBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/auth/disable';
  for (const resource of [target.replace('/disable', ''), target.replace('br-a', 'other'), target.replace('project-a', 'other'),
    target.replace('/disable', '/create'), target.replace('/auth/disable', '/realtime/disable'), 'neon/projects/project-a/branches/br-a']) {
    const f = authDisableBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = authDisableBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = authDisableBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { accepted: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Auth disable: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = authDisableBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.disableNeonAuth', authDisableArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Auth disable: host identity/resource TOCTOU and data-erasure overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = authDisableBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = authDisableBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { delete_data: true }, { delete_data: false }, { retry: true }]) {
    const g = authDisableBroker();
    assert.equal((await g.common.broker().call('neon.disableNeonAuth', { ...authDisableArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Auth disable: complete/uncertain permanent journal blocks restart replay without completion proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = authDisableBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(n > 2 ? {} : authDisableMetadata, { status: n > 2 ? 404 : 200 });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Auth disable: integration drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: credentialCanary }, { auth_provider: 'stack' },
    { owned_by: 'user' }, { transfer_status: 'initiated' }, { pagination: {} }]) {
    const f = authDisableBroker(() => response({ ...authDisableMetadata, ...change }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = authDisableBroker((url, init) => response(init.method === 'DELETE' ? { error: credentialCanary } : authDisableMetadata));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Auth disable: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...authDisableScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80) };
  const f = authDisableBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

import { realtimeDisableFixture, realtimeDisableScope, realtimeDisableArgs } from './helpers.mjs';
function realtimeDisableBroker(value = null, overrides = {}, config = realtimeDisableScope) {
  const provider = realtimeDisableFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('disableProjectBranchRealtime').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.disableProjectBranchRealtime', args, context, key);
  } };
}
const realtimeDisableMetadata = { enabled: true, pending: false, revision: 7 };

test('Realtime disable: reserved exact-plan authority and exact disable AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = realtimeDisableBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/realtime/disable';
  for (const resource of [target.replace('/disable', ''), target.replace('br-a', 'other'), target.replace('project-a', 'other'),
    target.replace('/disable', '/secret'), target.replace('/disable', '/enable'), 'neon/projects/project-a/branches/br-a']) {
    const f = realtimeDisableBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = realtimeDisableBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = realtimeDisableBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { accepted: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Realtime disable: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = realtimeDisableBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.disableProjectBranchRealtime', realtimeDisableArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Realtime disable: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = realtimeDisableBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = realtimeDisableBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { expectedRevision: 8 }, { retry: true }]) {
    const g = realtimeDisableBroker();
    assert.equal((await g.common.broker().call('neon.disableProjectBranchRealtime', { ...realtimeDisableArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Realtime disable: complete/uncertain permanent journal blocks restart replay without completion proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = realtimeDisableBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 202 }); }
      return response(n > 2 ? { ...realtimeDisableMetadata, enabled: false } : realtimeDisableMetadata);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Realtime disable: foreign/state drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: credentialCanary }, { enabled: false },
    { pending: true }, { revision: 8 }, { pagination: {} }]) {
    const f = realtimeDisableBroker(() => response({ ...realtimeDisableMetadata, ...change }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = realtimeDisableBroker((url, init) => response(init.method === 'DELETE' ? { error: credentialCanary } : realtimeDisableMetadata,
    { status: init.method === 'DELETE' ? 202 : 200 }));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Realtime disable: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...realtimeDisableScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60),
    expectedRevision: 2147483647, revision: 'r'.repeat(80) };
  const f = realtimeDisableBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function dataAPIDeletionBroker(value = null, overrides = {}, config = dataAPIDeleteScope) {
  const provider = dataAPIDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, database_name: config.databaseName };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchDataAPI').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchDataAPI', args, context, key);
  } };
}
const dataAPIDeletionMetadata = { status: 'ready' };

test('Data API delete: reserved exact-plan authority and exact database/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = dataAPIDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/data-api/main/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('br-a', 'other'), target.replace('project-a', 'other'),
    target.replace('/main/', '/other/'), 'neon/projects/project-a/branches/br-a']) {
    const f = dataAPIDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = dataAPIDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = dataAPIDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Data API delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = dataAPIDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchDataAPI', dataAPIDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Data API delete: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = dataAPIDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = dataAPIDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { database_name: 'other' },
    { expectedStatus: 'other' }, { retry: true }]) {
    const g = dataAPIDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchDataAPI', { ...dataAPIDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Data API delete: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = dataAPIDeletionBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response({}); }
      return response(dataAPIDeletionMetadata, { status: ambiguous && n > 2 ? 404 : 200 });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Data API delete: foreign/status drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: 'other' }, { database_name: credentialCanary },
    { status: credentialCanary }, { status: 'other' }, { pagination: {} }]) {
    const f = dataAPIDeletionBroker(() => response({ ...dataAPIDeletionMetadata, ...change }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = dataAPIDeletionBroker((url, init) => response(init.method === 'DELETE' ? { error: credentialCanary } : dataAPIDeletionMetadata));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Data API delete: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...dataAPIDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60),
    databaseName: 'd'.repeat(63), expectedStatus: 's'.repeat(64), revision: 'r'.repeat(80) };
  const f = dataAPIDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function legacyOAuthProviderDeletionBroker(value = null, overrides = {}, config = legacyOAuthProviderDeleteScope) {
  const provider = legacyOAuthProviderDeleteFixture(value, config);
  const args = { project_id: config.projectId, oauth_provider_id: config.oauthProviderId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteNeonAuthOauthProvider').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteNeonAuthOauthProvider', args, context, key);
  } };
}
const legacyOAuthProviderDeletionList = { providers: [oauthProviderDeleteMetadata] };

test('legacy OAuth provider delete: reserved exact-plan authority and exact provider/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = legacyOAuthProviderDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/auth/legacy/oauth_providers/google/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('/auth/legacy', '/branches/br-a/auth'), target.replace('project-a', 'other'),
    target.replace('google', 'github'), target.replace('/legacy', ''), 'neon/projects/project-a/branches/br-a/auth/oauth_providers']) {
    const f = legacyOAuthProviderDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = legacyOAuthProviderDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = legacyOAuthProviderDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('legacy OAuth provider delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = legacyOAuthProviderDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteNeonAuthOauthProvider', legacyOAuthProviderDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('legacy OAuth provider delete: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = legacyOAuthProviderDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = legacyOAuthProviderDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { oauth_provider_id: 'github' },
    { expectedType: 'shared' }, { retry: true }]) {
    const g = legacyOAuthProviderDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteNeonAuthOauthProvider', { ...legacyOAuthProviderDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('legacy OAuth provider delete: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = legacyOAuthProviderDeletionBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(ambiguous && n > 2 ? { providers: [] } : legacyOAuthProviderDeletionList);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('legacy OAuth provider delete: malformed/foreign/type drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: 'other' }, { id: credentialCanary },
    { type: 'shared' }, { pagination: {} }]) {
    const f = legacyOAuthProviderDeletionBroker(() => response({ providers: [{ ...oauthProviderDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = legacyOAuthProviderDeletionBroker((url, init) => init.method === 'DELETE' ? response({ acknowledged: true, error: credentialCanary }) : response(legacyOAuthProviderDeletionList));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('legacy OAuth provider delete: maximum identity selection fits actual common prepared budgets', async () => {
  const config = { ...legacyOAuthProviderDeleteScope, projectId: 'p'.repeat(60),
    oauthProviderId: 'microsoft', revision: 'r'.repeat(80) };
  const f = legacyOAuthProviderDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function authDomainDeletionBroker(value = null, overrides = {}, config = authDomainDeleteScope) {
  const provider = authDomainDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, auth_provider: config.authProvider, domain: config.domain };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteBranchNeonAuthTrustedDomain').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteBranchNeonAuthTrustedDomain', args, context, key);
  } };
}
const authDomainDeletionList = { domains: [authDomainDeleteMetadata] };

test('Auth domain delete: reserved exact-plan authority and exact provider/origin/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = authDomainDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/auth/domains/better_auth/app.example.invalid/delete';
  for (const resource of [target.replace('/delete', ''), target.replace('br-a', 'other'), target.replace('project-a', 'other'),
    target.replace('better_auth', 'stack'), target.replace('app.example.invalid', 'other.invalid'), 'neon/projects/project-a/branches/br-a/auth/domains']) {
    const f = authDomainDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = authDomainDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = authDomainDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  safeEnvelope(f, result);
});

test('Auth domain delete: stale, wrong-target and unconsumable native evidence are isolated negative controls', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = authDomainDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteBranchNeonAuthTrustedDomain', authDomainDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Auth domain delete: host identity/resource TOCTOU and authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = authDomainDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = authDomainDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.call()).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { auth_provider: 'stack' },
    { domain: 'https://other.invalid' }, { domains: [] }, { retry: true }]) {
    const g = authDomainDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteBranchNeonAuthTrustedDomain', { ...authDomainDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Auth domain delete: complete/uncertain permanent journal blocks restart replay without enforcement proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = authDomainDeletionBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 200 }); }
      return response(ambiguous && n > 2 ? { domains: [] } : authDomainDeletionList);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Auth domain delete: malformed/foreign/provider drift and reflected lease strings cannot enter safe envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { branch_id: 'other' }, { domain: credentialCanary },
    { auth_provider: 'stack' }, { pagination: {} }]) {
    const f = authDomainDeletionBroker(() => response({ domains: [{ ...authDomainDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = authDomainDeletionBroker((url, init) => init.method === 'DELETE' ? response({ acknowledged: true, error: credentialCanary }) : response(authDomainDeletionList));
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safeEnvelope(f, result);
});

test('Auth domain delete: maximum origin and identity selection fits actual common prepared budgets', async () => {
  const config = { ...authDomainDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60),
    domain: 'https://' + 'a'.repeat(40) + '.' + 'b'.repeat(38), revision: 'r'.repeat(80) };
  const f = authDomainDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function objectDeletionBroker(value = null, overrides = {}, config = objectDeleteScope) {
  const provider = objectDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName, object_key: config.objectKey };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchBucketObject').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchBucketObject', args, context, key);
  } };
}
const objectDeletionList = { objects: [objectDeleteMetadata], folders: [], prefix: objectDeleteScope.objectKey, is_truncated: false };

test('Object delete: reserved authority and exact object/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = objectDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/buckets/assets/objects/docs/file.txt';
  for (const resource of [target, target + '/download', target.replace('br-a', 'other') + '/delete',
    target.replace('project-a', 'other') + '/delete', target.replace('assets', 'other') + '/delete',
    target.replace('file.txt', 'other.txt') + '/delete', 'neon/projects/project-a/branches/br-a/buckets/assets/delete']) {
    const f = objectDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = objectDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = objectDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('Object delete: native authorization rejects stale, wrong-target and unconsumable evidence independently', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = objectDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchBucketObject', objectDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Object delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = objectDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = objectDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchBucketObject', objectDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { bucket_name: 'other' }, { object_key: 'other' }, { expected_size: 0 }, { retry: true }]) {
    const g = objectDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchBucketObject', { ...objectDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Object delete: permanent journal blocks complete and uncertain replay after restart without deletion proof', async () => {
  for (const ambiguous of [false, true]) {
    const f = objectDeletionBroker((url, init, n) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response(ambiguous && n > 2 ? { ...objectDeletionList, objects: [] } : objectDeletionList);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Object delete: malformed/foreign/size drift refuses before deletion and secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { bucket_name: 'other' }, { key: credentialCanary }, { size: 124 }, { pagination: {} }]) {
    const f = objectDeletionBroker(() => response({ ...objectDeletionList, objects: [{ ...objectDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = objectDeletionBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ ...objectDeletionList, objects: [{ ...objectDeleteMetadata, etag: derivedCanary, last_modified: credentialCanary, error: credentialCanary }] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('Object delete: terminal pagination and early-hit later-page drift are enforced through common core', async () => {
  for (const drift of [false, true]) {
    const f = objectDeletionBroker((url, init, n) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
      response(n === 1 ? { ...objectDeletionList, is_truncated: true, next_cursor: 'next' } :
        { ...objectDeletionList, objects: [], ...(drift ? { branch_id: 'other' } : {}) }));
    const result = await f.call();
    assert.equal(result.ok, !drift);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, drift ? 0 : 1);
    safeEnvelope(f, result);
  }
});

test('Object delete: exact 256-character resource and maximum size fit common prepared budgets', async () => {
  const config = { ...objectDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 's'.repeat(7), objectKey: 'k'.repeat(80),
    expectedSize: Number.MAX_SAFE_INTEGER, revision: 'r'.repeat(80) };
  const f = objectDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function bucketDeletionBroker(value = null, overrides = {}, config = bucketDeleteScope) {
  const provider = bucketDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchBucket').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchBucket', args, context, key);
  } };
}

test('Bucket delete: reserved authority and exact bucket/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = bucketDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/buckets/assets';
  for (const resource of [target, target + '/reveal', target.replace('br-a', 'other') + '/delete',
    target.replace('project-a', 'other') + '/delete', target.replace('assets', 'other') + '/delete',
    'neon/projects/project-a/branches/br-a/credentials']) {
    const f = bucketDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = bucketDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = bucketDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('Bucket delete: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = bucketDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchBucket', bucketDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Bucket delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = bucketDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = bucketDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchBucket', bucketDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { bucket_name: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = bucketDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchBucket', { ...bucketDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Bucket delete: permanent journal blocks complete and uncertain replay after restart without claiming independent deletion', async () => {
  for (const ambiguous of [false, true]) {
    const f = bucketDeletionBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response({ buckets: [bucketDeleteMetadata] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Bucket delete: malformed/foreign list refuses before deletion; secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { name: credentialCanary }, { pagination: {} }]) {
    const f = bucketDeletionBroker(() => response({ buckets: [{ ...bucketDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = bucketDeletionBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ buckets: [{ ...bucketDeleteMetadata, created_at: derivedCanary, objects: credentialCanary, error: credentialCanary }] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('Bucket delete: maximum copied project/branch/bucket names fit common budgets', async () => {
  const config = { ...bucketDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 's'.repeat(60), revision: 'r'.repeat(80) };
  const f = bucketDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function functionDeletionBroker(value = null, overrides = {}, config = functionDeleteScope) {
  const provider = functionDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, slug: config.functionSlug };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchFunction').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchFunction', args, context, key);
  } };
}

test('Function delete: reserved authority and exact function/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = functionDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/functions/hello';
  for (const resource of [target, target + '/reveal', target.replace('br-a', 'other') + '/delete',
    target.replace('project-a', 'other') + '/delete', target.replace('hello', 'other') + '/delete',
    'neon/projects/project-a/branches/br-a/credentials']) {
    const f = functionDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = functionDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = functionDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('Function delete: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = functionDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchFunction', functionDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Function delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = functionDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = functionDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchFunction', functionDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { slug: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = functionDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchFunction', { ...functionDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Function delete: permanent journal blocks complete and uncertain replay after restart without claiming invocation refusal', async () => {
  for (const ambiguous of [false, true]) {
    const f = functionDeletionBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response({ function: functionDeleteMetadata });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Function delete: malformed/foreign detail refuses before deletion; secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { id: credentialCanary }, { pagination: {} }]) {
    const f = functionDeletionBroker(() => response({ function: { ...functionDeleteMetadata, ...change } }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = functionDeletionBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ function: { ...functionDeleteMetadata, name: derivedCanary, invocation_url: credentialCanary, current_deployment: { error: credentialCanary } } }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('Function delete: maximum copied project/branch/function IDs fit common budgets', async () => {
  const config = { ...functionDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), functionId: 'f'.repeat(80),
    functionSlug: 's'.repeat(20), revision: 'r'.repeat(80) };
  const f = functionDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function triggerDeletionBroker(value = null, overrides = {}, config = triggerDeleteScope) {
  const provider = triggerDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, trigger_id: config.triggerId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchTrigger').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchTrigger', args, context, key);
  } };
}

test('Trigger delete: reserved authority and exact trigger/delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = triggerDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/triggers/tr-a';
  for (const resource of [target, target + '/reveal', target.replace('br-a', 'other') + '/delete',
    target.replace('project-a', 'other') + '/delete', target.replace('tr-a', 'other') + '/delete',
    'neon/projects/project-a/branches/br-a/credentials']) {
    const f = triggerDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = triggerDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = triggerDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('Trigger delete: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = triggerDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchTrigger', triggerDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('Trigger delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = triggerDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = triggerDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchTrigger', triggerDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { trigger_id: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = triggerDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchTrigger', { ...triggerDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('Trigger delete: permanent journal blocks complete and uncertain replay after restart without cancelling committed invocations', async () => {
  for (const ambiguous of [false, true]) {
    const f = triggerDeletionBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response({ trigger: triggerDeleteMetadata });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('Trigger delete: malformed/foreign detail refuses before deletion; secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { trigger_id: credentialCanary }, { pagination: {} }]) {
    const f = triggerDeletionBroker(() => response({ trigger: { ...triggerDeleteMetadata, ...change } }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = triggerDeletionBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ trigger: { ...triggerDeleteMetadata, name: derivedCanary, function_path: credentialCanary, schedule: { cron: credentialCanary } } }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('Trigger delete: maximum copied project/branch/opaque IDs fit common budgets', async () => {
  for (const expectedInherited of [false, true]) {
    const config = { ...triggerDeleteScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), triggerId: 't'.repeat(80),
      functionSlug: 'f'.repeat(20), expectedVersion: Number.MAX_SAFE_INTEGER, expectedType: 'storage_object_created',
      expectedInherited, revision: 'r'.repeat(80) };
    const f = triggerDeletionBroker(null, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    safeEnvelope(f, result);
  }
});

function jwksDeletionBroker(value = null, overrides = {}, config = jwksDeleteScope) {
  const provider = jwksDeleteFixture(value, config);
  const args = { project_id: config.projectId, jwks_id: config.jwksId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectJWKS').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectJWKS', args, context, key);
  } };
}

test('JWKS delete: reserved authority and exact delete AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = jwksDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/jwks/jwks-a';
  for (const resource of [target, target + '/read', target.replace('project-a', 'other') + '/delete',
    target.replace('jwks-a', 'other') + '/delete', 'neon/projects/project-a/jwks', 'neon/projects/project-a/delete']) {
    const f = jwksDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = jwksDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = jwksDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { ...jwksDeleteMetadata, acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('JWKS delete: native authorization independently rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = jwksDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectJWKS', jwksDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('JWKS delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = jwksDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = jwksDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectJWKS', jwksDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { jwks_id: 'other' }, { branch_id: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = jwksDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectJWKS', { ...jwksDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('JWKS delete: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = jwksDeletionBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response(jwksDeleteMetadata); }
      return response({ jwks: [jwksDeleteMetadata] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('JWKS delete: foreign/reassociated/paginated preflight refuses; secret-bearing extras never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { id: credentialCanary }, { pagination: {} }]) {
    const f = jwksDeletionBroker(() => response({ jwks: [{ ...jwksDeleteMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const value = { ...jwksDeleteMetadata, jwks_url: credentialCanary, provider_name: derivedCanary, role_names: [credentialCanary] };
  const f = jwksDeletionBroker((url, init) => response(init.method === 'DELETE' ? value : { jwks: [value] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('JWKS delete: maximum copied IDs and project-wide binding fit common budgets', async () => {
  for (const branchId of [null, 'b'.repeat(60)]) {
    const config = { projectId: 'p'.repeat(60), branchId, jwksId: 'j'.repeat(80), revision: 'r'.repeat(80) };
    const f = jwksDeletionBroker(null, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    safeEnvelope(f, result);
  }
});

function authClientDeletionBroker(value = null, overrides = {}, config = authClientDeleteScope) {
  const provider = authClientDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, client_id: config.clientId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteNeonAuthOAuthClient').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteNeonAuthOAuthClient', args, context, key);
  } };
}

test('OAuth client delete: reserved authority and exact credential/revoke AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = authClientDeletionBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients/clientA';
  for (const resource of [target, target + '/reveal', target.replace('br-a', 'other') + '/delete',
    target.replace('project-a', 'other') + '/delete', target.replace('clientA', 'other') + '/delete',
    'neon/projects/project-a/branches/br-a/credentials']) {
    const f = authClientDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = authClientDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = authClientDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('OAuth client delete: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = authClientDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteNeonAuthOAuthClient', authClientDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('OAuth client delete: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = authClientDeletionBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = authClientDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteNeonAuthOAuthClient', authClientDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { client_id: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = authClientDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteNeonAuthOAuthClient', { ...authClientDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('OAuth client delete: permanent journal blocks complete and uncertain replay after restart despite provider idempotence', async () => {
  for (const ambiguous of [false, true]) {
    const f = authClientDeletionBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response(authClientDeleteMetadata);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('OAuth client delete: malformed/foreign detail refuses before deletion; secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { client_id: credentialCanary }, { pagination: {} }]) {
    const f = authClientDeletionBroker(() => response({ ...authClientDeleteMetadata, ...change }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = authClientDeletionBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ ...authClientDeleteMetadata, client_secret: credentialCanary, name: derivedCanary, redirect_uris: [credentialCanary] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('OAuth client delete: maximum copied project/branch/opaque IDs fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), clientId: 'c'.repeat(64), revision: 'r'.repeat(80) };
  const f = authClientDeletionBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function projectMemberRoleRemovalBroker(value, overrides = {}, config = projectMemberRoleRemoveScope) {
  const provider = projectMemberRoleRemoveFixture(value, config);
  const args = { project_id: config.projectId, member_id: config.memberId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('removeProjectMemberRole').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.removeProjectMemberRole', args, context, key);
  } };
}

test('project member role remove: reserved authority and exact member/role/remove AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = projectMemberRoleRemovalBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = `neon/projects/project-a/members/${projectMemberRoleRemoveScope.memberId}`;
  for (const resource of [target, target + '/role', target + '/remove', target.replace('project-a', 'other') + '/role/remove',
    target.replace(projectMemberRoleRemoveScope.memberId, projectMemberRoleRemoveScope.userId) + '/remove', 'neon/projects/project-a/members']) {
    const f = projectMemberRoleRemovalBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = projectMemberRoleRemovalBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = projectMemberRoleRemovalBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { member_id: projectMemberRoleRemoveScope.memberId, acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('project member role remove: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = projectMemberRoleRemovalBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.removeProjectMemberRole', projectMemberRoleRemoveArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('project member role remove: identity/resource TOCTOU and caller target/authority overrides refuse', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = projectMemberRoleRemovalBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = projectMemberRoleRemovalBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.removeProjectMemberRole', projectMemberRoleRemoveArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { member_id: projectMemberRoleRemoveScope.userId }, { user_id: 'user-a' }, { role: 'admin' }, { retry: true }]) {
    const g = projectMemberRoleRemovalBroker();
    assert.equal((await g.common.broker().call('neon.removeProjectMemberRole', { ...projectMemberRoleRemoveArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('project member role remove: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = projectMemberRoleRemovalBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response(projectMemberRoleRemoveReceipt); }
      return response({ project_members: [projectMemberRoleRemoveMetadata] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('project member role remove: wrong response identities stay uncertain; profile/default access never enter envelopes', async () => {
  for (const change of [{ project_id: 'other' }, { member_id: projectMemberRoleRemoveScope.userId }, { user_id: projectMemberRoleRemoveScope.memberId }, { org_role: 'admin' }, { pagination: {} }]) {
    const f = projectMemberRoleRemovalBroker({ ...projectMemberRoleRemoveReceipt, ...change });
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = projectMemberRoleRemovalBroker((url, init) => response(init.method === 'DELETE' ? {
    ...projectMemberRoleRemoveReceipt, effective_project_permission: 'EDITOR', credential_rotation_recommended: true,
    email: credentialCanary, name: derivedCanary } : { project_members: [{ ...projectMemberRoleRemoveMetadata, email: credentialCanary, name: derivedCanary }] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { member_id: projectMemberRoleRemoveScope.memberId, acknowledged: true });
  safeEnvelope(f, result);
});

test('project member role remove: maximum copied organization, UUID and plan fields fit common budgets', async () => {
  const config = { ...projectMemberRoleRemoveScope, projectId: 'p'.repeat(60), expectedOrgRole: 'collaborator', revision: 'r'.repeat(80) };
  const f = projectMemberRoleRemovalBroker(undefined, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function organizationMemberRemovalBroker(value = {}, overrides = {}, config = organizationMemberRemoveScope) {
  const provider = organizationMemberRemoveFixture(value, config);
  const args = { org_id: config.organizationId, member_id: config.memberId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('removeOrganizationMember').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.removeOrganizationMember', args, context, key);
  } };
}

test('organization member remove: reserved authority and exact member/remove AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = organizationMemberRemovalBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = `neon/organizations/org-a/members/${organizationMemberRemoveScope.memberId}`;
  for (const resource of [target, target + '/role', target.replace('org-a', 'other') + '/remove',
    target.replace(organizationMemberRemoveScope.memberId, organizationMemberRemoveScope.userId) + '/remove', 'neon/organizations/org-a/members']) {
    const f = organizationMemberRemovalBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = organizationMemberRemovalBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = organizationMemberRemovalBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { member_id: organizationMemberRemoveScope.memberId, acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('organization member remove: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = organizationMemberRemovalBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.removeOrganizationMember', organizationMemberRemoveArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('organization member remove: identity/resource TOCTOU and caller target/authority overrides refuse', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = organizationMemberRemovalBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = organizationMemberRemovalBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.removeOrganizationMember', organizationMemberRemoveArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { org_id: 'other' }, { member_id: organizationMemberRemoveScope.userId }, { user_id: 'user-a' }, { role: 'admin' }, { retry: true }]) {
    const g = organizationMemberRemovalBroker();
    assert.equal((await g.common.broker().call('neon.removeOrganizationMember', { ...organizationMemberRemoveArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('organization member remove: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = organizationMemberRemovalBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response({}); }
      return response(organizationMemberRemoveMetadata);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('organization member remove: nonempty echoes stay uncertain; profile/timestamps never enter envelopes', async () => {
  for (const raw of [{ id: credentialCanary }, { org_id: 'other' }, { user_id: credentialCanary }, { pagination: {} }]) {
    const f = organizationMemberRemovalBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = organizationMemberRemovalBroker((url, init) => response(init.method === 'DELETE' ? {} : {
    ...organizationMemberRemoveMetadata, email: credentialCanary, name: derivedCanary, joined_at: credentialCanary }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('organization member remove: maximum copied organization, UUID and plan fields fit common budgets', async () => {
  const config = { ...organizationMemberRemoveScope, organizationId: 'p'.repeat(60), expectedRole: 'collaborator', revision: 'r'.repeat(80) };
  const f = organizationMemberRemovalBroker({}, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function permissionRevocationBroker(value = permissionRevokeReceipt, overrides = {}, config = permissionRevokeScope) {
  const provider = permissionRevokeFixture(value, config);
  const args = { project_id: config.projectId, permission_id: config.permissionId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('revokePermissionFromProject').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.revokePermissionFromProject', args, context, key);
  } };
}

test('permission revoke: reserved authority and exact project/permission/revoke AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = permissionRevocationBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a/permissions', 'neon/projects/project-a/permissions/permission-a',
    'neon/projects/other/permissions/permission-a/revoke', 'neon/projects/project-a/permissions/other/revoke', 'neon/projects/project-a/members/permission-a/revoke']) {
    const f = permissionRevocationBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = permissionRevocationBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = permissionRevocationBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'permission-a', acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('permission revoke: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = permissionRevocationBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.revokePermissionFromProject', permissionRevokeArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('permission revoke: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = permissionRevocationBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = permissionRevocationBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.revokePermissionFromProject', permissionRevokeArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { permission_id: 'other' }, { user_id: 'user-a' }, { email: 'not-an-email' }, { retry: true }]) {
    const g = permissionRevocationBroker();
    assert.equal((await g.common.broker().call('neon.revokePermissionFromProject', { ...permissionRevokeArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('permission revoke: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = permissionRevocationBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response(permissionRevokeReceipt); }
      return response({ project_permissions: [permissionRevokeReceipt] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('permission revoke: reassociated echoes stay uncertain; email/timestamps never enter envelopes', async () => {
  for (const raw of [{ id: credentialCanary }, { ...permissionRevokeReceipt, project_id: 'other' },
    { ...permissionRevokeReceipt, branch_id: credentialCanary }, { ...permissionRevokeReceipt, pagination: {} }]) {
    const f = permissionRevocationBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = permissionRevocationBroker({ ...permissionRevokeReceipt, granted_to_email: credentialCanary, granted_at: derivedCanary, revoked_at: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('permission revoke: maximum copied project/permission IDs fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), permissionId: 'p'.repeat(80), revision: 'r'.repeat(80) };
  const f = permissionRevocationBroker({ id: config.permissionId }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function credentialRevocationBroker(value = null, overrides = {}, config = credentialRevokeScope) {
  const provider = credentialRevokeFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, token_id: config.tokenId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('revokeCredential').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.revokeCredential', args, context, key);
  } };
}

test('credential revoke: reserved authority and exact credential/revoke AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = credentialRevocationBroker(null, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const target = 'neon/projects/project-a/branches/br-a/credentials/credential-id-fixture';
  for (const resource of [target, target + '/reveal', target.replace('br-a', 'other') + '/revoke',
    target.replace('project-a', 'other') + '/revoke', target.replace('credential-id-fixture', 'other') + '/revoke',
    'neon/projects/project-a/branches/br-a/credentials']) {
    const f = credentialRevocationBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = credentialRevocationBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = credentialRevocationBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('credential revoke: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = credentialRevocationBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.revokeCredential', credentialRevokeArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('credential revoke: identity/resource TOCTOU and caller authority/target overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = credentialRevocationBroker(null, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = credentialRevocationBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.revokeCredential', credentialRevokeArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { project_id: 'other' }, { branch_id: 'other' }, { token_id: 'other' }, { token: 'not-a-token' }, { retry: true }]) {
    const g = credentialRevocationBroker();
    assert.equal((await g.common.broker().call('neon.revokeCredential', { ...credentialRevokeArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('credential revoke: permanent journal blocks complete and uncertain replay after restart despite provider idempotence', async () => {
  for (const ambiguous of [false, true]) {
    const f = credentialRevocationBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return new Response(null, { status: 204 }); }
      return response({ credentials: [credentialRevokeMetadata] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('credential revoke: missing/foreign anchors and platform principals refuse; secrets never enter envelopes', async () => {
  for (const change of [{ branch_id: 'other' }, { project_id: 'other' }, { branch_id: undefined }, { principal_type: 'system' }, { token_id: credentialCanary }]) {
    const f = credentialRevocationBroker(() => response({ credentials: [{ ...credentialRevokeMetadata, ...change }] }));
    const result = await f.call();
    assert.equal(result.ok, false);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
    safeEnvelope(f, result);
  }
  const f = credentialRevocationBroker((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ credentials: [{ ...credentialRevokeMetadata, api_token: credentialCanary, s3_secret_access_key: derivedCanary, scopes: ['future:scope'] }] }));
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('credential revoke: maximum copied project/branch/opaque IDs fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), tokenId: 'c'.repeat(80), revision: 'r'.repeat(80) };
  const f = credentialRevocationBroker(null, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function organizationKeyRevocationBroker(value = organizationKeyRevokeReceipt, overrides = {}, config = organizationKeyRevokeScope) {
  const provider = organizationKeyRevokeFixture(value, config);
  const args = { org_id: config.organizationId, key_id: config.keyId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('revokeOrgApiKey').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.revokeOrgApiKey', args, context, key);
  } };
}

test('organization key revoke: reserved authority and exact organization/key/revoke AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = organizationKeyRevocationBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/organizations/org-a/api_keys', 'neon/organizations/org-a/api_keys/123',
    'neon/organizations/other/api_keys/123/revoke', 'neon/organizations/org-a/api_keys/456/revoke', 'neon/users/org-a/api_keys/123/revoke']) {
    const f = organizationKeyRevocationBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = organizationKeyRevocationBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = organizationKeyRevocationBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 123, acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('organization key revoke: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = organizationKeyRevocationBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.revokeOrgApiKey', organizationKeyRevokeArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('organization key revoke: identity/resource TOCTOU and caller authority/key overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = organizationKeyRevocationBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = organizationKeyRevocationBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.revokeOrgApiKey', organizationKeyRevokeArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { org_id: 'other' }, { key_id: 456 }, { user_id: 'user-a' }, { key: 'not-a-token' }, { retry: true }]) {
    const g = organizationKeyRevocationBroker();
    assert.equal((await g.common.broker().call('neon.revokeOrgApiKey', { ...organizationKeyRevokeArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('organization key revoke: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = organizationKeyRevocationBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response(organizationKeyRevokeReceipt); }
      return response([{ id: 123 }]);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('organization key revoke: reassociated and unconfirmed echoes stay uncertain; secrets never enter envelopes', async () => {
  for (const raw of [{ ...organizationKeyRevokeReceipt, id: credentialCanary }, { ...organizationKeyRevokeReceipt, org_id: 'other' },
    { ...organizationKeyRevokeReceipt, user_id: credentialCanary }, { ...organizationKeyRevokeReceipt, revoked: false }]) {
    const f = organizationKeyRevocationBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = organizationKeyRevocationBroker({ ...organizationKeyRevokeReceipt, key: credentialCanary, name: derivedCanary, created_by: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('organization key revoke: maximum copied organization/key IDs fit common budgets', async () => {
  const config = { organizationId: 'o'.repeat(60), keyId: Number.MAX_SAFE_INTEGER, revision: 'r'.repeat(80) };
  const f = organizationKeyRevocationBroker({ id: config.keyId, revoked: true }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function userKeyRevocationBroker(value = userKeyRevokeReceipt, overrides = {}, config = userKeyRevokeScope) {
  const provider = userKeyRevokeFixture(value, config);
  const args = { user_id: config.userId, key_id: config.keyId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('revokeApiKey').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.revokeApiKey', args, context, key);
  } };
}

test('user key revoke: reserved authority and exact user/key/revoke AND agent grant precede credentials', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = userKeyRevocationBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/users/user-a/api_keys', 'neon/users/user-a/api_keys/123',
    'neon/users/other/api_keys/123/revoke', 'neon/users/user-a/api_keys/456/revoke', 'neon/organizations/user-a/api_keys/123/revoke']) {
    const f = userKeyRevocationBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = userKeyRevocationBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = userKeyRevocationBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 123, acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('user key revoke: native authorization rejects stale, wrong-target and unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = userKeyRevocationBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.revokeApiKey', userKeyRevokeArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('user key revoke: identity/resource TOCTOU and caller authority/key overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = userKeyRevocationBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = userKeyRevocationBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.revokeApiKey', userKeyRevokeArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { user_id: 'other' }, { key_id: 456 }, { org_id: 'org-a' }, { key: 'not-a-token' }, { retry: true }]) {
    const g = userKeyRevocationBroker();
    assert.equal((await g.common.broker().call('neon.revokeApiKey', { ...userKeyRevokeArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('user key revoke: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = userKeyRevocationBroker((url, init) => {
      if (init.method === 'DELETE') { if (ambiguous) throw Error(credentialCanary); return response(userKeyRevokeReceipt); }
      return response(new URL(url).pathname.endsWith('/users/me') ? { id: 'user-a' } : [{ id: 123 }]);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('user key revoke: reassociated and unconfirmed echoes stay uncertain; secrets never enter envelopes', async () => {
  for (const raw of [{ ...userKeyRevokeReceipt, id: credentialCanary }, { ...userKeyRevokeReceipt, user_id: 'other' },
    { ...userKeyRevokeReceipt, org_id: credentialCanary }, { ...userKeyRevokeReceipt, revoked: false }]) {
    const f = userKeyRevocationBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = userKeyRevocationBroker({ ...userKeyRevokeReceipt, key: credentialCanary, name: derivedCanary, created_by: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('user key revoke: maximum copied user/key IDs fit common budgets', async () => {
  const config = { userId: 'u'.repeat(80), keyId: Number.MAX_SAFE_INTEGER, revision: 'r'.repeat(80) };
  const f = userKeyRevocationBroker({ id: config.keyId, revoked: true }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function roleDeletionBroker(value = roleDeleteReceipt, overrides = {}, config = roleDeleteScope) {
  const provider = roleDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, role_name: config.roleName };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchRole').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchRole', args, context, key);
  } };
}

test('role deletion: reserved exact agent AND delete grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = roleDeletionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a/branches/br-a/roles/reader', 'neon/projects/project-a/delete',
    'neon/projects/project-a/branches/br-a/delete', 'neon/projects/project-a/branches/br-a/roles/other/delete',
    'neon/projects/project-a/branches/br-other/roles/reader/delete', 'neon/projects/project-a/branches/br-a/databases/reader/delete']) {
    const f = roleDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = roleDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = roleDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'reader', branch_id: 'br-a', acknowledged: true,
    operations: roleDeleteReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('role deletion: native authorization rejects stale, wrong target or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = roleDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchRole', roleDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('role deletion: identity/resource TOCTOU and caller fingerprint/SQL/cascade overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = roleDeletionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = roleDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchRole', roleDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { expected_created_at: roleDeleteScope.expectedCreatedAt }, { sql: 'DROP ROLE reader' }, { cascade: true }, { force: true }, { role_name: 'other' }]) {
    const g = roleDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchRole', { ...roleDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('role deletion: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = roleDeletionBroker((url, init) => {
      if (init.method === 'DELETE' && ambiguous) throw Error(credentialCanary);
      return response(roleDeleteReceipt);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('role deletion: reflected/protected/reassociated echoes retain uncertainty and safe envelopes', async () => {
  for (const raw of [{ ...roleDeleteReceipt, role: { ...roleDeleteReceipt.role, name: credentialCanary } },
    { ...roleDeleteReceipt, role: { ...roleDeleteReceipt.role, protected: true } },
    { ...roleDeleteReceipt, role: { ...roleDeleteReceipt.role, created_at: '2026-11-09T10:00:00Z' } },
    { ...roleDeleteReceipt, operations: [{ ...roleDeleteReceipt.operations[0], project_id: credentialCanary }] }]) {
    const f = roleDeletionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = roleDeletionBroker({ ...roleDeleteReceipt, password: credentialCanary,
    role: { ...roleDeleteReceipt.role, password: credentialCanary, connection_uri: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('role deletion: maximum copied IDs, role name and creation fingerprint fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'br-' + 'b'.repeat(57), roleName: 'R'.repeat(63),
    expectedCreatedAt: '2026-11-08T10:00:00.123456789+00:00', revision: 'r'.repeat(80) };
  const f = roleDeletionBroker({ role: { name: config.roleName, branch_id: config.branchId, created_at: config.expectedCreatedAt, protected: false }, operations: [] }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function databaseDeletionBroker(value = databaseDeleteReceipt, overrides = {}, config = databaseDeleteScope) {
  const provider = databaseDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, database_name: config.databaseName };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranchDatabase').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranchDatabase', args, context, key);
  } };
}

test('database deletion: reserved exact agent AND delete grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = databaseDeletionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a/branches/br-a/databases/main', 'neon/projects/project-a/delete',
    'neon/projects/project-a/branches/br-a/delete', 'neon/projects/project-a/branches/br-a/databases/other/delete',
    'neon/projects/project-a/branches/br-other/databases/main/delete']) {
    const f = databaseDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = databaseDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = databaseDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 123, branch_id: 'br-a', acknowledged: true,
    operations: databaseDeleteReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('database deletion: native authorization rejects stale, wrong target or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = databaseDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranchDatabase', databaseDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('database deletion: identity/resource TOCTOU and caller ID/SQL/cascade overrides refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = databaseDeletionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = databaseDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranchDatabase', databaseDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { database_id: 123 }, { sql: 'DROP DATABASE main' }, { cascade: true }, { force: true }, { database_name: 'other' }]) {
    const g = databaseDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranchDatabase', { ...databaseDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('database deletion: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = databaseDeletionBroker((url, init) => {
      if (init.method === 'DELETE' && ambiguous) throw Error(credentialCanary);
      return response(databaseDeleteReceipt);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('database deletion: malformed/reflected or reassociated echoes retain uncertainty and safe envelopes', async () => {
  for (const raw of [{ ...databaseDeleteReceipt, database: { ...databaseDeleteReceipt.database, name: credentialCanary } },
    { ...databaseDeleteReceipt, database: { ...databaseDeleteReceipt.database, id: 456 } },
    { ...databaseDeleteReceipt, operations: [{ ...databaseDeleteReceipt.operations[0], project_id: credentialCanary }] }]) {
    const f = databaseDeletionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = databaseDeletionBroker({ ...databaseDeleteReceipt, password: credentialCanary,
    database: { ...databaseDeleteReceipt.database, owner_name: credentialCanary, connection_uri: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('database deletion: maximum copied IDs and database name fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'br-' + 'b'.repeat(57), databaseName: 'D'.repeat(63),
    databaseId: Number.MAX_SAFE_INTEGER, revision: 'r'.repeat(80) };
  const f = databaseDeletionBroker({ database: { id: config.databaseId, branch_id: config.branchId, name: config.databaseName }, operations: [] }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

function projectDeletionBroker(value = projectDeleteReceipt, overrides = {}, config = projectDeleteScope) {
  const provider = projectDeleteFixture(value, config);
  const args = { project_id: config.projectId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProject').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProject', args, context, key);
  } };
}

test('project deletion: reserved exact agent AND delete grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = projectDeletionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/rename', 'neon/projects/project-b/delete',
    'neon/projects/project-a/branches/br-a/delete', 'neon/organizations/org-a']) {
    const f = projectDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = projectDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = projectDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'project-a', acknowledged: true });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('project deletion: native authorization rejects stale, wrong target or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = projectDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProject', projectDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('project deletion: identity/resource TOCTOU and caller ownership/cascade/force refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = projectDeletionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = projectDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProject', projectDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { owner_id: 'org-a' }, { org_id: 'org-a' }, { cascade: false }, { force: true }, { project_id: 'project-b' }]) {
    const g = projectDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProject', { ...projectDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('project deletion: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = projectDeletionBroker((url, init) => {
      if (init.method === 'DELETE' && ambiguous) throw Error(credentialCanary);
      return response(projectDeleteReceipt);
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('project deletion: malformed/reflected owner echoes retain uncertainty and omit unused secret fields', async () => {
  for (const raw of [{ project: { ...projectDeleteReceipt.project, owner_id: credentialCanary } },
    { project: { ...projectDeleteReceipt.project, id: 'project-other' } }]) {
    const f = projectDeletionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = projectDeletionBroker({ password: credentialCanary,
    project: { ...projectDeleteReceipt.project, name: credentialCanary, proxy_host: derivedCanary, owner: { email: credentialCanary } } });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('project deletion: maximum copied project and organization fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), organizationId: 'o'.repeat(60), revision: 'r'.repeat(80) };
  const f = projectDeletionBroker({ project: { id: config.projectId, owner_id: config.organizationId } }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.projectId, acknowledged: true });
  safeEnvelope(f, result);
});

function branchDeletionBroker(value = branchDeleteReceipt, overrides = {}, config = branchDeleteScope) {
  const provider = branchDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectBranch').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectBranch', args, context, key);
  } };
}

test('branch deletion: reserved exact agent AND delete grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = branchDeletionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-a/rename', 'neon/projects/project-a/branches/br-b/delete',
    'neon/projects/project-a/branches/br-a/endpoints/ep-a/delete']) {
    const f = branchDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = branchDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = branchDeletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'br-a', acknowledged: true, operations: branchDeleteReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('branch deletion: native authorization rejects stale, wrong target or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = branchDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectBranch', branchDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('branch deletion: identity/resource TOCTOU and caller force/protection/cascade refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = branchDeletionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = branchDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectBranch', branchDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { protected: false }, { default: false }, { cascade: true }, { force: true }, { branch_id: 'br-b' }]) {
    const g = branchDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectBranch', { ...branchDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('branch deletion: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = branchDeletionBroker((url, init) => {
      if (init.method === 'DELETE') {
        if (ambiguous) throw Error(credentialCanary);
        return response(branchDeleteReceipt);
      }
      return response({ branch: branchDeleteReceipt.branch });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('branch deletion: malformed/reflected observations retain uncertainty and omit unused secret fields', async () => {
  for (const raw of [{ ...branchDeleteReceipt, operations: [{ ...branchDeleteReceipt.operations[0], status: credentialCanary }] },
    { ...branchDeleteReceipt, branch: { ...branchDeleteReceipt.branch, parent_id: 'br-other' } }]) {
    const f = branchDeletionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = branchDeletionBroker({ ...branchDeleteReceipt, password: credentialCanary,
    operations: branchDeleteReceipt.operations.map(op => ({ ...op, error: credentialCanary, action: derivedCanary })) });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('branch deletion: maximum copied target and bounded operation observations fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: `br-${'b'.repeat(57)}`, parentId: `br-${'a'.repeat(57)}`, revision: 'r'.repeat(80) };
  const operations = Array.from({ length: 30 }, (_, n) => ({ id: `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`,
    project_id: config.projectId, branch_id: config.branchId, status: 'running' }));
  const f = branchDeletionBroker({ branch: { id: config.branchId, project_id: config.projectId, parent_id: config.parentId }, operations }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.branchId, acknowledged: true, operations: operations.map(({ id, status }) => ({ id, status })) });
  safeEnvelope(f, result);
});

function endpointDeletionBroker(value = endpointDeleteReceipt, overrides = {}, config = endpointDeleteScope) {
  const provider = endpointDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteProjectEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteProjectEndpoint', args, context, key);
  } };
}

test('endpoint deletion: reserved authority and exact agent AND suspend grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = endpointDeletionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/endpoints/ep-a',
    'neon/projects/project-a/branches/br-a/endpoints/ep-a/rename', 'neon/projects/project-a/branches/br-a/endpoints/ep-a/suspend', 'neon/projects/project-a/branches/br-b/endpoints/ep-a/delete',
    'neon/projects/project-a/branches/br-a/endpoints/ep-b/delete']) {
    const f = endpointDeletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = endpointDeletionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = endpointDeletionBroker({ ...endpointDeleteReceipt, endpoint: { ...endpointDeleteReceipt.endpoint, host: credentialCanary, settings: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'ep-a', acknowledged: true, operations: endpointDeleteReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('endpoint deletion: native authorization rejects wrong target, stale or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = endpointDeletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.deleteProjectEndpoint', endpointDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('endpoint deletion: identity/resource TOCTOU and caller configuration or authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = endpointDeletionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = endpointDeletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.deleteProjectEndpoint', endpointDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { disabled: true }, { action: 'start' }, { settings: {} }, { branch_id: 'br-b' }]) {
    const g = endpointDeletionBroker();
    assert.equal((await g.common.broker().call('neon.deleteProjectEndpoint', { ...endpointDeleteArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('endpoint deletion: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = endpointDeletionBroker((url, init) => {
      if (init.method === 'DELETE') {
        if (ambiguous) throw Error(credentialCanary);
        return response(endpointDeleteReceipt);
      }
      return response({ endpoint: endpointDeleteReceipt.endpoint });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('endpoint deletion: malformed/reflected observations retain uncertainty and omit unused secret fields', async () => {
  for (const raw of [{ ...endpointDeleteReceipt, operations: [{ ...endpointDeleteReceipt.operations[0], status: credentialCanary }] },
    { ...endpointDeleteReceipt, endpoint: { ...endpointDeleteReceipt.endpoint, branch_id: 'br-b' } }]) {
    const f = endpointDeletionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = endpointDeletionBroker({ ...endpointDeleteReceipt, password: credentialCanary,
    operations: endpointDeleteReceipt.operations.map(op => ({ ...op, error: credentialCanary, action: derivedCanary })) });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('endpoint deletion: maximum copied target and bounded operation observations fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: `br-${'b'.repeat(57)}`, endpointId: `ep-${'e'.repeat(57)}`, revision: 'r'.repeat(80) };
  const operations = Array.from({ length: 30 }, (_, n) => ({ id: `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`,
    project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId, status: 'running' }));
  const f = endpointDeletionBroker({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId }, operations }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.endpointId, acknowledged: true, operations: operations.map(({ id, status }) => ({ id, status })) });
  safeEnvelope(f, result);
});

function startBroker(value = endpointStartReceipt, overrides = {}, config = endpointStartScope) {
  const provider = endpointStartFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('startProjectEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.startProjectEndpoint', args, context, key);
  } };
}

test('endpoint start: reserved authority and exact agent AND start grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = startBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/endpoints/ep-a',
    'neon/projects/project-a/branches/br-a/endpoints/ep-a/rename', 'neon/projects/project-a/branches/br-a/endpoints/ep-a/suspend', 'neon/projects/project-a/branches/br-a/endpoints/ep-a/delete', 'neon/projects/project-a/branches/br-b/endpoints/ep-a/start',
    'neon/projects/project-a/branches/br-a/endpoints/ep-b/start']) {
    const f = startBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = startBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = startBroker({ ...endpointStartReceipt, endpoint: { ...endpointStartReceipt.endpoint, host: credentialCanary, settings: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'ep-a', acknowledged: true, operations: endpointStartReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('endpoint start: native authorization rejects wrong target, stale or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = startBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.startProjectEndpoint', endpointStartArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('endpoint start: identity/resource TOCTOU and caller configuration or authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = startBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = startBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.startProjectEndpoint', endpointStartArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { disabled: true }, { action: 'suspend' }, { settings: {} }, { branch_id: 'br-b' }]) {
    const g = startBroker();
    assert.equal((await g.common.broker().call('neon.startProjectEndpoint', { ...endpointStartArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('endpoint start: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = startBroker((url, init) => {
      if (init.method === 'POST') {
        if (ambiguous) throw Error(credentialCanary);
        return response(endpointStartReceipt);
      }
      return response({ endpoint: endpointStartReceipt.endpoint });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'POST').length, 1);
    safeEnvelope(f, result);
  }
});

test('endpoint start: malformed/reflected observations retain uncertainty and omit unused secret fields', async () => {
  for (const raw of [{ ...endpointStartReceipt, operations: [{ ...endpointStartReceipt.operations[0], status: credentialCanary }] },
    { ...endpointStartReceipt, endpoint: { ...endpointStartReceipt.endpoint, branch_id: 'br-b' } }]) {
    const f = startBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'POST').length, 1);
    safeEnvelope(f, result);
  }
  const f = startBroker({ ...endpointStartReceipt, password: credentialCanary,
    operations: endpointStartReceipt.operations.map(op => ({ ...op, error: credentialCanary, action: derivedCanary })) });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('endpoint start: maximum copied target and bounded operation observations fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: `br-${'b'.repeat(57)}`, endpointId: `ep-${'e'.repeat(57)}`, revision: 'r'.repeat(80) };
  const operations = Array.from({ length: 30 }, (_, n) => ({ id: `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`,
    project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId, status: 'running' }));
  const f = startBroker({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId }, operations }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.endpointId, acknowledged: true, operations: operations.map(({ id, status }) => ({ id, status })) });
  safeEnvelope(f, result);
});

function restartBroker(value = endpointRestartReceipt, overrides = {}, config = endpointRestartScope) {
  const provider = endpointRestartFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('restartProjectEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.restartProjectEndpoint', args, context, key);
  } };
}

test('endpoint restart: reserved authority and exact agent AND restart grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = restartBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/endpoints/ep-a',
    'neon/projects/project-a/branches/br-a/endpoints/ep-a/rename', 'neon/projects/project-a/branches/br-a/endpoints/ep-a/suspend', 'neon/projects/project-a/branches/br-a/endpoints/ep-a/delete', 'neon/projects/project-a/branches/br-a/endpoints/ep-a/start', 'neon/projects/project-a/branches/br-b/endpoints/ep-a/restart',
    'neon/projects/project-a/branches/br-a/endpoints/ep-b/restart']) {
    const f = restartBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = restartBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = restartBroker({ ...endpointRestartReceipt, endpoint: { ...endpointRestartReceipt.endpoint, host: credentialCanary, settings: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'ep-a', acknowledged: true, operations: endpointRestartReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('endpoint restart: native authorization rejects wrong target, stale or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = restartBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.restartProjectEndpoint', endpointRestartArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('endpoint restart: identity/resource TOCTOU and caller configuration or authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = restartBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = restartBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.restartProjectEndpoint', endpointRestartArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { disabled: true }, { action: 'suspend' }, { settings: {} }, { branch_id: 'br-b' }]) {
    const g = restartBroker();
    assert.equal((await g.common.broker().call('neon.restartProjectEndpoint', { ...endpointRestartArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('endpoint restart: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = restartBroker((url, init) => {
      if (init.method === 'POST') {
        if (ambiguous) throw Error(credentialCanary);
        return response(endpointRestartReceipt);
      }
      return response({ endpoint: endpointRestartReceipt.endpoint });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'POST').length, 1);
    safeEnvelope(f, result);
  }
});

test('endpoint restart: malformed/reflected observations retain uncertainty and omit unused secret fields', async () => {
  for (const raw of [{ ...endpointRestartReceipt, operations: [{ ...endpointRestartReceipt.operations[0], status: credentialCanary }] },
    { ...endpointRestartReceipt, endpoint: { ...endpointRestartReceipt.endpoint, branch_id: 'br-b' } }]) {
    const f = restartBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'POST').length, 1);
    safeEnvelope(f, result);
  }
  const f = restartBroker({ ...endpointRestartReceipt, password: credentialCanary,
    operations: endpointRestartReceipt.operations.map(op => ({ ...op, error: credentialCanary, action: derivedCanary })) });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('endpoint restart: maximum copied target and bounded operation observations fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: `br-${'b'.repeat(57)}`, endpointId: `ep-${'e'.repeat(57)}`, revision: 'r'.repeat(80) };
  const operations = Array.from({ length: 30 }, (_, n) => ({ id: `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`,
    project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId, status: 'running' }));
  const f = restartBroker({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId }, operations }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.endpointId, acknowledged: true, operations: operations.map(({ id, status }) => ({ id, status })) });
  safeEnvelope(f, result);
});

function suspensionBroker(value = endpointSuspendReceipt, overrides = {}, config = endpointSuspendScope) {
  const provider = endpointSuspendFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('suspendProjectEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.suspendProjectEndpoint', args, context, key);
  } };
}

test('endpoint suspension: reserved authority and exact agent AND suspend grant precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = suspensionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/endpoints/ep-a',
    'neon/projects/project-a/branches/br-a/endpoints/ep-a/rename', 'neon/projects/project-a/branches/br-b/endpoints/ep-a/suspend',
    'neon/projects/project-a/branches/br-a/endpoints/ep-b/suspend']) {
    const f = suspensionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = suspensionBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = suspensionBroker({ ...endpointSuspendReceipt, endpoint: { ...endpointSuspendReceipt.endpoint, host: credentialCanary, settings: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'ep-a', acknowledged: true, operations: endpointSuspendReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('endpoint suspension: native authorization rejects wrong target, stale or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = suspensionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const result = await f.common.broker().call('neon.suspendProjectEndpoint', endpointSuspendArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('endpoint suspension: identity/resource TOCTOU and caller configuration or authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = suspensionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = suspensionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.suspendProjectEndpoint', endpointSuspendArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ approved: true }, { disabled: true }, { action: 'start' }, { settings: {} }, { branch_id: 'br-b' }]) {
    const g = suspensionBroker();
    assert.equal((await g.common.broker().call('neon.suspendProjectEndpoint', { ...endpointSuspendArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('endpoint suspension: permanent journal blocks complete and uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = suspensionBroker((url, init) => {
      if (init.method === 'POST') {
        if (ambiguous) throw Error(credentialCanary);
        return response(endpointSuspendReceipt);
      }
      return response({ endpoint: endpointSuspendReceipt.endpoint });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'POST').length, 1);
    safeEnvelope(f, result);
  }
});

test('endpoint suspension: malformed/reflected observations retain uncertainty and omit unused secret fields', async () => {
  for (const raw of [{ ...endpointSuspendReceipt, operations: [{ ...endpointSuspendReceipt.operations[0], status: credentialCanary }] },
    { ...endpointSuspendReceipt, endpoint: { ...endpointSuspendReceipt.endpoint, branch_id: 'br-b' } }]) {
    const f = suspensionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'POST').length, 1);
    safeEnvelope(f, result);
  }
  const f = suspensionBroker({ ...endpointSuspendReceipt, password: credentialCanary,
    operations: endpointSuspendReceipt.operations.map(op => ({ ...op, error: credentialCanary, action: derivedCanary })) });
  const result = await f.call();
  assert.equal(result.ok, true);
  safeEnvelope(f, result);
});

test('endpoint suspension: maximum copied target and bounded operation observations fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: `br-${'b'.repeat(57)}`, endpointId: `ep-${'e'.repeat(57)}`, revision: 'r'.repeat(80) };
  const operations = Array.from({ length: 30 }, (_, n) => ({ id: `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`,
    project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId, status: 'running' }));
  const f = suspensionBroker({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId }, operations }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.endpointId, acknowledged: true, operations: operations.map(({ id, status }) => ({ id, status })) });
  safeEnvelope(f, result);
});

function endpointRenameBroker(value = endpointUpdateReceipt, overrides = {}, config = endpointUpdateScope) {
  const provider = endpointUpdateFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, endpoint_id: config.endpointId, name: config.name };
  const common = providerFixture(overrides);
  common.vector.policy.resources = [provider.operation('updateProjectEndpoint').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.updateProjectEndpoint', args, context, key);
  } };
}

test('endpoint rename: exact agent AND rename grant precede transport; safe receipt omits provider metadata', async () => {
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/endpoints/ep-a',
    'neon/projects/project-a/branches/br-b/endpoints/ep-a/rename', 'neon/projects/project-a/branches/br-a/endpoints/ep-b/rename']) {
    const f = endpointRenameBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = endpointRenameBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = endpointRenameBroker({ ...endpointUpdateReceipt, endpoint: { ...endpointUpdateReceipt.endpoint, password: credentialCanary, settings: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'ep-a', updated: true });
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('endpoint rename: scope/identity TOCTOU and caller compute/connection/branch/authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = endpointRenameBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = endpointRenameBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.updateProjectEndpoint', endpointUpdateArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ settings: {} }, { autoscaling_limit_max_cu: 1 }, { suspend_timeout_seconds: 0 }, { disabled: false }, { passwordless_access: true }, { branch_id: 'br-b' }, { approved: true }, { name: 'different' }]) {
    const g = endpointRenameBroker();
    assert.equal((await g.common.broker().call('neon.updateProjectEndpoint', { ...endpointUpdateArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('endpoint rename: permanent journal blocks complete/uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = endpointRenameBroker((url, init, n) => {
      if (init.method === 'PATCH') {
        if (ambiguous) throw Error(credentialCanary);
        return response(endpointUpdateReceipt);
      }
      return response({ endpoint: { ...endpointUpdateReceipt.endpoint, name: n === 1 ? 'before' : 'after' } });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    safeEnvelope(f, result);
  }
});

test('endpoint rename: reflected acknowledgement retains uncertain journal', async () => {
  const f = endpointRenameBroker({ endpoint: { ...endpointUpdateReceipt.endpoint, name: credentialCanary } });
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
  safeEnvelope(f, result);
});

test('endpoint rename: maximal copied target and labels fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'br-' + 'b'.repeat(57), endpointId: 'ep-' + 'e'.repeat(57), revision: 'r'.repeat(80), expectedName: 'b'.repeat(64), name: 'a'.repeat(64) };
  const f = endpointRenameBroker({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId, name: config.name } }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.endpointId, updated: true });
  safeEnvelope(f, result);
});

function projectRenameBroker(value = projectUpdateReceipt, overrides = {}, config = projectUpdateScope) {
  const provider = projectUpdateFixture(value, config);
  const args = { project_id: config.projectId, name: config.name };
  const common = providerFixture(overrides);
  common.vector.policy.resources = [provider.operation('updateProject').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.updateProject', args, context, key);
  } };
}

test('project rename: exact agent AND rename grant precede transport; safe receipt omits provider metadata', async () => {
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a/rename',
    'neon/projects/project-a/delete', 'neon/projects/project-b/rename']) {
    const f = projectRenameBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = projectRenameBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = projectRenameBroker({ ...projectUpdateReceipt, project: { ...projectUpdateReceipt.project, password: credentialCanary, settings: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'project-a', updated: true });
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('project rename: scope/identity TOCTOU and caller settings/compute/retention/authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = projectRenameBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = projectRenameBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.updateProject', projectUpdateArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ settings: {} }, { default_endpoint_settings: {} }, { history_retention_seconds: 0 }, { approved: true }, { name: 'different' }]) {
    const g = projectRenameBroker();
    assert.equal((await g.common.broker().call('neon.updateProject', { ...projectUpdateArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('project rename: permanent journal blocks complete/uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = projectRenameBroker((url, init, n) => {
      if (init.method === 'PATCH') {
        if (ambiguous) throw Error(credentialCanary);
        return response(projectUpdateReceipt);
      }
      return response({ project: { ...projectUpdateReceipt.project, name: n === 1 ? 'before' : 'after' } });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    safeEnvelope(f, result);
  }
});

test('project rename: reflected acknowledgement retains uncertain journal', async () => {
  const f = projectRenameBroker({ project: { ...projectUpdateReceipt.project, name: credentialCanary } });
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
  safeEnvelope(f, result);
});

test('project rename: maximal copied target and labels fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), revision: 'r'.repeat(80), expectedName: 'b'.repeat(80), name: 'a'.repeat(80) };
  const f = projectRenameBroker({ project: { id: config.projectId, name: config.name } }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.projectId, updated: true });
  safeEnvelope(f, result);
});

function branchRenameBroker(value = branchUpdateReceipt, overrides = {}, config = branchUpdateScope) {
  const provider = branchUpdateFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, name: config.name };
  const common = providerFixture(overrides);
  common.vector.policy.resources = [provider.operation('updateProjectBranch').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.updateProjectBranch', args, context, key);
  } };
}

test('branch rename: exact agent AND rename grant precede transport; safe receipt omits provider metadata', async () => {
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-a/delete', 'neon/projects/project-a/branches/br-b/rename']) {
    const f = branchRenameBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = branchRenameBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = branchRenameBroker({ ...branchUpdateReceipt, branch: { ...branchUpdateReceipt.branch, password: credentialCanary, expires_at: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'br-a', updated: true });
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('branch rename: scope/identity TOCTOU and caller protection/expiry/authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = branchRenameBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = branchRenameBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.updateProjectBranch', branchUpdateArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ protected: false }, { expires_at: null }, { approved: true }, { name: 'different' }]) {
    const g = branchRenameBroker();
    assert.equal((await g.common.broker().call('neon.updateProjectBranch', { ...branchUpdateArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('branch rename: permanent journal blocks complete/uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = branchRenameBroker((url, init, n) => {
      if (init.method === 'PATCH') {
        if (ambiguous) throw Error(credentialCanary);
        return response(branchUpdateReceipt);
      }
      return response({ branch: { ...branchUpdateReceipt.branch, name: n === 1 ? 'before' : 'after' } });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    safeEnvelope(f, result);
  }
});

test('branch rename: reflected acknowledgement retains uncertain journal', async () => {
  const f = branchRenameBroker({ branch: { ...branchUpdateReceipt.branch, name: credentialCanary } });
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
  safeEnvelope(f, result);
});

test('branch rename: maximal copied target and labels fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80),
    expectedName: 'b'.repeat(80), name: 'a'.repeat(80) };
  const f = branchRenameBroker({ branch: { id: config.branchId, project_id: config.projectId, name: config.name } }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.branchId, updated: true });
  safeEnvelope(f, result);
});

function renameBroker(value = snapshotUpdateReceipt, overrides = {}, config = snapshotUpdateScope) {
  const provider = snapshotUpdateFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, snapshot_id: config.snapshotId, name: config.name };
  const common = providerFixture(overrides);
  common.vector.policy.resources = [provider.operation('updateSnapshot').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.updateSnapshot', args, context, key);
  } };
}

test('snapshot rename: exact agent AND rename grant precede transport; labels omitted from safe receipt', async () => {
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/snapshots',
    'neon/projects/project-a/branches/br-a/snapshots/snap-a/delete',
    'neon/projects/project-a/branches/br-b/snapshots/snap-a/rename']) {
    const f = renameBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const denied = renameBroker();
  denied.common.vector.policy.agents = ['other-agent'];
  assert.equal((await denied.call()).ok, false);
  assert.equal(denied.provider.requests.length, 0);
  const f = renameBroker({ snapshot: { ...snapshotUpdateReceipt.snapshot, password: credentialCanary, expires_at: derivedCanary } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'snap-a', updated: true });
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('snapshot rename: scope/identity TOCTOU and caller expiry/authority refuse before mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } }, { host: { async authenticate() { return null; } } }]) {
    const f = renameBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = renameBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  assert.equal((await f.common.broker().call('neon.updateSnapshot', snapshotUpdateArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  for (const extra of [{ expires_at: null }, { approved: true }, { name: 'different' }]) {
    const g = renameBroker();
    assert.equal((await g.common.broker().call('neon.updateSnapshot', { ...snapshotUpdateArgs, ...extra }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
    assert.equal(g.common.calls.secret, 0);
  }
});

test('snapshot rename: permanent journal blocks complete/uncertain replay after restart', async () => {
  for (const ambiguous of [false, true]) {
    const f = renameBroker((url, init, n) => {
      if (init.method === 'PATCH') {
        if (ambiguous) throw Error(credentialCanary);
        return response(snapshotUpdateReceipt);
      }
      return response({ snapshots: [{ ...snapshotUpdateReceipt.snapshot, name: n === 1 ? 'before' : 'after' }] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    safeEnvelope(f, result);
  }
});

test('snapshot rename: malformed/reflected acknowledgement cannot clear uncertain journal', async () => {
  const f = renameBroker({ snapshot: { ...snapshotUpdateReceipt.snapshot, name: credentialCanary } });
  const result = await f.call();
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
  safeEnvelope(f, result);
});

test('snapshot rename: maximal copied target and labels fit common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), snapshotId: 's'.repeat(60), revision: 'r'.repeat(80),
    expectedName: 'b'.repeat(80), name: 'a'.repeat(80) };
  const f = renameBroker({ snapshot: { id: config.snapshotId, source_branch_id: config.branchId, name: config.name } }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: config.snapshotId, updated: true });
  safeEnvelope(f, result);
});

function deletionBroker(value = snapshotDeleteReceipt, overrides = {}, config = snapshotDeleteScope) {
  const provider = snapshotDeleteFixture(value, config);
  const args = { project_id: config.projectId, branch_id: config.branchId, snapshot_id: config.snapshotId };
  const common = providerFixture({ authority: true, ...overrides });
  common.vector.policy.resources = [provider.operation('deleteSnapshot').prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  const broker = common.broker();
  return { provider, common, call(context = 'verified-runtime', key = 'request-a') {
    return broker.call('neon.deleteSnapshot', args, context, key);
  } };
}

test('snapshot deletion: reserved native authority and exact deletion resource precede credentials and transport', async () => {
  for (const authority of [null, { async verify() { return null; }, async consume() { throw Error('not reached'); } }]) {
    const f = deletionBroker(undefined, { authority });
    assert.match((await f.call()).code, /^AUTHORIZATION_/);
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/snapshots',
    'neon/projects/project-a/branches/br-a/snapshots/snap-a', 'neon/projects/project-a/branches/br-b/snapshots/snap-a/delete',
    'neon/projects/project-a/branches/br-a/snapshots/snap-b/delete']) {
    const f = deletionBroker();
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.common.calls.secret, 0);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = deletionBroker();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { accepted: true, operations: snapshotDeleteReceipt.operations.map(({ id, status }) => ({ id, status })) });
  assert.equal(f.common.calls.consumed, 1);
  assert.equal([...f.common.journal.values()][0].outcome, 'complete');
  safeEnvelope(f, result);
});

test('snapshot deletion: native target binds plan/revision and rejects stale, wrong-target or unconsumable evidence', async () => {
  for (const change of ['target', 'expiry', 'consume']) {
    const f = deletionBroker();
    const base = f.common.authority;
    let consumeCalls = 0;
    f.common.dependencies.authority = { async verify(target) {
      const evidence = await base.verify(target);
      return change === 'target' ? { ...evidence, targetHash: '0'.repeat(64) } :
        change === 'expiry' ? { ...evidence, expiresAt: 1000 } : evidence;
    }, async consume() { consumeCalls++; return change !== 'consume'; } };
    const broker = f.common.broker();
    const result = await broker.call('neon.deleteSnapshot', snapshotDeleteArgs, 'verified-runtime', 'request-a');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTHORIZATION_DENIED');
    assert.equal(f.common.calls.secret, change === 'consume' ? 1 : 0);
    assert.equal(consumeCalls, change === 'consume' ? 1 : 0);
    assert.equal(f.provider.requests.length, 0);
    safeEnvelope(f, result);
  }
});

test('snapshot deletion: identity/resource TOCTOU and caller authority refuse without mutation', async () => {
  for (const overrides of [{ host: { async revalidate() { return false; } } },
    { host: { async authenticate() { return null; } } }]) {
    const f = deletionBroker(undefined, overrides);
    assert.equal((await f.call()).ok, false);
    assert.equal(f.provider.requests.length, 0);
  }
  const f = deletionBroker();
  let reads = 0;
  f.common.dependencies.host.revalidate = async () => ++reads < 3;
  const broker = f.common.broker();
  assert.equal((await broker.call('neon.deleteSnapshot', snapshotDeleteArgs, 'verified-runtime', 'request-a')).code, 'RESOURCE_CHANGED');
  assert.equal(f.provider.requests.length, 0);
  const invalid = deletionBroker();
  assert.equal((await invalid.common.broker().call('neon.deleteSnapshot', { ...snapshotDeleteArgs, approved: true }, 'verified-runtime', 'request-a')).code, 'INVALID_ARGUMENTS');
  assert.equal(invalid.common.calls.secret, 0);
});

test('snapshot deletion: permanent journal blocks successful and uncertain replay across restarted runs', async () => {
  for (const ambiguous of [false, true]) {
    const f = deletionBroker((url, init, n) => {
      if (init.method === 'DELETE') {
        if (ambiguous) throw Error(credentialCanary);
        return response(snapshotDeleteReceipt, { status: 202 });
      }
      return response({ snapshots: n === 1 ? [snapshot] : [] });
    });
    const result = await f.call();
    assert.equal(result.ok, !ambiguous);
    if (ambiguous) assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, ambiguous ? 'uncertain' : 'complete');
    const requests = f.provider.requests.length;
    f.common.vector.principal.run = 'restarted-run';
    assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
    assert.equal(f.provider.requests.length, requests);
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
});

test('snapshot deletion: malformed acknowledgement or reflected secret keeps an uncertain tombstone', async () => {
  for (const raw of [{ operations: [{ ...snapshotDeleteReceipt.operations[0], status: credentialCanary }] },
    { operations: [{ ...snapshotDeleteReceipt.operations[0], project_id: 'other' }] }]) {
    const f = deletionBroker(raw);
    const result = await f.call();
    assert.equal(result.code, 'OUTCOME_UNCERTAIN');
    assert.equal([...f.common.journal.values()][0].outcome, 'uncertain');
    assert.equal(f.provider.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    safeEnvelope(f, result);
  }
  const f = deletionBroker({ ...snapshotDeleteReceipt, secret: credentialCanary,
    operations: snapshotDeleteReceipt.operations.map(op => ({ ...op, error: credentialCanary, action: derivedCanary })) });
  assert.equal((await f.call()).ok, true);
});

test('snapshot deletion: maximum exact binding fits common budgets', async () => {
  const config = { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), snapshotId: 's'.repeat(60), revision: 'r'.repeat(80) };
  const f = deletionBroker({ operations: [] }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { accepted: true, operations: [] });
  safeEnvelope(f, result);
});

test('object byte observation: exact download grant, closed count and stream contents never escape', async () => {
  const [name, args] = objectDownloadCases[0];
  const bytes = new TextEncoder().encode(`${credentialCanary}${derivedCanary}postgres://user:password-canary@example.invalid/db`);
  const f = brokerFixture(name, args, { bytes: [...bytes] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { observed_bytes: bytes.byteLength });
  safeEnvelope(f, result);
  const root = 'neon/projects/project-a/branches/br-a/buckets/assets/objects';
  for (const resource of [root, `${root}/images/a.png`, `${root}/images/b.png/download`,
    `${root}/images/a.png/presign`, root.replace('br-a', 'br-b') + '/images/a.png/download']) {
    const denied = brokerFixture(name, args, { bytes: [] });
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const refused = brokerFixture(name, args, () => binaryResponse([1, 2], { 'content-length': '3' }));
  assert.equal((await refused.call()).code, 'UPSTREAM_UNAVAILABLE');
  safeEnvelope(refused, await refused.call());
});

test('object byte observation: exact 256-character resource and maximum binary response fit common budgets', async () => {
  const config = { ...objectDownloadScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60),
    bucketName: 'a'.repeat(40), objectKey: 'k'.repeat(45), revision: 'r'.repeat(80) };
  const args = { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName, object_key: config.objectKey };
  const f = brokerFixture('getProjectBranchBucketObject', args, { bytes: new Array(65536).fill(255) }, {}, config);
  assert.equal(f.provider.operation('getProjectBranchBucketObject').prepare(args).resource.id.length, 256);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { observed_bytes: 65536 });
  safeEnvelope(f, result);
});

for (const [name, args, raw, expected] of oauthProviderCases) {
  test(`${name}: exact collection authority separates legacy and branch metadata without exposing OAuth material`, async () => {
    const f = brokerFixture(name, args, { ...raw, client_secret: credentialCanary, providers: [
      { ...oauthProvider, client_secret: credentialCanary, client_id: derivedCanary, microsoft_tenant_id: credentialCanary,
        apple_team_id: derivedCanary, apple_key_id: credentialCanary }, { id: 'google', type: 'shared' }] });
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    safeEnvelope(f, result);
    const correct = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/auth',
      'neon/projects/project-a/auth/oauth_providers', 'neon/projects/project-a/branches/br-a/auth/oauth_providers',
      'neon/projects/project-a/branches/br-b/auth/oauth_providers', 'neon/projects/project-a/branches/br-a/auth/plugins/oauth-provider']) {
      if (resource === correct) continue;
      const denied = brokerFixture(name, args, raw);
      denied.common.vector.policy.resources = [resource];
      assert.equal((await denied.call()).code, 'POLICY_DENIED');
      assert.equal(denied.common.calls.secret, 0);
      assert.equal(denied.provider.requests.length, 0);
    }
    for (const invalid of [{ ...raw, pagination: {} }, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' },
      { providers: [oauthProvider, oauthProvider] }, { providers: [oauthProvider, { id: 'google', type: 'future' }] }]) {
      const refused = brokerFixture(name, args, invalid);
      assert.equal((await refused.call()).code, 'UPSTREAM_UNAVAILABLE');
    }
  });

  test(`${name}: maximal fixed scope and every selected provider fit common budgets`, async () => {
    const config = { ...oauthProviderScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80),
      providerIds: ['google', 'github', 'microsoft', 'vercel', 'apple'] };
    const input = { project_id: config.projectId, ...('branch_id' in args ? { branch_id: config.branchId } : {}) };
    const providers = config.providerIds.map(id => ({ id, type: 'standard' }));
    const f = brokerFixture(name, input, { providers }, {}, config);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { providers });
    safeEnvelope(f, result);
  });
}

test('log query: only the dedicated query grant authorizes the bounded count, never content output', async () => {
  const [name, args, raw, expected] = logQueryCases[0];
  const f = brokerFixture(name, args, { ...raw, logs: [{ ...logRecord, message: credentialCanary,
    attributes: { secret: derivedCanary }, trace_id: credentialCanary, entity_id: derivedCanary }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a/branches/br-a/logs', 'neon/projects/project-a/branches/br-a/logs/fields',
    'neon/projects/project-a/branches/br-a/logs/fields/level/values', 'neon/projects/project-a/branches/br-b/logs/query']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const { source, ...logWithoutEcho } = logRecord;
  assert.equal(source, logQueryScope.source);
  const noEcho = brokerFixture(name, args, { ...raw, logs: [logWithoutEcho] });
  assert.deepEqual((await noEcho.call()).value, expected);
  for (const invalid of [{ ...raw, is_truncated: true }, { ...raw, next_cursor: 'more' }, { ...raw, source: 'storage' },
    { ...raw, logs: [{ ...logRecord, timestamp: args.end_time }] }, { ...raw, logs: [{ ...logRecord, branch_id: 'br-b' }] }]) {
    const f = brokerFixture(name, args, invalid);
    assert.equal((await f.call()).code, 'UPSTREAM_UNAVAILABLE');
  }
});

test('log query: maximum fixed scope and thirty observations fit common budgets', async () => {
  const config = { ...logQueryScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80) };
  const args = { project_id: config.projectId, branch_id: config.branchId, start_time: config.startTime,
    end_time: config.endTime, source: config.source };
  const f = brokerFixture('queryProjectBranchLogs', args, { logs: Array.from({ length: 30 }, () => logRecord), is_truncated: false }, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { observed_count: 30 });
  safeEnvelope(f, result);
});

test('schema comparison: directional pair/database grant is separate from either branch schema grant', async () => {
  const [name, args, raw, expected] = schemaComparisonCases[0];
  const f = brokerFixture(name, args, { ...raw, diff: `${credentialCanary}\n${derivedCanary}`, sql: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a/databases/main/schema',
    'neon/projects/project-a/branches/br-b/databases/main/schema',
    'neon/projects/project-a/branches/br-a/databases/main/schema-comparison/br-c',
    'neon/projects/project-a/branches/br-b/databases/main/schema-comparison/br-a',
    'neon/projects/project-a/branches/br-a/databases/other/schema-comparison/br-b']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{}, { diff: null }, { diff: 'x'.repeat(16385) }, { ...raw, base_branch_id: 'br-c' }, { ...raw, pagination: {} }]) {
    const f = brokerFixture(name, args, invalid);
    const result = await f.call();
    assert.equal(result.ok, false);
    safeEnvelope(f, result);
  }
  const empty = brokerFixture(name, args, { diff: '' });
  assert.deepEqual((await empty.call()).value, { has_diff: false });
});

test('schema comparison: exact maximum resource fits common budgets and diff content never leaves projection', async () => {
  const config = { ...schemaComparisonScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), databaseName: 'd'.repeat(60), revision: 'r'.repeat(80) };
  const prefix = `neon/projects/${config.projectId}/branches/${config.branchId}/databases/${config.databaseName}/schema-comparison/`;
  config.baseBranchId = 'a'.repeat(256 - prefix.length);
  const args = { project_id: config.projectId, branch_id: config.branchId, base_branch_id: config.baseBranchId, db_name: config.databaseName };
  const f = brokerFixture('getProjectBranchSchemaComparison', args, { diff: 'x'.repeat(16384) }, {}, config);
  assert.equal(f.provider.operation('getProjectBranchSchemaComparison').prepare(args).resource.id.length, 256);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { has_diff: true });
  safeEnvelope(f, result);
});

test('log values: exact field grant is distinct from catalog, log query and sibling authority', async () => {
  const [name, args, raw, expected] = logValueCases[0];
  const f = brokerFixture(name, args, { ...raw, values: [...raw.values, credentialCanary, derivedCanary], logs: [{ message: credentialCanary }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a/logs',
    'neon/projects/project-a/branches/br-a/logs/fields', 'neon/projects/project-a/branches/br-a/logs/fields/other/values',
    'neon/projects/project-a/branches/br-b/logs/fields/level/values']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, is_truncated: true }, { ...raw, branch_id: 'br-b' }, { ...raw, source: 'storage' },
    { ...raw, values: ['unselected', 'unselected'] }, { ...raw, pagination: {} }]) {
    const f = brokerFixture(name, args, invalid);
    const result = await f.call();
    assert.equal(result.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(f, result);
  }
});

test('log values: maximum selected observations fit common budgets and reflected credentials refuse', async () => {
  const values = Array.from({ length: 30 }, (_, i) => `value-${i}`.padEnd(80, 'x'));
  const config = { ...logValueScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), fieldName: 'f'.repeat(80), revision: 'r'.repeat(80), values };
  const args = { project_id: config.projectId, branch_id: config.branchId, field_name: config.fieldName,
    start_time: config.startTime, end_time: config.endTime, source: config.source };
  const maximum = brokerFixture('listProjectBranchLogFieldValues', args, { values, is_truncated: false }, {}, config);
  const result = await maximum.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { values });
  safeEnvelope(maximum, result);
  const reflectedValue = 'selected-log-observation';
  const reflected = brokerFixture('listProjectBranchLogFieldValues', logValueCases[0][1], { values: [reflectedValue], is_truncated: false }, {
    credentials: { async resolve() { return { value: reflectedValue, redactions: [], async close() {} }; } },
  }, { ...logValueScope, values: [reflectedValue] });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('branch schema: database schema grants do not follow from configuration, analysis or sibling access', async () => {
  const [name, args, raw] = branchSchemaCases[0];
  for (const resource of ['neon/projects/project-a/branches/br-a/databases/main',
    'neon/projects/project-a/branches/br-a/data-api/main',
    'neon/projects/project-a/branches/br-a/databases/main/advisors/security',
    'neon/projects/project-a/branches/br-a/databases/other/schema',
    'neon/projects/project-a/branches/br-b/databases/main/schema']) {
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.provider.requests.length, 0);
    assert.equal(f.common.calls.secret, 0);
  }
  for (const invalid of [{ sql: 'CREATE TABLE ignored' }, { json: { tables: [schemaTable, schemaTable] } },
    { ...raw, db_name: 'other' }, { ...raw, pagination: {} }]) {
    const f = brokerFixture(name, args, invalid);
    const result = await f.call();
    assert.equal(result.ok, false);
    safeEnvelope(f, result);
  }
});

test('branch schema: maximum selected identities fit common budgets while DDL and attributes remain hidden', async () => {
  const columns = Array.from({ length: 30 }, (_, i) => ({ schema_name: 's'.repeat(63), table_name: 't'.repeat(63), column_name: `c${i}`.padEnd(63, 'c') }));
  const config = { ...branchSchemaScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), databaseName: 'd'.repeat(63), revision: 'r'.repeat(80), columns };
  const args = { project_id: config.projectId, branch_id: config.branchId, db_name: config.databaseName };
  const raw = { sql: credentialCanary, json: { tables: [{ schema: columns[0].schema_name, name: columns[0].table_name,
    constraints: derivedCanary, columns: columns.map(c => ({ name: c.column_name, type: credentialCanary, default: derivedCanary })) }] } };
  const f = brokerFixture('getProjectBranchSchema', args, raw, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { columns });
  safeEnvelope(f, result);
  const reflected = brokerFixture('getProjectBranchSchema', branchSchemaCases[0][1], branchSchemaCases[0][2], {
    credentials: { async resolve() { return { value: schemaColumn.schema_name, redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('advisor: exact database analysis grant is separate from catalog, parent and sibling authority', async () => {
  const [name, args, raw] = advisorCases[0];
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-a/databases/main', 'neon/projects/project-a/branches/br-a/data-api/main',
    'neon/projects/project-a/branches/br-a/databases/other/advisors/security',
    'neon/projects/project-a/branches/br-b/databases/main/advisors/security']) {
    const f = brokerFixture(name, args, raw);
    f.common.vector.policy.resources = [resource];
    assert.equal((await f.call()).code, 'POLICY_DENIED');
    assert.equal(f.provider.requests.length, 0);
    assert.equal(f.common.calls.secret, 0);
  }
  for (const invalid of [{ issues: [advisorIssue, advisorIssue] }, { issues: [{ ...advisorIssue, categories: ['PERFORMANCE'] }] },
    { ...raw, database_name: 'other' }, { ...raw, pagination: {} }]) {
    const f = brokerFixture(name, args, invalid);
    const result = await f.call();
    assert.equal(result.ok, false);
    safeEnvelope(f, result);
  }
});

test('advisor: maximum scope/row bounds fit common budgets and omit sensitive analysis payloads', async () => {
  const config = { ...advisorScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), databaseName: 'd'.repeat(63), revision: 'r'.repeat(80) };
  const args = { project_id: config.projectId, branch_id: config.branchId, database_name: config.databaseName };
  const raw = { issues: Array.from({ length: 30 }, (_, i) => ({ ...advisorIssue, cache_key: `issue-${i}`,
    name: credentialCanary, detail: credentialCanary, metadata: { secret: derivedCanary }, remediation: credentialCanary })) };
  const f = brokerFixture('getProjectAdvisorSecurityIssues', args, raw, {}, config);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { counts: { ERROR: 30, WARN: 0, INFO: 0 } });
  safeEnvelope(f, result);
});

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
    assert.equal(f.provider.requests.length, ['getCurrentUserOrganizations', 'listSharedProjects', 'listApiKeys'].includes(name) ? 2 : 1);
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
      assert.equal(f.provider.requests.length, ['getCurrentUserOrganizations', 'listSharedProjects', 'listApiKeys'].includes(name) && mode === 'success' ? 2 : 1);
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

for (const [name, args, raw] of [...objectDownloadCases, ...logQueryCases, ...logValueCases, ...branchSchemaCases, ...advisorCases, ...userKeyCases, ...organizationKeyCases, ...credentialMetadataCases, ...authDetailsCases, ...maskingRuleCases, ...legacyConsumptionCases, ...branchConsumptionCases, ...consumptionCases, ...bucketObjectCases, ...logFieldCases, ...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases, ...authDomainCases, ...authIntegrationCases, ...functionCases, ...triggerCases, ...authClientCases, ...branchResourceCases, ...projectSecurityCases, ...projectAccessCases, ...organizationVPCCases, ...organizationCases, ...organizationMemberCases, ...organizationInvitationCases, ...dataAPICases, ...regionCases, ...projectCountCases, ...authWebhookCases, ...userProfileCases, ...authEmailCases, ...projectCases, ...userOrganizationCases, ...sharedProjectCases]) {
  test(`${name}: replay and TOCTOU policy/resource changes refuse without a second request`, async () => {
    const replay = brokerFixture(name, args, raw);
    assert.equal((await replay.call()).ok, true);
    assert.equal((await replay.call()).code, 'REPLAY_CONFLICT');
    assert.equal(replay.provider.requests.length, ['getCurrentUserOrganizations', 'listSharedProjects', 'listApiKeys'].includes(name) ? 2 : 1);
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

test('user key identities require exact user collection authority and same-credential proof without tokens', async () => {
  const [name, args, raw, expected] = userKeyCases[0];
  const f = brokerFixture(name, args, { ...raw, keys: [{ ...raw.keys[0], key: credentialCanary,
    created_by: derivedCanary, name: 'password-canary', last_used_from_addr: credentialCanary }, { id: 123 }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  assert.equal(f.common.calls.secret, 1);
  assert.equal(f.provider.requests.length, 2);
  safeEnvelope(f, result);
  for (const resource of ['neon/users/user-a', 'neon/users/user-a/profile', 'neon/users/other/api_keys',
    'neon/users/user-a/api_keys/165432', 'neon/accounts/user-a/api_keys', 'neon/organizations/org-a/api_keys']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, user: {} }, { ...raw, user: { id: 'other' } },
    { ...raw, keys: { api_keys: raw.keys } }, { ...raw, keys: [...raw.keys, ...raw.keys] },
    { ...raw, keys: [{ id: 123, user_id: 'other' }] }, { ...raw, keys: [{ id: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...raw, keys: Array.from({ length: 31 }, (_, id) => ({ id })) }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(refused.provider.requests.length, invalid.user.id === 'user-a' ? 2 : 1);
    safeEnvelope(refused, refusal);
  }
  const apiKeys = Array.from({ length: 30 }, (_, n) => ({ id: Number.MAX_SAFE_INTEGER - n }));
  const config = { ...userKeyScope, userId: 'u'.repeat(80), revision: 'r'.repeat(80), keyIds: apiKeys.map(k => k.id) };
  const maximum = brokerFixture(name, { user_id: config.userId }, { user: { id: config.userId }, keys: apiKeys }, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { api_keys: apiKeys });
  assert.equal(maximum.provider.requests.length, 2);
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: String(raw.keys[0].id), redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
  assert.equal(reflected.provider.requests.length, 2);
});

test('organization key identities require exact collection authority without tokens or account fallback', async () => {
  const [name, args, raw, expected] = organizationKeyCases[0];
  const f = brokerFixture(name, args, [{ ...raw[0], key: credentialCanary, created_by: derivedCanary,
    name: 'password-canary', last_used_from_addr: credentialCanary, project_id: derivedCanary }, { id: 123 }]);
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/organizations/org-a', 'neon/organizations/org-b/api_keys',
    'neon/organizations/org-a/api_keys/165432', 'neon/accounts/org-a/api_keys', 'neon/projects/project-a']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ api_keys: raw }, [raw[0], raw[0]], [{ id: 123, org_id: 'other' }],
    [{ id: Number.MAX_SAFE_INTEGER + 1 }], Array.from({ length: 31 }, (_, id) => ({ id }))]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const apiKeys = Array.from({ length: 30 }, (_, n) => ({ id: Number.MAX_SAFE_INTEGER - n }));
  const config = { ...organizationKeyScope, organizationId: 'o'.repeat(60), revision: 'r'.repeat(80), keyIds: apiKeys.map(k => k.id) };
  const maximum = brokerFixture(name, { org_id: config.organizationId }, apiKeys, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { api_keys: apiKeys });
  safeEnvelope(maximum, maxResult);
});

test('credential metadata requires exact collection authority and exposes no credential payload or scope inference', async () => {
  const [name, args, raw, expected] = credentialMetadataCases[0];
  const f = brokerFixture(name, args, { credentials: [{ ...raw.credentials[0], token: credentialCanary,
    secret: derivedCanary, name: 'password-canary', scopes: ['unknown:future'] }, { token_id: 'unselected' }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-b/credentials', `neon/projects/project-a/branches/br-a/credentials/${credentialMetadata.token_id}`]) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, pagination: {} }, { credentials: [credentialMetadata, credentialMetadata] },
    { credentials: [{ token_id: 'unselected', branch_id: 'br-b' }] },
    { credentials: Array.from({ length: 31 }, (_, i) => ({ token_id: `id-${i}` })) }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const credentials = Array.from({ length: 30 }, (_, n) => ({ token_id: `id-${String(n).padStart(77, '0')}`, branch_id: 'b'.repeat(60) }));
  const config = { ...credentialMetadataScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80),
    tokenIds: credentials.map(value => value.token_id) };
  const maximum = brokerFixture(name, { project_id: config.projectId, branch_id: config.branchId }, { credentials }, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { credentials });
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: credentialMetadata.token_id, redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('auth details require exact account authority without exposing opaque authentication data or implying user access', async () => {
  const [name, args, raw, expected] = authDetailsCases[0];
  const f = brokerFixture(name, args, { ...raw, auth_data: credentialCanary, password: 'password-canary', identity: derivedCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/accounts/account-a', 'neon/accounts/account-b/auth', 'neon/users/account-a/profile',
    'neon/organizations/account-a', 'neon/projects/project-a/auth']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, account_id: 'account-b' }, { ...raw, auth_method: 'api_key_project' },
    { ...raw, pagination: {} }, { auth_method: raw.auth_method }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...authDetailsScope, accountId: 'a'.repeat(80), revision: 'r'.repeat(80) };
  const maximum = brokerFixture(name, { account_id: config.accountId }, { account_id: config.accountId, auth_method: 'session_cookie' }, {}, config);
  assert.equal((await maximum.call()).ok, true);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: authDetails.auth_method, redactions: [], async close() {} }; } },
  });
  const reflectedResult = await reflected.call();
  assert.equal(reflectedResult.code, 'OUTPUT_REFUSED');
  safeEnvelope(reflected, reflectedResult);
});

test('masking-rule identities require exact collection authority and never expose functions or literal data', async () => {
  const [name, args, raw, expected] = maskingRuleCases[0];
  const f = brokerFixture(name, args, { masking_rules: [{ ...maskingRule, masking_function: credentialCanary,
    masking_value: derivedCanary, password: 'password-canary' }, { ...maskingRule, column_name: 'unselected' }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a',
    'neon/projects/project-a/branches/br-b/masking_rules', 'neon/projects/project-a/branches/br-a/schema']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, branch_id: 'br-b' }, { masking_rules: [maskingRule, maskingRule] },
    { masking_rules: [{ ...maskingRule, column_name: '' }] }, { ...raw, pagination: {} },
    { masking_rules: Array.from({ length: 31 }, (_, n) => ({ ...maskingRule, column_name: `c_${n}` })) }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const rules = Array.from({ length: 30 }, (_, n) => Object.fromEntries(Object.keys(maskingRule).map(key => [key, `n_${n}_${'x'.repeat(58)}`.slice(0, 63)])));
  const config = { ...maskingRuleScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80), rules };
  const maximum = brokerFixture(name, { project_id: config.projectId, branch_id: config.branchId }, { masking_rules: rules }, {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { masking_rules: rules });
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: maskingRule.column_name, redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
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

test('bucket-object metadata requires exact effective-branch collection authority and closes output', async () => {
  const [name, args, raw, expected] = bucketObjectCases[0];
  const f = brokerFixture(name, args, { ...raw, objects: [{ ...bucketObject, content: credentialCanary, etag: derivedCanary, last_modified: credentialCanary },
    { key: `images/${credentialCanary}`, size: 1 }], download_url: credentialCanary });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/projects/project-a', 'neon/projects/project-a/branches/br-a/buckets',
    'neon/projects/project-a/branches/br-a/buckets/assets', 'neon/projects/project-a/branches/br-b/buckets/assets/objects',
    'neon/projects/project-a/branches/br-a/buckets/other/objects']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  for (const invalid of [{ ...raw, branch_id: 'br-b' }, { ...raw, bucket_name: 'other' }, { ...raw, prefix: 'other/' },
    { ...raw, folders: ['images/sub/'] }, { ...raw, objects: [bucketObject, bucketObject] },
    { ...raw, objects: [{ key: 'images/unselected', size: Number.MAX_SAFE_INTEGER + 1 }] }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const keys = Array.from({ length: 30 }, (_, n) => `images/${String(n).padStart(73, '0')}`);
  const objects = keys.map(key => ({ key, size: Number.MAX_SAFE_INTEGER }));
  const config = { ...bucketObjectScope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 'a'.repeat(60), revision: 'r'.repeat(80), objectKeys: keys };
  const maximum = brokerFixture(name, { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName },
    (_url, _init, n) => response({ ...raw, objects: objects.slice((n - 1) * 10, n * 10), is_truncated: n < 3, next_cursor: n < 3 ? `next-${n}` : '' }), {}, config);
  const maxResult = await maximum.call();
  assert.equal(maxResult.ok, true);
  assert.deepEqual(maxResult.value, { objects });
  safeEnvelope(maximum, maxResult);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: bucketObject.key, redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('project consumption requires exact aggregate authority and cannot widen the time window or leak billing metadata', async () => {
  const [name, args, raw, expected] = consumptionCases[0];
  const f = brokerFixture(name, args, { projects: [{ ...raw.projects[0], periods: [{ ...consumptionPeriod,
    period_plan: credentialCanary, password: derivedCanary, consumption: [{ ...consumptionFrame, message: credentialCanary }] }] }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/organizations/org-a', 'neon/organizations/org-a/projects', 'neon/projects/project-a',
    'neon/organizations/org-b/projects/project-a/consumption/v2', 'neon/organizations/org-a/projects/project-b/consumption/v2']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const widened = brokerFixture(name, args, raw);
  widened.args = { ...args, from: '2026-11-06T00:00:00Z' };
  assert.equal((await widened.call()).code, 'INVALID_ARGUMENTS');
  assert.equal(widened.common.calls.secret, 0);
  for (const invalid of [{ ...raw, org_id: 'other' }, { projects: [{ ...raw.projects[0], project_id: 'other' }] },
    { projects: [raw.projects[0], raw.projects[0]] }, { projects: [{ ...raw.projects[0], periods: [{ ...consumptionPeriod,
      consumption: [{ ...consumptionFrame, metrics: [{ metric_name: 'compute_unit_seconds', value: Number.MAX_SAFE_INTEGER + 1 }] }] }] }] }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...consumptionScope, organizationId: 'o'.repeat(60), projectId: 'p'.repeat(60), revision: 'r'.repeat(80) };
  const maximum = brokerFixture(name, { ...args, org_id: config.organizationId, project_id: config.projectId },
    { projects: [{ ...raw.projects[0], project_id: config.projectId }] }, {}, config);
  assert.equal((await maximum.call()).ok, true);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'project-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('legacy project consumption requires exact aggregate authority and cannot widen the time window or leak billing metadata', async () => {
  const [name, args, raw, expected] = legacyConsumptionCases[0];
  const f = brokerFixture(name, args, { projects: [{ ...raw.projects[0], periods: [{ ...legacyConsumptionPeriod,
    period_plan: credentialCanary, password: derivedCanary, consumption: [{ ...legacyConsumptionFrame, message: credentialCanary }] }] }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/organizations/org-a', 'neon/organizations/org-a/projects', 'neon/projects/project-a', 'neon/organizations/org-a/projects/project-a/consumption/v2',
    'neon/organizations/org-b/projects/project-a/consumption/legacy', 'neon/organizations/org-a/projects/project-b/consumption/legacy']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const widened = brokerFixture(name, args, raw);
  widened.args = { ...args, from: '2026-11-06T00:00:00Z' };
  assert.equal((await widened.call()).code, 'INVALID_ARGUMENTS');
  assert.equal(widened.common.calls.secret, 0);
  for (const invalid of [{ ...raw, org_id: 'other' }, { projects: [{ ...raw.projects[0], project_id: 'other' }] },
    { projects: [raw.projects[0], raw.projects[0]] }, { projects: [{ ...raw.projects[0], periods: [{ ...legacyConsumptionPeriod,
      consumption: [{ ...legacyConsumptionFrame, compute_time_seconds: Number.MAX_SAFE_INTEGER + 1 }] }] }] }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...consumptionScope, organizationId: 'o'.repeat(60), projectId: 'p'.repeat(60), revision: 'r'.repeat(80) };
  const maximum = brokerFixture(name, { ...args, org_id: config.organizationId, project_id: config.projectId },
    { projects: [{ ...raw.projects[0], project_id: config.projectId }] }, {}, config);
  assert.equal((await maximum.call()).ok, true);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'project-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('branch consumption requires exact aggregate authority and cannot widen the time window or leak billing metadata', async () => {
  const [name, args, raw, expected] = branchConsumptionCases[0];
  const f = brokerFixture(name, args, { branches: [{ ...raw.branches[0], periods: [{ ...consumptionPeriod,
    period_plan: credentialCanary, password: derivedCanary, consumption: [{ ...consumptionFrame, message: credentialCanary }] }] }] });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, expected);
  safeEnvelope(f, result);
  for (const resource of ['neon/organizations/org-a', 'neon/organizations/org-a/projects', 'neon/organizations/org-a/projects/project-a/consumption/v2', 'neon/organizations/org-a/projects/project-a/branches/br-b/consumption/v2', 'neon/projects/project-a',
    'neon/organizations/org-b/projects/project-a/branches/br-a/consumption/v2', 'neon/organizations/org-a/projects/project-b/branches/br-a/consumption/v2']) {
    const denied = brokerFixture(name, args, raw);
    denied.common.vector.policy.resources = [resource];
    assert.equal((await denied.call()).code, 'POLICY_DENIED');
    assert.equal(denied.common.calls.secret, 0);
    assert.equal(denied.provider.requests.length, 0);
  }
  const widened = brokerFixture(name, args, raw);
  widened.args = { ...args, from: '2026-11-06T00:00:00Z' };
  assert.equal((await widened.call()).code, 'INVALID_ARGUMENTS');
  assert.equal(widened.common.calls.secret, 0);
  for (const invalid of [{ ...raw, org_id: 'other' }, { branches: [{ ...raw.branches[0], branch_id: 'br-b' }] }, { branches: [{ ...raw.branches[0], project_id: 'other' }] },
    { branches: [raw.branches[0], raw.branches[0]] }, { branches: [{ ...raw.branches[0], periods: [{ ...consumptionPeriod,
      consumption: [{ ...consumptionFrame, metrics: [{ metric_name: 'compute_unit_seconds', value: Number.MAX_SAFE_INTEGER + 1 }] }] }] }] }]) {
    const refused = brokerFixture(name, args, invalid);
    const refusal = await refused.call();
    assert.equal(refusal.code, 'UPSTREAM_UNAVAILABLE');
    safeEnvelope(refused, refusal);
  }
  const config = { ...branchConsumptionScope, organizationId: 'o'.repeat(60), projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80) };
  const maximum = brokerFixture(name, { ...args, org_id: config.organizationId, project_id: config.projectId, branch_id: config.branchId },
    { branches: [{ ...raw.branches[0], project_id: config.projectId, branch_id: config.branchId }] }, {}, config);
  assert.equal((await maximum.call()).ok, true);
  const reflected = brokerFixture(name, args, raw, {
    credentials: { async resolve() { return { value: 'project-a', redactions: [], async close() {} }; } },
  });
  assert.equal((await reflected.call()).code, 'OUTPUT_REFUSED');
});

test('common operation-map validator confirms incomplete status for all unknown entitlements', () => {
  const map = JSON.parse(readFileSync(new URL('../operation-map.json', import.meta.url)));
  const result = validateOperationMap(map);
  assert.equal(result.complete, false);
  assert.equal(result.incomplete.length, 194);
  assert.deepEqual(map.operations.filter(operation => operation.implemented).map(operation => operation.id).sort(), sourceNames.toSorted());
  assert.equal(map.operations.filter(operation => operation.enabled).length, 0);
});
