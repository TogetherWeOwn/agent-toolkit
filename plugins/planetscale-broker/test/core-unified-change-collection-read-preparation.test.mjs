import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListChangeRequestsPreparation, bindListDedicatedReadReplicaChangeRequestsPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as changeRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-change-requests.js';
import { prepare as replicaRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-dedicated-read-replica-change-requests.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'list_change_requests', bind: bindListChangeRequestsPreparation, read: changeRead,
    path: `${root}/change-requests`, binding: { id: 'change_1', type: 'NekiRouterChangeRequest',
      targetId: 'router_1', targetType: 'NekiRouter', targetName: 'router-a' },
    row: { id: 'change_1', type: 'NekiRouterChangeRequest', target_id: 'router_1',
      target_type: 'NekiRouter', target_name: 'router-a', state: 'applying', can_delete: false } },
  { operation: 'list_dedicated_read_replica_change_requests', bind: bindListDedicatedReadReplicaChangeRequestsPreparation,
    read: replicaRead, path: `${root}/dedicated-read-replica-changes`,
    binding: { id: 'change_1', replicaId: 'replica_1', replica: 'replica-a' },
    row: { id: 'change_1', replica: { id: 'replica_1', name: 'replica-a' }, state: 'resizing' } },
];
const rows = (c, n) => Array.from({ length: n }, (_, i) => ({ ...c.binding, id: `change_${i + 1}` }));
const targetFor = c => ({ ...parent(), changes: rows(c, 2), pagination: { page: 2, perPage: 3 } });
const scopeFor = t => ({ organization: t.organization, database: t.database, branch: t.branch, changes: t.changes });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body, target = targetFor(c)) => c.read(scopeFor(target), target.pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });
const expected = c => ({ ...c.binding, state: c.row.state, ...('type' in c.binding ? { canDelete: false } : {}) });

for (const c of cases) {
  test(`${c.operation}: immutable host parent and child snapshots bind the fixed collection GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/br_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: `${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: target confinement is not execution, collection or non-waking authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'record-and-target-binding-parent-not-verified');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: scalar receipts omit config, errors, actors, times and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, parameters: 'synthetic-canary', previous_parameters: 'synthetic-canary',
      storage: 'synthetic-canary', error: 'synthetic-canary', actor: 'synthetic-canary', completed_at: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent' }]));
    assert.deepEqual(result, { items: [expected(c)], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown and rebound target identities refuse the whole page`, () => {
    const patches = [{ id: 'other' }];
    if ('type' in c.binding) patches.push({ type: 'NekiClusterChangeRequest' }, { target_type: 'NekiCluster' },
      { target_id: 'other' }, { target_id: null }, { target_name: 'other' });
    else patches.push({ replica: { id: 'other', name: 'replica-a' } }, { replica: { id: 'replica_1', name: 'other' } });
    for (const patch of patches) assert.throws(() => project(c, envelope([c.row, { ...c.row, ...patch }])), { code: 'scope' });
    for (const state of ['unknown', null, false]) refused(() => project(c, envelope([{ ...c.row, state }])));
    if ('type' in c.binding) assert.throws(() => project(c, envelope([{ ...c.row, can_delete: 'true' }])), { code: 'upstream' });
  });

  test(`${c.operation}: captured pagination and wire bounds reject malformed upstream responses`, () => {
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
    assert.throws(() => project(c, [c.row]), { code: 'upstream' });
    assert.throws(() => c.read(scopeFor(targetFor(c)), targetFor(c).pagination).project(new Uint8Array(65537)), { code: 'upstream' });
  });

  test(`${c.operation}: later host parent, child and page mutations cannot rebind the preparation`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    for (const child of target.changes) for (const key of Object.keys(child)) child[key] = 'other';
    target.changes.push({ ...c.binding, id: 'other' }); target.pagination.page = 3;
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target.changes, ...before.plan.target.changes, before.plan.target.pagination, before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.changes[0].id = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host parent, child and page field changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) {
      for (const key of Object.keys(c.binding).filter(key => !['type', 'targetType'].includes(key))) {
        const target = targetFor(c); target.changes[index][key] = 'other'; variants.push(target);
      }
      if ('type' in c.binding) {
        const typed = targetFor(c); typed.changes[index].type = 'NekiClusterChangeRequest';
        typed.changes[index].targetType = 'NekiCluster'; variants.push(typed);
        const nullable = targetFor(c); nullable.changes[index].targetId = null; variants.push(nullable);
      }
    }
    for (const key of ['page', 'perPage']) { const target = targetFor(c); target.pagination[key] += 1; variants.push(target); }
    const reordered = targetFor(c); reordered.changes.reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override host bindings, pagination, filters or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { changes: rows(c, 1) }, { page: 1 }, { perPage: 10 },
      { state: 'draft' }, { target_types: ['NekiRouter'] }, { target_id: 'other' }, { period: 'all' }, { completed_at: 'other' },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host captures are closed, bounded, unique and data-only`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const changes of [[], rows(c, 33), [c.binding, c.binding], [null], [{ ...c.binding, approved: true }]]) refused(() => c.bind({ ...targetFor(c), changes }));
    const changes = rows(c, 2); let touched = false;
    Object.defineProperty(changes, '0', { enumerable: true, get() { touched = true; return c.binding; } });
    refused(() => c.bind({ ...targetFor(c), changes })); assert.equal(touched, false);
    for (const key of Object.keys(c.binding)) {
      const child = Object.defineProperty({ ...c.binding }, key, { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind({ ...targetFor(c), changes: [child] })); assert.equal(touched, false);
    }
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), changes: rows(c, 32) })({}).plan.target.changes.length, 32);
  });
}

