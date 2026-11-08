import { createNeonMetadataOperations } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonCatalogOperations } from '../dist/plugins/neon-broker/src/catalog.js';
import { createNeonCapabilityOperations } from '../dist/plugins/neon-broker/src/capabilities.js';
import { createNeonBranchFeatureOperations } from '../dist/plugins/neon-broker/src/branch-features.js';
import { createNeonAuthStatusOperations } from '../dist/plugins/neon-broker/src/auth-status.js';
import { createNeonAuthDomainOperations } from '../dist/plugins/neon-broker/src/auth-domains.js';
import { createNeonAuthIntegrationOperations } from '../dist/plugins/neon-broker/src/auth-integrations.js';
import { createNeonFunctionOperations } from '../dist/plugins/neon-broker/src/functions.js';
import { createNeonTriggerOperations } from '../dist/plugins/neon-broker/src/triggers.js';
import { createNeonAuthClientOperations } from '../dist/plugins/neon-broker/src/auth-clients.js';
import { createNeonBranchResourceOperations } from '../dist/plugins/neon-broker/src/branch-resources.js';
import { createNeonProjectSecurityOperations } from '../dist/plugins/neon-broker/src/project-security.js';
import { createNeonMetadataTransport } from '../dist/plugins/neon-broker/src/transport.js';

export const scope = {
  projectId: 'project-a', revision: 'scope-v1', branchIds: ['br-a', 'br-b'],
  endpoints: [{ id: 'ep-a', branchId: 'br-a' }, { id: 'ep-b', branchId: 'br-b' }],
};
export const operation = { id: 'a07f8772-1877-4da9-a939-3a3ae62d1d8d', project_id: 'project-a', branch_id: 'br-a',
  endpoint_id: 'ep-a', action: 'create_timeline', status: 'finished', failures_count: 0, total_duration_ms: 100 };
