import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-queries.js';
import * as get from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const listScope = { ...target, summaryIds: ['summary-1', 'summary-2'] };
const getScope = { ...target, queryId: 'query-1' };
const path = '/v1/organizations/example-org/databases/app/branches/staging/insights';
const sensitive = { password: { value: canary }, tags: [{ value: canary }], fingerprint: canary, started_at: canary, statement_type: canary, keyspace: canary, tables: [canary], qualified_tables: [canary], table_keyspaces: [canary], username: canary, remote_address: canary, error_message: canary, normalized_sql: canary, syntax_highlighted_sql: canary, created_at: canary, updated_at: canary, last_run_at: canary, index_usages: [{ value: canary }], query_count: 1, rows_read: 1, total_duration_millis: 1 };
const row = { ...sensitive, id: 'summary-1', multishard: true };
const query = { ...sensitive, id: 'query-1', explainable: true, truncated: false };
const body = { type: 'list', next_page: null, prev_page: null, data: [row], next_page_url: canary };
const summary = { id: 'summary-1', multishard: true, executionAuthority: 'not-established' };
const detail = { id: 'query-1', explainable: true, truncated: false, executionAuthority: 'not-established' };
const expected = { items: [summary], hasMore: false, coverage: 'first-page-only' };
const fixtures = [
  [list, listScope, body, expected, path + '?page=1&per_page=10'],
  [get, getScope, query, detail, path + '/queries/query-1'],
];

for (const [adapter, scope, response, output, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET and immutable SQL/password-free projection`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const result = prepared.project(wire(response));
    assert.deepEqual(result, output);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, ...(result.items ? [result.items, ...result.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: malformed/oversized wire refuses without reflection`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments refuse SQL, filters and authority overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'queryId', 'summaryIds', 'from', 'to', 'period', 'fields', 'q', 'sort', 'page', 'perPage', 'execute', 'explain']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({}, 'sql', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed scope and bounded path segments`, () => {
    for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: caller mutation cannot retarget bindings`, () => {
    const copy = structuredClone(scope);
    const prepared = adapter.prepare(copy, {});
    copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign';
    if (adapter === list) { copy.summaryIds[0] = 'foreign'; copy.summaryIds.push('another'); }
    else copy.queryId = 'foreign';
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(response)), output);
    assert.throws(() => prepared.project(wire(adapter === list ? { ...body, data: [{ ...row, id: 'foreign' }] } : { ...query, id: 'foreign' })));
  });

  test(`${adapter.operationId}: bound identity and strict flags, never execution authority`, () => {
    const prepared = adapter.prepare(scope, {});
    const project = change => prepared.project(wire(adapter === list ? { ...body, data: [{ ...row, ...change }] } : { ...query, ...change }));
    for (const id of [undefined, null, 'foreign', canary, '', 1]) assert.throws(() => project({ id }), error => !String(error).includes(canary));
    for (const field of adapter === list ? ['multishard'] : ['explainable', 'truncated']) {
      for (const value of [undefined, null, 0, 1, 'false', canary, {}, []]) assert.throws(() => project({ [field]: value }), error => !String(error).includes(canary));
      for (const value of [true, false]) assert.deepEqual(project({ [field]: value }), adapter === list ? { ...expected, items: [{ ...summary, [field]: value }] } : { ...detail, [field]: value });
    }
  });
}

test('query summaries: unknown, duplicate or over-cap rows refuse the whole page', () => {
  const prepared = list.prepare(listScope, {});
  for (const data of [null, {}, [null], [row, { ...row, id: 'foreign' }], [row, row], Array(11).fill(row)]) assert.throws(() => prepared.project(wire({ ...body, data })));
  assert.deepEqual(prepared.project(wire({ ...body, data: [row, { ...row, id: 'summary-2' }] })), { ...expected, items: [summary, { ...summary, id: 'summary-2' }] });
  assert.deepEqual(prepared.project(wire({ ...body, data: [] })), { ...expected, items: [] });
});

test('query summaries: exact first-page envelope, no URLs or completeness inference', () => {
  const prepared = list.prepare(listScope, {});
  assert.deepEqual(prepared.project(wire({ ...body, next_page: 2 })), { ...expected, hasMore: true });
  for (const change of [{ type: undefined }, { type: canary }, { prev_page: undefined }, { prev_page: 1 }, { next_page: undefined }, { next_page: 0 }, { next_page: 3 }, { next_page: canary }, { next_page: true }]) assert.throws(() => prepared.project(wire({ ...body, ...change })));
  assert.throws(() => prepared.project(wire({ current_page: 1, per_page: 10, next_page: null, data: [row] })));
});

test('query records: separate summary/query ID bindings and unique bounded scope', () => {
  for (const summaryIds of [[], ['summary-1', 'summary-1'], Array(33).fill('summary-1'), ['x/y'], ['../foreign'], [canary], [null], ['']]) assert.throws(() => list.prepare({ ...listScope, summaryIds }, {}));
  const hostile = Object.defineProperty(['summary-1'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...listScope, summaryIds: hostile }, {}), error => !String(error).includes(canary));
  for (const queryId of ['x/y', '../foreign', canary, null, '']) assert.throws(() => get.prepare({ ...getScope, queryId }, {}));
  assert.throws(() => get.prepare(listScope, {}));
  assert.throws(() => list.prepare(getScope, {}));
  assert.throws(() => get.prepare(getScope, {}).project(wire({ ...query, id: 'summary-1' })));
  assert.throws(() => list.prepare(listScope, {}).project(wire({ ...body, data: [{ ...row, id: 'query-1' }] })));
});

test('query records: sensitive subtrees are never inspected or reflected', () => {
  for (const password of [undefined, null, [], { secret: canary }, canary]) assert.deepEqual(get.prepare(getScope, {}).project(wire({ ...query, password, secret: canary })), detail);
  assert.deepEqual(get.prepare(getScope, {}).project(wire(detail)), detail);
  assert.deepEqual(list.prepare(listScope, {}).project(wire({ ...body, data: [summary] })), expected);
});

test('query metadata paths, envelopes and selected flags match pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'id' ? scope.queryId : scope[key]), endpoint.split('?')[0]);
    const response = schema.definitions[entry.value.responses['200'].schema.$ref.split('/').at(-1)];
    const result = adapter === list ? response.properties.data.items : response;
    for (const [field, type] of adapter === list ? [['id', 'string'], ['multishard', 'boolean']] : [['id', 'string'], ['explainable', 'boolean'], ['truncated', 'boolean']]) { assert.equal(result.properties[field].type, type); assert.ok(result.required.includes(field)); }
    if (adapter === list) {
      assert.deepEqual(response.required, ['type', 'next_page', 'prev_page', 'data']);
      for (const field of ['next_page', 'prev_page']) { assert.equal(response.properties[field].type, 'integer'); assert.equal(response.properties[field]['x-nullable'], true); }
      for (const field of ['page', 'per_page']) assert.equal(entry.value.parameters.find(value => value.name === field).in, 'query');
    } else assert.equal(result.properties.password.additionalProperties, true);
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const mapped = map.operations.find(value => value.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.test, 'test/query-records.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  }
});
