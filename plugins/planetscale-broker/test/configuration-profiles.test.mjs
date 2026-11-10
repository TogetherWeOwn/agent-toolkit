import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as profile from '../../../dist/plugins/planetscale-broker/src/tools/get-shard-configuration-profile.js';
import * as profiles from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profiles.js';
import * as shard from '../../../dist/plugins/planetscale-broker/src/tools/get-shard-configuration-profile-shard.js';
import * as shards from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profile-shards.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const branch = { organization: 'example-org', database: 'example-db', branch: 'staging' };
const prefix = '/v1/organizations/example-org/databases/example-db/branches/staging/configuration-profiles';
const binding = { id: 'profile123', name: 'standard' };
const profileRow = { ...binding, state: 'ready', default: true, metal: false, architecture: canary, cluster_size: canary, cluster_display_name: canary, replicas: canary, read_only_replicas: canary, shards: canary, storage: { minimum_storage_bytes: canary }, postgres_image_version: canary, created_at: canary, updated_at: canary };
const profileExpected = { ...binding, state: 'ready', default: true, metal: false };
const shardRow = { id: 'shard123', name: canary, display_name: canary, configuration_profile: 'standard', ready: true, authoritative: false, created_at: canary };
const shardExpected = { id: 'shard123', ready: true, authoritative: false };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [profile, { ...branch, profile: binding }, 'profile', profileRow, profileExpected, '/standard', 'detail', ['state', 'default', 'metal']],
  [profiles, { ...branch, profiles: [binding] }, 'profiles', profileRow, profileExpected, '', 'array', ['state', 'default', 'metal']],
  [shard, { ...branch, profile: binding, shard: { id: 'shard123' } }, 'shard', shardRow, shardExpected, '/standard/shards/shard123', 'detail', ['ready', 'authoritative', 'configuration_profile']],
  [shards, { ...branch, profile: binding, shards: [{ id: 'shard123' }] }, 'shards', shardRow, shardExpected, '/standard/shards', 'page', ['ready', 'authoritative', 'configuration_profile']],
];

for (const [adapter, scope, key, row, expected, path, kind, selected] of fixtures) {
  const args = kind === 'page' ? { page: 1, perPage: 2 } : {};
  const wrap = rows => kind === 'page' ? page(rows) : kind === 'array' ? rows : rows[0];
  const output = rows => kind === 'page' ? { items: rows, nextPage: null, complete: true } : kind === 'array' ? rows : rows[0];
  const suffix = kind === 'page' ? '?page=1&per_page=2' : '';

  test(`${adapter.operationId}: fixed GET and bounded metadata without storage, SKU, version or free text`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: prefix + path + suffix });
    const result = prepared.project(wire(wrap([row])));
    assert.deepEqual(result, output([expected]));
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, kind === 'page' ? result.items[0] : kind === 'array' ? result[0] : result]) assert.ok(Object.isFrozen(value));
    if (kind !== 'detail') assert.deepEqual(prepared.project(wire(wrap([]))), output([]));
  });

  test(`${adapter.operationId}: unknown or rebound identity refuses the whole response`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', null, {}, canary]) {
      const bad = { ...row, id };
      assert.throws(() => prepared.project(wire(wrap(kind === 'detail' ? [bad] : [row, bad]))), error => !String(error).includes(canary));
    }
    const field = key.startsWith('profile') ? 'name' : 'configuration_profile';
    for (const value of ['foreign', undefined, null, canary]) assert.throws(() => prepared.project(wire(wrap([{ ...row, [field]: value }]))), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: selected schema, response shape and wire caps fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of selected) {
      for (const value of [undefined, null, {}, [], 1, canary]) assert.throws(() => prepared.project(wire(wrap([{ ...row, [field]: value }]))), error => !String(error).includes(canary));
    }
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({}), wire(canary), new TextEncoder().encode('{')]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (kind === 'array') {
      assert.throws(() => prepared.project(wire(page([row]))));
      assert.throws(() => prepared.project(wire(Array(33).fill(row))));
      assert.throws(() => prepared.project(wire([row, null])));
    } else assert.throws(() => prepared.project(wire([row])));
    if (kind === 'page') {
      for (const value of [page([null]), page([row, row, row]), { ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }]) assert.throws(() => prepared.project(wire(value)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed scope and arguments reject target and authority overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'approval', 'agentId', 'production', 'all', key, 'q']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'x%2fy' }, { ...scope, branch: '../foreign' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(invalid, args));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    const entry = key.startsWith('profile') ? binding : { id: 'shard123' };
    const badBindings = [null, '../escape', { ...entry, id: canary }, { ...entry, approval: true }];
    for (const invalid of kind === 'detail' ? badBindings : [[], [entry, entry], Array(33).fill(entry), ...badBindings.map(item => [item])]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
    for (const invalid of kind === 'page' ? [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }] : [{ page: 1 }, { perPage: 2 }]) assert.throws(() => adapter.prepare(scope, invalid));
  });

  test(`${adapter.operationId}: scope snapshots cannot be widened or retargeted after preparation`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.branch = 'foreign';
    if (copied.profile) { copied.profile.id = 'foreign'; copied.profile.name = 'foreign'; }
    if (kind !== 'detail') { copied[key][0].id = 'foreign'; copied[key].push({ id: 'foreign', name: 'foreign' }); }
    else copied[key].id = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, prefix + path + suffix);
    assert.deepEqual(prepared.project(wire(wrap([row]))), output([expected]));
    assert.throws(() => prepared.project(wire(wrap([{ ...row, id: 'foreign' }]))));
  });
}

