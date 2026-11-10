import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as change from '../../../dist/plugins/planetscale-broker/src/tools/get-change-request.js';
import * as changes from '../../../dist/plugins/planetscale-broker/src/tools/list-change-requests.js';
import * as replicas from '../../../dist/plugins/planetscale-broker/src/tools/list-dedicated-read-replica-change-requests.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const branch = { organization: 'example-org', database: 'example-db', branch: 'staging' };
const branchPath = '/v1/organizations/example-org/databases/example-db/branches/staging';
const binding = { id: 'ch123', type: 'NekiRouterChangeRequest', targetId: 'ro123', targetType: 'NekiRouter', targetName: 'router-a' };
const replicaBinding = { id: 'rc123', replicaId: 're123', replica: 'replica-a' };
const row = { id: binding.id, type: binding.type, target_id: binding.targetId, target_type: binding.targetType, target_name: binding.targetName, state: 'draft', can_delete: true, parameters: { key: canary }, previous_parameters: { key: canary }, storage: { iops: canary }, actor: { id: canary }, created_at: canary, updated_at: canary, started_at: canary, completed_at: canary, cluster_name: canary, router_size: canary, target: canary, postgres_image_version: canary };
const replicaRow = { id: replicaBinding.id, replica: { id: replicaBinding.replicaId, name: replicaBinding.replica, created_at: canary, deleted_at: canary }, state: 'resizing', parameters: { key: canary }, previous_parameters: { key: canary }, cluster_name: canary, storage_type: canary, actor: { id: canary }, started_at: canary, completed_at: canary };
const expected = { ...binding, state: 'draft', canDelete: true };
const replicaExpected = { ...replicaBinding, state: 'resizing' };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [change, { ...branch, change: binding }, row, expected, '/change-requests/ch123', false],
  [changes, { ...branch, changes: [binding] }, row, expected, '/change-requests', true],
  [replicas, { ...branch, changes: [replicaBinding] }, replicaRow, replicaExpected, '/dedicated-read-replica-changes', true],
];

for (const [adapter, scope, value, output, suffix, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const path = branchPath + suffix + (list ? '?page=1&per_page=2' : '');
  const response = rows => list ? page(rows) : rows[0];
  const result = rows => list ? { items: rows, nextPage: null, complete: true } : rows[0];
  const project = (prepared, rows) => prepared.project(wire(response(rows)));
  const key = list ? 'changes' : 'change';

  test(`${adapter.operationId}: fixed GET and immutable metadata-only result`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
    const actual = project(prepared, [value]);
    assert.deepEqual(actual, result([output]));
    assert.ok(!JSON.stringify(actual).includes(canary));
    for (const item of [prepared, prepared.request, actual, ...(list ? [actual.items, actual.items[0]] : [])]) assert.ok(Object.isFrozen(item));
    if (list) assert.deepEqual(project(prepared, []), result([]));
  });

  test(`${adapter.operationId}: bound child and target mismatches refuse the whole response`, () => {
    const prepared = adapter.prepare(scope, args);
    const bad = [{ ...value, id: 'foreign' }, { ...value, id: canary }];
    if (adapter === replicas) {
      for (const replica of [null, {}, [], { ...value.replica, id: 'foreign' }, { ...value.replica, name: 'foreign' }, { ...value.replica, name: canary }]) bad.push({ ...value, replica });
    } else {
      for (const [field, values] of Object.entries({ type: ['NekiClusterChangeRequest', canary, null], target_type: ['NekiCluster', canary, null], target_id: ['foreign', null, canary], target_name: ['foreign', null, canary] })) for (const changed of values) bad.push({ ...value, [field]: changed });
    }
    for (const changed of bad) assert.throws(() => project(prepared, list ? [value, changed] : [changed]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed broker scope and arguments reject overrides and accessors`, () => {
    for (const field of ['url', 'sql', 'credential', 'approval', 'agentId', 'production', 'can_delete', 'state', 'target_types', 'target_id', 'period', 'completed_at']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, extra: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'x%2fy' }, { ...scope, branch: 'x\n' }]) assert.throws(() => adapter.prepare(invalid, args));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    const item = list ? scope[key][0] : scope[key];
    const badBindings = [{ ...item, id: '../foreign' }, { ...item, extra: true }];
    if (adapter === replicas) badBindings.push({ ...item, replica: '../foreign' }, { ...item, replicaId: null });
    else badBindings.push({ ...item, type: 'NekiClusterChangeRequest' }, { ...item, targetName: '../foreign' }, { ...item, targetId: undefined }, { ...item, targetId: '../foreign' });
    for (const invalid of badBindings) assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [invalid] : invalid }, args));
    if (list) for (const invalid of [[], [item, item], Array(33).fill(item)]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
  });

  test(`${adapter.operationId}: bounded wire and malformed fields fail without reflecting payload`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const invalid of [wire(null), wire([]), wire({}), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(invalid), error => !String(error).includes(canary));
    for (const field of adapter === replicas ? ['state'] : ['state', 'can_delete']) for (const invalid of [undefined, null, 1, {}, [], canary]) assert.throws(() => project(prepared, [{ ...value, [field]: invalid }]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: later scope/argument mutation cannot retarget or widen`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign'; copied.database = 'foreign'; copied.branch = 'foreign';
    const item = list ? copied[key][0] : copied[key];
    item.id = 'foreign';
    if (adapter === replicas) { item.replicaId = 'foreign'; item.replica = 'foreign'; }
    else { item.targetId = 'foreign'; item.targetName = 'foreign'; item.type = 'NekiClusterChangeRequest'; }
    if (list) copied[key].push({ ...item });
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path);
    assert.deepEqual(project(prepared, [value]), result([output]));
    assert.throws(() => project(prepared, [{ ...value, id: 'foreign' }]));
  });

  test(`${adapter.operationId}: informational state sets never grant action authority`, () => {
    const prepared = adapter.prepare(scope, args);
    const states = adapter === replicas ? ['pending', 'resizing', 'canceled', 'completed'] : ['draft', 'pending', 'applying', 'canceled', 'completed'];
    for (const state of states) assert.deepEqual(project(prepared, [{ ...value, state, approval: true }]), result([{ ...output, state }]));
    assert.throws(() => project(prepared, [{ ...value, state: 'queued' }]));
    if (adapter !== replicas) assert.deepEqual(project(prepared, [{ ...value, can_delete: false }]), result([{ ...output, canDelete: false }]));
  });
}

test('unified change projections preserve every documented type/target pair and nullable target identity', () => {
  for (const targetType of ['NekiAdmin', 'NekiCluster', 'NekiConfigurationProfile', 'NekiExternalShard', 'NekiRouter', 'PostgresBouncer']) {
    for (const targetId of ['ta123', null]) {
      const bound = { ...binding, type: targetType + 'ChangeRequest', targetType, targetId };
      const prepared = change.prepare({ ...branch, change: bound }, {});
      assert.deepEqual(prepared.project(wire({ ...row, type: bound.type, target_type: targetType, target_id: targetId })), { ...bound, state: 'draft', canDelete: true });
      assert.throws(() => prepared.project(wire({ ...row, type: bound.type, target_type: targetType, target_id: targetId === null ? 'ta123' : null })));
    }
  }
});

test('unified collections preserve mixed targets and refuse invalid pagination without following URLs', () => {
  const bound = { ...binding, id: 'ch456', type: 'NekiClusterChangeRequest', targetType: 'NekiCluster', targetId: null, targetName: 'cluster-a' };
  const changed = { ...row, id: bound.id, type: bound.type, target_type: bound.targetType, target_id: bound.targetId, target_name: bound.targetName };
  assert.deepEqual(changes.prepare({ ...branch, changes: [binding, bound] }, { page: 1, perPage: 2 }).project(wire(page([row, changed]))).items, [expected, { ...bound, state: 'draft', canDelete: true }]);
  for (const [adapter, scope, value] of fixtures.filter(([, , , , , list]) => list)) {
    const prepared = adapter.prepare(scope, { page: 1, perPage: 2 });
    assert.deepEqual(prepared.project(wire({ ...page([value]), next_page: 2 })), { items: [adapter === replicas ? replicaExpected : expected], nextPage: 2, complete: false });
    for (const invalid of [{ ...page([value]), current_page: 2 }, { ...page([value]), per_page: 11 }, { ...page([value]), next_page: 3 }, page([value, value, value]), page([null])]) assert.throws(() => prepared.project(wire(invalid)));
    for (const args of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, args));
    assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([value]), current_page: 100, next_page: 101 })));
  }
});

