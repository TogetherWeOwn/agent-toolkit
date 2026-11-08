import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as adapter from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-vschema.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const scope = { organization: 'example-org', database: 'app', branch: 'staging', keyspace: { id: 'ks123', name: 'main' } };
const endpoint = '/v1/organizations/example-org/databases/app/branches/staging/keyspaces/main/vschema';
const expected = { requestKeyspaceId: 'ks123', rawReported: true, provenance: 'not-established', executionAuthority: 'not-established' };
const safeError = error => !String(error).includes(canary);

test('VSchema: fixed GET and immutable availability-only output', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
  const output = prepared.project(wire({ raw: canary, password: canary, tables: [canary] }));
  assert.deepEqual(output, expected);
  assert.ok(!JSON.stringify(output).includes(canary));
  for (const value of [prepared, prepared.request, output]) assert.ok(Object.isFrozen(value));
});

test('VSchema: empty raw text is reported as absent, never a validity verdict', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.project(wire({ raw: '' })), { ...expected, rawReported: false });
  for (const raw of [' ', 'not JSON', '{broken', canary, '{"tables":{"secret":{}}}']) assert.deepEqual(prepared.project(wire({ raw })), expected);
});

test('VSchema: missing or nonstring raw field refuses the whole response', () => {
  const prepared = adapter.prepare(scope, {});
  for (const raw of [undefined, null, true, 1, {}, [], { password: canary }]) assert.throws(() => prepared.project(wire({ raw })), safeError);
  assert.throws(() => prepared.project(wire({ schema: canary })), safeError);
});

test('VSchema: raw text length is bounded independently of wire size', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.project(wire({ raw: 'a'.repeat(32768) })), expected);
  assert.throws(() => prepared.project(wire({ raw: 'a'.repeat(32769) })), safeError);
});

test('VSchema: shared wire cap and malformed UTF-8 or JSON fail without reflection', () => {
  const prepared = adapter.prepare(scope, {});
  for (const value of [wire(null), wire([]), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"raw":"' + canary)]) assert.throws(() => prepared.project(value), safeError);
  assert.throws(() => prepared.project(wire({ raw: 'é'.repeat(32768) })), safeError);
});

test('VSchema: caller arguments cannot select schema, target or authority', () => {
  for (const field of ['sql', 'raw', 'url', 'keyspace', 'id', 'credential', 'secret', 'agentId', 'approval', 'production', 'all', 'page', 'timeout']) assert.throws(() => adapter.prepare(scope, { [field]: canary }), safeError);
  for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value), safeError);
  const hostile = Object.defineProperty({}, 'raw', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare(scope, hostile), safeError);
});

test('VSchema: parent names and keyspace names cannot escape their fixed path', () => {
  for (const value of ['../foreign', 'x/y', 'x%2fy', 'é', '', 'a'.repeat(64), canary, null]) {
    for (const field of ['organization', 'database', 'branch']) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), safeError);
    assert.throws(() => adapter.prepare({ ...scope, keyspace: { ...scope.keyspace, name: value } }, {}), safeError);
  }
});

test('VSchema: closed scope requires a separately bound keyspace ID', () => {
  for (const keyspace of [null, 'main', {}, { name: 'main' }, { id: 'ks123' }, { ...scope.keyspace, approval: true }, { id: canary, name: 'main' }, { id: '../foreign', name: 'main' }]) assert.throws(() => adapter.prepare({ ...scope, keyspace }, {}), safeError);
  for (const value of [null, [], { ...scope, agentId: 'other' }, { ...scope, approval: true }]) assert.throws(() => adapter.prepare(value, {}), safeError);
});

test('VSchema: scope accessors are refused without evaluating them', () => {
  for (const field of ['organization', 'database', 'branch', 'keyspace']) {
    const hostile = Object.defineProperty({ ...scope }, field, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), safeError);
  }
  const keyspace = Object.defineProperty({ ...scope.keyspace }, 'name', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare({ ...scope, keyspace }, {}), safeError);
});

test('VSchema: caller mutation cannot retarget the request or receipt', () => {
  const copy = structuredClone(scope);
  const prepared = adapter.prepare(copy, {});
  copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign';
  copy.keyspace.id = 'foreign'; copy.keyspace.name = 'foreign';
  assert.equal(prepared.request.path, endpoint);
  assert.deepEqual(prepared.project(wire({ raw: canary })), expected);
});

test('VSchema: unsolicited identity fields do not establish response provenance', () => {
  const prepared = adapter.prepare(scope, {});
  assert.deepEqual(prepared.project(wire({ raw: canary, id: 'foreign', branch: 'foreign', keyspace: 'foreign', provenance: 'verified', executionAuthority: true })), expected);
});

test('VSchema: official schema has required raw text, no identity or query parameters', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
  assert.equal(entry.method, 'get');
  assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'keyspace' ? scope.keyspace.name : scope[key]), endpoint);
  assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query'), []);
  assert.deepEqual(entry.value.responses['200'].schema, { type: 'object', properties: { raw: { type: 'string', description: "The keyspace's VSchema" } }, required: ['raw'] });
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const mapped = map.operations.find(value => value.operationId === adapter.operationId);
  assert.equal(mapped.adapter, 'src/tools/get-keyspace-vschema.ts');
  assert.equal(mapped.test, 'test/keyspace-vschema.test.mjs');
  assert.equal(mapped.implementation, 'offline-adapter-only');
  assert.equal(mapped.review, 'not-reviewed');
  assert.equal(mapped.enablement, 'disabled');
});