test('profile binding lists refuse duplicate names as well as duplicate IDs', () => {
  for (const entries of [[binding, { id: 'other', name: binding.name }], [binding, { id: binding.id, name: 'other' }]]) assert.throws(() => profiles.prepare({ ...branch, profiles: entries }, {}));
  for (const name of ['../escape', 'x%2fy', canary, null]) {
    assert.throws(() => profile.prepare({ ...branch, profile: { ...binding, name } }, {}));
    assert.throws(() => shards.prepare({ ...branch, profile: { ...binding, name }, shards: [{ id: 'shard123' }] }, { page: 1, perPage: 2 }));
  }
});

test('profile parent is closed and fixed independently of profile-shard IDs', () => {
  for (const adapter of [shard, shards]) {
    const scope = { ...branch, profile: binding, ...(adapter === shard ? { shard: { id: 'shard123' } } : { shards: [{ id: 'shard123' }] }) };
    const args = adapter === shard ? {} : { page: 1, perPage: 2 };
    for (const profile of [null, { id: canary, name: 'standard' }, { ...binding, name: '../escape' }, { ...binding, url: canary }]) assert.throws(() => adapter.prepare({ ...scope, profile }, args));
  }
});

test('profile and shard state flags remain metadata, not configuration or spend authority', () => {
  const prepared = profile.prepare({ ...branch, profile: binding }, {});
  for (const state of ['draft', 'pending', 'applying', 'ready']) {
    for (const value of [true, false]) assert.deepEqual(prepared.project(wire({ ...profileRow, state, default: value, metal: value, approval: 'accepted' })), { ...binding, state, default: value, metal: value });
  }
  assert.throws(() => prepared.project(wire({ ...profileRow, state: 'approved' })));
  for (const value of [true, false]) assert.deepEqual(shard.prepare({ ...branch, profile: binding, shard: { id: 'shard123' } }, {}).project(wire({ ...shardRow, ready: value, authoritative: value, approval: 'accepted' })), { id: 'shard123', ready: value, authoritative: value });
});

test('profile and profile-shard requests match official paths, response shapes and permissions', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , path, kind] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { ...branch, configuration_profile: scope.profile?.name, id: scope.shard?.id };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), prefix + path);
    assert.deepEqual(operation.value.parameters.filter(item => item.in === 'query').map(item => item.name).sort(), kind === 'page' ? ['page', 'per_page', 'q'] : []);
    assert.ok(operation.value.description.includes('`read_branch`'));
    if (kind === 'array') assert.equal(operation.value.responses['200'].schema.type, 'array');
  }
  assert.deepEqual(schema.definitions.NekiShardConfigurationProfile.properties.state.enum, ['draft', 'pending', 'applying', 'ready']);
  assert.equal(schema.definitions.NekiShard.properties.configuration_profile.type, 'string');
});

test('default profile is a 302-only unresolved alias, never fabricated successful coverage', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const operation = schema.paths['/organizations/{organization}/databases/{database}/branches/{branch}/default-configuration-profile'].get;
  assert.deepEqual(Object.keys(operation.responses).filter(code => code.startsWith('2')), []);
  assert.ok(operation.responses['302']);
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const row = map.operations.find(item => item.operationId === operation.operationId);
  assert.equal(row.implementation, 'missing');
  assert.equal(row.adapter, null);
  assert.equal(row.tier, 'unresolved');
  assert.ok(row.prerequisites.includes('reviewed-fixed-redirect-alias-contract-no-automatic-follow'));
});
