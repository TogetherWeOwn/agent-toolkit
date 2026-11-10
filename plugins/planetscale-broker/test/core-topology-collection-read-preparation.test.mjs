import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListKeyspacesPreparation, bindListShardsPreparation,
  bindListMaintenanceEventsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as keyspaceRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-keyspaces.js';
import { prepare as shardRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-shards.js';
import { prepare as eventRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-maintenance-events.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  revision: 'a'.repeat(64), pagination: { page: 2, perPage: 3 } });
const branch = () => ({ ...database(), branch: 'sample-branch', branchId: 'branch_1' });
const root = '/v1/organizations/sample-org/databases/sample-db';
const cases = [
  { operation: 'list_keyspaces', bind: bindListKeyspacesPreparation, read: keyspaceRead, parent: branch, field: 'keyspaces',
    child: i => ({ id: `keyspace_${i}`, name: `keyspace-${i}` }), resource: 'planetscale/branch/branch_1',
    path: `${root}/branches/sample-branch/keyspaces`, identity: 'record-and-name-parent-not-verified',
    row: { id: 'keyspace_1', name: 'keyspace-1', sharded: true, external: false, ready: true, resizing: false, default: false },
    malformed: { ready: 'true' } },
  { operation: 'list_shards', bind: bindListShardsPreparation, read: shardRead, parent: branch, field: 'shards',
    child: i => ({ id: `shard_${i}` }), resource: 'planetscale/branch/branch_1',
    path: `${root}/branches/sample-branch/shards`, identity: 'record-id-only-parent-not-verified',
    row: { id: 'shard_1', ready: true, authoritative: false }, malformed: { authoritative: 'true' } },
  { operation: 'list_maintenance_events', bind: bindListMaintenanceEventsPreparation, read: eventRead, parent: database, field: 'events',
    child: i => ({ id: `event_${i}`, branchId: `branch_${i}`, branch: `branch-${i}` }), resource: 'planetscale/database/db_1',
    path: `${root}/maintenance-events`, identity: 'record-and-branch-ids-parent-not-verified',
    row: { id: 'event_1', branch: { id: 'branch_1', name: 'branch-1' }, state: 'scheduled', urgent: true },
    output: { id: 'event_1', branchId: 'branch_1', branch: 'branch-1', state: 'scheduled', urgent: true }, malformed: { urgent: 'true' } },
];
const targetFor = c => ({ ...c.parent(), [c.field]: [c.child(1), c.child(2)] });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database,
  ...(c.field !== 'events' ? { branch: t.branch } : {}), [c.field]: t[c.field] });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: host parent, child bindings and page produce a fixed GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
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

  test(`${c.operation}: confinement never grants collection, topology, maintenance or non-waking authority`, () => {
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

  test(`${c.operation}: projections omit secrets, config, raw schedules, actors and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, password: 'synthetic-canary', connection_url: 'synthetic-canary',
      schedule: 'synthetic-canary', config: { token: 'synthetic-canary' }, started_at: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', actor: 'synthetic-canary' }]));
    assert.deepEqual(result, { items: [c.output ?? c.row], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown children, strict flags and mismatched pagination refuse whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope([{ ...c.row, ...c.malformed }])), { code: 'upstream' });
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: [c.row, c.row, c.row, c.row] }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: captures deeply immutable host children and pagination`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.field][0].id = 'other';
    target[c.field].push(c.child(3));
    target.pagination.page = 3;
    target.pagination.perPage = 10;
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], ...before.plan.target[c.field], before.plan.target.pagination,
      before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0].id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.pagination.page = 3; }, TypeError);
  });

  test(`${c.operation}: every host parent, child, revision and page field changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [];
    for (const key of Object.keys(c.parent()).filter(k => k !== 'pagination')) {
      variants.push({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' });
    }
    for (const key of ['page', 'perPage']) {
      const target = targetFor(c);
      target.pagination[key] += 1;
      variants.push(target);
    }
    for (const index of [0, 1]) {
      for (const key of Object.keys(c.child(1))) {
        const target = targetFor(c);
        target[c.field][index][key] = 'other';
        variants.push(target);
      }
    }
    const reordered = targetFor(c);
    reordered[c.field].reverse();
    variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override bindings, pagination, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: [c.child(1)] }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
      refused(() => prepare(raw));
    }
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing, extra, unsafe and accessor host fields refuse without evaluation`, () => {
    for (const raw of [null, [], {}, { ...targetFor(c), approved: true }, { ...targetFor(c), credential: 'synthetic-canary' },
      { ...targetFor(c), revision: 'latest' }, { ...targetFor(c), [Symbol('scope')]: true },
      Object.defineProperty(targetFor(c), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c);
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });

  test(`${c.operation}: child allowlists and pagination are unique, bounded and closed`, () => {
    const rows = n => Array.from({ length: n }, (_, i) => c.child(i + 1));
    for (const children of [[], rows(33), [c.child(1), c.child(1)], ['../escape'],
      [{ ...c.child(1), approved: true }], [{ ...c.child(1), id: '../escape' }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    }
    for (const key of Object.keys(c.child(1))) {
      const row = c.child(1);
      delete row[key];
      refused(() => c.bind({ ...targetFor(c), [c.field]: [row] }));
      let touched = false;
      const accessor = Object.defineProperty(c.child(1), key, { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind({ ...targetFor(c), [c.field]: [accessor] }));
      assert.equal(touched, false);
    }
    let touched = false;
    const children = rows(2);
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return c.child(1); } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    assert.equal(touched, false);
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: rows(32), pagination: { page: 100, perPage: 10 } })({}).plan.target[c.field].length, 32);
  });
}

test('topology collection plans distinguish operations sharing a branch resource', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(prepared[0].resource.id, prepared[1].resource.id);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('topology child rebinding changes hashes without changing the upstream collection request', () => {
  for (const c of cases) {
    const original = c.bind(targetFor(c))({});
    const target = targetFor(c);
    target[c.field][0].id = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});

test('keyspace names and maintenance branch tuples match independently without proving parent ownership', () => {
  assert.throws(() => project(cases[0], envelope([{ ...cases[0].row, name: 'other' }])), { code: 'scope' });
  const c = cases[2];
  for (const branch of [{ id: 'other', name: 'branch-1' }, { id: 'branch_1', name: 'other' }]) {
    assert.throws(() => project(c, envelope([{ ...c.row, branch }])), { code: 'scope' });
  }
  assert.throws(() => project(c, envelope([{ ...c.row, state: 'unknown' }])), { code: 'schema' });
  const result = project(c, envelope([{ ...c.row, approved: true, database_id: 'unverified' }]));
  assert.deepEqual(result.items[0], c.output);
  assert.equal(Object.hasOwn(result.items[0], 'approved'), false);
  assert.equal(Object.hasOwn(result.items[0], 'databaseId'), false);
});
