import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListRoutersPreparation, bindListDedicatedReadReplicasPreparation,
  bindListSwitchoversPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as routerRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-routers.js';
import { prepare as replicaRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-dedicated-read-replicas.js';
import { prepare as switchoverRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-switchovers.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'list_routers', bind: bindListRoutersPreparation, read: routerRead, field: 'routers',
    path: `${root}/routers`, identity: 'record-and-name-parent-not-verified',
    row: { id: 'record_1', name: 'child-one', state: 'ready', default: false, autoscaling: true },
    malformed: { autoscaling: 'true' }, code: 'upstream' },
  { operation: 'list_dedicated_read_replicas', bind: bindListDedicatedReadReplicasPreparation, read: replicaRead,
    field: 'replicas', path: `${root}/dedicated-read-replicas`, identity: 'record-and-name-parent-not-verified',
    row: { id: 'record_1', name: 'child-one', state: 'ready', ready: true },
    malformed: { ready: 'true' }, code: 'upstream' },
  { operation: 'list_switchovers', bind: bindListSwitchoversPreparation, read: switchoverRead,
    field: 'switchoverIds', paged: true, path: `${root}/switchovers?page=2&per_page=3`,
    identity: 'record-id-only-parent-not-verified',
    row: { id: 'record_1', state: 'failed', started_at: '2026-01-01T00:00:00Z', completed_at: null },
    output: { id: 'record_1', state: 'failed', startRecorded: true, finishRecorded: false },
    malformed: { started_at: false }, code: 'schema' },
];
const rows = (c, n) => Array.from({ length: n }, (_, i) => c.paged ? `record_${i + 1}` :
  { id: `record_${i + 1}`, name: `child-${i + 1}` });
const targetFor = c => ({ ...parent(), [c.field]: c.paged ? ['record_1', 'record_2'] :
  [{ id: 'record_1', name: 'child-one' }, { id: 'record_2', name: 'child-two' }],
  ...(c.paged ? { pagination: { page: 2, perPage: 3 } } : {}) });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch, [c.field]: t[c.field] });
const envelope = (c, data) => c.paged ? { current_page: 2, per_page: 3, next_page: 3, data } : data;
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), c.paged ? targetFor(c).pagination : {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: immutable host parents and children bind the exact collection GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/br_1', revision: target.revision });
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

  test(`${c.operation}: confinement is not collection, execution or non-waking authority`, () => {
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

  test(`${c.operation}: scalar receipts omit config, costs, actors, times and parent claims`, () => {
    const result = project(c, envelope(c, [{ ...c.row, configuration: 'synthetic-canary', sku: 'synthetic-canary',
      connection: 'synthetic-canary', cost: 'synthetic-canary', error: 'synthetic-canary', actor: 'synthetic-canary',
      created_at: 'synthetic-canary', organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent' }]));
    const expected = c.output ?? c.row;
    assert.deepEqual(result, c.paged ? { items: [expected], nextPage: 3, complete: false } : [expected]);
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    const items = c.paged ? result.items : result;
    for (const value of [result, items, items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, c.paged ? { ...envelope(c, []), next_page: null } : []),
      c.paged ? { items: [], nextPage: null, complete: true } : []);
  });

  test(`${c.operation}: unknown children, rebound names and malformed fields refuse whole response`, () => {
    assert.throws(() => project(c, envelope(c, [c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    if (!c.paged) assert.throws(() => project(c, [{ ...c.row, name: 'child-two' }]), { code: 'scope' });
    assert.throws(() => project(c, envelope(c, [{ ...c.row, ...c.malformed }])), { code: c.code });
    assert.throws(() => project(c, envelope(c, [{ ...c.row, state: 'unknown' }])), { code: 'schema' });
    if (c.paged) {
      for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
        assert.throws(() => project(c, { ...envelope(c, [c.row]), ...patch }), { code: 'upstream' });
      }
    } else {
      assert.throws(() => project(c, { data: [c.row] }), { code: 'upstream' });
      assert.throws(() => project(c, Array(33).fill(c.row)), { code: 'upstream' });
    }
  });

  test(`${c.operation}: captured parents, nested children and pagination cannot be rebound`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    if (c.paged) { target[c.field][0] = 'other'; target.pagination.page = 3; }
    else { target[c.field][0].id = 'other'; target[c.field][0].name = 'other'; }
    target[c.field].push(...rows(c, 1));
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    const nested = before.plan.target[c.field];
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, nested,
      before.plan.proposedRequest, ...(c.paged ? [before.plan.target.pagination] : nested)]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { nested[0] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every parent, revision, child and page field changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) {
      for (const key of c.paged ? ['id'] : ['id', 'name']) {
        const target = targetFor(c);
        if (c.paged) target[c.field][index] = 'other'; else target[c.field][index][key] = 'other';
        variants.push(target);
      }
    }
    if (c.paged) for (const key of ['page', 'perPage']) {
      const target = targetFor(c); target.pagination[key] += 1; variants.push(target);
    }
    const reordered = targetFor(c); reordered[c.field].reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override child, page, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: rows(c, 1) }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host bindings are closed, bounded, unique and data-only`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const children of [[], rows(c, 33), [rows(c, 1)[0], rows(c, 1)[0]], [null]]) refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    if (!c.paged) for (const children of [[{ id: 'record_1', name: 'one' }, { id: 'record_1', name: 'two' }],
      [{ id: 'record_1', name: 'one' }, { id: 'record_2', name: 'one' }], [{ id: 'record_1', name: 'one', approved: true }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    }
    const children = rows(c, 2); let touched = false;
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children })); assert.equal(touched, false);
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: rows(c, 32) })({}).plan.target[c.field].length, 32);
  });
}

test('plain-array router and replica lists reject invented host pagination; switchovers require a bounded page', () => {
  for (const c of cases.slice(0, 2)) refused(() => c.bind({ ...targetFor(c), pagination: { page: 1, perPage: 10 } }));
  const c = cases[2];
  for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
    { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
});

test('routing collection namespaces differ even when bound parent and children match', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
  for (const c of cases) {
    const target = targetFor(c);
    if (c.paged) target[c.field][0] = 'other'; else target[c.field][0].id = 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});

test('failed switchovers and completion presence do not establish rollback or closure', () => {
  const c = cases[2];
  const result = project(c, envelope(c, [{ ...c.row, completed_at: '2026-01-01T00:00:01Z' }]));
  assert.deepEqual(result.items[0], { ...c.output, finishRecorded: true });
  for (const key of ['rollback', 'closure', 'executionAuthority']) assert.equal(Object.hasOwn(result.items[0], key), false);
});
