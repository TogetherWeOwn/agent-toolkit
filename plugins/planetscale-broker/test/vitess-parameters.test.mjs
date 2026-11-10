import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as adapter from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-vitess-parameters.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const scope = { ...target, vtgate: ['query_timeout'], keyspaces: [{ name: 'app', vttablet: ['query_timeout'], mysqld: ['max_connections'] }] };
const path = '/v1/organizations/example-org/databases/app/branches/staging/vitess-parameters';
const row = { type: 'VitessParameterDefinition', name: 'query_timeout', component: 'vtgate', parameter_type: 'duration', override: true, title: canary, description: canary, category: canary, default_value: canary, value: canary, options: [canary] };
const tablet = { ...row, component: 'vttablet', override: false };
const mysql = { ...row, name: 'max_connections', component: 'mysqld', parameter_type: 'integer' };
const body = { type: 'VitessParameters', vtgate: [row], keyspaces: { app: { vttablet: [tablet], mysqld: [mysql] } } };
const summary = { name: row.name, component: row.component, parameterType: row.parameter_type, override: true };
const expected = { vtgate: [summary], keyspaces: [{ name: 'app', vttablet: [{ ...summary, component: 'vttablet', override: false }], mysqld: [{ ...summary, name: mysql.name, component: 'mysqld', parameterType: 'integer' }] }], configurationAuthority: 'not-established' };
const prepared = () => adapter.prepare(scope, {});

function frozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
}

test('Vitess parameters: fixed GET with immutable value-free nested projection', () => {
  const read = prepared();
  assert.deepEqual(read.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
  const result = read.project(wire(body));
  assert.deepEqual(result, expected);
  assert.ok(!JSON.stringify(result).includes(canary));
  frozen(read); frozen(result);
});

test('Vitess parameters: malformed and oversized wire data refuses without reflection', () => {
  for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared().project(value), error => !String(error).includes(canary));
});

test('Vitess parameters: closed arguments reject values, mutations and authority overrides', () => {
  for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'keyspace', 'name', 'value', 'execute', 'page']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
  for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
  const hostile = Object.defineProperty({}, 'value', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
});

test('Vitess parameters: closed scope and bounded path segments', () => {
  for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
  for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
  const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
});

test('Vitess parameters: caller mutations cannot retarget nested bindings', () => {
  const copy = structuredClone(scope);
  const read = adapter.prepare(copy, {});
  copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign'; copy.vtgate[0] = 'foreign';
  copy.keyspaces[0].name = 'foreign'; copy.keyspaces[0].vttablet[0] = 'foreign'; copy.keyspaces[0].mysqld.push('foreign'); copy.keyspaces.push({ name: 'foreign', vttablet: [], mysqld: [] });
  assert.equal(read.request.path, path);
  assert.deepEqual(read.project(wire(body)), expected);
  assert.throws(() => read.project(wire({ ...body, vtgate: [{ ...row, name: 'foreign' }] })));
  assert.throws(() => read.project(wire({ ...body, keyspaces: { foreign: body.keyspaces.app } })));
});

test('Vitess parameters: required envelope type and collection shapes', () => {
  for (const change of [{ type: undefined }, { type: 'List' }, { type: canary }, { vtgate: null }, { vtgate: {} }, { keyspaces: null }, { keyspaces: [] }, { keyspaces: canary }]) assert.throws(() => prepared().project(wire({ ...body, ...change })), error => !String(error).includes(canary));
  for (const value of [null, [], canary, {}, { vttablet: [] }, { mysqld: [] }, { ...body.keyspaces.app, unknown: [] }]) assert.throws(() => prepared().project(wire({ ...body, keyspaces: { app: value } })));
});

