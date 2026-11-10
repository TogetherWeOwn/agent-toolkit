import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as change from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-change-request.js';
import * as changes from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-change-requests.js';
import * as branchConfig from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-config-change-request.js';
import * as branchConfigs from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-config-change-requests.js';
import * as keyspaceConfig from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-config-change-request.js';
import * as keyspaceConfigs from '../../../dist/plugins/planetscale-broker/src/tools/list-keyspace-config-change-requests.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const path = '/v1/organizations/example-org/databases/app/branches/staging';
const changeBinding = { id: 'ch123' };
const branchBinding = { id: 'bc123', changeType: 'vtgate', keyspace: null };
const keyspaceBinding = { id: 'kc123', changeType: 'mysqld', keyspace: 'main' };
const parentBinding = { id: 'ks123', name: 'main' };
const ignored = { actor: { id: canary, display_name: canary }, parameters: { password: canary }, previous_parameters: { password: canary }, new_options: { password: canary }, previous_options: { password: canary }, error_message: canary, started_at: canary, completed_at: canary, created_at: canary, updated_at: canary, queued_until: canary, cluster_name: canary, version: canary, previous_version: canary, approval: true };
const changeRow = { ...ignored, id: 'ch123', state: 'queued' };
const branchRow = { ...ignored, id: 'bc123', state: 'draft', change_type: 'vtgate', keyspace_name: null };
const keyspaceRow = { ...ignored, id: 'kc123', state: 'applying', change_type: 'mysqld', keyspace_name: 'main' };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [change, { ...target, change: changeBinding }, changeRow, { id: 'ch123', state: 'queued' }, path + '/changes/ch123', false, 'PostgresClusterResizeRequest'],
  [changes, { ...target, changes: [changeBinding] }, changeRow, { id: 'ch123', state: 'queued' }, path + '/changes', true, 'PostgresClusterResizeRequest'],
  [branchConfig, { ...target, change: branchBinding }, branchRow, { ...branchBinding, state: 'draft' }, path + '/config-changes/bc123', false, 'BranchConfigChangeRequest'],
  [branchConfigs, { ...target, changes: [branchBinding] }, branchRow, { ...branchBinding, state: 'draft' }, path + '/config-changes', true, 'ConfigChangeRequest'],
  [keyspaceConfig, { ...target, keyspace: parentBinding, change: keyspaceBinding }, keyspaceRow, { ...keyspaceBinding, state: 'applying' }, path + '/keyspaces/main/config-changes/kc123', false, 'KeyspaceConfigChangeRequest'],
  [keyspaceConfigs, { ...target, keyspace: parentBinding, changes: [keyspaceBinding] }, keyspaceRow, { ...keyspaceBinding, state: 'applying' }, path + '/keyspaces/main/config-changes', true, 'KeyspaceConfigChangeRequest'],
];

for (const [adapter, scope, row, expected, endpoint, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const project = (prepared, rows) => prepared.project(wire(list ? page(rows) : rows[0]));
  const output = list ? { items: [expected], nextPage: null, complete: true } : expected;
  test(`${adapter.operationId}: fixed GET and immutable configuration-free projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, output);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, ...(list ? [result.items, result.items[0]] : [])]) assert.ok(Object.isFrozen(value));
    if (list) assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: unknown or rebound identities refuse the whole page`, () => {
    const prepared = adapter.prepare(scope, args);
    const bad = [{ ...row, id: 'foreign' }, { ...row, id: canary }, { ...row, id: null }];
    if ('change_type' in row) {
      for (const change_type of [null, 'approved', 'vttablet', canary]) bad.push({ ...row, change_type });
      for (const keyspace_name of [undefined, 'foreign', canary, 1, ...(row.keyspace_name === null ? ['main'] : [null])]) bad.push({ ...row, keyspace_name });
    }
    for (const value of bad) assert.throws(() => project(prepared, list ? [row, value] : [value]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: selected fields and bounded wire/page validation`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const state of [null, undefined, 'approved', canary, 1, {}]) assert.throws(() => project(prepared, [{ ...row, state }]), error => !String(error).includes(canary));
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.deepEqual(prepared.project(wire({ ...page([row]), next_page: 2 })), { items: [expected], nextPage: 2, complete: false });
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed scope and arguments reject overrides/accessors`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'parameters', 'new_options', 'period', 'completed_at']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: '../foreign' }, { ...scope, branch: '../foreign' }]) assert.throws(() => adapter.prepare(value, args));
    const binding = list ? scope.changes[0] : scope.change;
    const bad = [{ ...binding, id: '../escape' }, { ...binding, extra: true }, {}];
    if ('changeType' in binding) for (const patch of [{ changeType: canary }, { keyspace: canary }, { changeType: 'vtgate', keyspace: 'main' }, { changeType: 'mysqld', keyspace: null }]) bad.push({ ...binding, ...patch });
    for (const value of bad) assert.throws(() => adapter.prepare({ ...scope, [list ? 'changes' : 'change']: list ? [value] : value }, args));
    if (list) {
      for (const value of [[], [binding, binding], Array(33).fill(binding)]) assert.throws(() => adapter.prepare({ ...scope, changes: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    }
    const hostile = Object.defineProperty({ ...binding }, 'id', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare({ ...scope, [list ? 'changes' : 'change']: list ? [hostile] : hostile }, args), error => !String(error).includes(canary));
    if (scope.keyspace) for (const value of [{ ...scope.keyspace, id: '../escape' }, { ...scope.keyspace, name: '../escape' }, { ...scope.keyspace, extra: true }]) assert.throws(() => adapter.prepare({ ...scope, keyspace: value }, args));
  });

  test(`${adapter.operationId}: later caller mutation cannot retarget bindings`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign'; copied.database = 'foreign'; copied.branch = 'foreign';
    const binding = list ? copied.changes[0] : copied.change;
    for (const field of Object.keys(binding)) binding[field] = 'foreign';
    if (copied.keyspace) { copied.keyspace.id = 'foreign'; copied.keyspace.name = 'foreign'; }
    if (list) copied.changes.push({ ...binding, id: 'another' });
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, endpoint + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), output);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });
}

