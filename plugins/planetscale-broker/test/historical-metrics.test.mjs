import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as branch from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-metrics.js';
import * as tablet from '../../../dist/plugins/planetscale-broker/src/tools/get-tablet-metrics.js';
import * as query from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query-metrics.js';
import * as tag from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-tag-metrics.js';
import { historicalBranchMetricNames, historicalTabletMetricNames } from '../../../dist/plugins/planetscale-broker/src/historical-metrics.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const parent = { organization: 'example-org', database: 'app', branch: 'staging', branchId: 'branch123', from: '2026-11-07T12:00:00Z', to: '2026-11-07T12:15:00Z' };
const start = Date.parse(parent.from) / 1000;
const fixtures = [[branch, historicalBranchMetricNames, ''], [tablet, historicalTabletMetricNames, '/tablets'], [query, historicalBranchMetricNames, '/query'], [tag, historicalBranchMetricNames, '/tag']];
const series = metric => ({ type: 'TimeSeries', metric, label: canary, labels: { role: canary, pod: canary }, points: [[start, 42.5]], secret: canary });
const response = metric => ({ type: 'MetricSeries', start_date: parent.from, end_date: parent.to, interval: 60, series: [series(metric)], secret: canary });
const expected = (metric, seriesPresent = true, samplesPresent = true) => ({ requestBranchId: 'branch123', metric, seriesPresent, samplesPresent, health: 'not-established', provenance: 'not-established' });