test('Vitess parameters: malformed row, name and definition type refuse whole result', () => {
  for (const value of [null, [], canary, {}, { ...row, name: 'foreign' }, { ...row, name: null }, { ...row, name: canary }, { ...row, type: undefined }, { ...row, type: 'Parameter' }]) assert.throws(() => prepared().project(wire({ ...body, vtgate: [value] })), error => !String(error).includes(canary));
  assert.deepEqual(prepared().project(wire(body)), expected);
});

test('Vitess parameters: component must match its container even when name is allowed', () => {
  for (const component of [undefined, null, 'admin', 'vttablet', 'mysqld', canary]) assert.throws(() => prepared().project(wire({ ...body, vtgate: [{ ...row, component }] })), error => !String(error).includes(canary));
  for (const component of ['vtgate', 'mysqld']) assert.throws(() => prepared().project(wire({ ...body, keyspaces: { app: { ...body.keyspaces.app, vttablet: [{ ...tablet, component }] } } })));
  assert.throws(() => prepared().project(wire({ ...body, keyspaces: { app: { ...body.keyspaces.app, mysqld: [{ ...mysql, component: 'vttablet' }] } } })));
});

test('Vitess parameters: only documented parameter types and strict override flags', () => {
  for (const parameter_type of ['boolean', 'bytes', 'duration', 'float', 'integer', 'select', 'string']) assert.deepEqual(prepared().project(wire({ ...body, vtgate: [{ ...row, parameter_type }] })).vtgate, [{ ...summary, parameterType: parameter_type }]);
  for (const parameter_type of [undefined, null, 'time', 'array', canary, 1]) assert.throws(() => prepared().project(wire({ ...body, vtgate: [{ ...row, parameter_type }] })), error => !String(error).includes(canary));
  for (const override of [undefined, null, 0, 1, 'false', canary, {}, []]) assert.throws(() => prepared().project(wire({ ...body, vtgate: [{ ...row, override }] })), error => !String(error).includes(canary));
  for (const override of [true, false]) assert.equal(prepared().project(wire({ ...body, vtgate: [{ ...row, override }] })).vtgate[0].override, override);
});

test('Vitess parameters: unknown names or keyspaces refuse whole response, not filtered success', () => {
  for (const keyspaces of [{ ...body.keyspaces, foreign: { vttablet: [], mysqld: [] } }, { app: { ...body.keyspaces.app, vttablet: [tablet, { ...tablet, name: 'foreign' }] } }, { app: { ...body.keyspaces.app, mysqld: [mysql, { ...mysql, name: 'query_timeout' }] } }]) assert.throws(() => prepared().project(wire({ ...body, keyspaces })));
  assert.throws(() => prepared().project(wire({ ...body, vtgate: [row, { ...row, name: 'foreign' }] })));
  assert.throws(() => prepared().project(wire(JSON.parse('{"type":"VitessParameters","vtgate":[],"keyspaces":{"__proto__":{"vttablet":[],"mysqld":[]}}}'))));
});

test('Vitess parameters: duplicate and oversized component arrays refuse', () => {
  for (const vtgate of [[row, row], Array(33).fill(row)]) assert.throws(() => prepared().project(wire({ ...body, vtgate })));
  for (const component of ['vttablet', 'mysqld']) {
    const item = component === 'vttablet' ? tablet : mysql;
    for (const rows of [[item, item], Array(33).fill(item), null, {}]) assert.throws(() => prepared().project(wire({ ...body, keyspaces: { app: { ...body.keyspaces.app, [component]: rows } } })));
  }
  const keyspaces = Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['keyspace-' + i, { vttablet: [], mysqld: [] }]));
  assert.throws(() => prepared().project(wire({ ...body, keyspaces })));
});

