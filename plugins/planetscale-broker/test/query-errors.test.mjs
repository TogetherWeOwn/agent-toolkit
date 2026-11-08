import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-query-errors.js';
import * as get from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query-error.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const listScope = { ...target, errors: [{ id: 'error-1', fingerprint: 'ef-1' }, { id: 'error-2', fingerprint: 'ef-2' }] };
const getScope = { ...target, errorFingerprint: 'ef-1', queryIds: ['query-1', 'query-2'] };
const path = '/v1/organizations/example-org/databases/app/branches/staging/insights/errors';
const sensitive = { password: { value: canary }, tags: [{ value: canary }], fingerprint: canary, started_at: canary, statement_type: canary, keyspace: canary, tables: [canary], username: canary, remote_address: canary, error_message: canary, normalized_sql: canary, syntax_highlighted_sql: canary, created_at: canary, updated_at: canary, error_count: 42, total_duration_millis: 42, time_per_query: 42 };
const errorRow = { ...sensitive, id: 'error-1', error_fingerprint: 'ef-1' };
const queryRow = { ...sensitive, id: 'query-1', explainable: true, truncated: false };
const errorOutput = { id: 'error-1', executionAuthority: 'not-established' };
const queryOutput = { id: 'query-1', explainable: true, truncated: false, executionAuthority: 'not-established' };
const page = rows => ({ type: 'list', prev_page: null, next_page: null, data: rows, next_page_url: canary, prev_page_url: canary });
const output = items => ({ items, hasMore: false, coverage: 'first-page-only' });
const fixtures = [
  [list, listScope, errorRow, errorOutput, path + '?page=1&per_page=10'],
  [get, getScope, queryRow, queryOutput, path + '/ef-1?page=1&per_page=10'],
];

for (const [adapter, scope, row, projected, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET with frozen redacted output`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const result = prepared.project(wire(page([row])));
    assert.deepEqual(result, output([projected]));
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, result.items, ...result.items]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: malformed and over-cap wire refuses without reflection`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments and scope reject caller authority and filters`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'fingerprint', 'queryIds', 'from', 'to', 'period', 'q', 'sort', 'dir', 'tablet_type', 'page', 'per_page', 'execute', 'explain']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const object of [Object.defineProperty({}, 'sql', { get() { throw new Error(canary); }, enumerable: true }), Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true })]) assert.throws(() => adapter.prepare(object, object), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: immutable broker bindings cannot be retargeted`, () => {
    const copy = structuredClone(scope);
    const prepared = adapter.prepare(copy, {});
    copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign';
    if (adapter === list) { copy.errors[0].id = 'foreign'; copy.errors[0].fingerprint = 'foreign'; copy.errors.push({ id: 'other', fingerprint: 'other' }); }
    else { copy.errorFingerprint = 'foreign'; copy.queryIds[0] = 'foreign'; copy.queryIds.push('other'); }
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(page([row]))), output([projected]));
    assert.throws(() => prepared.project(wire(page([{ ...row, id: 'foreign' }]))));
  });

  test(`${adapter.operationId}: unknown, malformed, duplicate or excess rows refuse whole page`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const data of [null, {}, [null], [row, { ...row, id: 'foreign' }], [row, row], Array(11).fill(row)]) assert.throws(() => prepared.project(wire({ ...page([]), data })));
    for (const id of [undefined, null, canary, '', 1]) assert.throws(() => prepared.project(wire(page([{ ...row, id }]))), error => !String(error).includes(canary));
    assert.deepEqual(prepared.project(wire(page([]))), output([]));
    const second = adapter === list ? { ...row, id: 'error-2', error_fingerprint: 'ef-2' } : { ...row, id: 'query-2' };
    assert.deepEqual(prepared.project(wire(page([row, second]))), output([projected, { ...projected, id: second.id }]));
  });

  test(`${adapter.operationId}: official first-page envelope never follows provider URLs`, () => {
    const prepared = adapter.prepare(scope, {});
    const body = page([row]);
    assert.deepEqual(prepared.project(wire({ ...body, next_page: 2 })), { ...output([projected]), hasMore: true });
    for (const change of [{ type: undefined }, { type: canary }, { prev_page: undefined }, { prev_page: 1 }, { next_page: undefined }, { next_page: 0 }, { next_page: 3 }, { next_page: canary }, { next_page: true }, { current_page: 2 }, { current_page: '1' }, { per_page: 11 }, { per_page: true }]) assert.throws(() => prepared.project(wire({ ...body, ...change })));
    for (const change of [{ current_page: null, per_page: null }, { current_page: 1, per_page: 10 }]) assert.deepEqual(prepared.project(wire({ ...body, ...change })), output([projected]));
  });
}

