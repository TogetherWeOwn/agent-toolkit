import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as cidr from '../../../dist/plugins/planetscale-broker/src/tools/get-database-postgres-cidr.js';
import * as cidrs from '../../../dist/plugins/planetscale-broker/src/tools/list-database-postgres-cidrs.js';
import * as databaseThrottler from '../../../dist/plugins/planetscale-broker/src/tools/get-database-throttler.js';
import * as deployThrottler from '../../../dist/plugins/planetscale-broker/src/tools/get-deploy-request-throttler.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const db = { organization: 'example-org', database: 'example-db' };
const prefix = '/v1/organizations/example-org/databases/example-db';
const cidrRow = { id: 'cidr123', schema: canary, role: canary, cidrs: [canary], description: canary, created_at: canary, updated_at: canary, deleted_at: canary, actor: { id: canary } };
const cidrExpected = { id: 'cidr123', enforcementAuthority: 'not-established' };
const throttlerRow = { configurable: { id: 'resource123', name: canary, created_at: canary, updated_at: canary, deleted_at: canary }, keyspaces: ['main', 'aux'], configurations: [{ keyspace_name: 'main', ratio: 0 }], actor: canary };
const throttlerExpected = { configurableId: 'resource123', keyspaces: [{ name: 'main', configured: true }, { name: 'aux', configured: false }], configurationAuthority: 'not-established' };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const throttlerFixtures = [
  [databaseThrottler, { ...db, configurableId: 'resource123', keyspaceNames: ['main', 'aux'] }, '/throttler'],
  [deployThrottler, { ...db, number: 42, configurableId: 'resource123', keyspaceNames: ['main', 'aux'] }, '/deploy-requests/42/throttler'],
];
const fixtures = [
  [cidr, { ...db, cidrId: 'cidr123' }, '/cidrs/cidr123', cidrRow, cidrExpected],
  [cidrs, { ...db, cidrIds: ['cidr123'] }, '/cidrs?page=1&per_page=2', page([cidrRow]), { items: [cidrExpected], nextPage: null, complete: true }],
  ...throttlerFixtures.map(([adapter, scope, path]) => [adapter, scope, path, throttlerRow, throttlerExpected]),
];

