import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as rollout from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-rollout-status.js';
import * as operation from '../../../dist/plugins/planetscale-broker/src/tools/get-vtctld-operation.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const path = '/v1/organizations/example-org/databases/app/branches/staging';
const rolloutScope = { ...target, keyspace: 'main', shardNames: ['-80', '80-'] };
const operationScope = { ...target, operationId: 'op123' };
const shard = { name: '-80', state: canary, last_rollout_started_at: canary, last_rollout_finished_at: '' };
const rolloutRow = { name: 'main', state: canary, shards: [shard], metadata: { password: canary } };
const operationRow = { type: 'VtctldOperation', id: 'op123', state: 'running', completed_at: null, completed: 'false', action: canary, timeout: 30, created_at: canary, metadata: { password: canary }, result: { sql: canary }, error: canary };
const authority = { executionAuthority: 'not-established' };
const shardExpected = { name: '-80', stateReported: true, startRecorded: true, finishRecorded: false };
const rolloutExpected = { keyspace: 'main', stateReported: true, shards: [shardExpected], ...authority };
const operationExpected = { id: 'op123', state: 'running', completionRecorded: false, ...authority };
const fixtures = [
  [rollout, rolloutScope, rolloutRow, rolloutExpected, path + '/keyspaces/main/rollout-status'],
  [operation, operationScope, operationRow, operationExpected, path + '/vtctld/operations/op123'],
];

for (const [adapter, scope, row, expected, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET and frozen scalar-only projection`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const output = prepared.project(wire(row));
    assert.deepEqual(output, expected);
    assert.ok(!JSON.stringify(output).includes(canary));
    for (const value of [prepared, prepared.request, output, ...(output.shards ? [output.shards, ...output.shards] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: fixed errors for malformed or oversized wire values`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments never accept access or authority overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'action', 'result', 'page', 'perPage', 'timeout']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const args = Object.defineProperty({}, 'url', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, args), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed scope and bounded parent path segments`, () => {
    for (const field of ['organization', 'database', 'branch']) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, {}), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: later caller mutation cannot retarget the prepared read`, () => {
    const copy = structuredClone(scope);
    const prepared = adapter.prepare(copy, {});
    copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign';
    if (copy.shardNames) { copy.keyspace = 'foreign'; copy.shardNames[0] = 'foreign'; copy.shardNames.push('another'); }
    else copy.operationId = 'foreign';
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(row)), expected);
    assert.throws(() => prepared.project(wire({ ...row, [adapter === rollout ? 'name' : 'id']: 'foreign' })));
  });
}

test('rollout: unknown/rebound keyspace or shard refuses the whole response', () => {
  const prepared = rollout.prepare(rolloutScope, {});
  for (const name of ['foreign', canary, null, 3]) {
    assert.throws(() => prepared.project(wire({ ...rolloutRow, name })), error => !String(error).includes(canary));
    assert.throws(() => prepared.project(wire({ ...rolloutRow, shards: [shard, { ...shard, name }] })), error => !String(error).includes(canary));
  }
});

test('rollout: duplicate, malformed and over-cap shards are refused without partial output', () => {
  const prepared = rollout.prepare(rolloutScope, {});
  for (const shards of [null, {}, [null], [shard, shard], Array(33).fill(shard)]) assert.throws(() => prepared.project(wire({ ...rolloutRow, shards })));
  assert.deepEqual(prepared.project(wire({ ...rolloutRow, shards: [] })), { ...rolloutExpected, shards: [] });
  assert.deepEqual(prepared.project(wire({ ...rolloutRow, shards: [shard, { ...shard, name: '80-' }] })), { ...rolloutExpected, shards: [shardExpected, { ...shardExpected, name: '80-' }] });
});

test('rollout: no invented state enum or timestamp-validity/completion claim', () => {
  const prepared = rollout.prepare(rolloutScope, {});
  assert.deepEqual(prepared.project(wire({ ...rolloutRow, state: '', shards: [{ ...shard, state: '', last_rollout_started_at: '', last_rollout_finished_at: canary }] })), { ...rolloutExpected, stateReported: false, shards: [{ ...shardExpected, stateReported: false, startRecorded: false, finishRecorded: true }] });
  for (const value of [null, 1, {}, [], 'a'.repeat(4097)]) {
    assert.throws(() => prepared.project(wire({ ...rolloutRow, state: value })));
    for (const field of ['state', 'last_rollout_started_at', 'last_rollout_finished_at']) assert.throws(() => prepared.project(wire({ ...rolloutRow, shards: [{ ...shard, [field]: value }] })));
  }
  for (const field of ['state', 'last_rollout_started_at', 'last_rollout_finished_at']) {
    const row = { ...shard }; delete row[field];
    assert.throws(() => prepared.project(wire({ ...rolloutRow, shards: [row] })));
  }
});

