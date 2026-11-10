import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as adapter from '../../../dist/plugins/planetscale-broker/src/tools/get-data-topology.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const scope = { organization: 'example-org', database: 'app', branch: 'staging', branchId: 'br123' };
const endpoint = '/v1/organizations/example-org/databases/app/branches/staging/data-topology';
const body = { data_topology: { [canary]: { nested: [canary] } }, synced_at: canary };
const expected = { requestBranchId: 'br123', topologyReported: true, syncTimeReported: true, freshness: 'not-established', provenance: 'not-established' };
const safeError = error => !String(error).includes(canary);

test('data topology: fixed GET and frozen availability-only receipt', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
  const output = prepared.project(wire({ ...body, password: canary, branch: canary }));
  assert.deepEqual(output, expected);
  assert.ok(!JSON.stringify(output).includes(canary));
  for (const value of [prepared, prepared.request, output]) assert.ok(Object.isFrozen(value));
});

test('data topology: empty object and nullable or empty sync string remain distinct', () => {
  const prepared = adapter.prepare(scope, {});
  for (const synced_at of [null, '']) assert.deepEqual(prepared.project(wire({ data_topology: {}, synced_at })), { ...expected, topologyReported: false, syncTimeReported: false });
  assert.deepEqual(prepared.project(wire({ data_topology: {}, synced_at: 'not a timestamp' })), { ...expected, topologyReported: false });
  assert.deepEqual(prepared.project(wire({ ...body, synced_at: null })), { ...expected, syncTimeReported: false });
});

test('data topology: required opaque object refuses absent or nonobject shapes', () => {
  const prepared = adapter.prepare(scope, {});
  for (const data_topology of [undefined, null, [], canary, true, 1]) assert.throws(() => prepared.project(wire({ ...body, data_topology })), safeError);
});

test('data topology: required nullable sync field refuses absent or nonstring values', () => {
  const prepared = adapter.prepare(scope, {});
  for (const synced_at of [undefined, {}, [], true, 1]) assert.throws(() => prepared.project(wire({ ...body, synced_at })), safeError);
});

test('data topology: opaque contents are not interpreted as trusted schema', () => {
  const prepared = adapter.prepare(scope, {});
  for (const value of [null, [], true, 1, canary, { password: canary, primary: 'foreign' }]) assert.deepEqual(prepared.project(wire({ ...body, data_topology: { arbitrary: value } })), expected);
  assert.deepEqual(prepared.project(wire({ ...body, data_topology: JSON.parse('{"__proto__":{"password":"hidden"}}') })), expected);
});

test('data topology: opaque object entry and sync length caps refuse whole response', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.project(wire({ data_topology: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [String(i), canary])), synced_at: 'a'.repeat(80) })), expected);
  assert.throws(() => prepared.project(wire({ ...body, data_topology: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [String(i), canary])) })), safeError);
  assert.throws(() => prepared.project(wire({ ...body, synced_at: 'a'.repeat(81) })), safeError);
});

test('data topology: shared wire and decoding refusals never reflect contents', () => {
  const prepared = adapter.prepare(scope, {});
  for (const value of [wire(null), wire([]), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"data_topology":"' + canary)]) assert.throws(() => prepared.project(value), safeError);
  assert.throws(() => prepared.project(wire({ ...body, data_topology: { hidden: 'x'.repeat(65536) } })), safeError);
});

test('data topology: closed arguments cannot select content, filters or authority', () => {
  for (const field of ['sql', 'url', 'branch', 'branchId', 'keyspace', 'credential', 'agentId', 'approval', 'production', 'all', 'page', 'timeout']) assert.throws(() => adapter.prepare(scope, { [field]: canary }), safeError);
  for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value), safeError);
  const hostile = Object.defineProperty({}, 'sql', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare(scope, hostile), safeError);
});

test('data topology: fixed parent names and immutable ID cannot escape scope', () => {
  for (const value of ['../foreign', 'x/y', 'x%2fy', 'é', '', 'a'.repeat(64), canary, null]) {
    for (const field of ['organization', 'database', 'branch']) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), safeError);
  }
  for (const branchId of [undefined, null, '', '../foreign', canary]) assert.throws(() => adapter.prepare({ ...scope, branchId }, {}), safeError);
  for (const value of [null, [], { ...scope, agentId: 'other' }, { ...scope, approval: true }]) assert.throws(() => adapter.prepare(value, {}), safeError);
});

test('data topology: scope accessors are refused without evaluation', () => {
  for (const field of Object.keys(scope)) {
    const hostile = Object.defineProperty({ ...scope }, field, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), safeError);
  }
});

test('data topology: caller mutation cannot retarget request or receipt', () => {
  const copy = { ...scope };
  const prepared = adapter.prepare(copy, {});
  for (const field of Object.keys(copy)) copy[field] = 'foreign';
  assert.equal(prepared.request.path, endpoint);
  assert.deepEqual(prepared.project(wire(body)), expected);
});

test('data topology: unsolicited identity or status cannot establish provenance or freshness', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.project(wire({ ...body, id: 'foreign', branchId: 'foreign', state: 'ready', provenance: 'verified', freshness: true, executionAuthority: true })), expected);
});

test('data topology: official schema documents opaque topology and nullable sync, not identity', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
  assert.equal(entry.method, 'get');
  assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), endpoint);
  assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query'), []);
  assert.equal(entry.value.responses['200'].schema.$ref, '#/definitions/NekiDataTopology');
  const definition = schema.definitions.NekiDataTopology;
  assert.deepEqual(definition.required, ['data_topology', 'synced_at']);
  assert.deepEqual(Object.keys(definition.properties), ['data_topology', 'synced_at']);
  assert.equal(definition.properties.data_topology.type, 'object');
  assert.equal(definition.properties.data_topology.additionalProperties, true);
  assert.equal(definition.properties.synced_at.type, 'string');
  assert.equal(definition.properties.synced_at['x-nullable'], true);
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const mapped = map.operations.find(value => value.operationId === adapter.operationId);
  assert.equal(mapped.adapter, 'src/tools/get-data-topology.ts');
  assert.equal(mapped.test, 'test/data-topology.test.mjs');
  assert.equal(mapped.implementation, 'offline-adapter-only');
  assert.equal(mapped.review, 'not-reviewed');
  assert.equal(mapped.enablement, 'disabled');
});