test('unified collections retain all exact type pairs, nullable identity and non-cancellable informational states', () => {
  const c = cases[0];
  for (const targetType of ['NekiAdmin', 'NekiCluster', 'NekiConfigurationProfile', 'NekiExternalShard', 'NekiRouter', 'PostgresBouncer']) {
    for (const targetId of ['target_1', null]) {
      const target = targetFor(c);
      const binding = { ...c.binding, type: `${targetType}ChangeRequest`, targetType, targetId };
      target.changes[1] = { ...binding, id: 'change_2' };
      assert.deepEqual(JSON.parse(JSON.stringify(c.bind(target)({}).plan.target)), target);
      for (const state of ['draft', 'pending', 'applying', 'canceled', 'completed']) {
        const row = { ...c.row, id: 'change_2', type: binding.type, target_type: targetType, target_id: targetId, state };
        assert.deepEqual(project(c, envelope([c.row, row]), target).items, [expected(c), { ...target.changes[1], state, canDelete: false }]);
      }
      const mismatched = structuredClone(target); mismatched.changes[1].type = `${targetType === 'NekiRouter' ? 'NekiCluster' : 'NekiRouter'}ChangeRequest`;
      assert.throws(() => c.bind(mismatched), { code: 'scope' });
    }
  }
});

test('replica change collections retain multiple bound replicas without inventing single-replica scope', () => {
  const c = cases[1]; const target = targetFor(c);
  target.changes[1] = { id: 'change_2', replicaId: 'replica_2', replica: 'replica-b' };
  assert.deepEqual(JSON.parse(JSON.stringify(c.bind(target)({}).plan.target)), target);
  for (const state of ['pending', 'resizing', 'canceled', 'completed']) {
    const row = { id: 'change_2', replica: { id: 'replica_2', name: 'replica-b' }, state };
    assert.deepEqual(project(c, envelope([c.row, row]), target).items, [expected(c), { ...target.changes[1], state }]);
  }
});

test('collection operations and child-only bindings remain distinct even when resource or request is unchanged', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.deepEqual(prepared[0].resource, prepared[1].resource);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
  for (const c of cases) for (const key of Object.keys(c.binding).filter(key => !['type', 'targetType'].includes(key))) {
    const target = targetFor(c); target.changes[0][key] = 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});
