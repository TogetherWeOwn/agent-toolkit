import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetMaintenanceSchedulePreparation, bindGetBranchMaintenanceWindowPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as scheduleRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-maintenance-schedule.js';
import { prepare as branchRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-maintenance-window.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', revision: 'a'.repeat(64), scheduleId: 'schedule_1' });
const branch = () => ({ ...database(), branch: 'staging', branchId: 'branch_1' });
const path = '/v1/organizations/sample-org/databases/sample-db';
const cases = [
  { operation: 'get_maintenance_schedule', bind: bindGetMaintenanceSchedulePreparation, read: scheduleRead,
    target: database, path: `${path}/maintenance-schedules/schedule_1` },
  { operation: 'get_branch_maintenance_window', bind: bindGetBranchMaintenanceWindowPreparation, read: branchRead,
    target: branch, path: `${path}/branches/staging/maintenance-window` },
];
const scopeFor = t => ({ organization: t.organization, database: t.database, scheduleId: t.scheduleId,
  ...(t.branch ? { branch: t.branch } : {}) });
const body = { id: 'schedule_1', enabled: true, required: false, frequency_unit: 'week' };
const output = { id: 'schedule_1', enabled: true, required: false, frequencyUnit: 'week' };
const project = (c, value) => c.read(scopeFor(c.target()), {}).project(Buffer.from(JSON.stringify(value)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: binds closed host identities, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/maintenance-schedule/schedule_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(target), {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: record-only response identity never grants use-window authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'executionAuthority', 'authorizedWindow']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: projection omits times, names and unverified parent claims`, () => {
    const result = project(c, { ...body, name: 'synthetic-canary', starts_at: 'synthetic-canary',
      ends_at: 'synthetic-canary', duration: 'synthetic-canary', actor: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent' });
    assert.deepEqual(result, output);
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    assert.ok(Object.isFrozen(result));
  });

  test(`${c.operation}: projection refuses rebound schedule and malformed fields`, () => {
    assert.throws(() => project(c, { ...body, id: 'other' }), { code: 'scope' });
    for (const patch of [{ enabled: 'true' }, { required: null }]) {
      assert.throws(() => project(c, { ...body, ...patch }), { code: 'upstream' });
    }
    assert.throws(() => project(c, { ...body, frequency_unit: 'other' }), { code: 'schema' });
  });

  test(`${c.operation}: captured target and request are immutable snapshots`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target.scheduleId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every host field affects plan and full hashes`, () => {
    const original = c.bind(c.target())({});
    for (const key of Object.keys(c.target())) {
      const changed = c.bind({ ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot retarget, reschedule or supply authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { scheduleId: 'other' }, { branchId: 'other' },
      { enabled: false }, { frequency_unit: 'day' }, { starts_at: 'synthetic-canary' }, { approved: true },
      { credential: 'synthetic-canary' }, { method: 'POST' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
      refused(() => prepare(raw));
    }
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing, extra, unsafe and accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), enabled: true }, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), [Symbol('scope')]: true },
      Object.defineProperty(c.target(), 'hidden', { value: true })]) refused(() => c.bind(raw));
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

test('branch maintenance singleton independently binds the schedule absent from its path', () => {
  const original = bindGetBranchMaintenanceWindowPreparation(branch())({});
  const changed = bindGetBranchMaintenanceWindowPreparation({ ...branch(), scheduleId: 'other' })({});
  assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
  assert.notEqual(original.resource.id, changed.resource.id);
  assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  assert.throws(() => branchRead(scopeFor({ ...branch(), scheduleId: 'other' }), {}).project(Buffer.from(JSON.stringify(body))), { code: 'scope' });
});

test('schedule and branch-window plans separate operations even for the same schedule resource', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 1);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
});
