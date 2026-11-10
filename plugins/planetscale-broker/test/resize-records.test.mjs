import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as bouncer from '../../../dist/plugins/planetscale-broker/src/tools/get-bouncer.js';
import * as bouncers from '../../../dist/plugins/planetscale-broker/src/tools/list-bouncers.js';
import * as bouncerResizes from '../../../dist/plugins/planetscale-broker/src/tools/list-bouncer-resize-requests.js';
import * as branchBouncerResizes from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-bouncer-resize-requests.js';
import * as branchResize from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-resize-request.js';
import * as branchResizes from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-resize-requests.js';
import * as keyspaceResize from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-resize-request.js';
import * as keyspaceResizes from '../../../dist/plugins/planetscale-broker/src/tools/list-keyspace-resize-requests.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const path = '/v1/organizations/example-org/databases/app/branches/staging';
const bouncerBinding = { id: 'bo123', name: 'pool' };
const resizeBinding = { id: 'rs123' };
const bouncerResizeBinding = { ...resizeBinding, bouncerId: 'bo123', bouncer: 'pool' };
const keyspaceBinding = { id: 'ks123', name: 'main' };
const ignored = { actor: { id: canary, display_name: canary }, sku: { name: canary }, previous_sku: { name: canary }, parameters: { password: canary }, previous_parameters: { password: canary }, created_at: canary, updated_at: canary, started_at: canary, completed_at: canary, replicas_per_cell: 3, vtgate_size: canary, vtgate_name: canary, cluster_name: canary, cluster_display_name: canary, approval: true };
const bouncerRow = { ...ignored, ...bouncerBinding, target: 'primary', branch: { id: 'br123', name: 'staging', url: canary }, parameters: [{ name: canary, value: canary }] };
const bouncerExpected = { ...bouncerBinding, branchId: 'br123', branch: 'staging', target: 'primary' };
const bouncerResizeRow = { ...ignored, id: 'rs123', state: 'pending', bouncer: { ...bouncerBinding, url: canary } };
const bouncerResizeExpected = { ...bouncerResizeBinding, state: 'pending' };
const resizeRow = { ...ignored, id: 'rs123', state: 'queued' };
const resizeExpected = { id: 'rs123', state: 'queued' };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [bouncer, { ...target, branchId: 'br123', bouncer: bouncerBinding }, 'bouncer', bouncerRow, bouncerExpected, path + '/bouncers/pool', false, 'PostgresBouncer'],
  [bouncers, { ...target, branchId: 'br123', bouncers: [bouncerBinding] }, 'bouncers', bouncerRow, bouncerExpected, path + '/bouncers', true, 'PostgresBouncer'],
  [bouncerResizes, { ...target, bouncer: bouncerBinding, resizes: [bouncerResizeBinding] }, 'resizes', bouncerResizeRow, bouncerResizeExpected, path + '/bouncers/pool/resizes', true, 'PostgresBouncerResizeRequest'],
  [branchBouncerResizes, { ...target, resizes: [bouncerResizeBinding] }, 'resizes', bouncerResizeRow, bouncerResizeExpected, path + '/bouncer-resizes', true, 'PostgresBouncerResizeRequest'],
  [branchResize, { ...target, resize: resizeBinding }, 'resize', resizeRow, resizeExpected, path + '/resizes/rs123', false, 'MysqlClusterResizeRequest'],
  [branchResizes, { ...target, resizes: [resizeBinding] }, 'resizes', resizeRow, resizeExpected, path + '/resizes', true, 'MysqlClusterResizeRequest'],
  [keyspaceResize, { ...target, keyspace: keyspaceBinding, resize: resizeBinding }, 'resize', resizeRow, resizeExpected, path + '/keyspaces/main/resizes/rs123', false, 'KeyspaceResizeRequest'],
  [keyspaceResizes, { ...target, keyspace: keyspaceBinding, resizes: [resizeBinding] }, 'resizes', resizeRow, resizeExpected, path + '/keyspaces/main/resizes', true, 'KeyspaceResizeRequest'],
];