test('error summaries: exact ID/fingerprint pair binding, not either identity alone', () => {
  const prepared = list.prepare(listScope, {});
  for (const error_fingerprint of [undefined, null, 'foreign', 'ef-2', canary, '', 1]) assert.throws(() => prepared.project(wire(page([{ ...errorRow, error_fingerprint }]))), error => !String(error).includes(canary));
  for (const errors of [[], Array(33).fill(listScope.errors[0]), [listScope.errors[0], listScope.errors[0]], [listScope.errors[0], { id: 'error-2', fingerprint: 'ef-1' }], [{ id: '../foreign', fingerprint: 'ef-1' }], [{ id: 'error-1', fingerprint: 'x/y' }], [{ ...listScope.errors[0], approval: true }]]) assert.throws(() => list.prepare({ ...listScope, errors }, {}));
});

test('error queries: bound fingerprint path and independently bound unique query IDs', () => {
  for (const errorFingerprint of ['../foreign', 'x/y', 'x%2fy', canary, null, '', 'é', 'a'.repeat(129)]) assert.throws(() => get.prepare({ ...getScope, errorFingerprint }, {}));
  for (const queryIds of [[], ['query-1', 'query-1'], Array(33).fill('query-1'), [null], [canary], ['x/y']]) assert.throws(() => get.prepare({ ...getScope, queryIds }, {}));
  const hostile = Object.defineProperty(['query-1'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => get.prepare({ ...getScope, queryIds: hostile }, {}), error => !String(error).includes(canary));
  assert.throws(() => get.prepare(listScope, {}));
  assert.throws(() => list.prepare(getScope, {}));
});

test('error queries: strict flags never grant execution or prove error provenance', () => {
  const prepared = get.prepare(getScope, {});
  for (const field of ['explainable', 'truncated']) {
    for (const value of [undefined, null, 0, 1, 'false', canary, {}, []]) assert.throws(() => prepared.project(wire(page([{ ...queryRow, [field]: value }]))), error => !String(error).includes(canary));
    for (const value of [true, false]) assert.deepEqual(prepared.project(wire(page([{ ...queryRow, [field]: value }]))), output([{ ...queryOutput, [field]: value }]));
  }
  // The query fingerprint is distinct from the bound error fingerprint.
  assert.deepEqual(prepared.project(wire(page([{ ...queryRow, fingerprint: 'different-query-fingerprint' }]))), output([queryOutput]));
});

test('query errors: sensitive omitted subtrees do not affect projection', () => {
  for (const value of [undefined, null, [], { secret: canary }, canary]) {
    assert.deepEqual(get.prepare(getScope, {}).project(wire(page([{ ...queryRow, password: value, error_message: value }]))), output([queryOutput]));
    assert.deepEqual(list.prepare(listScope, {}).project(wire(page([{ ...errorRow, error_message: value }]))), output([errorOutput]));
  }
});

test('query error paths, bindings and envelopes match pinned official schema and map', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'fingerprint' ? scope.errorFingerprint : scope[key]), endpoint.split('?')[0]);
    const response = schema.definitions[entry.value.responses['200'].schema.$ref.split('/').at(-1)];
    assert.deepEqual(response.required, ['type', 'next_page', 'prev_page', 'data']);
    for (const field of ['current_page', 'per_page', 'next_page', 'prev_page']) { assert.equal(response.properties[field].type, 'integer'); assert.equal(response.properties[field]['x-nullable'], true); }
    const row = response.properties.data.items;
    for (const [field, type] of adapter === list ? [['id', 'string'], ['error_fingerprint', 'string']] : [['id', 'string'], ['explainable', 'boolean'], ['truncated', 'boolean']]) { assert.equal(row.properties[field].type, type); assert.ok(row.required.includes(field)); }
    for (const field of ['page', 'per_page']) assert.equal(entry.value.parameters.find(value => value.name === field).in, 'query');
    const mapped = map.operations.find(value => value.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.test, 'test/query-errors.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
    assert.deepEqual(mapped.documentedAuthorization.serviceTokenAnyOf, ['read_databases', 'read_database']);
  }
});