export const database = { id: 834686, branch_id: 'br-a', name: 'main' };
export const role = { branch_id: 'br-a', name: 'reader', protected: false };
export const catalogScope = { ...scope,
  operations: [{ id: operation.id, branchId: 'br-a', endpointId: 'ep-a' }],
  databases: [{ id: database.id, branchId: 'br-a', name: database.name }],
  roles: [{ branchId: 'br-a', name: role.name }],
};
export function catalogScopeAt(count) {
  const indices = Array.from({ length: count }, (_, index) => index);
  return { ...scope,
    branchIds: indices.map(index => `br-${index}`),
    endpoints: indices.map(index => ({ id: `ep-${index}`, branchId: `br-${index}` })),
    operations: indices.map(index => ({ id: `00000000-0000-0000-0000-${index.toString(16).padStart(12, '0')}`,
      branchId: `br-${index}`, endpointId: `ep-${index}` })),
    databases: indices.map(index => ({ id: index + 1, name: `db_${index}`, branchId: `br-${index}` })),
    roles: indices.map(index => ({ name: `reader_${index}`, branchId: `br-${index}` })),
  };
}
export const project = { id: 'project-a', region_id: 'aws-us-east-2', pg_version: 17 };
export const branch = { id: 'br-a', project_id: 'project-a', current_state: 'ready', default: true, protected: false };
export const endpoint = { id: 'ep-a', project_id: 'project-a', branch_id: 'br-a', type: 'read_write', current_state: 'idle', disabled: false };
export const cases = [
  ['getProject', { project_id: 'project-a' }, { project }, { project }],
  ['listProjectBranches', { project_id: 'project-a' }, { branches: [branch] }, { branches: [branch] }],
  ['getProjectBranch', { project_id: 'project-a', branch_id: 'br-a' }, { branch }, { branch }],
  ['listProjectBranchEndpoints', { project_id: 'project-a', branch_id: 'br-a' }, { endpoints: [endpoint] }, { endpoints: [endpoint] }],
  ['getProjectEndpoint', { project_id: 'project-a', endpoint_id: 'ep-a' }, { endpoint }, { endpoint }],
];
export const catalogCases = [
  ['getProjectOperation', { project_id: 'project-a', operation_id: operation.id }, { operation }, { operation }],
  ['listProjectOperations', { project_id: 'project-a' }, { operations: [operation] }, { operations: [operation] }],
  ['countProjectBranches', { project_id: 'project-a' }, { count: 2 }, { count: 2 }],
  ['listProjectEndpoints', { project_id: 'project-a' }, { endpoints: [endpoint] }, { endpoints: [endpoint] }],
  ['listProjectBranchDatabases', { project_id: 'project-a', branch_id: 'br-a' }, { databases: [database] }, { databases: [database] }],
  ['getProjectBranchDatabase', { project_id: 'project-a', branch_id: 'br-a', database_name: 'main' }, { database }, { database }],
  ['listProjectBranchRoles', { project_id: 'project-a', branch_id: 'br-a' }, { roles: [role] }, { roles: [role] }],
  ['getProjectBranchRole', { project_id: 'project-a', branch_id: 'br-a', role_name: 'reader' }, { role }, { role }],
];
export const library = { library_name: 'pg_stat_statements', is_default: true, is_experimental: false, version: '1.11' };
export const anonymized = { project_id: 'project-a', branch_id: 'br-a', state: 'anonymized' };
export const snapshot = { id: 'snap-a', source_branch_id: 'br-a', created_at: '2026-11-08T00:00:00Z', manual: true };
export const schedule = { frequency: 'daily', hour: 3, day: 1, month: 1, retention_seconds: 86400 };
export const capabilityScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  snapshots: [{ id: 'snap-a', branchId: 'br-a' }] };
export const capabilityCases = [
  ['getAvailablePreloadLibraries', { project_id: 'project-a' }, { libraries: [library] }, { libraries: [library] }],
  ['getAnonymizedBranchStatus', { project_id: 'project-a', branch_id: 'br-a' }, anonymized, anonymized],
  ['listSnapshots', { project_id: 'project-a' }, { snapshots: [snapshot] }, { snapshots: [snapshot] }],
  ['getSnapshotSchedule', { project_id: 'project-a', branch_id: 'br-a' }, { schedule: [schedule] }, { schedule: [schedule] }],
];
export const branchFeatureScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const realtime = { enabled: false, pending: true, revision: 1, invocation_url: 'https://example.invalid', allowed_origins: ['https://example.invalid'] };
export const storage = { enabled: true, s3_endpoint: 'https://example.invalid', region: 'us-east-2', force_path_style: true };
export const aiGateway = { enabled: true, base_url: 'https://example.invalid' };
export const branchFeatureCases = [
  ['getProjectBranchRealtime', { project_id: 'project-a', branch_id: 'br-a' }, realtime, { enabled: false, pending: true, revision: 1 }],
  ['getProjectBranchStorage', { project_id: 'project-a', branch_id: 'br-a' }, storage, { enabled: true }],
  ['getProjectBranchAiGateway', { project_id: 'project-a', branch_id: 'br-a' }, aiGateway, { enabled: true }],
];
export const authStatusScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const authStatusCases = [
  ['getNeonAuthAllowLocalhost', { project_id: 'project-a', branch_id: 'br-a' }, { allow_localhost: false }, { allow_localhost: false }],
  ['getNeonAuthPhoneNumberPlugin', { project_id: 'project-a', branch_id: 'br-a' }, { enabled: true, otp_expires_in: 300 }, { enabled: true, otp_expires_in: 300 }],
  ['getNeonAuthOAuthProviderPlugin', { project_id: 'project-a', branch_id: 'br-a' }, { enabled: false }, { enabled: false }],
];
export const authDomainScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const authDomain = { domain: 'example.invalid', auth_provider: 'better_auth' };
export const authDomainCases = [
  ['listNeonAuthRedirectURIWhitelistDomains', { project_id: 'project-a' }, { domains: [authDomain] }, { domains: [authDomain] }],
  ['listBranchNeonAuthTrustedDomains', { project_id: 'project-a', branch_id: 'br-a' }, { domains: [authDomain] }, { domains: [authDomain] }],
];
export const authIntegrationScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const authIntegration = { branch_id: 'br-a', auth_provider: 'better_auth', owned_by: 'neon', transfer_status: 'finished' };
export const authIntegrationCases = [
  ['getNeonAuth', { project_id: 'project-a', branch_id: 'br-a' }, authIntegration, authIntegration],
  ['listNeonAuthIntegrations', { project_id: 'project-a' }, { data: [authIntegration] }, { data: [authIntegration] }],
];
export const functionScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  functions: [{ id: 'fn-a', slug: 'hello', branchId: 'br-a' }, { id: 'fn-b', slug: 'other', branchId: 'br-b' }] };
export const neonFunction = { id: 'fn-a', slug: 'hello', current_deployment: { id: 2, status: 'building' },
  active_deployment: { id: 1, status: 'completed' } };
export const functionCases = [
  ['listProjectBranchFunctions', { project_id: 'project-a', branch_id: 'br-a' }, { functions: [neonFunction] }, { functions: [neonFunction] }],
  ['getProjectBranchFunction', { project_id: 'project-a', branch_id: 'br-a', slug: 'hello' }, { function: neonFunction }, { function: neonFunction }],
];
export const triggerScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  triggers: [{ id: 'tr-a', branchId: 'br-a', functionSlug: 'hello' }, { id: 'tr-b', branchId: 'br-a', functionSlug: 'other' },
    { id: 'tr-a', branchId: 'br-b', functionSlug: 'hello' }] };
