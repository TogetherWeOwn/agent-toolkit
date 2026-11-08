import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as admin from '../../../dist/plugins/planetscale-broker/src/tools/get-admin.js';
import * as adminSkus from '../../../dist/plugins/planetscale-broker/src/tools/list-admin-size-skus.js';
import * as routerSkus from '../../../dist/plugins/planetscale-broker/src/tools/list-router-size-skus.js';
import * as clusterSkus from '../../../dist/plugins/planetscale-broker/src/tools/list-cluster-size-skus.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const adminScope = { ...target, adminId: 'admin123' };
const branchScope = { ...target, skuNames: ['SKU-1', 'SKU-2'] };
const clusterScope = { organization: 'example-org', engine: 'mysql', skuNames: ['SKU-1', 'SKU-2'] };
const path = '/v1/organizations/example-org/databases/app/branches/staging';
const adminRow = { id: 'admin123', state: 'ready', sku: { name: canary }, admin_size: canary, created_at: canary, updated_at: canary };
const skuRow = { name: 'SKU-1', enabled: true, display_name: canary, cpu: canary, ram: 1024, storage: 1024, rate: 100, default_vtgate: canary, provider: canary, architecture: canary, actor: canary };
const adminOutput = { id: 'admin123', state: 'ready', actionAuthority: 'not-established' };
const skuOutput = { name: 'SKU-1', actionAuthority: 'not-established' };
const fixtures = [
  [admin, adminScope, adminRow, adminOutput, path + '/admin'],
  [adminSkus, branchScope, [skuRow], [skuOutput], path + '/admin-size-skus'],
  [routerSkus, branchScope, [skuRow], [{ ...skuOutput, enabled: true }], path + '/router-size-skus'],
  [clusterSkus, clusterScope, [skuRow], [{ ...skuOutput, enabled: true }], '/v1/organizations/example-org/cluster-size-skus?engine=mysql&rates=false'],
];

