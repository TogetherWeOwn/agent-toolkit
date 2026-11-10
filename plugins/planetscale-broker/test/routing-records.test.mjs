import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as router from '../../../dist/plugins/planetscale-broker/src/tools/get-router.js';
import * as routers from '../../../dist/plugins/planetscale-broker/src/tools/list-routers.js';
import * as replica from '../../../dist/plugins/planetscale-broker/src/tools/get-dedicated-read-replica.js';
import * as replicas from '../../../dist/plugins/planetscale-broker/src/tools/list-dedicated-read-replicas.js';
import * as switchover from '../../../dist/plugins/planetscale-broker/src/tools/get-switchover.js';
import * as switchovers from '../../../dist/plugins/planetscale-broker/src/tools/list-switchovers.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const branch = { organization: 'example-org', database: 'example-db', branch: 'staging' };
const branchPath = '/v1/organizations/example-org/databases/example-db/branches/staging';
const routerBinding = { id: 'ro123', name: 'router-a' };
const replicaBinding = { id: 're123', name: 'replica-a' };
const routerRow = { ...routerBinding, state: 'ready', default: true, autoscaling: false, sku: { rate: canary }, router_size: canary, replicas_per_cell: canary, max_replicas_per_cell: canary, target_cpu_utilization: canary, created_at: canary, updated_at: canary };
const routerExpected = { ...routerBinding, state: 'ready', default: true, autoscaling: false };
const replicaRow = { ...replicaBinding, state: 'ready', ready: true, replicas: canary, cluster_name: canary, cluster_display_name: canary, access_host_url: canary, private_access_host_url: canary, private_connection_service_name: canary, minimum_storage_bytes: canary, maximum_storage_bytes: canary, storage_autoscaling: canary, storage_type: canary, storage_iops: canary, storage_throughput_mibs: canary, volume_modifications_blocked_until: canary, created_at: canary, updated_at: canary, ready_at: canary, actor: { id: canary }, region: { public_ip_addresses: [canary] }, parameters: [{ value: canary }] };
const replicaExpected = { ...replicaBinding, state: 'ready', ready: true };
const switchoverRow = { id: 'sw123', state: 'failed', method: canary, error: canary, started_at: '2026-11-07T10:00:00Z', completed_at: null, created_at: canary, updated_at: canary, actor: { id: canary } };
const switchoverExpected = { id: 'sw123', state: 'failed', startRecorded: true, finishRecorded: false };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [router, { ...branch, router: routerBinding }, 'router', routerRow, routerExpected, '/routers/router-a', 'detail', ['state', 'default', 'autoscaling']],
  [routers, { ...branch, routers: [routerBinding] }, 'routers', routerRow, routerExpected, '/routers', 'array', ['state', 'default', 'autoscaling']],
  [replica, { ...branch, replica: replicaBinding }, 'replica', replicaRow, replicaExpected, '/dedicated-read-replicas/replica-a', 'detail', ['state', 'ready']],
  [replicas, { ...branch, replicas: [replicaBinding] }, 'replicas', replicaRow, replicaExpected, '/dedicated-read-replicas', 'array', ['state', 'ready']],
  [switchover, { ...branch, switchoverId: 'sw123' }, 'switchoverId', switchoverRow, switchoverExpected, '/switchovers/sw123', 'detail', ['state', 'started_at', 'completed_at']],
  [switchovers, { ...branch, switchoverIds: ['sw123'] }, 'switchoverIds', switchoverRow, switchoverExpected, '/switchovers', 'page', ['state', 'started_at', 'completed_at']],
];

