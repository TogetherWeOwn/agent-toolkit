import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetRouterPreparation, bindGetDedicatedReadReplicaPreparation, bindGetSwitchoverPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as routerRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-router.js';
import { prepare as replicaRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-dedicated-read-replica.js';
import { prepare as switchoverRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-switchover.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  branch: 'main', branchId: 'branch_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/main';
const cases = [
  { operation: 'get_router', bind: bindGetRouterPreparation, read: routerRead,
    target: () => ({ ...branch(), router: { id: 'record_1', name: 'router-one' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, router: t.router }),
    resource: 'planetscale/router/record_1', path: `${path}/routers/router-one`,
    body: { id: 'record_1', name: 'router-one', state: 'ready', default: true, autoscaling: false },
    keys: ['id', 'name', 'state', 'default', 'autoscaling'] },
  { operation: 'get_dedicated_read_replica', bind: bindGetDedicatedReadReplicaPreparation, read: replicaRead,
    target: () => ({ ...branch(), replica: { id: 'record_1', name: 'replica-one' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, replica: t.replica }),
    resource: 'planetscale/dedicated-read-replica/record_1', path: `${path}/dedicated-read-replicas/replica-one`,
    body: { id: 'record_1', name: 'replica-one', state: 'ready', ready: true }, keys: ['id', 'name', 'state', 'ready'] },
  { operation: 'get_switchover', bind: bindGetSwitchoverPreparation, read: switchoverRead,
    target: () => ({ ...branch(), switchoverId: 'record_1' }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, switchoverId: t.switchoverId }),
    resource: 'planetscale/switchover/record_1', path: `${path}/switchovers/record_1`,
    body: { id: 'record_1', state: 'failed', started_at: null, completed_at: null },
    keys: ['id', 'state', 'startRecorded', 'finishRecorded'] },
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

  test(`${c.operation}: existing projection omits parent/configuration/connection/actor canaries`, () => {
    const output = c.read(c.scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent',
      parameters: { password: 'synthetic-canary' }, connection: 'synthetic-canary', sku: 'synthetic-canary',
      actor: { name: 'synthetic-canary' }, error: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: existing projection refuses rebound child ID/name and unknown states`, () => {
    const read = c.read(c.scope(c.target()), {});
    for (const patch of [{ id: 'other' }, ...(c.body.name ? [{ name: 'other' }] : [])]) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...patch }))), { code: 'scope' });
    }
    refused(() => read.project(Buffer.from(JSON.stringify({ ...c.body, state: 'unknown' }))));
  });

  test(`${c.operation}: captured nested target and request remain immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of nested(target)) for (const field of Object.keys(target[key])) target[key][field] = 'other';
    target.organization = 'other';
    target.branchId = 'other';
    if (target.switchoverId) target.switchoverId = 'other';
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.proposedRequest, ...nested(before.plan.target).map(key => before.plan.target[key])]) {
      assert.ok(Object.isFrozen(value));
    }
    for (const key of nested(before.plan.target)) assert.throws(() => { before.plan.target[key].id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent/child/revision field affects plan and full hashes`, () => {
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
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { switchoverId: 'other' },
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

test('router, replica and switchover namespaces stay distinct for identical IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
