import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as detail from '../../../dist/plugins/planetscale-broker/src/tools/get-traffic-budget.js';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-traffic-budgets.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const detailScope = { ...target, budgetId: 'budget123' };
const listScope = { ...target, budgetIds: ['budget123', 'budget456'] };
const pageArgs = { page: 1, perPage: 2 };
const path = '/v1/organizations/example-org/databases/app/branches/staging/traffic/budgets';
const row = { id: 'budget123', mode: 'enforce', name: canary, capacity: 6000, rate: 100, burst: 6000, concurrency: 100, warning_threshold: 90, actor: { id: canary }, rules: [{ id: canary, tags: [{ key: canary, value: canary }], fingerprint: canary, keyspace: canary, syntax_highlighted_sql: canary }], created_at: canary, updated_at: canary };
const expected = { id: 'budget123', mode: 'enforce', effectiveEnforcement: 'not-established' };
const page = (data, next_page = null) => ({ type: 'list', data, current_page: 1, per_page: 2, next_page, next_page_url: canary, prev_page: null, prev_page_url: canary });
const fixtures = [
  [detail, detailScope, {}, row, expected, path + '/budget123'],
  [list, listScope, pageArgs, page([row]), { items: [expected], nextPage: null, complete: true }, path + '?page=1&per_page=2'],
];

for (const [adapter, scope, args, response, output, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET and frozen scalar-only metadata`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    assert.equal(adapter.tool, 'planetscale.' + adapter.operationId);
    const projected = prepared.project(wire(response));
    assert.deepEqual(projected, output);
    assert.ok(!JSON.stringify(projected).includes(canary));
    for (const value of [prepared, prepared.request, projected, ...(projected.items ? [projected.items, ...projected.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: closed arguments cannot override transport, identity, filters or authority`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'mode', 'period', 'created_at', 'fingerprint', 'keyspace', 'budgetId', 'all']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({ ...args }, 'url', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: bounded parents and closed broker scope`, () => {
    for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, args), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, args));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: malformed or oversized wire data returns fixed refusal`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: immutable scope snapshots prevent caller retargeting`, () => {
    const mutable = structuredClone(scope);
    const mutableArgs = { ...args };
    const prepared = adapter.prepare(mutable, mutableArgs);
    mutable.organization = 'foreign'; mutable.database = 'foreign'; mutable.branch = 'foreign';
    if (mutable.budgetIds) { mutable.budgetIds[0] = 'foreign'; mutable.budgetIds.push('another'); }
    else mutable.budgetId = 'foreign';
    if (adapter === list) { mutableArgs.page = 3; mutableArgs.perPage = 10; }
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(response)), output);
    assert.throws(() => prepared.project(wire(adapter === list ? page([{ ...row, id: 'foreign' }]) : { ...row, id: 'foreign' })));
  });

  test(`${adapter.operationId}: unknown identities and malformed selected fields refuse the whole result`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of ['id', 'mode']) for (const value of [undefined, null, true, 1, {}, [], canary, 'foreign']) {
      const invalid = { ...row, [field]: value };
      assert.throws(() => prepared.project(wire(adapter === list ? page([row, invalid]) : invalid)), error => !String(error).includes(canary));
    }
  });

  test(`${adapter.operationId}: every documented mode is informational, never effective enforcement`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const mode of ['enforce', 'warn', 'off']) {
      const projected = prepared.project(wire(adapter === list ? page([{ ...row, mode }]) : { ...row, mode }));
      assert.deepEqual(adapter === list ? projected.items : [projected], [{ ...expected, mode }]);
    }
  });
}

test('traffic budget scopes require bounded unique IDs, not URLs, fingerprints or mutable authority', () => {
  for (const budgetId of ['../foreign', 'x/y', 'x%2fy', '', 'a'.repeat(81), canary, null]) assert.throws(() => detail.prepare({ ...detailScope, budgetId }, {}));
  for (const budgetIds of [[], ['budget123', 'budget123'], Array(33).fill('budget123'), ['x/y'], [null], [canary], ['']]) assert.throws(() => list.prepare({ ...listScope, budgetIds }, pageArgs));
  const hostile = Object.defineProperty(['budget123'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...listScope, budgetIds: hostile }, pageArgs), error => !String(error).includes(canary));
  assert.doesNotThrow(() => list.prepare({ ...listScope, budgetIds: Array.from({ length: 32 }, (_, i) => 'budget' + i) }, pageArgs));
});

test('traffic budget list refuses duplicate, over-cap or malformed rows without partial output', () => {
  const prepared = list.prepare(listScope, pageArgs);
  for (const rows of [null, {}, [null], [row, row], [row, row, row]]) assert.throws(() => prepared.project(wire(page(rows))));
  assert.deepEqual(prepared.project(wire(page([]))), { items: [], nextPage: null, complete: true });
  assert.deepEqual(prepared.project(wire(page([row, { ...row, id: 'budget456' }]))).items, [expected, { ...expected, id: 'budget456' }]);
});

test('traffic budget list uses bounded page numbers, never follows pagination URLs', () => {
  const prepared = list.prepare(listScope, pageArgs);
  assert.deepEqual(prepared.project(wire(page([row], 2))), { items: [expected], nextPage: 2, complete: false });
  for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 10 }, page([row], 1), page([row], 3), page([row], '2'), page([row], undefined)]) {
    // An omitted next_page differs from the page helper's null default.
    if (value.next_page === null) delete value.next_page;
    assert.throws(() => prepared.project(wire(value)));
  }
  for (const args of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: '1', perPage: 2 }, { page: 1, perPage: 0 }, { page: 1, perPage: 11 }, { page: 1, perPage: 1.5 }]) assert.throws(() => list.prepare(listScope, args));
  const last = list.prepare(listScope, { page: 100, perPage: 2 });
  assert.throws(() => last.project(wire({ ...page([row], 101), current_page: 100 })));
  assert.deepEqual(last.project(wire({ ...page([row]), current_page: 100 })), { items: [expected], nextPage: null, complete: true });
});

test('traffic budget metadata omits entire SQL/rule/tag/limit/actor subtrees rather than reflecting them', () => {
  for (const omitted of ['name', 'capacity', 'rate', 'burst', 'concurrency', 'warning_threshold', 'actor', 'rules', 'created_at', 'updated_at']) {
    const altered = { ...row, [omitted]: { token: canary, sql: canary } };
    assert.deepEqual(detail.prepare(detailScope, {}).project(wire(altered)), expected);
    delete altered[omitted];
    assert.deepEqual(detail.prepare(detailScope, {}).project(wire(altered)), expected);
  }
});

test('traffic budget routes and selected fields match pinned official response contracts', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, , , , endpoint] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => ({ ...scope, id: scope.budgetId })[key]), endpoint.split('?')[0]);
    let response = schema.definitions[operation.value.responses['200'].schema.$ref.split('/').at(-1)];
    if (adapter === list) response = response.properties.data.items;
    for (const field of ['id', 'mode']) assert.ok(response.required.includes(field));
    assert.equal(response.properties.id.type, 'string');
    assert.deepEqual(response.properties.mode.enum, ['enforce', 'warn', 'off']);
    const mapped = map.operations.find(row => row.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
    assert.equal(mapped.test, 'test/traffic-budgets.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  }
  const queryBudgets = map.operations.find(row => row.operationId === 'list_traffic_budgets_for_query');
  assert.equal(queryBudgets.implementation, 'offline-adapter-only');
  assert.equal(queryBudgets.test, 'test/query-traffic-budgets.test.mjs');
  assert.equal(queryBudgets.enablement, 'disabled');
});