test('unified paths, selected fields and redirect-only gaps match the pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url), 'utf8'));
  for (const [adapter, scope, , , suffix, list] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    const parameters = { organization: scope.organization, database: scope.database, branch: scope.branch, id: binding.id };
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), branchPath + suffix);
    assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query').map(value => value.name), !list ? [] : adapter === replicas ? ['page', 'per_page', 'period', 'completed_at'] : ['page', 'per_page', 'state', 'target_types', 'target_id', 'period', 'completed_at']);
    let selected = schema.definitions[entry.value.responses['200'].schema.$ref.split('/').at(-1)];
    if (list) selected = selected.properties.data.items;
    for (const field of adapter === replicas ? ['id', 'state', 'replica'] : ['id', 'state', 'type', 'can_delete', 'target_id', 'target_type', 'target_name']) assert.ok(selected.required.includes(field));
    assert.deepEqual(selected.properties.state.enum, adapter === replicas ? ['pending', 'resizing', 'canceled', 'completed'] : ['draft', 'pending', 'applying', 'canceled', 'completed']);
    if (adapter === replicas) for (const field of ['id', 'name']) assert.ok(selected.properties.replica.required.includes(field));
    else {
      assert.equal(selected.properties.target_id['x-nullable'], true);
      assert.deepEqual(selected.properties.type.enum, selected.properties.target_type.enum.map(type => type + 'ChangeRequest'));
    }
  }
  for (const operationId of ['get_admin_change_request', 'list_admin_change_requests', 'get_neki_change_request', 'list_neki_change_requests', 'get_router_change_request', 'list_router_change_requests']) {
    const entry = Object.values(schema.paths).flatMap(methods => Object.values(methods)).find(value => value.operationId === operationId);
    assert.ok(entry.responses['308']);
    assert.equal(Object.keys(entry.responses).some(code => code.startsWith('2')), false);
    const mapped = map.operations.find(value => value.operationId === operationId);
    assert.equal(mapped.adapter, null);
    assert.equal(mapped.implementation, 'missing');
    assert.ok(mapped.prerequisites.includes('reviewed-fixed-redirect-alias-contract-no-automatic-follow'));
  }
});