for (const [adapter, scope, path, body, expected] of fixtures) {
  const args = adapter === cidrs ? { page: 1, perPage: 2 } : {};
  test(`${adapter.operationId}: fixed GET, minimal projection and frozen result`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: prefix + path });
    const result = prepared.project(wire(body));
    assert.deepEqual(result, expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(prepared));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(result));
    if (result.keyspaces) {
      assert.ok(Object.isFrozen(result.keyspaces));
      for (const row of result.keyspaces) assert.ok(Object.isFrozen(row));
    }
    if (result.items) {
      assert.ok(Object.isFrozen(result.items));
      assert.ok(Object.isFrozen(result.items[0]));
    }
  });

  test(`${adapter.operationId}: closed scope and arguments reject authority or target overrides`, () => {
    for (const field of ['url', 'sql', 'secret', 'approval', 'agentId', 'production', 'all', 'database', 'cidrId', 'configurableId', 'keyspaceNames']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'x%2fy' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(invalid, args));
    const hostile = Object.defineProperty({ ...scope }, 'database', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    if (adapter !== cidrs) assert.throws(() => adapter.prepare(scope, { page: 1 }));
  });

  test(`${adapter.operationId}: malformed wire and shape fail without reflection`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({}), wire([]), wire(canary), new TextEncoder().encode('{')]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: target and nested bindings snapshot before mutation`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign';
    copied.database = 'foreign';
    copied.cidrId = 'foreign';
    copied.configurableId = 'foreign';
    copied.number = 99;
    copied.cidrIds?.push('foreign');
    copied.keyspaceNames?.push('foreign');
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, prefix + path);
    assert.deepEqual(prepared.project(wire(body)), expected);
    const foreign = adapter === cidr ? { ...body, id: 'foreign' } : adapter === cidrs ? page([{ ...cidrRow, id: 'foreign' }]) : { ...body, keyspaces: ['foreign'] };
    assert.throws(() => prepared.project(wire(foreign)));
  });
}

test('CIDR entry identity mismatch refuses single response and entire mixed page', () => {
  for (const id of [undefined, null, {}, '../escape', 'foreign', canary]) {
    assert.throws(() => cidr.prepare({ ...db, cidrId: 'cidr123' }, {}).project(wire({ ...cidrRow, id })), error => !String(error).includes(canary));
    assert.throws(() => cidrs.prepare({ ...db, cidrIds: ['cidr123'] }, { page: 1, perPage: 2 }).project(wire(page([cidrRow, { ...cidrRow, id }]))), error => !String(error).includes(canary));
  }
});

test('CIDR binding lists are bounded, unique and never expose network or role data', () => {
  for (const cidrIds of [[], ['cidr123', 'cidr123'], Array(33).fill('cidr123'), ['../escape'], [canary]]) assert.throws(() => cidrs.prepare({ ...db, cidrIds }, { page: 1, perPage: 2 }));
  for (const cidrId of [null, '../escape', canary]) assert.throws(() => cidr.prepare({ ...db, cidrId }, {}));
  assert.deepEqual(cidr.prepare({ ...db, cidrId: 'cidr123' }, {}).project(wire({ ...cidrRow, enforcementAuthority: 'approved' })), cidrExpected);
});

test('CIDR pagination is explicit, bounded and cannot follow provider URLs', () => {
  const prepared = cidrs.prepare({ ...db, cidrIds: ['cidr123'] }, { page: 1, perPage: 2 });
  assert.deepEqual(prepared.project(wire(page([]))), { items: [], nextPage: null, complete: true });
  assert.equal(prepared.project(wire({ ...page([cidrRow]), next_page: 2 })).complete, false);
  for (const value of [page([null]), page([cidrRow, cidrRow, cidrRow]), { ...page([]), current_page: 2 }, { ...page([]), per_page: 3 }, { ...page([]), next_page: 3 }]) assert.throws(() => prepared.project(wire(value)));
  for (const args of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => cidrs.prepare({ ...db, cidrIds: ['cidr123'] }, args));
  assert.throws(() => cidrs.prepare({ ...db, cidrIds: ['cidr123'] }, { page: 100, perPage: 2 }).project(wire({ ...page([]), current_page: 100, next_page: 101 })));
});

for (const [adapter, scope] of throttlerFixtures) {
  test(`${adapter.operationId}: configurable resource ID mismatch refuses instead of rebinding`, () => {
    for (const id of [undefined, null, {}, 'foreign', canary]) assert.throws(() => adapter.prepare(scope, {}).project(wire({ ...throttlerRow, configurable: { id } })), error => !String(error).includes(canary));
    for (const configurable of [null, [], canary]) assert.throws(() => adapter.prepare(scope, {}).project(wire({ ...throttlerRow, configurable })));
    for (const configurableId of [null, '../escape', canary]) assert.throws(() => adapter.prepare({ ...scope, configurableId }, {}));
  });

  test(`${adapter.operationId}: keyspace lists and configurations refuse unknown, duplicate or oversized data`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const keyspaces of [undefined, null, {}, ['main', 'foreign'], ['main', 'main'], Array(33).fill('main'), [canary]]) assert.throws(() => prepared.project(wire({ ...throttlerRow, keyspaces })), error => !String(error).includes(canary));
    for (const configurations of [undefined, null, {}, [null], [{ keyspace_name: 'foreign', ratio: 0 }], [{ keyspace_name: 'aux', ratio: 0 }, { keyspace_name: 'aux', ratio: 1 }], Array(33).fill({ keyspace_name: 'main', ratio: 0 })]) assert.throws(() => prepared.project(wire({ ...throttlerRow, configurations })));
    assert.throws(() => prepared.project(wire({ ...throttlerRow, keyspaces: ['aux'] })));
    assert.deepEqual(prepared.project(wire({ ...throttlerRow, keyspaces: [], configurations: [] })).keyspaces, []);
  });

  test(`${adapter.operationId}: scoped names and ratio bounds fail closed without returning values`, () => {
    for (const keyspaceNames of [[], ['main', 'main'], Array(33).fill('main'), ['../escape'], [canary]]) assert.throws(() => adapter.prepare({ ...scope, keyspaceNames }, {}));
    const prepared = adapter.prepare(scope, {});
    for (const ratio of [undefined, null, '0', true, -1, 96, Infinity, canary]) assert.throws(() => prepared.project(wire({ ...throttlerRow, configurations: [{ keyspace_name: 'main', ratio }] })), error => !String(error).includes(canary));
    for (const ratio of [0, 0.5, 95]) assert.deepEqual(prepared.project(wire({ ...throttlerRow, configurations: [{ keyspace_name: 'main', ratio }], configurationAuthority: 'approved' })), throttlerExpected);
  });
}

test('deploy throttler number is independently bounded and cannot be supplied as an argument', () => {
  const scope = throttlerFixtures[1][1];
  for (const number of [null, 0, -1, 1.5, 2147483648, '42', canary]) assert.throws(() => deployThrottler.prepare({ ...scope, number }, {}));
  assert.throws(() => deployThrottler.prepare(scope, { number: 42 }));
});

test('network and throttler paths, pagination, response references and provider accesses match the pin', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, path] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { ...scope, id: scope.cidrId };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), prefix + path.split('?')[0]);
    assert.deepEqual(operation.value.parameters.filter(item => item.in === 'query').map(item => item.name).sort(), adapter === cidrs ? ['page', 'per_page'] : []);
    assert.equal(operation.value.responses['200'].schema.$ref, '#/definitions/' + (adapter === cidr ? 'PostgresClusterCidr' : adapter === cidrs ? 'PaginatedPostgresClusterCidr' : 'ThrottlerConfigurations'));
    const row = map.operations.find(item => item.operationId === adapter.operationId);
    assert.deepEqual(row.documentedAuthorization.serviceTokenAnyOf, adapter === cidr || adapter === cidrs ? ['read_database', 'read_databases'] : adapter === databaseThrottler ? ['read_deploy_request', 'create_deploy_request'] : ['read_deploy_request']);
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.credentialEntitlement, 'unknown-awaiting-operator-metadata');
  }
  assert.equal(schema.definitions.ThrottlerConfigurations.properties.configurations.items.properties.ratio.type, 'number');
  assert.ok(schema.definitions.ThrottlerConfigurations.properties.configurations.items.properties.ratio.description.includes('0 and 95'));
});
