import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as extensions from '../../../dist/plugins/planetscale-broker/src/tools/list-extensions.js';
import * as profileExtensions from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profile-extensions.js';
import * as parameters from '../../../dist/plugins/planetscale-broker/src/tools/list-parameters.js';
import * as adminParameters from '../../../dist/plugins/planetscale-broker/src/tools/list-admin-parameters.js';
import * as routerParameters from '../../../dist/plugins/planetscale-broker/src/tools/list-router-parameters.js';
import * as profileParameters from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profile-parameters.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const branch = { organization: 'example-org', database: 'example-db', branch: 'staging' };
const prefix = '/v1/organizations/example-org/databases/example-db/branches/staging';
const profile = { id: 'profile123', name: 'standard' };
const router = { id: 'router123', name: 'primary' };
const extensionBinding = { name: 'pg_stat_statements' };
const parameterBinding = { name: 'shared_buffers', namespace: 'pgconf' };
const extensionRow = { ...extensionBinding, can_enable: true, enabled: false, internal: false, description: canary, parameters: [{ value: canary }], requires_update: canary, url: canary };
const extensionExpected = { ...extensionBinding, canEnable: true, enabled: false, internal: false };
const parameterRow = { ...parameterBinding, id: canary, parameter_type: 'bytes', internal: false, disabled: true, required: false, restart: true, advanced: canary, display_name: canary, category: canary, description: canary, default_value: canary, value: canary, options: [canary], units: [canary], min: canary, max: canary, requires_update: canary, created_at: canary, updated_at: canary, url: canary, actor: { id: canary } };
const parameterExpected = { ...parameterBinding, parameterType: 'bytes', internal: false, disabled: true, required: false, restart: true };
const fixtures = [
  [extensions, { ...branch, extensions: [extensionBinding] }, 'extensions', extensionRow, extensionExpected, '/extensions', ['can_enable', 'internal']],
  [profileExtensions, { ...branch, profile, extensions: [extensionBinding] }, 'extensions', extensionRow, extensionExpected, '/configuration-profiles/standard/extensions', ['can_enable', 'internal']],
  [parameters, { ...branch, parameters: [parameterBinding] }, 'parameters', parameterRow, parameterExpected, '/parameters', ['parameter_type', 'internal', 'disabled', 'required', 'restart']],
  [adminParameters, { ...branch, parameters: [parameterBinding] }, 'parameters', parameterRow, parameterExpected, '/admin/parameters', ['parameter_type', 'internal', 'disabled', 'required', 'restart']],
  [routerParameters, { ...branch, router, parameters: [parameterBinding] }, 'parameters', parameterRow, parameterExpected, '/routers/primary/parameters', ['parameter_type', 'internal', 'disabled', 'required', 'restart']],
  [profileParameters, { ...branch, profile, parameters: [parameterBinding] }, 'parameters', parameterRow, parameterExpected, '/configuration-profiles/standard/parameters', ['parameter_type', 'internal', 'disabled', 'required', 'restart']],
];

