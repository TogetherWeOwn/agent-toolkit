import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as detail from '../../../dist/plugins/planetscale-broker/src/tools/get-query-patterns-report-status.js';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-generated-query-patterns-reports.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const detailScope = { ...target, reportId: 'report123' };
const listScope = { ...target, reportIds: ['report123', 'report456'] };
const path = '/v1/organizations/example-org/databases/app/branches/staging/query-patterns';
const row = { id: 'report123', state: 'completed', created_at: canary, finished_at: canary, url: canary, download_url: canary, actor: { id: canary, display_name: canary, avatar_url: canary }, sql: canary };
const expected = { id: 'report123', state: 'completed', downloadAuthority: 'not-established' };
const page = (data, has_next = false) => ({ type: 'list', has_next, has_prev: false, cursor_start: data[0]?.id ?? null, cursor_end: data.at(-1)?.id ?? null, data });
const outputPage = (items, hasMore = false) => ({ items, hasMore, coverage: 'first-page-only-not-completeness-evidence' });
const fixtures = [
  [detail, detailScope, row, expected, path + '/report123'],
  [list, listScope, page([row]), outputPage([expected]), path + '?limit=10'],
];

for (const [adapter, scope, response, output, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET and frozen scalar-only report metadata`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    assert.equal(adapter.tool, 'planetscale.' + adapter.operationId);
    const projected = prepared.project(wire(response));
    assert.deepEqual(projected, output);
    assert.ok(!JSON.stringify(projected).includes(canary));
    for (const value of [prepared, prepared.request, projected, ...(projected.items ? [projected.items, ...projected.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: arguments cannot override transport, cursor, limit or authority`, () => {
    for (const field of ['sql', 'url', 'download_url', 'secret', 'credential', 'approval', 'agentId', 'production', 'state', 'starting_after', 'ending_before', 'limit', 'page', 'reportId', 'all']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({}, 'url', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed broker scope and bounded parents`, () => {
    for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: malformed or oversized wire data gives fixed refusal`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: immutable bindings resist caller retargeting`, () => {
    const mutable = structuredClone(scope);
    const prepared = adapter.prepare(mutable, {});
    mutable.organization = 'foreign'; mutable.database = 'foreign'; mutable.branch = 'foreign';
    if (mutable.reportIds) { mutable.reportIds[0] = 'foreign'; mutable.reportIds.push('another'); }
    else mutable.reportId = 'foreign';
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(response)), output);
    assert.throws(() => prepared.project(wire(adapter === list ? page([{ ...row, id: 'foreign' }]) : { ...row, id: 'foreign' })));
  });

  test(`${adapter.operationId}: unknown IDs and malformed selected fields refuse all rows`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const field of ['id', 'state']) for (const value of [undefined, null, true, 1, {}, [], canary, 'foreign']) {
      const invalid = { ...row, [field]: value };
      assert.throws(() => prepared.project(wire(adapter === list ? page([row, invalid]) : invalid)), error => !String(error).includes(canary));
    }
  });

  test(`${adapter.operationId}: provider state never establishes download authority or closure`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const state of ['pending', 'completed', 'failed']) {
      const projected = prepared.project(wire(adapter === list ? page([{ ...row, state }]) : { ...row, state }));
      assert.deepEqual(adapter === list ? projected.items : [projected], [{ ...expected, state }]);
    }
  });
}

test('query report scopes require bounded unique IDs, never download URLs or arbitrary strings', () => {
  for (const reportId of ['../foreign', 'x/y', 'x%2fy', '', 'a'.repeat(81), canary, null]) assert.throws(() => detail.prepare({ ...detailScope, reportId }, {}));
  for (const reportIds of [[], ['report123', 'report123'], Array(33).fill('report123'), ['x/y'], [null], [canary], ['']]) assert.throws(() => list.prepare({ ...listScope, reportIds }, {}));
  const hostile = Object.defineProperty(['report123'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...listScope, reportIds: hostile }, {}), error => !String(error).includes(canary));
  assert.doesNotThrow(() => list.prepare({ ...listScope, reportIds: Array.from({ length: 32 }, (_, i) => 'report' + i) }, {}));
});

test('query report first page refuses duplicate, malformed or over-cap data without partial output', () => {
  const prepared = list.prepare(listScope, {});
  for (const data of [null, {}, [null], [row, row], Array(11).fill(row)]) assert.throws(() => prepared.project(wire({ ...page([]), data })));
  assert.deepEqual(prepared.project(wire(page([]))), outputPage([]));
  assert.deepEqual(prepared.project(wire(page([row, { ...row, id: 'report456' }]))), outputPage([expected, { ...expected, id: 'report456' }]));
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...row, id: 'report' + i }));
  assert.equal(list.prepare({ ...target, reportIds: rows.map(row => row.id) }, {}).project(wire(page(rows))).items.length, 10);
  assert.deepEqual(prepared.project(wire(page([row]))), outputPage([expected]));
});

test('query report first page validates cursor envelope and marks more data without following it', () => {
  const prepared = list.prepare(listScope, {});
  assert.deepEqual(prepared.project(wire(page([row], true))), outputPage([expected], true));
  for (const [field, values] of [
    ['type', [undefined, null, true, 'page']],
    ['has_next', [undefined, null, 1, 'true']],
    ['has_prev', [undefined, null, true, 0, 'false']],
    ['cursor_start', [undefined, null, canary, 'report456', 1]],
    ['cursor_end', [undefined, null, canary, 'report456', 1]],
  ]) for (const value of values) assert.throws(() => prepared.project(wire({ ...page([row]), [field]: value })), error => !String(error).includes(canary));
  assert.throws(() => prepared.project(wire(page([], true))));
  assert.throws(() => prepared.project(wire({ ...page([]), cursor_start: 'report123' })));
  assert.throws(() => prepared.project(wire({ ...page([]), cursor_end: 'report123' })));
  const reversed = { ...page([row, { ...row, id: 'report456' }]), cursor_start: 'report456', cursor_end: 'report123' };
  assert.throws(() => prepared.project(wire(reversed)));
});

test('query report projections omit entire URLs, actor, SQL and timestamp subtrees', () => {
  for (const omitted of ['url', 'download_url', 'actor', 'sql', 'created_at', 'finished_at']) {
    const altered = { ...row, [omitted]: { token: canary, sql: canary } };
    assert.deepEqual(detail.prepare(detailScope, {}).project(wire(altered)), expected);
    assert.deepEqual(list.prepare(listScope, {}).project(wire(page([altered]))), outputPage([expected]));
    delete altered[omitted];
    assert.deepEqual(detail.prepare(detailScope, {}).project(wire(altered)), expected);
  }
});

test('query report routes, cursor contract and states match pinned official schema; download stays missing', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, , , endpoint] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => ({ ...scope, id: scope.reportId })[key]), endpoint.split('?')[0]);
    let response = schema.definitions[operation.value.responses['200'].schema.$ref.split('/').at(-1)];
    if (adapter === list) {
      assert.deepEqual(response.required, ['type', 'has_next', 'has_prev', 'cursor_start', 'cursor_end', 'data']);
      assert.equal(operation.value.parameters.find(row => row.name === 'limit').type, 'integer');
      response = response.properties.data.items;
    }
    for (const field of ['id', 'state']) assert.ok(response.required.includes(field));
    assert.equal(response.properties.id.type, 'string');
    assert.deepEqual(response.properties.state.enum, ['pending', 'completed', 'failed']);
    const mapped = map.operations.find(row => row.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
    assert.equal(mapped.test, 'test/query-reports.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  }
  const download = map.operations.find(row => row.operationId === 'get_query_patterns_report');
  assert.equal(download.implementation, 'missing');
  assert.equal(download.adapter, null);
  assert.ok(download.prerequisites.includes('reviewed-report-download-redirect-and-custody-contract'));
});
