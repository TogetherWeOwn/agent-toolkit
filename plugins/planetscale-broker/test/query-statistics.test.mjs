import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as statistics from '../../../dist/plugins/planetscale-broker/src/tools/get-query-statistics.js';
import * as summary from '../../../dist/plugins/planetscale-broker/src/tools/get-query-summary.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging', fingerprint: 'fingerprint-1', keyspace: 'main' };
const statisticsScope = { ...target, queryIds: ['query-1', 'query-2'] };
const summaryScope = { ...target, summaryId: 'summary-1' };
const path = '/v1/organizations/example-org/databases/app/branches/staging/insights/fingerprint-1';
const sensitive = { password: { value: canary }, normalized_sql: canary, syntax_highlighted_sql: canary, error_message: canary, username: canary, remote_address: canary, tags: [canary], tables: [canary], qualified_tables: [canary], table_keyspaces: [canary], index_usages: [canary], routing_index_usages: [canary], last_run_at: canary, started_at: canary, statement_type: canary, query_count: 9, p50_latency: 9, total_duration_millis: 9 };
const query = { ...sensitive, id: 'query-1', fingerprint: target.fingerprint, keyspace: target.keyspace, explainable: true, truncated: false };
const aggregate = { ...sensitive, id: 'summary-1', fingerprint: target.fingerprint, keyspace: target.keyspace, multishard: false };
const page = { type: 'list', prev_page: null, next_page: null, data: [query], next_page_url: canary };
const queryOutput = { id: 'query-1', explainable: true, truncated: false, executionAuthority: 'not-established' };
const summaryOutput = { id: 'summary-1', multishard: false, executionAuthority: 'not-established' };
const pageOutput = { items: [queryOutput], hasMore: false, coverage: 'first-page-only' };
const fixtures = [
  [statistics, statisticsScope, page, pageOutput, path + '?keyspace=main&page=1&per_page=10'],
  [summary, summaryScope, aggregate, summaryOutput, path + '/summary?keyspace=main'],
];