for (const [adapter, scope, key, row, expected, endpoint, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const project = (prepared, rows) => prepared.project(wire(list ? page(rows) : rows[0]));
  const output = list ? { items: [expected], nextPage: null, complete: true } : expected;
  test(`${adapter.operationId}: fixed GET and immutable configuration-free projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, output);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, list ? result.items : result, list ? result.items[0] : result]) assert.ok(Object.isFrozen(value));
    if (list) assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: unknown/rebound identities refuse the whole page`, () => {
    const prepared = adapter.prepare(scope, args);
    const bad = [{ ...row, id: 'foreign' }, { ...row, id: canary }, { ...row, id: null }];
    if ('target' in row) {
      for (const name of ['foreign', null, canary]) bad.push({ ...row, name });
      for (const branch of [null, {}, [], { id: 'foreign', name: 'staging' }, { id: 'br123', name: 'foreign' }, { id: canary, name: canary }]) bad.push({ ...row, branch });
    }
    if (row.bouncer) for (const value of [null, {}, [], { id: 'foreign', name: 'pool' }, { id: 'bo123', name: 'foreign' }, { id: canary, name: canary }]) bad.push({ ...row, bouncer: value });
    for (const value of bad) assert.throws(() => project(prepared, list ? [row, value] : [value]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: malformed selected fields, wire/page caps refuse`, () => {
    const prepared = adapter.prepare(scope, args);
    const field = 'target' in row ? 'target' : 'state';
    for (const value of [null, undefined, 'approved', canary, 1, {}]) assert.throws(() => project(prepared, [{ ...row, [field]: value }]), error => !String(error).includes(canary));
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.deepEqual(prepared.project(wire({ ...page([row]), next_page: 2 })), { items: [expected], nextPage: 2, complete: false });
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed arguments and broker scope reject overrides/accessors`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'target', 'sku', 'parameters', 'completed_at', 'q']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: '../foreign' }, { ...scope, branch: '../foreign' }]) assert.throws(() => adapter.prepare(value, args));
    const binding = list ? scope[key][0] : scope[key];
    const bad = [{ ...binding, id: '../escape' }, { ...binding, extra: true }, {}];
    for (const field of ['name', 'bouncer', 'bouncerId']) if (field in binding) bad.push({ ...binding, [field]: '../escape' });
    for (const value of bad) assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [value] : value }, args));
    if (list) {
      for (const value of [[], [binding, binding], Array(33).fill(binding)]) assert.throws(() => adapter.prepare({ ...scope, [key]: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    }
    const hostile = Object.defineProperty({ ...binding }, 'id', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [hostile] : hostile }, args), error => !String(error).includes(canary));
    for (const parent of ['keyspace', ...(key !== 'bouncer' ? ['bouncer'] : [])]) if (scope[parent]) {
      for (const value of [{ ...scope[parent], id: '../escape' }, { ...scope[parent], name: '../escape' }, { ...scope[parent], extra: true }]) assert.throws(() => adapter.prepare({ ...scope, [parent]: value }, args));
    }
    if (scope.branchId) assert.throws(() => adapter.prepare({ ...scope, branchId: '../escape' }, args));
  });

  test(`${adapter.operationId}: later input mutation cannot widen/retarget bindings`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign'; copied.database = 'foreign'; copied.branch = 'foreign';
    if (copied.branchId) copied.branchId = 'foreign';
    const binding = list ? copied[key][0] : copied[key];
    for (const field of Object.keys(binding)) binding[field] = 'foreign';
    for (const parent of ['keyspace', 'bouncer']) if (copied[parent]) { copied[parent].id = 'foreign'; copied[parent].name = 'foreign'; }
    if (list) copied[key].push({ ...binding, id: 'another' });
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, endpoint + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), output);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });
}

test('per-bouncer resize bindings cannot name another parent', () => {
  const scope = { ...target, bouncer: bouncerBinding, resizes: [bouncerResizeBinding] };
  for (const patch of [{ bouncerId: 'foreign' }, { bouncer: 'foreign' }]) assert.throws(() => bouncerResizes.prepare({ ...scope, resizes: [{ ...bouncerResizeBinding, ...patch }] }, { page: 1, perPage: 2 }));
});

test('provider target and resize states are informational enums, not native authority', () => {
  for (const targetValue of ['primary', 'replica', 'replica_az_affinity']) assert.deepEqual(bouncer.prepare({ ...target, branchId: 'br123', bouncer: bouncerBinding }, {}).project(wire({ ...bouncerRow, target: targetValue })), { ...bouncerExpected, target: targetValue });
  for (const [adapter, scope, , row, expected, , list, definition] of fixtures.filter(value => value[7] !== 'PostgresBouncer')) {
    const states = ['pending', 'resizing', 'canceled', 'completed', ...(definition === 'PostgresBouncerResizeRequest' ? [] : ['queued'])];
    const prepared = adapter.prepare(scope, list ? { page: 1, perPage: 2 } : {});
    for (const state of states) assert.deepEqual(prepared.project(wire(list ? page([{ ...row, state }]) : { ...row, state })), list ? { items: [{ ...expected, state }], nextPage: null, complete: true } : { ...expected, state });
    if (definition === 'PostgresBouncerResizeRequest') assert.throws(() => prepared.project(wire(page([{ ...row, state: 'queued' }]))));
  }
});

test('bouncer/resize endpoints and selected fields match pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, key, , , endpoint, list, definitionName] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const binding = list ? scope[key][0] : scope[key];
    const parameters = { ...target, bouncer: scope.bouncer?.name, keyspace: scope.keyspace?.name, id: binding.id, resize: binding.id };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), endpoint);
    const queries = operation.value.parameters.filter(value => value.in === 'query').map(value => value.name);
    if (list) for (const name of ['page', 'per_page']) assert.ok(queries.includes(name));
    else assert.deepEqual(queries, []);
    const definition = schema.definitions[definitionName];
    for (const field of ['id', ...(definitionName === 'PostgresBouncer' ? ['name', 'branch', 'target'] : ['state']), ...(definitionName === 'PostgresBouncerResizeRequest' ? ['bouncer'] : [])]) assert.ok(definition.required.includes(field));
    if (definitionName === 'PostgresBouncer') for (const field of ['id', 'name']) assert.ok(definition.properties.branch.required.includes(field));
    if (definitionName === 'PostgresBouncerResizeRequest') for (const field of ['id', 'name']) assert.ok(definition.properties.bouncer.required.includes(field));
    const resultSchema = operation.value.responses['200'].schema;
    if (list) assert.deepEqual(schema.definitions[resultSchema.$ref.split('/').at(-1)].properties.data.items, definition);
    else assert.equal(resultSchema.$ref, '#/definitions/' + definitionName);
  }
  assert.deepEqual(schema.definitions.PostgresBouncer.properties.target.enum, ['primary', 'replica', 'replica_az_affinity']);
  assert.deepEqual(schema.definitions.PostgresBouncerResizeRequest.properties.state.enum, ['pending', 'resizing', 'canceled', 'completed']);
  for (const name of ['KeyspaceResizeRequest', 'MysqlClusterResizeRequest']) assert.deepEqual(schema.definitions[name].properties.state.enum, ['pending', 'resizing', 'canceled', 'completed', 'queued']);
});
