import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListBranchChangeRequestsPreparation, bindListBranchConfigChangeRequestsPreparation,
  bindListKeyspaceConfigChangeRequestsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as changeRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-change-requests.js';
import { prepare as branchConfigRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-config-change-requests.js';
import { prepare as keyspaceConfigRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-keyspace-config-change-requests.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'list_branch_change_requests', bind: bindListBranchChangeRequestsPreparation, read: changeRead,
    path: `${root}/changes`, identity: 'record-id-only-parent-not-verified',
    binding: { id: 'change_1' }, row: { id: 'change_1', state: 'queued' } },
  { operation: 'list_branch_config_change_requests', bind: bindListBranchConfigChangeRequestsPreparation, read: branchConfigRead,
    path: `${root}/config-changes`, identity: 'record-and-target-binding-parent-not-verified',
    binding: { id: 'change_1', changeType: 'vtgate', keyspace: null },
    row: { id: 'change_1', state: 'applying', change_type: 'vtgate', keyspace_name: null } },
  { operation: 'list_keyspace_config_change_requests', bind: bindListKeyspaceConfigChangeRequestsPreparation, read: keyspaceConfigRead,
    path: `${root}/keyspaces/main/config-changes`, identity: 'record-and-target-binding-parent-not-verified', keyspace: true,
    binding: { id: 'change_1', changeType: 'mysqld', keyspace: 'main' },
    row: { id: 'change_1', state: 'failed', change_type: 'mysqld', keyspace_name: 'main' } },
];
const rows = (c, n) => Array.from({ length: n }, (_, i) => ({ ...c.binding, id: `change_${i + 1}` }));
const targetFor = c => ({ ...parent(), changes: rows(c, 2), pagination: { page: 2, perPage: 3 },
  ...(c.keyspace ? { keyspace: { id: 'ks_1', name: 'main' } } : {}) });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch,
  changes: t.changes, ...(c.keyspace ? { keyspace: t.keyspace } : {}) });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: immutable host parents and child bindings fix the collection GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.keyspace ? 'planetscale/keyspace/ks_1' : 'planetscale/branch/br_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: `${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: collection confinement is not execution or non-waking authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: scalar receipts omit configuration, errors, actors, times and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, parameters: 'synthetic-canary', new_options: 'synthetic-canary',
      previous_options: 'synthetic-canary', error_message: 'synthetic-canary', actor: 'synthetic-canary',
      completed_at: 'synthetic-canary', organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent' }]));
    const expected = { ...c.binding, state: c.row.state };
    assert.deepEqual(result, { items: [expected], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown or rebound children and malformed states refuse the whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    for (const state of ['unknown', null, false]) refused(() => project(c, envelope([{ ...c.row, state }])));
    if ('changeType' in c.binding) for (const patch of [{ change_type: 'other' }, { keyspace_name: 'other' }]) {
      assert.throws(() => project(c, envelope([c.row, { ...c.row, ...patch }])), { code: 'scope' });
    }
  });

  test(`${c.operation}: captured page and wire bounds refuse malformed upstream envelopes`, () => {
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
    assert.throws(() => project(c, [c.row]), { code: 'upstream' });
    const read = c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination);
    assert.throws(() => read.project(new Uint8Array(65537)), { code: 'upstream' });
  });

  test(`${c.operation}: captured parents, nested changes, keyspace and page cannot be rebound`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target.changes[0])) target.changes[0][key] = 'other';
    target.changes.push({ ...c.binding, id: 'other' }); target.pagination.page = 3;
    if (c.keyspace) { target.keyspace.id = 'other'; target.keyspace.name = 'other'; }
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target.changes, ...before.plan.target.changes, before.plan.target.pagination,
      before.plan.proposedRequest, ...(c.keyspace ? [before.plan.target.keyspace] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.changes[0].id = 'other'; }, TypeError);
  });

  test(`${c.operation}: every parent, child, page and keyspace field changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) {
      const target = targetFor(c); target.changes[index].id = 'other'; variants.push(target);
      if ('changeType' in c.binding) {
        const typed = targetFor(c);
        typed.changes[index] = { ...typed.changes[index], changeType: 'vttablet', keyspace: c.keyspace ? 'main' : 'other' };
        variants.push(typed);
        if (c.keyspace) {
          const renamed = targetFor(c); renamed.keyspace.name = 'other';
          for (const change of renamed.changes) change.keyspace = 'other'; variants.push(renamed);
        } else {
          const keyed = targetFor(c); keyed.changes[index] = { ...keyed.changes[index], changeType: 'mysqld', keyspace: 'main' };
          const rebound = structuredClone(keyed); rebound.changes[index].keyspace = 'other';
          assert.notEqual(canonicalHash(c.bind(keyed)({})), canonicalHash(c.bind(rebound)({})));
        }
      }
    }
    if (c.keyspace) { const target = targetFor(c); target.keyspace.id = 'other'; variants.push(target); }
    for (const key of ['page', 'perPage']) { const target = targetFor(c); target.pagination[key] += 1; variants.push(target); }
    const reordered = targetFor(c); reordered.changes.reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override children, pagination, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { changes: rows(c, 1) }, { page: 1 }, { perPage: 10 },
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
    for (const changes of [[], rows(c, 33), [c.binding, c.binding], [null], [{ ...c.binding, approved: true }]]) {
      refused(() => c.bind({ ...targetFor(c), changes }));
    }
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

test('branch config collection preserves mixed branch and keyspace types rather than applying detail-only restrictions', () => {
  const c = cases[1];
  const target = targetFor(c); target.changes[1] = { id: 'change_2', changeType: 'mysqld', keyspace: 'main' };
  const prepared = c.bind(target)({});
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target.changes)), target.changes);
  const result = c.read(scopeFor(c, target), target.pagination).project(Buffer.from(JSON.stringify(envelope([
    c.row, { id: 'change_2', change_type: 'mysqld', keyspace_name: 'main', state: 'applying' },
  ]))));
  assert.deepEqual(result.items, [{ ...target.changes[0], state: 'applying' }, { ...target.changes[1], state: 'applying' }]);
  for (const change of [{ id: 'change_1', changeType: 'vtgate', keyspace: 'main' },
    { id: 'change_1', changeType: 'mysqld', keyspace: null }]) {
    assert.throws(() => c.bind({ ...targetFor(c), changes: [change] }), { code: 'scope' });
  }
});

test('keyspace config collections require exact keyspace and non-branch types for every child', () => {
  const c = cases[2];
  for (const change of [{ id: 'change_2', changeType: 'vtgate', keyspace: null },
    { id: 'change_2', changeType: 'mysqld', keyspace: 'other' }]) {
    assert.throws(() => c.bind({ ...targetFor(c), changes: [c.binding, change] }), { code: 'scope' });
  }
  assert.doesNotThrow(() => c.bind({ ...targetFor(c), changes: [{ ...c.binding, changeType: 'vttablet' }] }));
});

test('change collection namespaces and child-only rebindings remain distinct in both hashes', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
  for (const c of cases) {
    const target = targetFor(c); target.changes[0].id = 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});
