import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListShardConfigurationProfilesPreparation, bindListShardConfigurationProfileShardsPreparation
} from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as profileRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profiles.js';
import { prepare as shardRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profile-shards.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging/configuration-profiles';
const cases = [
  { operation: 'list_shard_configuration_profiles', bind: bindListShardConfigurationProfilesPreparation,
    read: profileRead, field: 'profiles', path: root, identity: 'record-and-name-parent-not-verified',
    row: { id: 'record_1', name: 'profile-one', state: 'ready', default: false, metal: true } },
  { operation: 'list_shard_configuration_profile_shards', bind: bindListShardConfigurationProfileShardsPreparation,
    read: shardRead, field: 'shards', paged: true, path: `${root}/profile-one/shards?page=2&per_page=3`,
    identity: 'record-id-only-parent-not-verified',
    row: { id: 'record_1', configuration_profile: 'profile-one', ready: true, authoritative: false },
    output: { id: 'record_1', ready: true, authoritative: false } },
];
const bindings = (c, n) => Array.from({ length: n }, (_, i) => ({ id: `record_${i + 1}`,
  ...(!c.paged ? { name: i === 0 ? 'profile-one' : `profile-${i + 1}` } : {}) }));
const targetFor = c => ({ ...parent(), [c.field]: bindings(c, 2), ...(c.paged ? {
  profile: { id: 'profile_1', name: 'profile-one' }, pagination: { page: 2, perPage: 3 } } : {}) });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch,
  [c.field]: t[c.field], ...(c.paged ? { profile: t.profile } : {}) });
const envelope = (c, data) => c.paged ? { current_page: 2, per_page: 3, next_page: 3, data } : data;
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), c.paged ? targetFor(c).pagination : {})
  .project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: closed host captures bind exact collection GET and resource`, () => {
    const target = targetFor(c); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.paged ? 'planetscale/configuration-profile/profile_1' : 'planetscale/branch/br_1',
      revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), c.paged ? target.pagination : {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: confinement never grants collection, config, spend or wake authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'configurationAuthority', 'spendAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: bounded frozen receipts omit config, costs, versions and parent claims`, () => {
    const result = project(c, envelope(c, [{ ...c.row, configuration: 'synthetic-canary', sku: 'synthetic-canary',
      cost: 'synthetic-canary', version: 'synthetic-canary', actor: 'synthetic-canary', created_at: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent' }]));
    const expected = c.output ?? c.row;
    assert.deepEqual(result, c.paged ? { items: [expected], nextPage: 3, complete: false } : [expected]);
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    const items = c.paged ? result.items : result;
    for (const value of [result, items, items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, c.paged ? { ...envelope(c, []), next_page: null } : []),
      c.paged ? { items: [], nextPage: null, complete: true } : []);
  });

  test(`${c.operation}: unknown children, rebound names and malformed flags refuse whole response`, () => {
    assert.throws(() => project(c, envelope(c, [c.row, { ...c.row, id: 'unknown' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope(c, [{ ...c.row,
      [c.paged ? 'configuration_profile' : 'name']: 'other' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope(c, [{ ...c.row, [c.paged ? 'ready' : 'metal']: 'true' }])), { code: 'upstream' });
    if (c.paged) for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
      assert.throws(() => project(c, { ...envelope(c, [c.row]), ...patch }), { code: 'upstream' });
    }
    else {
      assert.throws(() => project(c, [{ ...c.row, state: 'unknown' }]), { code: 'schema' });
      assert.throws(() => project(c, { data: [c.row] }), { code: 'upstream' });
      assert.throws(() => project(c, Array(33).fill(c.row)), { code: 'upstream' });
    }
  });

  test(`${c.operation}: captured parents, children, profile and page are immutable`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    target[c.field][0].id = 'other'; target[c.field].push(...bindings(c, 1));
    if (c.paged) { target.profile.id = 'other'; target.profile.name = 'other'; target.pagination.page = 3; }
    else target.profiles[0].name = 'other';
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], ...before.plan.target[c.field], before.plan.proposedRequest,
      ...(c.paged ? [before.plan.target.profile, before.plan.target.pagination] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0].id = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field changes plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) for (const key of Object.keys(targetFor(c)[c.field][index])) {
      const target = targetFor(c); target[c.field][index][key] = 'other'; variants.push(target);
    }
    if (c.paged) for (const [field, keys] of [['profile', ['id', 'name']], ['pagination', ['page', 'perPage']]]) {
      for (const key of keys) {
        const target = targetFor(c); target[field][key] = field === 'pagination' ? target[field][key] + 1 : 'other'; variants.push(target);
      }
    }
    const reordered = targetFor(c); reordered[c.field].reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override host child, page, request or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: bindings(c, 1) }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host input is closed, bounded, unique and accessor-free`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const children of [[], bindings(c, 33), [bindings(c, 1)[0], bindings(c, 1)[0]], [null],
      [{ ...bindings(c, 1)[0], approved: true }]]) refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    const children = bindings(c, 2); let touched = false;
    Object.defineProperty(children[0], 'id', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children })); assert.equal(touched, false);
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: bindings(c, 32) })({}).plan.target[c.field].length, 32);
  });
}

test('profile lists reject invented pagination and duplicate names; shard lists require a bounded page', () => {
  const c = cases[0]; refused(() => c.bind({ ...targetFor(c), pagination: { page: 1, perPage: 10 } }));
  refused(() => c.bind({ ...targetFor(c), profiles: [{ id: 'one', name: 'same' }, { id: 'two', name: 'same' }] }));
  const shards = cases[1];
  for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
    { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => shards.bind({ ...targetFor(shards), pagination }));
});

test('profile and shard collection namespaces and independent IDs cannot collide', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.notEqual(canonicalHash(prepared[0]), canonicalHash(prepared[1]));
  for (const c of cases) {
    const target = targetFor(c); target[c.field][0].id = 'other';
    const changed = c.bind(target)({}); const original = c.bind(targetFor(c))({});
    assert.deepEqual(changed.plan.proposedRequest, original.plan.proposedRequest);
    assert.notEqual(canonicalHash(changed.plan), canonicalHash(original.plan));
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
  }
  const target = targetFor(cases[1]); target.profile.id = 'other';
  assert.deepEqual(cases[1].bind(target)({}).plan.proposedRequest, prepared[1].plan.proposedRequest);
  assert.notEqual(canonicalHash(cases[1].bind(target)({})), canonicalHash(prepared[1]));
});
