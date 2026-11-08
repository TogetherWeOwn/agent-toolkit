import { createNeonMetadataOperations } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonCatalogOperations } from '../dist/plugins/neon-broker/src/catalog.js';
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
export const allCases = [...cases, ...catalogCases];
export const canary = 'synthetic-neon-credential-canary';
export function response(value, init = {}) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init });
}
export function catalogFixture(value, config = catalogScope) {
  return fixture(value, config, true);
}
export function fixture(value, config = scope, catalog = false) {
  const requests = [];
  const transport = createNeonMetadataTransport(async (url, init) => {
    requests.push({ url, init });
    return typeof value === 'function' ? value(url, init, requests.length) : response(value);
  });
  const operations = (catalog ? createNeonCatalogOperations : createNeonMetadataOperations)(structuredClone(config), transport);
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
