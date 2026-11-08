import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as keyspace from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace.js';
import * as keyspaces from '../../../dist/plugins/planetscale-broker/src/tools/list-keyspaces.js';
import * as shard from '../../../dist/plugins/planetscale-broker/src/tools/get-shard.js';
import * as shards from '../../../dist/plugins/planetscale-broker/src/tools/list-shards.js';
import * as event from '../../../dist/plugins/planetscale-broker/src/tools/get-maintenance-event.js';
import * as events from '../../../dist/plugins/planetscale-broker/src/tools/list-maintenance-events.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const db = { organization: 'example-org', database: 'example-db' };
const branch = { ...db, branch: 'staging' };
const dbPath = '/v1/organizations/example-org/databases/example-db';
const branchPath = dbPath + '/branches/staging';
const keyBinding = { id: 'ks123', name: 'primary' };
const shardBinding = { id: 'sh123' };
const eventBinding = { id: 'ev123', branchId: 'br123', branch: 'staging' };
const keyRow = { id: 'ks123', name: 'primary', sharded: true, external: false, ready: true, resizing: false, default: true, cluster_name: canary, cluster_display_name: canary, mysqld_options: { value: canary }, vttablet_options: { value: canary }, storage: { value: canary }, throttler: { value: canary }, created_at: canary };
const keyExpected = { id: 'ks123', name: 'primary', sharded: true, external: false, ready: true, resizing: false, default: true };
const shardRow = { id: 'sh123', ready: true, authoritative: false, name: canary, display_name: canary, configuration_profile: canary, created_at: canary };
const shardExpected = { id: 'sh123', ready: true, authoritative: false };
const eventRow = { id: 'ev123', state: 'scheduled', urgent: false, branch: { id: 'br123', name: 'staging', created_at: canary }, what: canary, why: canary, expected_impact: canary, urgent_reason: canary, scheduled_at: canary, not_after: canary, completed_at: canary, available_times: [canary], reschedules_remaining: canary };
const eventExpected = { id: 'ev123', branchId: 'br123', branch: 'staging', state: 'scheduled', urgent: false };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [keyspace, { ...branch, keyspace: keyBinding }, 'keyspace', keyRow, keyExpected, branchPath + '/keyspaces/primary', false, ['sharded', 'external', 'ready', 'resizing', 'default']],
  [keyspaces, { ...branch, keyspaces: [keyBinding] }, 'keyspaces', keyRow, keyExpected, branchPath + '/keyspaces', true, ['sharded', 'external', 'ready', 'resizing', 'default']],
  [shard, { ...branch, shard: shardBinding }, 'shard', shardRow, shardExpected, branchPath + '/shards/sh123', false, ['ready', 'authoritative']],
  [shards, { ...branch, shards: [shardBinding] }, 'shards', shardRow, shardExpected, branchPath + '/shards', true, ['ready', 'authoritative']],
  [event, { ...db, event: eventBinding }, 'event', eventRow, eventExpected, dbPath + '/maintenance-events/ev123', false, ['urgent']],
  [events, { ...db, events: [eventBinding] }, 'events', eventRow, eventExpected, dbPath + '/maintenance-events', true, ['urgent']],
];

for (const [adapter, scope, key, row, expected, path, list, flags] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const project = (prepared, rows) => prepared.project(wire(list ? page(rows) : rows[0]));
  test(`${adapter.operationId}: fixed GET and immutable secret-free projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, list ? result.items : result, list ? result.items[0] : result]) assert.ok(Object.isFrozen(value));
    if (list) assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: unknown identity or rebound name refuses entire page`, () => {
    const prepared = adapter.prepare(scope, args);
    const bad = [{ ...row, id: 'foreign' }, { ...row, id: canary }, { ...row, id: null }];
    if (key.startsWith('keyspace')) bad.push({ ...row, name: 'foreign' });
    if (key.startsWith('event')) for (const value of [null, {}, { id: 'foreign', name: 'staging' }, { id: 'br123', name: 'foreign' }]) bad.push({ ...row, branch: value });
    for (const value of bad) assert.throws(() => project(prepared, list ? [row, value] : [value]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: malformed fields, wire limits and page mismatch refuse`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of flags) for (const value of [undefined, null, 1, {}, [], canary]) assert.throws(() => project(prepared, [{ ...row, [field]: value }]), error => !String(error).includes(canary));
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.deepEqual(prepared.project(wire({ ...page([row]), next_page: 2 })), { items: [expected], nextPage: 2, complete: false });
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed arguments and broker-owned bindings reject overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'keyspace', 'branch', 'state', 'q', 'exclude_configuration_profile']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: '../foreign' }]) assert.throws(() => adapter.prepare(value, args));
    const binding = list ? scope[key][0] : scope[key];
    const bad = [{ ...binding, id: '../escape' }, { ...binding, extra: true }, {}];
    if (binding.name) bad.push({ ...binding, name: '../escape' });
    if (binding.branch) bad.push({ ...binding, branch: '../escape' }, { ...binding, branchId: '../escape' });
    for (const value of bad) assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [value] : value }, args));
    if (list) {
      for (const value of [[], [binding, binding], Array(33).fill(binding)]) assert.throws(() => adapter.prepare({ ...scope, [key]: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    }
    const hostile = Object.defineProperty({ ...binding }, 'id', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [hostile] : hostile }, args), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: later input mutation cannot widen output bindings`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign';
    copied.database = 'foreign';
    copied.branch = 'foreign';
    const binding = list ? copied[key][0] : copied[key];
    binding.id = 'foreign';
    if (binding.name) binding.name = 'foreign';
    if (binding.branch) { binding.branch = 'foreign'; binding.branchId = 'foreign'; }
    if (list) copied[key].push({ ...binding, id: 'another' });
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });
}

test('maintenance states are informational; urgent never authorizes execution', () => {
  for (const state of ['scheduled', 'in_progress', 'completed', 'canceled', 'expired']) {
    const result = event.prepare({ ...db, event: eventBinding }, {}).project(wire({ ...eventRow, state, urgent: true, approval: true }));
    assert.deepEqual(result, { ...eventExpected, state, urgent: true });
  }
  for (const state of [null, 'approved', canary]) assert.throws(() => event.prepare({ ...db, event: eventBinding }, {}).project(wire({ ...eventRow, state })));
});

test('topology endpoints and selected fields match pinned official schema; optional filters stay unsupported', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, key, , , path, list, flags] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const binding = list ? scope[key][0] : scope[key];
    const parameters = { organization: scope.organization, database: scope.database, branch: scope.branch, keyspace: binding.name, id: binding.id };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), path);
    const queries = operation.value.parameters.filter(value => value.in === 'query').map(value => value.name);
    if (list) for (const name of ['page', 'per_page']) assert.ok(queries.includes(name));
    else assert.deepEqual(queries, []);
    const definition = schema.definitions[key.startsWith('keyspace') ? 'DatabaseBranchKeyspace' : key.startsWith('shard') ? 'NekiShard' : 'PostgresBranchMaintenanceEvent'];
    for (const field of ['id', ...flags]) assert.ok(definition.required.includes(field));
  }
  assert.deepEqual(schema.definitions.PostgresBranchMaintenanceEvent.properties.state.enum, ['scheduled', 'in_progress', 'completed', 'canceled', 'expired']);
});
