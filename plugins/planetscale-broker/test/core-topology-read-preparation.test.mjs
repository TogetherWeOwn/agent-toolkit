import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetKeyspacePreparation, bindGetShardPreparation, bindGetMaintenanceEventPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as keyspaceRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace.js';
import { prepare as shardRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-shard.js';
import { prepare as eventRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-maintenance-event.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1', revision: 'a'.repeat(64) });
const branch = () => ({ ...database(), branch: 'feature', branchId: 'branch_1' });
const refused = fn => assert.throws(fn, { code: 'schema' });
const cases = [
  { operation: 'get_keyspace', kind: 'keyspace', child: 'keyspace', bind: bindGetKeyspacePreparation, read: keyspaceRead,
    target: () => ({ ...branch(), keyspace: { id: 'keyspace_1', name: 'main' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, keyspace: t.keyspace }),
    path: '/v1/organizations/sample-org/databases/sample-db/branches/feature/keyspaces/main',
    identity: 'record-id-only-parent-not-verified',
    body: { id: 'keyspace_1', name: 'main', sharded: false, external: false, ready: true, resizing: false, default: true },
    mismatches: [{ id: 'other' }, { name: 'other' }] },
  { operation: 'get_shard', kind: 'shard', child: 'shard', bind: bindGetShardPreparation, read: shardRead,
    target: () => ({ ...branch(), shard: { id: 'shard_1' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, shard: t.shard }),
    path: '/v1/organizations/sample-org/databases/sample-db/branches/feature/shards/shard_1',
    identity: 'record-id-only-parent-not-verified',
    body: { id: 'shard_1', ready: true, authoritative: true }, mismatches: [{ id: 'other' }] },
  { operation: 'get_maintenance_event', kind: 'maintenance-event', child: 'event', bind: bindGetMaintenanceEventPreparation, read: eventRead,
    target: () => ({ ...database(), event: { id: 'event_1', branchId: 'branch_1', branch: 'feature' } }),
    scope: t => ({ organization: t.organization, database: t.database, event: t.event }),
    path: '/v1/organizations/sample-org/databases/sample-db/maintenance-events/event_1',
    identity: 'record-and-branch-ids-parent-not-verified',
    body: { id: 'event_1', branch: { id: 'branch_1', name: 'feature' }, state: 'scheduled', urgent: true },
    mismatches: [{ id: 'other' }, { branch: { id: 'other', name: 'feature' } }, { branch: { id: 'branch_1', name: 'other' } }] },
];

for (const c of cases) {
  test(`${c.operation}: core preparation binds every identity and existing fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: `planetscale/${c.kind}/${target[c.child].id}`, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.equal(Object.getPrototypeOf(prepared.plan.target[c.child]), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${c.operation}: preparation retains identity limits without execution or non-waking authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
    const output = c.read(c.scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      database_id: 'unverified-parent', branch_id: 'unverified-parent', password: 'synthetic-canary' })));
    assert.equal(output.id, c.target()[c.child].id);
    for (const key of ['database_id', 'branch_id', 'password']) assert.equal(Object.hasOwn(output, key), false);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
  });

  test(`${c.operation}: existing projection refuses mismatched response identity`, () => {
    const read = c.read(c.scope(c.target()), {});
    for (const mismatch of c.mismatches) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...mismatch }))), { code: 'scope' });
    }
  });

  test(`${c.operation}: deeply captured host targets and requests are immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.child].id = 'other';
    target[c.child] = { id: 'replacement' };
    target.databaseId = 'other';
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.child], before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.child].id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent, nested binding and revision changes plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    const paths = Object.keys(target).flatMap(key => key === c.child ? Object.keys(target[c.child]).map(child => [key, child]) : [[key]]);
    for (const path of paths) {
      const changed = structuredClone(target);
      const parent = path.length === 1 ? changed : changed[c.child];
      const key = path.at(-1);
      parent[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan), path.join('.'));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared), path.join('.'));
    }
  });

  test(`${c.operation}: caller cannot supply scope, requests, credentials or authority`, () => {
    const prepare = c.bind(c.target());
    for (const args of [null, [], { target: c.target() }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { approved: true }, { artifactDigest: 'b'.repeat(64) }, { url: 'https://example.invalid' },
      { method: 'DELETE' }, { page: 2 }, { credential: 'synthetic-canary' }]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
    refused(() => prepare(Object.defineProperty({}, 'hidden', { value: true })));
    refused(() => prepare({ [Symbol('scope')]: true }));
  });

  test(`${c.operation}: incomplete, extra and unsafe host bindings refuse without accessors`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' },
      { ...c.target(), databaseId: '../other' }]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const target = c.target();
      delete target[key];
      refused(() => c.bind(target));
    }
    for (const key of Object.keys(c.target()[c.child])) {
      const target = c.target();
      delete target[c.child][key];
      refused(() => c.bind(target));
    }
    for (const value of [null, [], { ...c.target()[c.child], id: '../other' }, { ...c.target()[c.child], approved: true }]) {
      refused(() => c.bind({ ...c.target(), [c.child]: value }));
    }
    for (const nested of [false, true]) {
      let touched = false;
      const target = c.target();
      Object.defineProperty(nested ? target[c.child] : target, nested ? 'id' : 'databaseId',
        { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind(target));
      assert.equal(touched, false);
    }
  });
}

test('topology detail resources retain separate namespaces for identical provider IDs', () => {
  const prepared = cases.map(c => {
    const target = c.target();
    target[c.child].id = 'shared_1';
    return c.bind(target)({});
  });
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