for (const [adapter, metrics, suffix] of fixtures) {
  const scope = { ...parent, metric: metrics[0] };
  const path = '/v1/organizations/example-org/databases/app/branches/staging/metrics' + suffix + '?metrics=' + scope.metric + '&from=2026-11-07T12%3A00%3A00Z&to=2026-11-07T12%3A15%3A00Z&steps=16';
  test(`${adapter.operationId}: fixed GET and frozen availability-only projection`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.equal(adapter.tool, 'planetscale.' + adapter.operationId);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
    const output = prepared.project(wire(response(scope.metric)));
    assert.deepEqual(output, expected(scope.metric));
    assert.ok(!JSON.stringify(output).includes(canary));
    for (const value of [prepared, prepared.request, output]) assert.ok(Object.isFrozen(value));
  });
  test(`${adapter.operationId}: closed caller arguments refuse filters and authority overrides`, () => {
    for (const field of ['metrics', 'from', 'to', 'steps', 'period', 'keyspace', 'shard', 'pod', 'role', 'query_ids', 'fingerprint', 'tag_sets', 'tablet_type', 'budget_id', 'rule_id', 'q', 'sql', 'url', 'credential', 'approval', 'agentId', 'production']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const args of [null, [], 1, true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, args));
    const hostile = Object.defineProperty({}, 'metric', { enumerable: true, get() { throw new Error(canary); } });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });
  test(`${adapter.operationId}: broker scope refuses injection and unsupported metrics`, () => {
    for (const field of Object.keys(scope)) for (const value of [undefined, null, '', '../foreign', 'x/y', 'x%2fy', 'é', 'a'.repeat(81), canary]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}));
    for (const bad of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }, { ...scope, metric: metrics === historicalTabletMetricNames ? historicalBranchMetricNames[0] : historicalTabletMetricNames[0] }]) assert.throws(() => adapter.prepare(bad, {}));
    const hostile = Object.defineProperty({ ...scope }, 'from', { enumerable: true, get() { throw new Error(canary); } });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });
  test(`${adapter.operationId}: canonical UTC dates and positive fifteen-minute window required`, () => {
    for (const from of ['2026-02-30T12:00:00Z', '2026-11-07T24:00:00Z', '2026-11-07T12:00:60Z', '2026-11-07T12:00:00+00:00', '2026-11-07T12:00:00.000Z']) assert.throws(() => adapter.prepare({ ...scope, from }, {}));
    for (const to of [parent.from, '2026-11-07T11:59:59Z', '2026-11-07T12:15:01Z', '2026-11-08T12:00:00Z']) assert.throws(() => adapter.prepare({ ...scope, to }, {}));
    assert.ok(adapter.prepare({ ...scope, to: '2026-11-07T12:00:01Z' }, {}));
    assert.ok(adapter.prepare({ ...scope, from: '2024-02-29T12:00:00Z', to: '2024-02-29T12:15:00Z' }, {}));
  });
  test(`${adapter.operationId}: immutable request identity and time-window snapshot`, () => {
    const mutable = { ...scope }, prepared = adapter.prepare(mutable, {});
    for (const field of Object.keys(mutable)) mutable[field] = 'foreign';
    assert.equal(prepared.request.path, path);
    assert.deepEqual(prepared.project(wire(response(scope.metric))), expected(scope.metric));
    for (const field of ['start_date', 'end_date']) for (const value of [undefined, null, 1, {}, 'foreign', '2026-11-07T12:01:00Z']) assert.throws(() => prepared.project(wire({ ...response(scope.metric), [field]: value })));
  });
  test(`${adapter.operationId}: bounded wire decode returns fixed refusal`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const body of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(body), error => !String(error).includes(canary));
    for (const type of [undefined, null, 1, {}, [], '', 'x'.repeat(81)]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), type })));
    for (const interval of [undefined, null, '60', -1, 0, 0.5, 901, Infinity]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), interval })));
  });
  test(`${adapter.operationId}: malformed or foreign series refuse the whole result`, () => {
    const prepared = adapter.prepare(scope, {}), row = series(scope.metric);
    for (const data of [undefined, null, {}, [null], Array(9).fill(row), [row, { ...row, metric: 'foreign' }], [{ ...row, metric: metrics[1] }]]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), series: data })));
    for (const type of [undefined, null, '', [], {}, 1, 'x'.repeat(81)]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), series: [{ ...row, type }] })));
    for (const label of [undefined, null, {}, [], 1, 'x'.repeat(257)]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), series: [{ ...row, label }] })));
    for (const labels of [undefined, null, [], 'x']) assert.throws(() => prepared.project(wire({ ...response(scope.metric), series: [{ ...row, labels }] })));
  });
  test(`${adapter.operationId}: bounded finite chronological point pairs only`, () => {
    const prepared = adapter.prepare(scope, {});
    const project = points => prepared.project(wire({ ...response(scope.metric), series: [{ ...series(scope.metric), points }] }));
    assert.deepEqual(project(Array.from({ length: 16 }, (_, i) => [start + i * 60, -1e90])), expected(scope.metric));
    assert.deepEqual(project([[start + 900, 0]]), expected(scope.metric));
    for (const points of [undefined, null, {}, [null], [[start]], [[start, 1, 2]], [[start, '1']], [[start, null]], [[start, Infinity]], [[start - 1, 1]], [[start + 901, 1]], [['0', 1]], [[start + 1, 1], [start, 2]], [[start, 1], [start, 2]], Array.from({ length: 17 }, (_, i) => [start + i, 1])]) assert.throws(() => project(points));
  });
  test(`${adapter.operationId}: empty series, empty samples and multi-series presence stay distinct`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.project(wire({ ...response(scope.metric), series: [] })), expected(scope.metric, false, false));
    assert.deepEqual(prepared.project(wire({ ...response(scope.metric), series: [{ ...series(scope.metric), points: [] }] })), expected(scope.metric, true, false));
    assert.deepEqual(prepared.project(wire({ ...response(scope.metric), series: Array(8).fill(series(scope.metric)) })), expected(scope.metric));
    for (const metric of metrics) assert.deepEqual(adapter.prepare({ ...scope, metric }, {}).project(wire(response(metric))), expected(metric));
  });
  test(`${adapter.operationId}: response cannot prove branch identity, labels or health`, () => {
    const body = { ...response(scope.metric), branch: { id: 'foreign', name: 'production' }, complete: true, healthy: true };
    body.series[0].labels = { query: canary, secret: { password: canary } };
    assert.deepEqual(adapter.prepare(scope, {}).project(wire(body)), expected(scope.metric));
    // No branch field is documented. Caller-supplied bodies are never provenance.
    assert.equal(adapter.prepare({ ...scope, branchId: 'other' }, {}).project(wire(body)).provenance, 'not-established');
  });
  if (adapter === query || adapter === tag) test(`${adapter.operationId}: whole-branch subset never accepts selector-based authority`, () => {
    const prepared = adapter.prepare(scope, {});
    const selectors = ['query_ids', 'fingerprint', 'keyspace', 'tag_sets', 'tablet_type', 'budget_id', 'rule_id', 'q'];
    for (const name of selectors) {
      assert.ok(!new URL('https://api.planetscale.com' + prepared.request.path).searchParams.has(name));
      assert.throws(() => adapter.prepare({ ...scope, [name]: 'foreign' }, {}));
    }
    const body = response(scope.metric);
    body.series[0].labels = { query_id: 'foreign', tag_sets: [canary], fingerprint: canary, keyspace: 'foreign' };
    assert.deepEqual(prepared.project(wire(body)), expected(scope.metric));
    assert.equal(prepared.project(wire(body)).provenance, 'not-established');
  });
  test(`${adapter.operationId}: fixed subset agrees with pinned official contract and inventory`, async () => {
    const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), path.split('?')[0]);
    assert.deepEqual(operation.value.responses['200'].schema, { $ref: '#/definitions/MetricSeries' });
    const query = operation.value.parameters.find(p => p.name === 'metrics' && p.in === 'query');
    assert.ok(metrics.every(metric => query.items.enum.includes(metric)));
    for (const name of ['from', 'to', 'steps']) assert.ok(operation.value.parameters.some(p => p.name === name && p.in === 'query'));
    const shape = schema.definitions.MetricSeries;
    assert.deepEqual(shape.required, ['type', 'start_date', 'end_date', 'interval', 'series']);
    assert.equal(shape.properties.branch, undefined);
    assert.deepEqual(shape.properties.series.items.required, ['type', 'metric', 'label', 'labels', 'points']);
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const mapped = map.operations.find(row => row.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
    assert.equal(mapped.test, 'test/historical-metrics.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  });
}
