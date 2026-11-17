import { createNeonBranchFeatureOperations } from '../dist/plugins/neon-broker/src/branch-features.js';
import { createNeonMetadataTransport } from '../dist/plugins/neon-broker/src/transport.js';

export const branchFeatureScope = { projectId: 'project-a', revision: 'scope-v1', branchIds: ['br-a', 'br-b'] };
export const canary = 'synthetic-neon-credential-canary';
export const realtime = { enabled: false, pending: true, revision: 1 };
const args = { project_id: 'project-a', branch_id: 'br-a' };
export const branchFeatureCases = [
  ['getProjectBranchRealtime', args, realtime, { enabled: false, pending: true, revision: 1 }],
  ['getProjectBranchStorage', args, { enabled: true }, { enabled: true }],
  ['getProjectBranchAiGateway', args, { enabled: true }, { enabled: true }],
];
export function response(value, init = {}) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init });
}
export function branchFeatureFixture(value, config = branchFeatureScope) {
  const requests = [];
  const transport = createNeonMetadataTransport(async (url, init) => {
    requests.push({ url, init });
    return typeof value === 'function' ? value(url, init, requests.length) : response(value);
  });
  const operations = createNeonBranchFeatureOperations(structuredClone(config), transport);
  return {
    operations, requests,
    operation(name) { return operations.find(operation => operation.name === `neon.${name}`); },
    async run(name, arguments_, signal = new AbortController().signal) {
      const operation = this.operation(name);
      const prepared = operation.prepare(arguments_);
      return operation.project(await operation.execute(prepared, canary, signal));
    },
  };
}
