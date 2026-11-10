import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListBouncersPreparation, bindListBranchBouncerResizeRequestsPreparation,
  bindListBouncerResizeRequestsPreparation, bindListBranchResizeRequestsPreparation,
  bindListKeyspaceResizeRequestsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as bouncerRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-bouncers.js';
import { prepare as branchBouncerResizeRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-bouncer-resize-requests.js';
import { prepare as bouncerResizeRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-bouncer-resize-requests.js';
import { prepare as branchResizeRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-resize-requests.js';
import { prepare as keyspaceResizeRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-keyspace-resize-requests.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'list_bouncers', bind: bindListBouncersPreparation, read: bouncerRead, field: 'bouncers',
    path: `${root}/bouncers`, kind: 'bouncer', identity: 'record-and-branch-ids-parent-not-verified' },
  { operation: 'list_branch_bouncer_resize_requests', bind: bindListBranchBouncerResizeRequestsPreparation,
    read: branchBouncerResizeRead, field: 'resizes', path: `${root}/bouncer-resizes`, kind: 'bouncer-resize',
    identity: 'record-and-target-binding-parent-not-verified' },
  { operation: 'list_bouncer_resize_requests', bind: bindListBouncerResizeRequestsPreparation,
    read: bouncerResizeRead, field: 'resizes', path: `${root}/bouncers/pool-one/resizes`, kind: 'bouncer-resize',
    child: 'bouncer', identity: 'record-and-target-binding-parent-not-verified' },
  { operation: 'list_branch_resize_requests', bind: bindListBranchResizeRequestsPreparation,
    read: branchResizeRead, field: 'resizes', path: `${root}/resizes`, kind: 'resize',
    identity: 'record-id-only-parent-not-verified' },
  { operation: 'list_keyspace_resize_requests', bind: bindListKeyspaceResizeRequestsPreparation,
    read: keyspaceResizeRead, field: 'resizes', path: `${root}/keyspaces/main/resizes`, kind: 'resize',
    child: 'keyspace', identity: 'record-id-only-parent-not-verified' },
];
const bindings = (c, n) => Array.from({ length: n }, (_, i) => ({ id: `record_${i + 1}`,
  ...(c.kind === 'bouncer' ? { name: `pool-${i + 1}` } : {}),
  ...(c.kind === 'bouncer-resize' ? { bouncerId: 'pool_1', bouncer: 'pool-one' } : {}) }));
const targetFor = c => ({ ...parent(), [c.field]: bindings(c, 2), pagination: { page: 2, perPage: 3 },
  ...(c.child === 'bouncer' ? { bouncer: { id: 'pool_1', name: 'pool-one' } } : {}),
  ...(c.child === 'keyspace' ? { keyspace: { id: 'ks_1', name: 'main' } } : {}) });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch,
  [c.field]: t[c.field], ...(c.kind === 'bouncer' ? { branchId: t.branchId } : {}),
  ...(c.child ? { [c.child]: t[c.child] } : {}) });
const rowFor = c => ({ id: 'record_1', ...(c.kind === 'bouncer' ? { name: 'pool-1',
  branch: { id: 'br_1', name: 'staging' }, target: 'primary' } : { state: 'completed' }),
  ...(c.kind === 'bouncer-resize' ? { bouncer: { id: 'pool_1', name: 'pool-one' } } : {}) });