for (const [adapter, scope, body, expected, endpoint] of fixtures) {
  const response = change => adapter === statistics ? { ...page, data: [{ ...query, ...change }] } : { ...aggregate, ...change };

  test(`${adapter.operationId}: fixed GET with required keyspace and immutable redacted output`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const result = prepared.project(wire(body));
    assert.deepEqual(result, expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(!JSON.stringify(result).includes(target.fingerprint));
    for (const value of [prepared, prepared.request, result, ...(result.items ? [result.items, ...result.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: malformed and oversized wire refuses without reflection`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments reject filters, SQL and authority overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'fingerprint', 'keyspace', 'summaryId', 'queryIds', 'from', 'to', 'period', 'page', 'per_page', 'execute', 'explain']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({}, 'sql', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed broker scope and injection-safe required selectors`, () => {
    for (const field of ['organization', 'database', 'branch', 'fingerprint', 'keyspace']) for (const value of [undefined, null, '', '../foreign', 'x/y', 'x%2fy', 'x&keyspace=other', 'x?all=true', 'é', 'a'.repeat(129), canary]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    const hostile = Object.defineProperty({ ...scope }, 'fingerprint', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: caller mutation cannot retarget fingerprint, keyspace or child IDs`, () => {
    const copy = structuredClone(scope);
    const prepared = adapter.prepare(copy, {});
    copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign'; copy.fingerprint = 'foreign'; copy.keyspace = 'foreign';
    if (adapter === statistics) { copy.queryIds[0] = 'foreign'; copy.queryIds.push('another'); } else copy.summaryId = 'foreign';
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(body)), expected);
    for (const field of ['id', 'fingerprint', 'keyspace']) assert.throws(() => prepared.project(wire(response({ [field]: 'foreign' }))));
  });

  test(`${adapter.operationId}: response must match independent fingerprint, keyspace and child identity`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const field of ['id', 'fingerprint', 'keyspace']) for (const value of [undefined, null, '', 'foreign', canary, 1, {}, []]) assert.throws(() => prepared.project(wire(response({ [field]: value }))), error => !String(error).includes(canary));
    assert.throws(() => prepared.project(wire(response({ id: adapter === statistics ? 'summary-1' : 'query-1' }))));
    for (const field of adapter === statistics ? ['explainable', 'truncated'] : ['multishard']) {
      for (const value of [undefined, null, 0, 1, 'false', canary, {}, []]) assert.throws(() => prepared.project(wire(response({ [field]: value }))), error => !String(error).includes(canary));
      for (const value of [true, false]) assert.deepEqual(prepared.project(wire(response({ [field]: value }))), adapter === statistics ? { ...pageOutput, items: [{ ...queryOutput, [field]: value }] } : { ...summaryOutput, [field]: value });
    }
  });
}

test('query statistics: whole-page refusal on unknown, duplicate or over-cap rows', () => {
  const prepared = statistics.prepare(statisticsScope, {});
  for (const data of [null, {}, [null], [query, { ...query, id: 'foreign' }], [query, query], Array(11).fill(query), [query, { ...query, id: 'query-2', fingerprint: 'foreign' }], [query, { ...query, id: 'query-2', keyspace: 'foreign' }]]) assert.throws(() => prepared.project(wire({ ...page, data })));
  assert.deepEqual(prepared.project(wire({ ...page, data: [query, { ...query, id: 'query-2' }] })), { ...pageOutput, items: [queryOutput, { ...queryOutput, id: 'query-2' }] });
  assert.deepEqual(prepared.project(wire({ ...page, data: [] })), { ...pageOutput, items: [] });
});

test('query statistics: exact first-page envelope and optional page fields, no URL following', () => {
  const prepared = statistics.prepare(statisticsScope, {});
  assert.deepEqual(prepared.project(wire({ ...page, next_page: 2 })), { ...pageOutput, hasMore: true });
  for (const change of [{ type: undefined }, { type: canary }, { prev_page: undefined }, { prev_page: 1 }, { next_page: undefined }, { next_page: 0 }, { next_page: 3 }, { next_page: canary }, { current_page: 2 }, { per_page: 11 }]) assert.throws(() => prepared.project(wire({ ...page, ...change })));
  for (const change of [{ current_page: 1, per_page: 10 }, { current_page: null, per_page: null }]) assert.deepEqual(prepared.project(wire({ ...page, ...change })), pageOutput);
});

test('query statistics: unique bounded query scope distinct from summary scope', () => {
  for (const queryIds of [[], ['query-1', 'query-1'], Array(33).fill('query-1'), ['x/y'], ['../foreign'], [canary], [null], ['']]) assert.throws(() => statistics.prepare({ ...statisticsScope, queryIds }, {}));
  const hostile = Object.defineProperty(['query-1'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => statistics.prepare({ ...statisticsScope, queryIds: hostile }, {}), error => !String(error).includes(canary));
  for (const summaryId of [undefined, null, '', 'x/y', '../foreign', canary]) assert.throws(() => summary.prepare({ ...summaryScope, summaryId }, {}));
  assert.throws(() => summary.prepare(statisticsScope, {}));
  assert.throws(() => statistics.prepare(summaryScope, {}));
});

test('query statistics: sensitive subtrees are omitted without shape assumptions', () => {
  for (const password of [undefined, null, [], { value: canary }, canary]) assert.deepEqual(statistics.prepare(statisticsScope, {}).project(wire({ ...page, data: [{ ...query, password }] })), pageOutput);
  assert.deepEqual(summary.prepare(summaryScope, {}).project(wire({ id: aggregate.id, fingerprint: target.fingerprint, keyspace: target.keyspace, multishard: false })), summaryOutput);
});

test('query fingerprint reads match pinned required selectors, identities, envelopes and map', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), endpoint.split('?')[0]);
    for (const field of ['fingerprint', 'keyspace']) { const parameter = entry.value.parameters.find(value => value.name === field); assert.equal(parameter.required, true); assert.equal(parameter.in, field === 'fingerprint' ? 'path' : 'query'); }
    const response = schema.definitions[entry.value.responses['200'].schema.$ref.split('/').at(-1)];
    const row = adapter === statistics ? response.properties.data.items : response;
    for (const [field, type] of [['id', 'string'], ['fingerprint', 'string'], ['keyspace', 'string'], ...(adapter === statistics ? [['explainable', 'boolean'], ['truncated', 'boolean']] : [['multishard', 'boolean']])]) { assert.equal(row.properties[field].type, type); assert.ok(row.required.includes(field)); }
    if (adapter === statistics) { assert.deepEqual(response.required, ['type', 'next_page', 'prev_page', 'data']); for (const field of ['page', 'per_page']) assert.equal(entry.value.parameters.find(value => value.name === field).in, 'query'); }
    const mapped = map.operations.find(value => value.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only'); assert.equal(mapped.test, 'test/query-statistics.test.mjs'); assert.equal(mapped.enablement, 'disabled');
  }
});
