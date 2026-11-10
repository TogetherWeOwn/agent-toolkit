import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetBouncerPreparation, bindGetBranchResizeRequestPreparation, bindGetKeyspaceResizeRequestPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as bouncerRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-bouncer.js';
import { prepare as branchResizeRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-resize-request.js';
import { prepare as keyspaceResizeRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-resize-request.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  branch: 'main', branchId: 'branch_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/main';
const cases = [
  { operation: 'get_bouncer', bind: bindGetBouncerPreparation, read: bouncerRead,
    target: () => ({ ...branch(), bouncer: { id: 'record_1', name: 'pooler' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, branchId: t.branchId, bouncer: t.bouncer }),
    resource: 'planetscale/bouncer/record_1', path: `${path}/bouncers/pooler`,
    identity: 'record-and-branch-ids-parent-not-verified',
    body: { id: 'record_1', name: 'pooler', branch: { id: 'branch_1', name: 'main' }, target: 'primary' },
    keys: ['id', 'name', 'branchId', 'branch', 'target'] },
  { operation: 'get_branch_resize_request', bind: bindGetBranchResizeRequestPreparation, read: branchResizeRead,
    target: () => ({ ...branch(), resize: { id: 'record_1' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, resize: t.resize }),
    resource: 'planetscale/branch-resize/record_1', path: `${path}/resizes/record_1`,
    identity: 'record-id-only-parent-not-verified', body: { id: 'record_1', state: 'completed' }, keys: ['id', 'state'] },
  { operation: 'get_keyspace_resize_request', bind: bindGetKeyspaceResizeRequestPreparation, read: keyspaceResizeRead,
    target: () => ({ ...branch(), keyspace: { id: 'keyspace_1', name: 'data' }, resize: { id: 'record_1' } }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, keyspace: t.keyspace, resize: t.resize }),
    resource: 'planetscale/keyspace-resize/record_1', path: `${path}/keyspaces/data/resizes/record_1`,
    identity: 'record-id-only-parent-not-verified', body: { id: 'record_1', state: 'completed' }, keys: ['id', 'state'] },
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
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains response identity/non-waking gaps without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: existing projection omits parent/configuration/price/actor canaries`, () => {
    const output = c.read(c.scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', keyspace_id: 'unverified-parent',
      parameters: { password: 'synthetic-canary' }, sku: 'synthetic-canary', price: 'synthetic-canary',
      actor: { name: 'synthetic-canary' }, created_at: 'synthetic-canary', error: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: existing projection refuses rebound record and bouncer branch identities`, () => {
    const read = c.read(c.scope(c.target()), {});
    for (const patch of [{ id: 'other' }, ...(c.body.branch
      ? [{ name: 'other' }, { branch: { id: 'other', name: 'main' } }, { branch: { id: 'branch_1', name: 'other' } }] : [])]) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...patch }))), { code: 'scope' });
    }
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
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { resize: { id: 'other' } },
      { parameters: { password: 'synthetic-canary' } }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { method: 'DELETE' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
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
      for (const patch of [{ authority: true }, { id: '../other' }, { [Symbol('scope')]: true }]) {
        const invalid = c.target();
        Object.assign(invalid[child], patch);
        refused(() => c.bind(invalid));
      }
    }
  });
}

test('bouncer, branch resize and keyspace resize namespaces stay distinct for identical IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