for (const [adapter, scope, key, row, expected, suffix, shape, fields] of fixtures) {
  const args = shape === 'page' ? { page: 1, perPage: 2 } : {};
  const path = branchPath + suffix + (shape === 'page' ? '?page=1&per_page=2' : '');
  const response = rows => shape === 'page' ? page(rows) : shape === 'array' ? rows : rows[0];
  const output = rows => shape === 'page' ? { items: rows, nextPage: null, complete: true } : shape === 'array' ? rows : rows[0];
  const project = (prepared, rows) => prepared.project(wire(response(rows)));

  test(`${adapter.operationId}: fixed GET and bounded metadata-only projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
    const result = project(prepared, [row]);
    assert.deepEqual(result, output([expected]));
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(prepared));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(result));
    if (shape !== 'detail') {
      const items = shape === 'page' ? result.items : result;
      assert.ok(Object.isFrozen(items));
      assert.ok(Object.isFrozen(items[0]));
      assert.deepEqual(project(prepared, []), output([]));
    }
  });

  test(`${adapter.operationId}: unknown or rebound child refuses the whole response`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', canary, null, undefined]) assert.throws(() => project(prepared, shape === 'detail' ? [{ ...row, id }] : [row, { ...row, id }]), error => !String(error).includes(canary));
    if ('name' in row) for (const name of ['foreign', canary, null]) assert.throws(() => project(prepared, shape === 'detail' ? [{ ...row, name }] : [row, { ...row, name }]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments and broker scope refuse overrides`, () => {
    for (const field of ['sql', 'url', 'credential', 'approval', 'agentId', 'production', 'state', 'ready', 'router', 'replica', 'switchoverId', 'replicas', 'autoscaling']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, extra: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'x%2fy' }, { ...scope, branch: 'x\n' }]) assert.throws(() => adapter.prepare(invalid, args));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    const bound = scope[key];
    if (Array.isArray(bound)) {
      const item = bound[0];
      for (const invalid of [[], [item, item], Array(33).fill(item), ['../foreign']]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
      if (typeof item === 'object') {
        for (const duplicate of [{ id: item.id, name: 'other' }, { id: 'other', name: item.name }]) assert.throws(() => adapter.prepare({ ...scope, [key]: [item, duplicate] }, args));
      }
    } else if (typeof bound === 'object') {
      for (const invalid of [{ ...bound, name: '../foreign' }, { ...bound, id: '../foreign' }, { ...bound, extra: true }]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
    } else assert.throws(() => adapter.prepare({ ...scope, [key]: '../foreign' }, args));
  });

  test(`${adapter.operationId}: wire and collection bounds fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    const malformed = [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({}), wire(canary), new TextEncoder().encode('{"secret":"' + canary)];
    if (shape !== 'array') malformed.push(wire([]));
    for (const value of malformed) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (shape === 'array') {
      assert.throws(() => prepared.project(wire(page([row]))));
      assert.throws(() => project(prepared, Array(33).fill(row)));
      assert.throws(() => project(prepared, [row, null]));
      assert.equal(project(prepared, Array(32).fill(row)).length, 32);
      for (const value of [{ page: 1, perPage: 2 }, { limit: 32 }]) assert.throws(() => adapter.prepare(scope, value));
    }
    if (shape === 'page') {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.deepEqual(prepared.project(wire({ ...page([row]), next_page: 2 })), { items: [expected], nextPage: 2, complete: false });
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: later scope mutation cannot retarget or widen results`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign'; copied.database = 'foreign'; copied.branch = 'foreign';
    if (Array.isArray(copied[key])) {
      if (typeof copied[key][0] === 'object') copied[key][0].name = 'foreign';
      copied[key].push(typeof copied[key][0] === 'object' ? { id: 'foreign', name: 'foreign' } : 'foreign');
    } else if (typeof copied[key] === 'object') copied[key].name = 'foreign';
    else copied[key] = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path);
    assert.deepEqual(project(prepared, [row]), output([expected]));
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign', name: 'foreign' }]));
  });

  test(`${adapter.operationId}: selected fields are strict informational metadata`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of fields) for (const value of [undefined, 1, {}, [], canary]) assert.throws(() => project(prepared, [{ ...row, [field]: value }]), error => !String(error).includes(canary));
    for (const field of fields.filter(value => !value.endsWith('_at'))) assert.throws(() => project(prepared, [{ ...row, [field]: null }]));
    if (fields.includes('started_at')) {
      assert.deepEqual(project(prepared, [{ ...row, started_at: null, completed_at: '2026-11-07T11:00:00Z' }]), output([{ ...expected, startRecorded: false, finishRecorded: true }]));
      for (const value of ['not-a-date', '2026-99-99T99:99:99Z']) assert.throws(() => project(prepared, [{ ...row, started_at: value }]));
    }
  });
}

test('routing state sets preserve pinned semantics without inferring action authority', () => {
  for (const [adapter, scope, , row, expected] of fixtures) {
    const states = adapter === router || adapter === routers ? ['pending', 'applying', 'ready'] : adapter === replica || adapter === replicas ? ['pending', 'ready', 'deleting'] : ['pending', 'running', 'succeeded', 'failed', 'canceled'];
    const list = adapter === routers || adapter === replicas;
    const paginated = adapter === switchovers;
    const prepared = adapter.prepare(scope, paginated ? { page: 1, perPage: 2 } : {});
    for (const state of states) {
      const changed = { ...row, state, approval: true };
      assert.deepEqual(prepared.project(wire(paginated ? page([changed]) : list ? [changed] : changed)), paginated ? { items: [{ ...expected, state }], nextPage: null, complete: true } : list ? [{ ...expected, state }] : { ...expected, state });
    }
  }
});

test('routing paths, non-paginated arrays and selected fields match the official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , suffix, shape, fields] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { organization: scope.organization, database: scope.database, branch: scope.branch, router: scope.router?.name, dedicated_read_replica: scope.replica?.name, id: scope.switchoverId };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), branchPath + suffix);
    assert.deepEqual(operation.value.parameters.filter(value => value.in === 'query').map(value => value.name), shape === 'page' ? ['page', 'per_page'] : []);
    const response = operation.value.responses['200'].schema;
    if (shape === 'array') assert.equal(response.type, 'array');
    let selected = shape === 'array' ? schema.definitions[response.items.$ref.split('/').at(-1)] : schema.definitions[response.$ref.split('/').at(-1)];
    if (shape === 'page') selected = selected.properties.data.items;
    for (const field of ['id', ...fields, ...(scope.router || scope.routers || scope.replica || scope.replicas ? ['name'] : [])]) assert.ok(selected.required.includes(field));
    if (scope.router || scope.routers) assert.deepEqual(selected.properties.state.enum, ['pending', 'applying', 'ready']);
    else if (scope.replica || scope.replicas) assert.match(selected.properties.state.description, /pending, ready, or deleting/);
    else assert.deepEqual(selected.properties.state.enum, ['pending', 'running', 'succeeded', 'failed', 'canceled']);
  }
});