test('rollout: scope requires snapshotted unique bounded names, never ID-shaped authority', () => {
  for (const keyspace of ['../foreign', 'x/y', canary, null]) assert.throws(() => rollout.prepare({ ...rolloutScope, keyspace }, {}));
  for (const shardNames of [[], ['-80', '-80'], Array(33).fill('0'), ['x/y'], ['../foreign'], [canary], [null], [''], ['a'.repeat(64)]]) assert.throws(() => rollout.prepare({ ...rolloutScope, shardNames }, {}));
  const hostile = Object.defineProperty(['-80'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => rollout.prepare({ ...rolloutScope, shardNames: hostile }, {}), error => !String(error).includes(canary));
  for (const name of ['0', '-80', '80-']) assert.doesNotThrow(() => rollout.prepare({ ...rolloutScope, shardNames: [name] }, {}));
});

test('vtctld: exact operation ID and documented type required', () => {
  const prepared = operation.prepare(operationScope, {});
  for (const id of ['foreign', canary, null, 1]) assert.throws(() => prepared.project(wire({ ...operationRow, id })), error => !String(error).includes(canary));
  for (const type of [undefined, null, canary, 'OtherOperation', true]) assert.throws(() => prepared.project(wire({ ...operationRow, type })), error => !String(error).includes(canary));
  for (const operationId of ['../foreign', 'x/y', canary, null, 'a'.repeat(81)]) assert.throws(() => operation.prepare({ ...operationScope, operationId }, {}));
});

test('vtctld: every official state remains informational, not successful topology or closure', () => {
  const prepared = operation.prepare(operationScope, {});
  for (const state of ['pending', 'running', 'completed', 'failed', 'cancelled']) assert.deepEqual(prepared.project(wire({ ...operationRow, state })), { ...operationExpected, state });
  for (const state of [undefined, null, 'canceled', 'approved', canary, 1]) assert.throws(() => prepared.project(wire({ ...operationRow, state })), error => !String(error).includes(canary));
});

test('vtctld: nullable completion string presence, no completed-string boolean coercion', () => {
  const prepared = operation.prepare(operationScope, {});
  for (const completed_at of [null, '', canary]) for (const completed of ['false', 'true', false, canary, null]) assert.deepEqual(prepared.project(wire({ ...operationRow, completed_at, completed })), { ...operationExpected, completionRecorded: typeof completed_at === 'string' && completed_at.length > 0 });
  for (const completed_at of [undefined, true, 1, {}, [], 'a'.repeat(4097)]) assert.throws(() => prepared.project(wire({ ...operationRow, completed_at })));
});

test('operation-status paths and selected field shapes match the pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    const parameters = { ...scope, id: scope.operationId };
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), endpoint);
    assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query'), []);
    const response = entry.value.responses['200'].schema;
    const result = response.$ref ? schema.definitions[response.$ref.split('/').at(-1)] : response;
    if (adapter === rollout) {
      assert.deepEqual(result.required, ['name', 'state', 'shards']);
      assert.equal(result.properties.state.type, 'string');
      assert.equal(result.properties.state.enum, undefined);
      const shard = result.properties.shards.items;
      for (const field of ['name', 'state', 'last_rollout_started_at', 'last_rollout_finished_at']) {
        assert.ok(shard.required.includes(field));
        assert.equal(shard.properties[field].type, 'string');
      }
    } else {
      for (const field of ['type', 'id', 'state', 'completed_at']) assert.ok(result.required.includes(field));
      assert.deepEqual(result.properties.state.enum, ['pending', 'running', 'completed', 'failed', 'cancelled']);
      assert.equal(result.properties.completed_at.type, 'string');
      assert.equal(result.properties.completed_at['x-nullable'], true);
      assert.equal(result.properties.completed.type, 'string');
    }
  }
});

test('profile change aliases remain honest 308-only gaps, never automatic redirect reads', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const operationId of ['get_shard_configuration_profile_change_request', 'list_shard_configuration_profile_change_requests']) {
    const operation = Object.values(schema.paths).flatMap(methods => Object.values(methods)).find(value => value.operationId === operationId);
    assert.ok(operation.responses['308']);
    assert.ok(!Object.keys(operation.responses).some(code => code.startsWith('2')));
    const mapped = map.operations.find(value => value.operationId === operationId);
    assert.equal(mapped.implementation, 'missing');
    assert.equal(mapped.adapter, null);
    assert.ok(mapped.prerequisites.includes('reviewed-fixed-redirect-alias-contract-no-automatic-follow'));
  }
});
