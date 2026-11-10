import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as adapter from '../../../dist/plugins/planetscale-broker/src/tools/get-move-tables-workflow-status.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const scope = { organization: 'example-org', database: 'app', branch: 'staging', branchId: 'br123', workflow: 'copy_widgets', targetKeyspace: 'target', keyspaceId: 'ks123' };
const endpoint = '/v1/organizations/example-org/databases/app/branches/staging/move-tables/workflows/copy_widgets/status?target_keyspace=target';
const table = { rows_copied: 1, rows_total: 2, rows_percentage: 50.5, bytes_copied: 0, bytes_total: 10, bytes_percentage: 0, hidden: canary };
const data = { traffic_state: canary, table_copy_state: { [canary]: table }, shard_streams: { [canary]: { hidden: canary } } };
const expected = { requestBranchId: 'br123', requestKeyspaceId: 'ks123', trafficStateReported: true, tableCopyReported: true, shardStreamsReported: true, provenance: 'not-established', executionAuthority: 'not-established' };
const absent = { ...expected, trafficStateReported: false, tableCopyReported: false, shardStreamsReported: false };
const safeError = error => !String(error).includes(canary);
const project = value => adapter.prepare(scope, {}).project(wire(value));

test('MoveTables status: fixed GET, required keyspace query and frozen redacted receipt', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
  const output = prepared.project(wire({ data, password: canary }));
  assert.deepEqual(output, expected);
  assert.ok(!JSON.stringify(output).includes(canary));
  for (const value of [prepared, prepared.request, output]) assert.ok(Object.isFrozen(value));
});

test('MoveTables status: documented optional fields and empty objects remain absent', () => {
  assert.deepEqual(project({ data: {} }), absent);
  assert.deepEqual(project({ data: { traffic_state: '', table_copy_state: {}, shard_streams: {} } }), absent);
  assert.deepEqual(project({ data: { table_copy_state: { arbitrary: {} }, shard_streams: { arbitrary: {} } } }), { ...expected, trafficStateReported: false });
});

test('MoveTables status: field presence does not mean nonzero progress or valid traffic state', () => {
  assert.deepEqual(project({ data: { ...data, traffic_state: 'not a validated state', table_copy_state: { arbitrary: { rows_copied: 0, rows_total: 0, rows_percentage: 0 } } } }), expected);
  for (const [field, flag] of [['traffic_state', 'trafficStateReported'], ['table_copy_state', 'tableCopyReported'], ['shard_streams', 'shardStreamsReported']]) {
    assert.deepEqual(project({ data: { [field]: data[field] } }), { ...absent, [flag]: true });
  }
});

test('MoveTables status: required data envelope refuses absent or nonobjects', () => {
  for (const value of [undefined, null, [], canary, true, 1]) assert.throws(() => project({ data: value }), safeError);
});

test('MoveTables status: optional traffic text refuses null, nonstrings and over-cap text', () => {
  for (const value of [null, [], {}, true, 1, 'a'.repeat(4097)]) assert.throws(() => project({ data: { ...data, traffic_state: value } }), safeError);
  assert.deepEqual(project({ data: { ...data, traffic_state: 'a'.repeat(4096) } }), expected);
});

test('MoveTables status: table and stream maps require bounded object-valued entries', () => {
  for (const field of ['table_copy_state', 'shard_streams']) {
    for (const value of [null, [], canary, true, 1, { bad: null }, { bad: [] }, { bad: canary }, { bad: 1 }, { bad: true }]) assert.throws(() => project({ data: { ...data, [field]: value } }), safeError);
    assert.deepEqual(project({ data: { ...data, [field]: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [String(i), {}])) } }), expected);
    assert.throws(() => project({ data: { ...data, [field]: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [String(i), {}])) } }), safeError);
  }
});

test('MoveTables status: documented copy counters refuse coercion and unsafe integers', () => {
  for (const field of ['rows_copied', 'rows_total', 'bytes_copied', 'bytes_total']) {
    for (const value of [null, canary, '1', 1.5, Number.MAX_SAFE_INTEGER + 1, true, {}, []]) assert.throws(() => project({ data: { ...data, table_copy_state: { hidden: { ...table, [field]: value } } } }), safeError);
    assert.deepEqual(project({ data: { ...data, table_copy_state: { hidden: { [field]: Number.MAX_SAFE_INTEGER } } } }), expected);
  }
});