export const neonTrigger = { trigger_id: 'tr-a', type: 'schedule', function_slug: 'hello', enabled: false, inherited: true, version: 1 };
export const triggerCases = [
  ['listProjectBranchTriggers', { project_id: 'project-a', branch_id: 'br-a' }, { triggers: [neonTrigger] }, { triggers: [neonTrigger] }],
  ['getProjectBranchTrigger', { project_id: 'project-a', branch_id: 'br-a', trigger_id: 'tr-a' }, { trigger: neonTrigger }, { trigger: neonTrigger }],
];
export const authClientScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  clients: [{ id: 'ClientA', branchId: 'br-a' }, { id: 'ClientB', branchId: 'br-b' }, { id: 'ClientC', branchId: 'br-a' }] };
export const authClient = { client_id: 'ClientA', type: 'confidential', skip_consent: false, disabled: true };
export const authClientCases = [
  ['listNeonAuthOAuthClients', { project_id: 'project-a', branch_id: 'br-a' }, { clients: [authClient] }, { clients: [authClient] }],
  ['getNeonAuthOAuthClient', { project_id: 'project-a', branch_id: 'br-a', client_id: 'ClientA' }, authClient, authClient],
];
export const branchResourceScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  buckets: [{ name: 'assets', branchId: 'br-a' }, { name: 'other', branchId: 'br-b' }],
  domains: [{ domain: 'app.example.invalid', branchId: 'br-a', functionSlug: 'hello' },
    { domain: 'other.example.invalid', branchId: 'br-b', functionSlug: 'other' }] };
export const bucket = { name: 'assets', access_level: 'private' };
export const customDomain = { domain: 'app.example.invalid', entity_type: 'function', entity_id: 'hello', status: 'pending' };
export const branchResourceCases = [
  ['listProjectBranchBuckets', { project_id: 'project-a', branch_id: 'br-a' }, { buckets: [bucket] }, { buckets: [bucket] }],
  ['listProjectBranchCustomDomains', { project_id: 'project-a', branch_id: 'br-a' }, { custom_domains: [customDomain] }, { custom_domains: [customDomain] }],
];
export const projectSecurityScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  jwks: [{ id: 'jwks-a', branchId: 'br-a' }, { id: 'jwks-project', branchId: null }], vpcEndpointIds: ['vpce-a'] };
export const jwks = { id: 'jwks-a', project_id: 'project-a', branch_id: 'br-a' };
export const vpcEndpoint = { vpc_endpoint_id: 'vpce-a' };
export const projectSecurityCases = [
  ['getProjectJWKS', { project_id: 'project-a' }, { jwks: [jwks] }, { jwks: [jwks] }],
  ['listProjectVPCEndpoints', { project_id: 'project-a' }, { endpoints: [vpcEndpoint] }, { endpoints: [vpcEndpoint] }],
];
export const allCases = [...cases, ...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases, ...authDomainCases, ...authIntegrationCases, ...functionCases, ...triggerCases, ...authClientCases, ...branchResourceCases, ...projectSecurityCases];
export const canary = 'synthetic-neon-credential-canary';
export function response(value, init = {}) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init });
}
export function catalogFixture(value, config = catalogScope) {
  return fixture(value, config, createNeonCatalogOperations);
}
export function capabilityFixture(value, config = capabilityScope) {
  return fixture(value, config, createNeonCapabilityOperations);
}
export function branchFeatureFixture(value, config = branchFeatureScope) {
  return fixture(value, config, createNeonBranchFeatureOperations);
}
export function authStatusFixture(value, config = authStatusScope) {
  return fixture(value, config, createNeonAuthStatusOperations);
}
export function authDomainFixture(value, config = authDomainScope) {
  return fixture(value, config, createNeonAuthDomainOperations);
}
export function authIntegrationFixture(value, config = authIntegrationScope) {
  return fixture(value, config, createNeonAuthIntegrationOperations);
}
export function functionFixture(value, config = functionScope) {
  return fixture(value, config, createNeonFunctionOperations);
}
export function triggerFixture(value, config = triggerScope) {
  return fixture(value, config, createNeonTriggerOperations);
}
export function authClientFixture(value, config = authClientScope) {
  return fixture(value, config, createNeonAuthClientOperations);
}
export function branchResourceFixture(value, config = branchResourceScope) {
  return fixture(value, config, createNeonBranchResourceOperations);
}
export function projectSecurityFixture(value, config = projectSecurityScope) {
  return fixture(value, config, createNeonProjectSecurityOperations);
}
export function fixture(value, config = scope, factory = createNeonMetadataOperations) {
  const requests = [];
  const transport = createNeonMetadataTransport(async (url, init) => {
    requests.push({ url, init });
    return typeof value === 'function' ? value(url, init, requests.length) : response(value);
  });
  const operations = factory(structuredClone(config), transport);
  return {
    operations, requests,
    operation(name) { return operations.find(operation => operation.name === `neon.${name}`); },
    async run(name, args, signal = new AbortController().signal) {
      const operation = this.operation(name);
      const prepared = operation.prepare(args);
      return operation.project(await operation.execute(prepared, canary, signal, 'synthetic-request'));
    },
  };
}
