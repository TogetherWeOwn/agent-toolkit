import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as branch from '../../../dist/plugins/planetscale-broker/src/tools/get-instant-branch-metrics.js';
import * as tablet from '../../../dist/plugins/planetscale-broker/src/tools/get-instant-tablet-metrics.js';
import { branchMetricNames, tabletMetricNames } from '../../../dist/plugins/planetscale-broker/src/instant-metrics.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const parent = { organization: 'example-org', database: 'app', branch: 'staging', branchId: 'branch123' };
const sample = { pod: canary, role: canary, value: 123.5, secret: canary };
const fixtures = [
  [branch, branchMetricNames, 'instant'],
  [tablet, tabletMetricNames, 'tablets-instant'],
];
const response = metric => ({ type: 'metrics', branch: { id: 'branch123', name: 'staging', created_at: canary, updated_at: canary, deleted_at: null }, metrics: [{ metric, label: canary, values: [sample] }], secret: canary });
const expected = (metric, samplesPresent = true) => ({ branchId: 'branch123', items: [{ metric, samplesPresent }], health: 'not-established' });

for (const [adapter, metrics, suffix] of fixtures) {
  const scope = { ...parent, metric: metrics[0] };
  const path = '/v1/organizations/example-org/databases/app/branches/staging/metrics/' + suffix + '?metrics=' + scope.metric;
  test(`${adapter.operationId}: fixed one-metric GET and frozen availability-only receipt`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.equal(adapter.tool, 'planetscale.' + adapter.operationId);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
    const output = prepared.project(wire(response(scope.metric)));
    assert.deepEqual(output, expected(scope.metric));
    assert.ok(!JSON.stringify(output).includes(canary));
    for (const value of [prepared, prepared.request, output, output.items, ...output.items]) assert.ok(Object.isFrozen(value));
  });
  test(`${adapter.operationId}: closed arguments reject filters and authority overrides`, () => {
    for (const field of ['metric', 'metrics', 'branchId', 'role', 'shard', 'pod', 'container', 'keyspace', 'shard_config_profile', 'sql', 'url', 'credential', 'approval', 'agentId', 'production']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const args of [null, [], 1, true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, args));
    const hostile = Object.defineProperty({}, 'metric', { enumerable: true, get() { throw new Error(canary); } });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });
  test(`${adapter.operationId}: closed broker scope refuses selector injection and cross-family metrics`, () => {
    for (const field of ['organization', 'database', 'branch', 'branchId', 'metric']) for (const value of [undefined, null, '', '../foreign', 'x/y', 'x%2fy', 'é', 'a'.repeat(81), canary]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}));
    for (const bad of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }, { ...scope, metric: adapter === branch ? tabletMetricNames[0] : branchMetricNames[0] }]) assert.throws(() => adapter.prepare(bad, {}));
    const hostile = Object.defineProperty({ ...scope }, 'metric', { enumerable: true, get() { throw new Error(canary); } });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });
  test(`${adapter.operationId}: immutable branch identity and metric snapshots`, () => {
    const mutable = { ...scope };
    const prepared = adapter.prepare(mutable, {});
    for (const field of Object.keys(mutable)) mutable[field] = 'foreign';
    assert.equal(prepared.request.path, path);
    assert.deepEqual(prepared.project(wire(response(scope.metric))), expected(scope.metric));
    for (const field of ['id', 'name']) for (const value of [undefined, null, 1, {}, 'foreign']) {
      const body = response(scope.metric); body.branch[field] = value;
      assert.throws(() => prepared.project(wire(body)));
    }
  });
  test(`${adapter.operationId}: bounded wire decode returns fixed refusal`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const body of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(body), error => !String(error).includes(canary));
    for (const branch of [undefined, null, [], {}, 'x']) assert.throws(() => prepared.project(wire({ ...response(scope.metric), branch })));
    for (const type of [undefined, null, 1, {}, [], '', 'x'.repeat(81)]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), type })));
  });
  test(`${adapter.operationId}: unknown, duplicate and malformed metrics refuse the whole response`, () => {
    const prepared = adapter.prepare(scope, {});
    const row = response(scope.metric).metrics[0];
    for (const bodyMetrics of [undefined, null, {}, [null], [row, row], [{ ...row, metric: 'foreign' }], [{ ...row, metric: metrics[1] }]]) assert.throws(() => prepared.project(wire({ ...response(scope.metric), metrics: bodyMetrics })));
    assert.deepEqual(prepared.project(wire({ ...response(scope.metric), metrics: [] })), { branchId: 'branch123', items: [], health: 'not-established' });
  });
  test(`${adapter.operationId}: samples are bounded shape-checked data, never operational health`, () => {
    const prepared = adapter.prepare(scope, {});
    const project = values => prepared.project(wire({ ...response(scope.metric), metrics: [{ metric: scope.metric, label: canary, values }] }));
    assert.deepEqual(project([]), expected(scope.metric, false));
    assert.deepEqual(project(Array(32).fill(sample)), expected(scope.metric));
    for (const values of [undefined, null, {}, [null], Array(33).fill(sample)]) assert.throws(() => project(values));
    for (const field of ['pod', 'role', 'value']) for (const value of [undefined, null, {}, [], true]) assert.throws(() => project([{ ...sample, [field]: value }]));
    for (const value of ['123', 'NaN', Infinity, -Infinity, NaN]) assert.throws(() => project([{ ...sample, value }]));
    for (const field of ['pod', 'role']) for (const value of ['', 'x'.repeat(257), 1]) assert.throws(() => project([{ ...sample, [field]: value }]));
    for (const value of [0, -1, 1e99]) assert.deepEqual(project([{ ...sample, value }]), expected(scope.metric));
  });
  test(`${adapter.operationId}: documented metric enum supported, labels and timestamps never reflected`, () => {
    for (const metric of metrics) assert.deepEqual(adapter.prepare({ ...scope, metric }, {}).project(wire(response(metric))), expected(metric));
    const body = response(scope.metric);
    body.type = canary; body.branch.created_at = { secret: canary }; body.branch.updated_at = canary;
    body.metrics[0].label = { secret: canary }; body.metrics[0].extra = { sql: canary };
    assert.deepEqual(adapter.prepare(scope, {}).project(wire(body)), expected(scope.metric));
  });
  test(`${adapter.operationId}: fixed request and projection match pinned official contract`, async () => {
    const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), path.split('?')[0]);
    const query = operation.value.parameters.find(p => p.name === 'metrics' && p.in === 'query');
    assert.deepEqual(query.items.enum, metrics);
    const shape = operation.value.responses['200'].schema;
    assert.deepEqual(shape.required, ['type', 'branch', 'metrics']);
    assert.equal(shape.properties.branch.properties.id.type, 'string');
    assert.equal(shape.properties.branch.properties.name.type, 'string');
    assert.equal(shape.properties.metrics.items.properties.metric.type, 'string');
    assert.equal(shape.properties.metrics.items.properties.values.type, 'array');
    const sampleShape = shape.properties.metrics.items.properties.values.items;
    assert.deepEqual(sampleShape.required, ['pod', 'role', 'value']);
    assert.equal(sampleShape.properties.value.type, 'number');
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const mapped = map.operations.find(row => row.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
    assert.equal(mapped.test, 'test/instant-metrics.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  });
}
