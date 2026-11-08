import { createNeonMetadataOperations } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonMetadataTransport } from '../dist/plugins/neon-broker/src/transport.js';

export const scope = {
  projectId: 'project-a', revision: 'scope-v1', branchIds: ['br-a', 'br-b'],
  endpoints: [{ id: 'ep-a', branchId: 'br-a' }, { id: 'ep-b', branchId: 'br-b' }],
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
export const canary = 'synthetic-neon-credential-canary';
export function response(value, init = {}) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init });
}
export function fixture(value, config = scope) {
  const requests = [];
  const transport = createNeonMetadataTransport(async (url, init) => {
    requests.push({ url, init });
    return typeof value === 'function' ? value(url, init, requests.length) : response(value);
  });
  const operations = createNeonMetadataOperations(structuredClone(config), transport);
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
