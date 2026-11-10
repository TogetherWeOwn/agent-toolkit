import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-traffic-budgets-for-query.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const scope = { organization: 'example-org', database: 'app', branch: 'staging', fingerprint: 'query123', keyspace: 'main', budgetIds: ['budget123', 'budget456'] };
const args = { page: 1, perPage: 2 };
const path = '/v1/organizations/example-org/databases/app/branches/staging/insights/query123/traffic/budgets?keyspace=main&page=1&per_page=2';
const row = { id: 'budget123', mode: 'enforce', name: canary, capacity: 6000, rate: 100, burst: 6000, concurrency: 100, warning_threshold: 90, actor: { id: canary }, rules: [{ fingerprint: canary, keyspace: canary, syntax_highlighted_sql: canary, tags: [{ key: canary, value: canary }] }], created_at: canary, updated_at: canary };
const expected = { id: 'budget123', mode: 'enforce', effectiveEnforcement: 'not-established' };
const page = (data, next_page = null) => ({ type: 'list', data, current_page: 1, per_page: 2, next_page, next_page_url: canary, prev_page: null, prev_page_url: canary });

test('query traffic budgets: fixed GET and frozen scalar-only receipt', () => {
  const prepared = list.prepare(scope, args);
  assert.equal(list.operationId, 'list_traffic_budgets_for_query');
  assert.equal(list.tool, 'planetscale.' + list.operationId);
  assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
  const output = prepared.project(wire(page([row])));
  assert.deepEqual(output, { items: [expected], nextPage: null, complete: true });
  assert.ok(!JSON.stringify(output).includes(canary));
  for (const value of [prepared, prepared.request, output, output.items, ...output.items]) assert.ok(Object.isFrozen(value));
});

test('query traffic budgets: closed arguments reject identity, filter and authority overrides', () => {
  for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'mode', 'fingerprint', 'keyspace', 'budgetIds', 'all']) assert.throws(() => list.prepare(scope, { ...args, [field]: canary }));
  for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => list.prepare(scope, value));
  const hostile = Object.defineProperty({ ...args }, 'url', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare(scope, hostile), error => !String(error).includes(canary));
});

test('query traffic budgets: required bounded parent, fingerprint and keyspace selectors', () => {
  for (const field of ['organization', 'database', 'branch', 'fingerprint', 'keyspace']) {
    for (const value of [undefined, null, '../foreign', 'x/y', 'x%2fy', 'é', '', 'a'.repeat(81), canary]) assert.throws(() => list.prepare({ ...scope, [field]: value }, args), error => !String(error).includes(canary));
  }
  for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => list.prepare(value, args));
  const hostile = Object.defineProperty({ ...scope }, 'fingerprint', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare(hostile, args), error => !String(error).includes(canary));
});

test('query traffic budgets: IDs are unique bounded broker bindings', () => {
  for (const budgetIds of [[], ['budget123', 'budget123'], Array(33).fill('budget123'), ['x/y'], [null], [canary], ['']]) assert.throws(() => list.prepare({ ...scope, budgetIds }, args));
  const hostile = Object.defineProperty(['budget123'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...scope, budgetIds: hostile }, args), error => !String(error).includes(canary));
  assert.doesNotThrow(() => list.prepare({ ...scope, budgetIds: Array.from({ length: 32 }, (_, i) => 'budget' + i) }, args));
});

test('query traffic budgets: immutable selectors, ID list and pagination snapshots', () => {
  const mutable = structuredClone(scope);
  const mutableArgs = { ...args };
  const prepared = list.prepare(mutable, mutableArgs);
  for (const field of ['organization', 'database', 'branch', 'fingerprint', 'keyspace']) mutable[field] = 'foreign';
  mutable.budgetIds[0] = 'foreign'; mutable.budgetIds.push('another');
  mutableArgs.page = 2; mutableArgs.perPage = 10;
  assert.equal(prepared.request.path, path);
  assert.deepEqual(prepared.project(wire(page([row]))).items, [expected]);
  assert.throws(() => prepared.project(wire(page([{ ...row, id: 'foreign' }]))));
});

