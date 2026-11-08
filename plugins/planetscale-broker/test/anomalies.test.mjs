import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-anomalies.js';
import * as get from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-anomaly.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const listScope = { ...target, anomalyIds: ['anomaly-1', 'anomaly-2'] };
const getScope = { ...target, anomalyId: 'anomaly-1' };
const path = '/v1/organizations/example-org/databases/app/branches/staging/insights/anomalies';
const args = { page: 1, perPage: 2 };
const row = { id: 'anomaly-1', active: true, period_start: canary, period_end: canary, minutes_in_violation: 5, duration: 600, metrics_start: canary, metrics_end: canary, correlations: [{ id: canary, r: 0.9, keyspace: canary, fingerprint: canary, normalized_sql: canary, syntax_highlighted_sql: canary, tablet_type: 'primary' }] };
const body = { current_page: 1, per_page: 2, next_page: null, data: [row], next_page_url: canary };
const summary = { id: 'anomaly-1', active: true, remediationAuthority: 'not-established' };
const expected = { items: [summary], nextPage: null, complete: true };
const fixtures = [
  [list, listScope, args, body, expected, path + '?page=1&per_page=2'],
  [get, getScope, {}, row, summary, path + '/anomaly-1'],
];

for (const [adapter, scope, input, response, output, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET and immutable SQL-free projection`, () => {
    const prepared = adapter.prepare(scope, input);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const result = prepared.project(wire(response));
    assert.deepEqual(result, output);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, ...(result.items ? [result.items, ...result.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: malformed/oversized wire data refuses without reflection`, () => {
    const prepared = adapter.prepare(scope, input);
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments refuse filters and authority overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'anomalyId', 'anomalyIds', 'from', 'to', 'period', 'execute']) assert.throws(() => adapter.prepare(scope, { ...input, [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({ ...input }, 'sql', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed scope and bounded path segments`, () => {
    for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, input), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, input));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, input), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: caller mutation cannot retarget bindings`, () => {
    const copy = structuredClone(scope);
    const inputCopy = structuredClone(input);
    const prepared = adapter.prepare(copy, inputCopy);
    copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign';
    if (adapter === list) { copy.anomalyIds[0] = 'foreign'; copy.anomalyIds.push('another'); inputCopy.page = 2; inputCopy.perPage = 10; }
    else copy.anomalyId = 'foreign';
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(response)), output);
    assert.throws(() => prepared.project(wire(adapter === list ? { ...body, data: [{ ...row, id: 'foreign' }] } : { ...row, id: 'foreign' })));
  });

  test(`${adapter.operationId}: bound identity and strict active flag, never remediation authority`, () => {
    const prepared = adapter.prepare(scope, input);
    const project = change => prepared.project(wire(adapter === list ? { ...body, data: [{ ...row, ...change }] } : { ...row, ...change }));
    for (const id of [undefined, null, 'foreign', canary, '', 1]) assert.throws(() => project({ id }), error => !String(error).includes(canary));
    for (const active of [undefined, null, 0, 1, 'false', canary, {}, []]) assert.throws(() => project({ active }), error => !String(error).includes(canary));
    for (const active of [true, false]) assert.deepEqual(project({ active }), adapter === list ? { ...expected, items: [{ ...summary, active }] } : { ...summary, active });
  });
}

test('anomaly list: unknown or duplicate IDs refuse the whole page', () => {
  const prepared = list.prepare(listScope, args);
  for (const data of [null, {}, [null], [row, { ...row, id: 'foreign' }], [row, row], Array(3).fill(row)]) assert.throws(() => prepared.project(wire({ ...body, data })));
  assert.deepEqual(prepared.project(wire({ ...body, data: [row, { ...row, id: 'anomaly-2' }] })), { ...expected, items: [summary, { ...summary, id: 'anomaly-2' }] });
  assert.deepEqual(prepared.project(wire(body)), expected);
});

test('anomaly list: bounded pagination, no provider URL following or scope completeness claim', () => {
  const prepared = list.prepare(listScope, args);
  assert.deepEqual(prepared.project(wire({ ...body, next_page: 2 })), { ...expected, nextPage: 2, complete: false });
  assert.deepEqual(prepared.project(wire({ ...body, data: [] })), { ...expected, items: [] });
  for (const change of [{ current_page: 2 }, { per_page: 3 }, { next_page: 3 }, { next_page: canary }]) assert.throws(() => prepared.project(wire({ ...body, ...change })));
  const last = list.prepare(listScope, { page: 100, perPage: 2 });
  assert.throws(() => last.project(wire({ ...body, current_page: 100, next_page: 101 })));
  assert.deepEqual(last.project(wire({ ...body, current_page: 100 })), expected);
  for (const input of [{}, { page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: 1, perPage: 0 }]) assert.throws(() => list.prepare(listScope, input));
});

test('anomaly list: unique snapshotted ID scope with caps', () => {
  for (const anomalyIds of [[], ['anomaly-1', 'anomaly-1'], Array(33).fill('anomaly-1'), ['x/y'], ['../foreign'], [canary], [null], ['']]) assert.throws(() => list.prepare({ ...listScope, anomalyIds }, args));
  const hostile = Object.defineProperty(['anomaly-1'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...listScope, anomalyIds: hostile }, args), error => !String(error).includes(canary));
  for (const anomalyId of ['x/y', '../foreign', canary, null, '']) assert.throws(() => get.prepare({ ...getScope, anomalyId }, {}));
});

test('anomaly details: no correlations, metrics, time or unknown field reflection', () => {
  const prepared = get.prepare(getScope, {});
  assert.deepEqual(prepared.project(wire({ id: row.id, active: false })), { ...summary, active: false });
  for (const correlations of [undefined, null, [], { secret: canary }, canary]) assert.deepEqual(prepared.project(wire({ ...row, correlations, sql: canary, secret: canary })), summary);
});

test('anomaly metadata paths and selected fields match the pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'id' ? scope.anomalyId : scope[key]), endpoint.split('?')[0]);
    const response = schema.definitions[entry.value.responses['200'].schema.$ref.split('/').at(-1)];
    const result = adapter === list ? response.properties.data.items : response;
    for (const [field, type] of [['id', 'string'], ['active', 'boolean']]) { assert.equal(result.properties[field].type, type); assert.ok(result.required.includes(field)); }
    assert.ok(result.properties.correlations.items.properties.normalized_sql);
    assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query').map(value => value.name).sort(), adapter === list ? ['from', 'page', 'per_page', 'period', 'to'] : []);
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const mapped = map.operations.find(value => value.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.test, 'test/anomalies.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  }
});