test('Vitess parameters: unique bounded name and keyspace bindings, closed nested scopes', () => {
  for (const vtgate of [null, {}, ['query_timeout', 'query_timeout'], Array(33).fill('query_timeout'), ['x/y'], ['../foreign'], [canary], [null], [''], ['a'.repeat(129)]]) assert.throws(() => adapter.prepare({ ...scope, vtgate }, {}));
  for (const keyspaces of [null, {}, [scope.keyspaces[0], scope.keyspaces[0]], Array(33).fill(scope.keyspaces[0]), [{ ...scope.keyspaces[0], name: 'x/y' }], [{ ...scope.keyspaces[0], value: canary }], [{ name: 'app', vttablet: [] }], [{ ...scope.keyspaces[0], vttablet: ['query_timeout', 'query_timeout'] }], [{ ...scope.keyspaces[0], mysqld: [canary] }]]) assert.throws(() => adapter.prepare({ ...scope, keyspaces }, {}));
  const hostile = Object.defineProperty(['query_timeout'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => adapter.prepare({ ...scope, vtgate: hostile }, {}), error => !String(error).includes(canary));
});

test('Vitess parameters: empty/missing bound entries do not establish completeness or authority', () => {
  const empty = { type: 'VitessParameters', vtgate: [], keyspaces: {} };
  assert.deepEqual(prepared().project(wire(empty)), { vtgate: [], keyspaces: [], configurationAuthority: 'not-established' });
  assert.deepEqual(adapter.prepare({ ...target, vtgate: [], keyspaces: [] }, {}).project(wire(empty)), { vtgate: [], keyspaces: [], configurationAuthority: 'not-established' });
  assert.deepEqual(prepared().project(wire({ ...empty, keyspaces: { app: { vttablet: [], mysqld: [] } } })), { vtgate: [], keyspaces: [{ name: 'app', vttablet: [], mysqld: [] }], configurationAuthority: 'not-established' });
});

test('Vitess parameters: names remain separate by component and keyspace', () => {
  const extended = { ...scope, keyspaces: [...scope.keyspaces, { name: 'other', vttablet: ['query_timeout'], mysqld: [] }] };
  const result = adapter.prepare(extended, {}).project(wire({ ...body, keyspaces: { ...body.keyspaces, other: { vttablet: [tablet], mysqld: [] } } }));
  assert.deepEqual(result.keyspaces[1], { name: 'other', vttablet: expected.keyspaces[0].vttablet, mysqld: [] });
  frozen(result);
});

test('Vitess parameters: no values, defaults, options or free text required or reflected', () => {
  const minimal = { type: row.type, name: row.name, component: row.component, parameter_type: row.parameter_type, override: row.override };
  assert.deepEqual(prepared().project(wire({ ...body, vtgate: [minimal], secret: canary })), expected);
  for (const value of [undefined, null, canary, { secret: canary }, [canary]]) assert.deepEqual(prepared().project(wire({ ...body, vtgate: [{ ...row, value, default_value: value, options: value, description: value }] })), expected);
});

test('Vitess parameters: path, selected fields and operation map agree with pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
  assert.equal(entry.method, 'get');
  assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => target[key]), path);
  assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query'), []);
  const response = entry.value.responses['200'].schema;
  assert.deepEqual(response.required, ['type', 'vtgate', 'keyspaces']);
  const definition = response.properties.vtgate.items;
  for (const field of ['type', 'name', 'component', 'parameter_type', 'override']) assert.ok(definition.required.includes(field));
  assert.deepEqual(definition.properties.component.enum, ['vtgate', 'vttablet', 'mysqld']);
  assert.equal(definition.properties.override.type, 'boolean');
  assert.match(definition.properties.parameter_type.description, /duration/);
  assert.ok(response.properties.keyspaces.additionalProperties.properties.vttablet);
  assert.ok(response.properties.keyspaces.additionalProperties.properties.mysqld);
  assert.match(entry.value.description, /same format as `vtgate`|VTTablet and MySQL parameters/);
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const mapped = map.operations.find(value => value.operationId === adapter.operationId);
  assert.equal(mapped.implementation, 'offline-adapter-only');
  assert.equal(mapped.test, 'test/vitess-parameters.test.mjs');
  assert.equal(mapped.enablement, 'disabled');
});