const expectedFor = c => c.kind === 'bouncer' ? { id: 'record_1', name: 'pool-1', branchId: 'br_1',
  branch: 'staging', target: 'primary' } : { id: 'record_1', state: 'completed',
  ...(c.kind === 'bouncer-resize' ? { bouncerId: 'pool_1', bouncer: 'pool-one' } : {}) };
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: closed host snapshot binds exact paginated collection GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    const resource = c.child ? `${c.child}/${target[c.child].id}` : 'branch/br_1';
    assert.deepEqual(prepared.resource, { id: `planetscale/${resource}`, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: child confinement is not collection, resize, spend or wake authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'resizeAuthority', 'spendAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: bounded receipts omit configuration, costs, actors and times`, () => {
    const row = { ...rowFor(c), configuration: 'synthetic-canary', sku: 'synthetic-canary', cost: 'synthetic-canary',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', error: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', keyspace_id: 'unverified-parent' };
    const result = project(c, envelope([row]));
    assert.deepEqual(result, { items: [expectedFor(c)], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
    for (const key of ['rollback', 'closure', 'executionAuthority']) assert.equal(Object.hasOwn(result.items[0], key), false);
  });

  test(`${c.operation}: unknown or rebound child and malformed enums refuse whole page`, () => {
    const row = rowFor(c);
    assert.throws(() => project(c, envelope([row, { ...row, id: 'unknown' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope([{ ...row, [c.kind === 'bouncer' ? 'target' : 'state']: 'unknown' }])), { code: 'schema' });
    if (c.kind === 'bouncer') {
      assert.throws(() => project(c, envelope([{ ...row, name: 'other' }])), { code: 'scope' });
      for (const branch of [{ id: 'other', name: 'staging' }, { id: 'br_1', name: 'other' }]) {
        assert.throws(() => project(c, envelope([{ ...row, branch }])), { code: 'scope' });
      }
    }
    if (c.kind === 'bouncer-resize') for (const bouncer of [{ id: 'other', name: 'pool-one' }, { id: 'pool_1', name: 'other' }]) {
      assert.throws(() => project(c, envelope([{ ...row, bouncer }])), { code: 'scope' });
    }
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(row) }]) {
      assert.throws(() => project(c, { ...envelope([row]), ...patch }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: parents, nested bindings and pagination are captured and frozen`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.field][0].id = 'other'; target[c.field].push(...bindings(c, 1)); target.pagination.page = 3;
    if (c.child) { target[c.child].id = 'other'; target[c.child].name = 'other'; }
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], ...before.plan.target[c.field], before.plan.target.pagination,
      before.plan.proposedRequest, ...(c.child ? [before.plan.target[c.child]] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0].id = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field changes plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) for (const key of Object.keys(targetFor(c)[c.field][index])) {
      const target = targetFor(c); target[c.field][index][key] = 'other';
      if (c.child === 'bouncer' && key !== 'id') {
        target.bouncer[key === 'bouncerId' ? 'id' : 'name'] = 'other';
        for (const binding of target.resizes) binding[key] = 'other';
      }
      variants.push(target);
    }
    if (c.child === 'keyspace') for (const key of ['id', 'name']) {
      const target = targetFor(c); target.keyspace[key] = 'other'; variants.push(target);
    }
    for (const key of ['page', 'perPage']) {
      const target = targetFor(c); target.pagination[key] += 1; variants.push(target);
    }
    const reordered = targetFor(c); reordered[c.field].reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override host child, page, transport or authority`, () => {
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
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: bindings(c, 32) })({}).plan.target[c.field].length, 32);
  });
}

test('bouncer-specific resize collections confine every target pair, including same-name ID rebinding', () => {
  const c = cases[2];
  for (const key of ['bouncerId', 'bouncer']) {
    const target = targetFor(c); target.resizes[1][key] = 'other';
    assert.throws(() => c.bind(target), { code: 'scope' });
  }
  for (const key of ['id', 'name']) {
    const target = targetFor(c); target.bouncer[key] = 'other';
    assert.throws(() => c.bind(target), { code: 'scope' });
  }
});

test('branch-wide bouncer resize collection preserves independently bound multiple bouncers', () => {
  const c = cases[1]; const target = targetFor(c);
  target.resizes[1] = { id: 'record_2', bouncerId: 'pool_2', bouncer: 'pool-two' };
  assert.deepEqual(JSON.parse(JSON.stringify(c.bind(target)({}).plan.target)), target);
  const result = c.read(scopeFor(c, target), target.pagination).project(Buffer.from(JSON.stringify(envelope([
    rowFor(c), { id: 'record_2', state: 'pending', bouncer: { id: 'pool_2', name: 'pool-two' } },
  ]))));
  assert.equal(result.items[1].bouncerId, 'pool_2');
});

test('compute collection namespaces and child-only rebinding cannot collide', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 5);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 5);
  for (const c of cases) {
    const original = c.bind(targetFor(c))({}); const target = targetFor(c);
    target[c.field][0].id = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});
