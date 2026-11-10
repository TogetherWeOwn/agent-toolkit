import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as schedule from '../../../dist/plugins/planetscale-broker/src/tools/get-maintenance-schedule.js';
import * as schedules from '../../../dist/plugins/planetscale-broker/src/tools/list-maintenance-schedules.js';
import * as branchWindow from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-maintenance-window.js';
import * as windows from '../../../dist/plugins/planetscale-broker/src/tools/list-maintenance-windows.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const db = { organization: 'example-org', database: 'example-db' };
const dbPath = '/v1/organizations/example-org/databases/example-db';
const scheduleRow = { id: 'sc123', enabled: true, required: false, frequency_unit: 'week', name: canary, created_at: canary, updated_at: canary, last_window_datetime: canary, next_window_datetime: canary, duration: canary, day: canary, hour: canary, week: canary, frequency_value: canary, expires_at: canary, deadline_at: canary, pending_vitess_version: canary, pending_mysql_version: canary };
const scheduleExpected = { id: 'sc123', enabled: true, required: false, frequencyUnit: 'week' };
const windowRow = { id: 'wi123', started_at: '2026-11-07T10:00:00Z', finished_at: null, created_at: canary, updated_at: canary };
const windowExpected = { id: 'wi123', startRecorded: true, finishRecorded: false };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [schedule, { ...db, scheduleId: 'sc123' }, 'scheduleId', scheduleRow, scheduleExpected, dbPath + '/maintenance-schedules/sc123', false],
  [schedules, { ...db, scheduleIds: ['sc123'] }, 'scheduleIds', scheduleRow, scheduleExpected, dbPath + '/maintenance-schedules', true],
  [branchWindow, { ...db, branch: 'staging', scheduleId: 'sc123' }, 'scheduleId', scheduleRow, scheduleExpected, dbPath + '/branches/staging/maintenance-window', false],
  [windows, { ...db, scheduleId: 'sc123', windowIds: ['wi123'] }, 'windowIds', windowRow, windowExpected, dbPath + '/maintenance-schedules/sc123/windows', true],
];

for (const [adapter, scope, key, row, expected, path, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const project = (prepared, rows) => prepared.project(wire(list ? page(rows) : rows[0]));
  test(`${adapter.operationId}: fixed GET, immutable metadata and dropped free text`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, list ? result.items : result, list ? result.items[0] : result]) assert.ok(Object.isFrozen(value));
    if (list) assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: unknown identity refuses the entire response`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', canary, null, undefined]) assert.throws(() => project(prepared, list ? [row, { ...row, id }] : [{ ...row, id }]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed args and broker scopes refuse overrides`, () => {
    for (const field of ['sql', 'url', 'credential', 'approval', 'agentId', 'production', 'enabled', 'required', 'scheduleId', 'windowIds', 'day', 'hour']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], { ...scope, extra: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'x%2fy' }, { ...scope, scheduleId: '../escape' }]) assert.throws(() => adapter.prepare(value, args));
    if (scope.branch) assert.throws(() => adapter.prepare({ ...scope, branch: '../escape' }, args));
    if (list) {
      for (const value of [[], ['bad/path'], [scope[key][0], scope[key][0]], Array(33).fill(scope[key][0])]) assert.throws(() => adapter.prepare({ ...scope, [key]: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    }
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: bounded decoding and pagination fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.deepEqual(prepared.project(wire({ ...page([row]), next_page: 2 })), { items: [expected], nextPage: 2, complete: false });
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: later mutation cannot retarget or widen the projection`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign';
    copied.database = 'foreign';
    copied.scheduleId = 'foreign';
    if (copied.branch) copied.branch = 'foreign';
    if (list) copied[key].push('foreign');
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });

  test(`${adapter.operationId}: selected fields are strict and never native authority`, () => {
    const prepared = adapter.prepare(scope, args);
    const fields = adapter === windows ? ['started_at', 'finished_at'] : ['enabled', 'required', 'frequency_unit'];
    for (const field of fields) for (const value of [undefined, 1, {}, [], canary]) assert.throws(() => project(prepared, [{ ...row, [field]: value }]), error => !String(error).includes(canary));
    if (adapter !== windows) {
      for (const unit of ['day', 'week', 'month', 'once']) assert.deepEqual(project(prepared, [{ ...row, frequency_unit: unit, approval: true }]), list ? { items: [{ ...expected, frequencyUnit: unit }], nextPage: null, complete: true } : { ...expected, frequencyUnit: unit });
      for (const field of fields) assert.throws(() => project(prepared, [{ ...row, [field]: null }]));
    } else {
      assert.deepEqual(project(prepared, [{ ...row, started_at: null, finished_at: '2026-11-07T11:00:00Z', approval: true }]), { items: [{ id: 'wi123', startRecorded: false, finishRecorded: true }], nextPage: null, complete: true });
      for (const value of ['not-a-date', '2026-99-99T99:99:99Z']) assert.throws(() => project(prepared, [{ ...row, started_at: value }]));
    }
  });
}

test('maintenance paths and selected fields match the pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , path, list] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { organization: scope.organization, database: scope.database, branch: scope.branch, id: scope.scheduleId };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), path);
    const queries = operation.value.parameters.filter(value => value.in === 'query').map(value => value.name);
    assert.deepEqual(queries, list ? ['page', 'per_page'] : []);
    const definition = schema.definitions[operation.value.responses['200'].schema.$ref.split('/').at(-1)];
    const selected = adapter === windows ? definition.properties.data.items : list ? schema.definitions.BranchMaintenanceSchedule : definition;
    for (const field of adapter === windows ? ['id', 'started_at', 'finished_at'] : ['id', 'enabled', 'required', 'frequency_unit']) assert.ok(selected.required.includes(field));
  }
  assert.deepEqual(schema.definitions.BranchMaintenanceSchedule.properties.frequency_unit.enum, ['day', 'week', 'month', 'once']);
});