for (const [adapter, scope, response, output, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET with frozen non-authoritative projection`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    assert.equal(adapter.tool, 'planetscale.' + adapter.operationId);
    const projected = prepared.project(wire(response));
    assert.deepEqual(projected, output);
    assert.ok(!JSON.stringify(projected).includes(canary));
    for (const value of [prepared, prepared.request, projected, ...(Array.isArray(projected) ? projected : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: closed arguments reject transport, pricing, filters and authority`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'engine', 'rates', 'region', 'database', 'external', 'architecture', 'page', 'perPage', 'all']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({}, 'url', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed broker scope bounds parents without coercion`, () => {
    for (const field of ['organization', ...(scope.branch ? ['database', 'branch'] : [])]) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: immutable snapshots prevent retargeting and widened output`, () => {
    const mutable = structuredClone(scope);
    const prepared = adapter.prepare(mutable, {});
    mutable.organization = 'foreign';
    if (mutable.skuNames) { mutable.skuNames[0] = 'foreign'; mutable.skuNames.push('another'); }
    else mutable.adminId = 'foreign';
    if (mutable.engine) mutable.engine = 'neki';
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(response)), output);
    assert.throws(() => prepared.project(wire(adapter === admin ? { ...adminRow, id: 'foreign' } : [{ ...skuRow, name: 'foreign' }])));
  });

  test(`${adapter.operationId}: malformed wire data refuses without reflection`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: unknown identities and selected-field types refuse whole response`, () => {
    const prepared = adapter.prepare(scope, {});
    const fields = adapter === admin ? ['id', 'state'] : ['name', ...(adapter === adminSkus ? [] : ['enabled'])];
    for (const field of fields) for (const value of [undefined, null, 1, {}, [], canary, 'foreign']) {
      const invalid = { ...(adapter === admin ? adminRow : skuRow), [field]: value };
      assert.throws(() => prepared.project(wire(adapter === admin ? invalid : [skuRow, invalid])), error => !String(error).includes(canary));
    }
  });
}

for (const adapter of [adminSkus, routerSkus, clusterSkus]) {
  const scope = adapter === clusterSkus ? clusterScope : branchScope;
  test(`${adapter.operationId}: unique bounded plain arrays, no invented pages or retained seen state`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const rows of [null, {}, [null], [skuRow, skuRow], Array(33).fill(skuRow), { data: [skuRow] }]) assert.throws(() => prepared.project(wire(rows)));
    assert.deepEqual(prepared.project(wire([])), []);
    const expected = adapter === adminSkus ? skuOutput : { ...skuOutput, enabled: true };
    const rows = [skuRow, { ...skuRow, name: 'SKU-2' }];
    for (let i = 0; i < 2; i++) assert.deepEqual(prepared.project(wire(rows)), [expected, { ...expected, name: 'SKU-2' }]);
    if (adapter !== adminSkus) assert.equal(prepared.project(wire([{ ...skuRow, enabled: false }]))[0].enabled, false);
  });
}

test('compute catalogs require bounded unique broker names and admin identity', () => {
  for (const adapter of [adminSkus, routerSkus, clusterSkus]) {
    const scope = adapter === clusterSkus ? clusterScope : branchScope;
    for (const skuNames of [[], ['SKU-1', 'SKU-1'], Array(33).fill('SKU-1'), ['x/y'], [null], [canary], [''], ['a'.repeat(81)]]) assert.throws(() => adapter.prepare({ ...scope, skuNames }, {}));
    const hostile = Object.defineProperty(['SKU-1'], '0', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare({ ...scope, skuNames: hostile }, {}), error => !String(error).includes(canary));
    assert.doesNotThrow(() => adapter.prepare({ ...scope, skuNames: Array.from({ length: 32 }, (_, i) => 'SKU-' + i) }, {}));
  }
  for (const adminId of ['../foreign', '', canary, null, 'a'.repeat(81)]) assert.throws(() => admin.prepare({ ...adminScope, adminId }, {}));
});

test('cluster catalog uses exact documented engine and no requested rates', () => {
  for (const engine of ['mysql', 'postgresql', 'neki']) assert.equal(clusterSkus.prepare({ ...clusterScope, engine }, {}).request.path, `/v1/organizations/example-org/cluster-size-skus?engine=${engine}&rates=false`);
  for (const engine of ['postgres', 'MYSQL', null, true, canary]) assert.throws(() => clusterSkus.prepare({ ...clusterScope, engine }, {}));
});

test('admin states and catalog enabled flags never establish resize, restart or spend authority', () => {
  for (const state of ['pending', 'applying', 'ready']) assert.deepEqual(admin.prepare(adminScope, {}).project(wire({ ...adminRow, state })), { ...adminOutput, state });
  for (const field of ['sku', 'admin_size', 'created_at', 'updated_at']) {
    const row = { ...adminRow, [field]: { secret: canary } };
    assert.deepEqual(admin.prepare(adminScope, {}).project(wire(row)), adminOutput);
    delete row[field];
    assert.deepEqual(admin.prepare(adminScope, {}).project(wire(row)), adminOutput);
  }
});

test('compute catalog projections omit prices, capacity, recommendations and free text wholesale', () => {
  for (const adapter of [adminSkus, routerSkus, clusterSkus]) {
    const scope = adapter === clusterSkus ? clusterScope : branchScope;
    const expected = adapter === adminSkus ? skuOutput : { ...skuOutput, enabled: true };
    for (const field of ['display_name', 'cpu', 'ram', 'storage', 'rate', 'default_vtgate', 'default_vtgate_rate', 'default_neki_router', 'default_neki_router_rate', 'replica_rate', 'provider', 'architecture', 'sort_order', 'metal', 'external', 'production', 'development', 'actor']) {
      const row = { ...skuRow, [field]: { secret: canary } };
      assert.deepEqual(adapter.prepare(scope, {}).project(wire([row])), [expected]);
      delete row[field];
      assert.deepEqual(adapter.prepare(scope, {}).project(wire([row])), [expected]);
    }
  }
});

test('compute catalog routes, selected fields and query enums match pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, , , endpoint] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), endpoint.split('?')[0]);
    let response = operation.value.responses['200'].schema;
    if (adapter !== admin) { assert.equal(response.type, 'array'); response = response.items; }
    response = schema.definitions[response.$ref.split('/').at(-1)];
    for (const field of adapter === admin ? ['id', 'state'] : ['name', ...(adapter === adminSkus ? [] : ['enabled'])]) assert.ok(response.required.includes(field));
    if (adapter === admin) assert.deepEqual(response.properties.state.enum, ['pending', 'applying', 'ready']);
    if (adapter === clusterSkus) {
      assert.deepEqual(operation.value.parameters.find(row => row.name === 'engine').enum, ['mysql', 'postgresql', 'neki']);
      assert.equal(operation.value.parameters.find(row => row.name === 'rates').type, 'boolean');
    } else assert.ok(operation.value.parameters.every(row => row.in === 'path'));
    const mapped = map.operations.find(row => row.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only');
    assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
    assert.equal(mapped.test, 'test/compute-catalog.test.mjs');
    assert.equal(mapped.enablement, 'disabled');
  }
});
