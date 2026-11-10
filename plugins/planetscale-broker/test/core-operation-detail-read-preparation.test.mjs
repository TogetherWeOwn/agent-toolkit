import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetChangeRequestPreparation, bindGetVtctldOperationPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as changeRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-change-request.js';
import { prepare as operationRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-vtctld-operation.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64) });
const change = () => ({ id: 'record_1', type: 'NekiRouterChangeRequest', targetId: 'target_1',
  targetType: 'NekiRouter', targetName: 'router-one' });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'get_change_request', bind: bindGetChangeRequestPreparation, read: changeRead,
    target: () => ({ ...branch(), change: change() }), selected: t => ({ change: t.change }),
    resource: 'planetscale/change-request/record_1', path: `${path}/change-requests/record_1`,
    identity: 'record-and-target-binding-parent-not-verified',
    body: { id: 'record_1', type: 'NekiRouterChangeRequest', target_id: 'target_1', target_type: 'NekiRouter',
      target_name: 'router-one', state: 'applying', can_delete: false },
    output: { ...change(), state: 'applying', canDelete: false }, invalid: { state: 'queued' }, invalidCode: 'schema' },
  { operation: 'get_vtctld_operation', bind: bindGetVtctldOperationPreparation, read: operationRead,
    target: () => ({ ...branch(), operationId: 'record_1' }), selected: t => ({ operationId: t.operationId }),
    resource: 'planetscale/vtctld-operation/record_1', path: `${path}/vtctld/operations/record_1`,
    identity: 'record-id-only-parent-not-verified',
    body: { id: 'record_1', type: 'VtctldOperation', state: 'failed', completed_at: null },
    output: { id: 'record_1', state: 'failed', completionRecorded: false, executionAuthority: 'not-established' },
    invalid: { completed_at: true }, invalidCode: 'upstream' },
];
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch, ...c.selected(t) });
const project = (c, body) => c.read(scopeFor(c, c.target()), {}).project(Buffer.from(JSON.stringify(body)));

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable parents, record, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains identity/non-waking gaps without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits action/configuration/result/error canaries`, () => {
    const output = project(c, { ...c.body, organization_id: 'unverified-parent', database_id: 'unverified-parent',
      branch_id: 'unverified-parent', action: 'synthetic-canary', metadata: { value: 'synthetic-canary' },
      results: ['synthetic-canary'], error: 'synthetic-canary', parameters: { value: 'synthetic-canary' },
      actor: 'synthetic-canary', created_at: 'synthetic-canary', completed: 'synthetic-canary',
      executionAuthority: 'synthetic-canary' });
    assert.deepEqual(output, c.output);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses rebound identity and malformed fields`, () => {
    assert.throws(() => project(c, { ...c.body, id: 'other' }), { code: 'scope' });
    assert.throws(() => project(c, { ...c.body, ...c.invalid }), { code: c.invalidCode });
  });

  test(`${c.operation}: captured target and request remain deeply immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    if (target.change) target.change.targetId = 'other';
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest,
      ...(before.plan.target.change ? [before.plan.target.change] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.branchId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
    if (before.plan.target.change) assert.throws(() => { before.plan.target.change.id = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field affects plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      if (key === 'change') continue;
      const prepared = c.bind({ ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
    if (target.change) for (const patch of [{ id: 'other' }, { targetId: 'other' }, { targetName: 'other' },
      { targetId: null }, { type: 'NekiAdminChangeRequest', targetType: 'NekiAdmin' }]) {
      const prepared = c.bind({ ...c.target(), change: { ...change(), ...patch } })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/selectors/authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { branchId: 'other' },
      { change: change() }, { operationId: 'other' }, { state: 'completed' }, { canDelete: true },
      { resource: 'other' }, { revision: 'b'.repeat(64) }, { method: 'POST' },
      { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), branch: '../other' },
      { ...c.target(), [Symbol('scope')]: true }, Object.defineProperty(c.target(), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });
}

test('change preparation reuses exact target/type pairs without cancellation state restrictions', () => {
  const c = cases[0];
  for (const type of ['NekiAdmin', 'NekiCluster', 'NekiConfigurationProfile', 'NekiExternalShard', 'NekiRouter', 'PostgresBouncer']) {
    const binding = { ...change(), type: `${type}ChangeRequest`, targetType: type };
    const prepared = c.bind({ ...c.target(), change: binding })({});
    assert.equal(prepared.plan.target.change.targetType, type);
  }
  assert.throws(() => c.bind({ ...c.target(), change: { ...change(), targetType: 'NekiAdmin' } }), { code: 'scope' });
  for (const state of ['draft', 'pending', 'applying', 'canceled', 'completed']) {
    assert.equal(project(c, { ...c.body, state, can_delete: false }).state, state);
  }
});

test('change preparation preserves null target identity without claiming a resource', () => {
  const c = cases[0];
  const target = { ...c.target(), change: { ...change(), targetId: null } };
  const prepared = c.bind(target)({});
  assert.equal(prepared.plan.target.change.targetId, null);
  const read = c.read(scopeFor(c, target), {});
  const output = read.project(Buffer.from(JSON.stringify({ ...c.body, target_id: null })));
  assert.equal(output.targetId, null);
  assert.throws(() => read.project(Buffer.from(JSON.stringify(c.body))), { code: 'scope' });
});

test('change preparation requires closed non-accessor nested target identity', () => {
  const c = cases[0];
  for (const binding of [null, [], {}, { ...change(), targetId: '../other' },
    { ...change(), state: 'pending' }, { ...change(), type: 'other' },
    { ...change(), [Symbol('scope')]: true }, Object.defineProperty(change(), 'hidden', { value: true })]) {
    refused(() => c.bind({ ...c.target(), change: binding }));
  }
  for (const key of Object.keys(change())) {
    const missing = change();
    delete missing[key];
    refused(() => c.bind({ ...c.target(), change: missing }));
    let touched = false;
    const binding = Object.defineProperty(change(), key, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...c.target(), change: binding }));
    assert.equal(touched, false);
  }
});

test('change projection matches all target identity fields; can-delete never grants authority', () => {
  const c = cases[0];
  for (const patch of [{ type: 'NekiAdminChangeRequest' }, { target_type: 'NekiAdmin' },
    { target_id: null }, { target_id: 'other' }, { target_name: 'other' }]) {
    assert.throws(() => project(c, { ...c.body, ...patch }), { code: 'scope' });
  }
  assert.throws(() => project(c, { ...c.body, can_delete: 'true' }), { code: 'upstream' });
  assert.deepEqual(project(c, { ...c.body, can_delete: true }), { ...c.output, canDelete: true });
});

test('vtctld projection requires exact type and treats completion strings as presence only', () => {
  const c = cases[1];
  assert.throws(() => project(c, { ...c.body, type: 'OtherOperation' }), { code: 'scope' });
  for (const [completed_at, completionRecorded] of [[null, false], ['', false], ['not-a-time', true]]) {
    assert.deepEqual(project(c, { ...c.body, completed_at }), { ...c.output, completionRecorded });
  }
});

test('change and vtctld preparations keep separate resources for equal record IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
});