test('config detail and keyspace collections reject wrong endpoint type/parent before preparation', () => {
  assert.throws(() => branchConfig.prepare({ ...target, change: keyspaceBinding }, {}));
  for (const [adapter, list] of [[keyspaceConfig, false], [keyspaceConfigs, true]]) {
    for (const binding of [branchBinding, { ...keyspaceBinding, keyspace: 'foreign' }]) assert.throws(() => adapter.prepare({ ...target, keyspace: parentBinding, [list ? 'changes' : 'change']: list ? [binding] : binding }, list ? { page: 1, perPage: 2 } : {}));
  }
});

test('branch config collection explicitly binds mixed branch and keyspace change types', () => {
  const prepared = branchConfigs.prepare({ ...target, changes: [branchBinding, keyspaceBinding] }, { page: 1, perPage: 2 });
  assert.deepEqual(prepared.project(wire(page([branchRow, keyspaceRow]))), { items: [{ ...branchBinding, state: 'draft' }, { ...keyspaceBinding, state: 'applying' }], nextPage: null, complete: true });
  assert.throws(() => prepared.project(wire(page([branchRow, { ...keyspaceRow, change_type: 'vtgate', keyspace_name: null }]))));
});

test('all documented config types and states are informational, never native authority', () => {
  for (const changeType of ['mysqld', 'vttablet']) {
    const prepared = keyspaceConfig.prepare({ ...target, keyspace: parentBinding, change: { ...keyspaceBinding, changeType } }, {});
    for (const state of ['draft', 'pending', 'queued', 'applying', 'completed', 'failed', 'canceled']) assert.deepEqual(prepared.project(wire({ ...keyspaceRow, change_type: changeType, state })), { ...keyspaceBinding, changeType, state });
  }
  const prepared = change.prepare({ ...target, change: changeBinding }, {});
  for (const state of ['queued', 'pending', 'resizing', 'canceled', 'completed']) assert.deepEqual(prepared.project(wire({ ...changeRow, state })), { id: 'ch123', state });
  assert.throws(() => prepared.project(wire({ ...changeRow, state: 'applying' })));
});

test('change endpoints and selected fields match pinned schema; admin aliases remain redirect-only', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , endpoint, list, definitionName] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const binding = list ? scope.changes[0] : scope.change;
    const parameters = { ...target, keyspace: scope.keyspace?.name, id: binding.id };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), endpoint);
    const queries = operation.value.parameters.filter(value => value.in === 'query').map(value => value.name);
    if (list) for (const name of ['page', 'per_page']) assert.ok(queries.includes(name));
    else assert.deepEqual(queries, []);
    const result = schema.definitions[operation.value.responses['200'].schema.$ref.split('/').at(-1)];
    const definition = list ? result.properties.data.items : result;
    for (const field of ['id', 'state', ...(definitionName === 'PostgresClusterResizeRequest' ? [] : ['change_type', 'keyspace_name'])]) assert.ok(definition.required.includes(field));
    assert.deepEqual(definition.properties.state.enum, definitionName === 'PostgresClusterResizeRequest' ? ['queued', 'pending', 'resizing', 'canceled', 'completed'] : ['draft', 'pending', 'queued', 'applying', 'completed', 'failed', 'canceled']);
    if (definitionName !== 'PostgresClusterResizeRequest') assert.deepEqual(definition.properties.change_type.enum, definitionName === 'BranchConfigChangeRequest' ? ['vtgate'] : definitionName === 'KeyspaceConfigChangeRequest' ? ['mysqld', 'vttablet'] : ['vtgate', 'mysqld', 'vttablet']);
  }
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const operationId of ['get_admin_change_request', 'list_admin_change_requests']) {
    const operation = Object.values(schema.paths).flatMap(methods => Object.values(methods)).find(value => value.operationId === operationId);
    assert.ok(operation.responses['308']);
    assert.ok(!Object.keys(operation.responses).some(code => code.startsWith('2')));
    const mapped = map.operations.find(value => value.operationId === operationId);
    assert.equal(mapped.implementation, 'missing');
    assert.equal(mapped.adapter, null);
    assert.ok(mapped.prerequisites.includes('reviewed-fixed-redirect-alias-contract-no-automatic-follow'));
  }
});