test('MoveTables status: documented percentages require finite numbers', () => {
  for (const field of ['rows_percentage', 'bytes_percentage']) {
    for (const value of [null, canary, '50', true, {}, []]) assert.throws(() => project({ data: { ...data, table_copy_state: { hidden: { [field]: value } } } }), safeError);
    const json = JSON.stringify({ data: { ...data, table_copy_state: { hidden: { [field]: 123456 } } } }).replace('123456', '1e999');
    assert.throws(() => adapter.prepare(scope, {}).project(new TextEncoder().encode(json)), safeError);
    assert.deepEqual(project({ data: { ...data, table_copy_state: { hidden: { [field]: 0.5 } } } }), expected);
  }
});

test('MoveTables status: opaque stream contents and unselected fields never escape', () => {
  assert.deepEqual(project({ data: { ...data, shard_streams: { hidden: { password: canary, status: canary, values: [canary] } }, unknown: { secret: canary } }, id: canary }), expected);
  for (const field of ['table_copy_state', 'shard_streams']) assert.deepEqual(project({ data: { ...data, [field]: JSON.parse('{"__proto__":{"hidden":"synthetic"}}') } }), expected);
});

test('MoveTables status: shared wire and decoding bounds refuse without reflection', () => {
  const prepared = adapter.prepare(scope, {});
  for (const value of [wire(null), wire([]), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"data":"' + canary)]) assert.throws(() => prepared.project(value), safeError);
  assert.throws(() => project({ data: { ...data, hidden: 'x'.repeat(65536) } }), safeError);
});

test('MoveTables status: closed arguments cannot select resources, fields or authority', () => {
  for (const field of ['sql', 'url', 'workflow', 'target_keyspace', 'targetKeyspace', 'branch', 'branchId', 'credential', 'agentId', 'approval', 'production', 'all', 'page']) assert.throws(() => adapter.prepare(scope, { [field]: canary }), safeError);
  for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value), safeError);
  const hostile = Object.defineProperty({}, 'sql', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare(scope, hostile), safeError);
});

test('MoveTables status: scope names cannot inject path or query selectors', () => {
  for (const field of ['organization', 'database', 'branch', 'workflow', 'targetKeyspace']) {
    for (const value of ['../foreign', 'x/y', 'x%2fy', 'x?other=1', 'x&other=1', 'é', '', 'a'.repeat(64), canary, null, undefined]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), safeError);
  }
  for (const field of ['branchId', 'keyspaceId']) {
    for (const value of [undefined, null, '', '../foreign', canary]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), safeError);
  }
  for (const value of [null, [], { ...scope, agentId: 'other' }, { ...scope, approval: true }]) assert.throws(() => adapter.prepare(value, {}), safeError);
});

test('MoveTables status: scope accessors refuse without evaluation', () => {
  for (const field of Object.keys(scope)) {
    const hostile = Object.defineProperty({ ...scope }, field, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), safeError);
  }
});

test('MoveTables status: caller mutation cannot retarget request or receipt', () => {
  const copy = { ...scope };
  const prepared = adapter.prepare(copy, {});
  for (const field of Object.keys(copy)) copy[field] = 'foreign';
  assert.equal(prepared.request.path, endpoint);
  assert.deepEqual(prepared.project(wire({ data })), expected);
});

test('MoveTables status: unsolicited identity or authority cannot establish provenance', () => {
  assert.deepEqual(project({ data: { ...data, branchId: 'foreign', keyspaceId: 'foreign', workflow: 'foreign', executionAuthority: true }, provenance: 'verified', ready: true }), expected);
});

test('MoveTables status: pinned schema supplies optional fields but no response identity', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
  assert.equal(entry.method, 'get');
  assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]) + '?target_keyspace=target', endpoint);
  const query = entry.value.parameters.filter(value => value.in === 'query');
  assert.deepEqual(query.map(value => [value.name, value.type, value.required]), [['target_keyspace', 'string', true]]);
  const response = entry.value.responses['200'].schema;
  assert.deepEqual(response.required, ['data']);
  assert.equal(response.properties.data.required, undefined);
  assert.deepEqual(Object.keys(response.properties.data.properties), ['traffic_state', 'table_copy_state', 'shard_streams']);
  assert.equal(response.properties.data.properties.traffic_state.type, 'string');
  assert.equal(response.properties.data.properties.table_copy_state.additionalProperties.type, 'object');
  assert.deepEqual(response.properties.data.properties.shard_streams.additionalProperties, { type: 'object' });
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const mapped = map.operations.find(value => value.operationId === adapter.operationId);
  assert.equal(mapped.adapter, 'src/tools/get-move-tables-workflow-status.ts');
  assert.equal(mapped.test, 'test/move-tables-status.test.mjs');
  assert.equal(mapped.implementation, 'offline-adapter-only');
  assert.equal(mapped.review, 'not-reviewed');
  assert.equal(mapped.enablement, 'disabled');
});
