import { createNeonMetadataOperations } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonCatalogOperations } from '../dist/plugins/neon-broker/src/catalog.js';
import { createNeonCapabilityOperations } from '../dist/plugins/neon-broker/src/capabilities.js';
import { createNeonBranchFeatureOperations } from '../dist/plugins/neon-broker/src/branch-features.js';
import { createNeonAuthStatusOperations } from '../dist/plugins/neon-broker/src/auth-status.js';
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
export const allCases = [...cases, ...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases];
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
