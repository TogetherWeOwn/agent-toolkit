import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetBranchChangeRequestPreparation, bindGetBranchConfigChangeRequestPreparation, bindGetKeyspaceConfigChangeRequestPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as branchRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-change-request.js';
import { prepare as branchConfigRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-config-change-request.js';
import { prepare as keyspaceConfigRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-config-change-request.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  branch: 'main', branchId: 'branch_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/main';
const cases = [
  { operation: 'get_branch_change_request', bind: bindGetBranchChangeRequestPreparation, read: branchRead,
    target: () => ({ ...branch(), change: { id: 'change_1' } }), resource: 'planetscale/branch-change/change_1',
    path: `${path}/changes/change_1`, body: { id: 'change_1', state: 'completed' }, keys: ['id', 'state'] },
  { operation: 'get_branch_config_change_request', bind: bindGetBranchConfigChangeRequestPreparation, read: branchConfigRead,
    target: () => ({ ...branch(), change: { id: 'change_1', changeType: 'vtgate', keyspace: null } }),
    resource: 'planetscale/branch-config-change/change_1', path: `${path}/config-changes/change_1`,
    body: { id: 'change_1', state: 'completed', change_type: 'vtgate', keyspace_name: null },
    keys: ['id', 'state', 'changeType', 'keyspace'] },
  { operation: 'get_keyspace_config_change_request', bind: bindGetKeyspaceConfigChangeRequestPreparation, read: keyspaceConfigRead,
    target: () => ({ ...branch(), keyspace: { id: 'keyspace_1', name: 'data' },
      change: { id: 'change_1', changeType: 'mysqld', keyspace: 'data' } }),
    resource: 'planetscale/keyspace-config-change/change_1', path: `${path}/keyspaces/data/config-changes/change_1`,
    body: { id: 'change_1', state: 'completed', change_type: 'mysqld', keyspace_name: 'data' },
    keys: ['id', 'state', 'changeType', 'keyspace'] },
];
const scope = target => ({ organization: target.organization, database: target.database, branch: target.branch,
  change: target.change, ...(target.keyspace ? { keyspace: target.keyspace } : {}) });

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable IDs, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.equal(Object.getPrototypeOf(prepared.plan.target.change), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scope(target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains parent/non-waking gaps without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: existing projection omits parent/configuration/actor canaries`, () => {
    const output = c.read(scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent',
      keyspace_id: 'unverified-parent', parameters: { password: 'synthetic-canary' },
      new_config: 'synthetic-canary', previous_config: 'synthetic-canary', error: 'synthetic-canary',
      actor: { name: 'synthetic-canary' }, sku: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses rebound record/type/keyspace`, () => {
    const read = c.read(scope(c.target()), {});
    for (const patch of [{ id: 'other' }, ...(c.body.change_type
      ? [{ change_type: 'unknown' }, { keyspace_name: 'other' }] : [])]) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...patch }))), { code: 'scope' });
    }
  });

  test(`${c.operation}: captured nested target and request remain immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    target.change.id = 'other';
    if (target.change.changeType) target.change.changeType = 'vttablet';
    if (target.keyspace) { target.keyspace.id = 'other'; target.keyspace.name = 'other'; target.change.keyspace = 'other'; }
    target.organization = 'other';
    target.branchId = 'other';
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target.change, before.plan.proposedRequest, ...(before.plan.target.keyspace ? [before.plan.target.keyspace] : [])]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target.change.id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent/change/keyspace/revision field affects hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    const variations = Object.keys(target).filter(key => !['change', 'keyspace'].includes(key))
      .map(key => ({ ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    variations.push({ ...c.target(), change: { ...target.change, id: 'other' } });
    if (target.keyspace) variations.push(
      { ...c.target(), keyspace: { ...target.keyspace, id: 'other' } },
      { ...c.target(), keyspace: { ...target.keyspace, name: 'other' }, change: { ...target.change, keyspace: 'other' } },
      { ...c.target(), change: { ...target.change, changeType: 'vttablet' } },
    );
    for (const changed of variations) {
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/configuration/authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { change: { id: 'other' } }, { approved: true },
      { parameters: { password: 'synthetic-canary' } }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { method: 'DELETE' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe host fields and nested accessors refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' }]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const child of ['change', ...(c.target().keyspace ? ['keyspace'] : [])]) {
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
      const extra = c.target();
      extra[child].authority = true;
      refused(() => c.bind(extra));
      const unsafe = c.target();
      unsafe[child].id = '../other';
      refused(() => c.bind(unsafe));
    }
  });
}

test('branch config preparation refuses keyspace-only type/binding pairs', () => {
  for (const change of [{ id: 'change_1', changeType: 'mysqld', keyspace: 'data' },
    { id: 'change_1', changeType: 'vttablet', keyspace: 'data' },
    { id: 'change_1', changeType: 'vtgate', keyspace: 'data' },
    { id: 'change_1', changeType: 'mysqld', keyspace: null }]) {
    assert.throws(() => bindGetBranchConfigChangeRequestPreparation({ ...branch(), change }), { code: 'scope' });
  }
});

test('keyspace config preparation refuses parent/type mismatches', () => {
  for (const change of [{ id: 'change_1', changeType: 'vtgate', keyspace: null },
    { id: 'change_1', changeType: 'mysqld', keyspace: 'other' },
    { id: 'change_1', changeType: 'vttablet', keyspace: 'other' }]) {
    assert.throws(() => bindGetKeyspaceConfigChangeRequestPreparation({ ...cases[2].target(), change }), { code: 'scope' });
  }
});

test('keyspace config preparation preserves both documented keyspace types', () => {
  for (const changeType of ['mysqld', 'vttablet']) {
    const target = cases[2].target();
    target.change.changeType = changeType;
    const prepared = cases[2].bind(target)({});
    assert.equal(prepared.plan.target.change.changeType, changeType);
    const output = keyspaceConfigRead(scope(target), {}).project(Buffer.from(JSON.stringify({ ...cases[2].body, change_type: changeType })));
    assert.equal(output.changeType, changeType);
  }
});

test('change and configuration resource namespaces stay distinct for identical IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
