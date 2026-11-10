import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetShardConfigurationProfilePreparation, bindGetShardConfigurationProfileShardPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as profileRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-shard-configuration-profile.js';
import { prepare as shardRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-shard-configuration-profile-shard.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  branch: 'main', branchId: 'branch_1', revision: 'a'.repeat(64), profile: { id: 'record_1', name: 'standard' } });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/main/configuration-profiles/standard';
const cases = [
  { operation: 'get_shard_configuration_profile', bind: bindGetShardConfigurationProfilePreparation, read: profileRead,
    target: branch,
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, profile: t.profile }),
    resource: 'planetscale/configuration-profile/record_1', path,
    body: { id: 'record_1', name: 'standard', state: 'ready', default: true, metal: false },
    keys: ['id', 'name', 'state', 'default', 'metal'], invalid: { state: 'unknown' }, invalidCode: 'schema', rebound: { name: 'other' } },
  { operation: 'get_shard_configuration_profile_shard', bind: bindGetShardConfigurationProfileShardPreparation, read: shardRead,
    target: () => ({ ...branch(), shard: { id: 'record_1' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, profile: t.profile, shard: t.shard }),
    resource: 'planetscale/configuration-profile-shard/record_1/record_1', path: `${path}/shards/record_1`,
    body: { id: 'record_1', configuration_profile: 'standard', ready: true, authoritative: false },
    keys: ['id', 'ready', 'authoritative'], invalid: { ready: 'true' }, invalidCode: 'upstream', rebound: { configuration_profile: 'other' } },
];
const nested = target => Object.keys(target).filter(key => typeof target[key] === 'object');

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable IDs, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    for (const key of nested(target)) assert.equal(Object.getPrototypeOf(prepared.plan.target[key]), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(Object.hasOwn(prepared.plan.proposedRequest, 'body'), false);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains response-parent/non-waking gaps without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits parent/configuration/storage/SKU/version/actor canaries`, () => {
    const output = c.read(c.scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent',
      parameters: { password: 'synthetic-canary' }, storage: { minimum_storage_bytes: 'synthetic-canary' },
      cluster_size: 'synthetic-canary', postgres_image_version: 'synthetic-canary',
      actor: { name: 'synthetic-canary' }, error: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses rebound child/name association and malformed selected fields`, () => {
    const read = c.read(c.scope(c.target()), {});
    for (const patch of [{ id: 'other' }, c.rebound]) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...patch }))), { code: 'scope' });
    }
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...c.invalid }))), { code: c.invalidCode });
  });

  test(`${c.operation}: captured nested target and request remain immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of nested(target)) for (const field of Object.keys(target[key])) target[key][field] = 'other';
    target.organization = 'other';
    target.branchId = 'other';
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.proposedRequest, ...nested(before.plan.target).map(key => before.plan.target[key])]) {
      assert.ok(Object.isFrozen(value));
    }
    for (const key of nested(before.plan.target)) assert.throws(() => { before.plan.target[key].id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent/profile/shard/revision field affects plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    const variations = Object.keys(target).filter(key => !nested(target).includes(key))
      .map(key => ({ ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const key of nested(target)) for (const field of Object.keys(target[key])) {
      const changed = c.target();
      changed[key][field] = 'other';
      variations.push(changed);
    }
    for (const changed of variations) {
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/configuration/authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { profile: { id: 'other', name: 'other' } },
      { parameters: { password: 'synthetic-canary' } }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { method: 'POST' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe host fields and nested accessors refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), branch: '../other' },
      { ...c.target(), [Symbol('scope')]: true }, Object.defineProperty(c.target(), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const child of nested(c.target())) {
      for (const key of Object.keys(c.target()[child])) {
        const missing = c.target();
        delete missing[child][key];
        refused(() => c.bind(missing));
        let touched = false;
        const accessor = c.target();
        Object.defineProperty(accessor[child], key, { enumerable: true, get() { touched = true; return 'other'; } });
        refused(() => c.bind(accessor));
        assert.equal(touched, false);
      }
      for (const patch of [{ authority: true }, { id: '../other' }, { name: '../other' }, { [Symbol('scope')]: true }]) {
        const invalid = c.target();
        Object.assign(invalid[child], patch);
        refused(() => c.bind(invalid));
      }
    }
  });
}

test('profile, profile-shard and ordinary shard resource namespaces do not collide', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
  for (const p of prepared) assert.notEqual(p.resource.id, 'planetscale/shard/record_1');
});

test('profile-shard resource retains independent immutable profile identity even when the route is unchanged', () => {
  const target = cases[1].target();
  const first = cases[1].bind(target)({});
  target.profile.id = 'profile_2';
  const second = cases[1].bind(target)({});
  assert.notEqual(first.resource.id, second.resource.id);
  assert.deepEqual(first.plan.proposedRequest, second.plan.proposedRequest);
  assert.notEqual(canonicalHash(first), canonicalHash(second));
});