test('query traffic budgets: malformed or oversized wire data returns fixed refusal', () => {
  const prepared = list.prepare(scope, args);
  for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
});

test('query traffic budgets: unknown identities and malformed fields refuse the whole page', () => {
  const prepared = list.prepare(scope, args);
  for (const field of ['id', 'mode']) for (const value of [undefined, null, true, 1, {}, [], canary, 'foreign']) assert.throws(() => prepared.project(wire(page([row, { ...row, [field]: value }]))), error => !String(error).includes(canary));
});

test('query traffic budgets: duplicate, malformed and over-cap rows refuse without partial output', () => {
  const prepared = list.prepare(scope, args);
  for (const rows of [null, {}, [null], [row, row], [row, row, row]]) assert.throws(() => prepared.project(wire(page(rows))));
  assert.deepEqual(prepared.project(wire(page([]))), { items: [], nextPage: null, complete: true });
  assert.deepEqual(prepared.project(wire(page([row, { ...row, id: 'budget456' }]))).items, [expected, { ...expected, id: 'budget456' }]);
});

test('query traffic budgets: bounded page numbers never follow provider URLs', () => {
  const prepared = list.prepare(scope, args);
  assert.deepEqual(prepared.project(wire(page([row], 2))), { items: [expected], nextPage: 2, complete: false });
  for (const response of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 10 }, page([row], 1), page([row], 3), page([row], '2'), { ...page([row]), next_page: undefined }]) assert.throws(() => prepared.project(wire(response)));
  for (const bad of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: '1', perPage: 2 }, { page: 1, perPage: 0 }, { page: 1, perPage: 11 }, { page: 1, perPage: 1.5 }]) assert.throws(() => list.prepare(scope, bad));
  const last = list.prepare(scope, { page: 100, perPage: 2 });
  assert.throws(() => last.project(wire({ ...page([row], 101), current_page: 100 })));
  assert.deepEqual(last.project(wire({ ...page([row]), current_page: 100 })).items, [expected]);
});

test('query traffic budgets: documented modes never establish effective enforcement', () => {
  for (const mode of ['enforce', 'warn', 'off']) assert.deepEqual(list.prepare(scope, args).project(wire(page([{ ...row, mode }]))).items, [{ ...expected, mode }]);
});

test('query traffic budgets: SQL, selectors, tags, limits and actors are never reflected or interpreted', () => {
  for (const field of ['name', 'capacity', 'rate', 'burst', 'concurrency', 'warning_threshold', 'actor', 'rules', 'created_at', 'updated_at']) {
    const altered = { ...row, [field]: { token: canary, sql: canary } };
    assert.deepEqual(list.prepare(scope, args).project(wire(page([altered]))).items, [expected]);
    delete altered[field];
    assert.deepEqual(list.prepare(scope, args).project(wire(page([altered]))).items, [expected]);
  }
});

test('query traffic budgets: fixed route and projection match pinned official contract', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === list.operationId);
  assert.equal(operation.method, 'get');
  assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), path.split('?')[0]);
  assert.deepEqual(operation.value.parameters.filter(p => p.in === 'query').map(p => p.name).sort(), ['keyspace', 'page', 'per_page']);
  assert.equal(operation.value.responses['200'].schema.$ref, '#/definitions/PaginatedTrafficBudget');
  const response = schema.definitions.PaginatedTrafficBudget.properties.data.items;
  assert.equal(response.properties.id.type, 'string');
  assert.deepEqual(response.properties.mode.enum, ['enforce', 'warn', 'off']);
  for (const field of ['id', 'mode']) assert.ok(response.required.includes(field));
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const mapped = map.operations.find(row => row.operationId === list.operationId);
  assert.equal(mapped.implementation, 'offline-adapter-only');
  assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
  assert.equal(mapped.test, 'test/query-traffic-budgets.test.mjs');
  assert.equal(mapped.enablement, 'disabled');
});