for (const [adapter, scope, key, row, expected, path, selected] of fixtures) {
  test(`${adapter.operationId}: fixed GET and bounded definition metadata without configuration values`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: prefix + path });
    const result = prepared.project(wire([row]));
    assert.deepEqual(result, [expected]);
    assert.deepEqual(prepared.project(wire([])), []);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, result[0]]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: unknown name or rebound namespace refuses the whole array`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const name of ['foreign', undefined, null, {}, canary]) assert.throws(() => prepared.project(wire([row, { ...row, name }])), error => !String(error).includes(canary));
    if (key === 'parameters') for (const namespace of ['router', 'patroni', 'foreign', undefined, null, {}, canary]) assert.throws(() => prepared.project(wire([row, { ...row, namespace }])), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: selected types and array/wire caps fail closed`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const field of selected) for (const value of [undefined, null, {}, [], 1, canary]) assert.throws(() => prepared.project(wire([{ ...row, [field]: value }])), error => !String(error).includes(canary));
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({ data: [row] }), wire(canary), wire([null]), wire(Array(33).fill(row)), new TextEncoder().encode('{')]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments, parent bindings and definition scopes`, () => {
    for (const field of ['sql', 'url', 'secret', 'approval', 'agentId', 'production', 'all', 'internal', 'page', 'perPage', 'q']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const invalid of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'x%2fy' }, { ...scope, branch: '../foreign' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(invalid, {}));
    const binding = scope[key][0];
    for (const invalid of [[], [binding, binding], Array(33).fill(binding), [null], [{ ...binding, name: canary }], [{ ...binding, name: '../escape' }], [{ ...binding, approval: true }]]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, {}));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
    for (const parent of ['profile', 'router'].filter(field => scope[field])) for (const invalid of [null, { ...scope[parent], id: canary }, { ...scope[parent], name: '../escape' }, { ...scope[parent], url: canary }]) assert.throws(() => adapter.prepare({ ...scope, [parent]: invalid }, {}));
  });

  test(`${adapter.operationId}: prepared scope is a deep immutable snapshot`, () => {
    const copied = structuredClone(scope);
    const prepared = adapter.prepare(copied, {});
    copied.branch = 'foreign';
    copied[key][0].name = 'foreign';
    if (key === 'parameters') copied[key][0].namespace = 'router';
    copied[key].push({ ...scope[key][0], name: 'foreign' });
    if (copied.profile) { copied.profile.id = 'foreign'; copied.profile.name = 'foreign'; }
    if (copied.router) { copied.router.id = 'foreign'; copied.router.name = 'foreign'; }
    assert.equal(prepared.request.path, prefix + path);
    assert.deepEqual(prepared.project(wire([row])), [expected]);
    assert.throws(() => prepared.project(wire([{ ...row, name: 'foreign' }])));
  });
}

test('extension enabled is nullable/optional and flags never confer native authority', () => {
  for (const adapter of [extensions, profileExtensions]) {
    const scope = { ...branch, ...(adapter === profileExtensions ? { profile } : {}), extensions: [extensionBinding] };
    const prepared = adapter.prepare(scope, {});
    for (const enabled of [undefined, null, true, false]) {
      const result = prepared.project(wire([{ ...extensionRow, enabled, approval: 'accepted' }]));
      assert.deepEqual(result, [{ ...extensionExpected, enabled: enabled ?? null }]);
    }
    for (const enabled of [1, 'true', canary, {}]) assert.throws(() => prepared.project(wire([{ ...extensionRow, enabled }])));
  }
});

test('parameter namespaces follow the engine-specific schema, not caller-selected arbitrary text', () => {
  for (const [adapter, scope, key] of fixtures.filter(([, , key]) => key === 'parameters')) {
    const namespaces = adapter === parameters ? ['patroni', 'pgbouncer', 'pgconf'] : ['admin', 'pgconf', 'replicator', 'router', 'sidecar'];
    for (const namespace of namespaces) {
      const prepared = adapter.prepare({ ...scope, [key]: [{ ...parameterBinding, namespace }] }, {});
      assert.deepEqual(prepared.project(wire([{ ...parameterRow, namespace }])), [{ ...parameterExpected, namespace }]);
    }
    for (const namespace of adapter === parameters ? ['admin', 'router'] : ['patroni', 'pgbouncer']) assert.throws(() => adapter.prepare({ ...scope, [key]: [{ ...parameterBinding, namespace }] }, {}));
    for (const parameter_type of ['array', 'boolean', 'bytes', 'float', 'integer', 'select', 'string', 'time']) assert.equal(adapter.prepare(scope, {}).project(wire([{ ...parameterRow, parameter_type }]))[0].parameterType, parameter_type);
  }
});

test('parameter binding identity is the namespace/name pair, not a nullable parameter ID', () => {
  const allowed = [{ ...parameterBinding }, { ...parameterBinding, namespace: 'patroni' }];
  const prepared = parameters.prepare({ ...branch, parameters: allowed }, {});
  assert.deepEqual(prepared.project(wire([{ ...parameterRow, id: null }, { ...parameterRow, id: null, namespace: 'patroni' }])), [parameterExpected, { ...parameterExpected, namespace: 'patroni' }]);
});

test('definition requests match pinned official paths, array shapes and enums', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const entries = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value })));
  for (const [adapter, scope, key, , , path] of fixtures) {
    const operation = entries.find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const replacements = { ...branch, configuration_profile: scope.profile?.name, router: scope.router?.name };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, field) => replacements[field]), prefix + path);
    assert.deepEqual(operation.value.parameters.filter(item => item.in === 'query').map(item => item.name), key === 'extensions' ? [] : ['internal']);
    assert.equal(operation.value.responses['200'].schema.type, 'array');
    const definition = schema.definitions[operation.value.responses['200'].schema.items.$ref.split('/').pop()];
    assert.equal(definition.properties.name.type, 'string');
    if (key === 'extensions') { assert.equal(definition.properties.enabled['x-nullable'], true); assert.ok(!definition.required.includes('enabled')); }
    else {
      assert.deepEqual(definition.properties.namespace.enum, adapter === parameters ? ['patroni', 'pgbouncer', 'pgconf'] : ['admin', 'pgconf', 'replicator', 'router', 'sidecar']);
      assert.deepEqual(definition.properties.parameter_type.enum, ['array', 'boolean', 'bytes', 'float', 'integer', 'select', 'string', 'time']);
    }
    assert.ok(operation.value.description.includes('`read_branch`'));
  }
});
