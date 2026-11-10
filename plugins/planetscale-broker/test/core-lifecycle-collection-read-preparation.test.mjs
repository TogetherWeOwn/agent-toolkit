import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListBackupsPreparation, bindListBackupPoliciesPreparation,
  bindListDeployRequestsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as backupRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-backups.js';
import { prepare as policyRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-backup-policies.js';
import { prepare as deployRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-deploy-requests.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  revision: 'a'.repeat(64), pagination: { page: 2, perPage: 3 } });
const branch = () => ({ ...database(), branch: 'sample-branch', branchId: 'branch_1' });
const request = (i = 1) => ({ id: `request_${i}`, number: i, branch: `source-${i}`, branchId: `branch_${i}`, intoBranch: 'main' });
const root = '/v1/organizations/sample-org/databases/sample-db';
const cases = [
  { operation: 'list_backups', bind: bindListBackupsPreparation, read: backupRead, parent: branch, field: 'backupIds',
    children: () => ['backup_1', 'backup_2'], resource: 'planetscale/branch/branch_1', path: `${root}/branches/sample-branch/backups`,
    identity: 'record-id-only-parent-not-verified',
    row: { id: 'backup_1', state: 'success', protected: true, required: true, emergency: false },
    output: { id: 'backup_1', state: 'success', protected: true, required: true, emergency: false } },
  { operation: 'list_backup_policies', bind: bindListBackupPoliciesPreparation, read: policyRead, parent: database, field: 'policyIds',
    children: () => ['policy_1', 'policy_2'], resource: 'planetscale/database/db_1', path: `${root}/backup-policies`,
    identity: 'record-id-only-parent-not-verified', row: { id: 'policy_1', target: 'production', required: true },
    output: { id: 'policy_1', target: 'production', required: true } },
  { operation: 'list_deploy_requests', bind: bindListDeployRequestsPreparation, read: deployRead, parent: database, field: 'requests',
    children: () => [request(1), request(2)], resource: 'planetscale/database/db_1', path: `${root}/deploy-requests`,
    identity: 'record-and-source-ids-destination-not-verified',
    row: { id: 'request_1', number: 1, branch: 'source-1', branch_id: 'branch_1', into_branch: 'main',
      state: 'open', deployment_state: 'ready', branch_deleted: false },
    output: { ...request(), state: 'open', deploymentState: 'ready', branchDeleted: false } },
];
const targetFor = c => ({ ...c.parent(), [c.field]: c.children() });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database,
  ...(c.field === 'backupIds' ? { branch: t.branch } : {}), [c.field]: t[c.field] });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: host parent, child bindings and page produce one fixed GET`, () => {
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

  test(`${c.operation}: confinement never grants collection, mutation or non-waking authority`, () => {
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

  test(`${c.operation}: projection omits secrets, config, schedules, actors and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, password: 'synthetic-canary', connection_url: 'synthetic-canary',
      name: 'synthetic-canary', schedule: 'synthetic-canary', retention: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', into_branch_id: 'unverified-parent',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', diff: 'synthetic-canary', config: { token: 'synthetic-canary' } }]));
    assert.deepEqual(result, { items: [c.output], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown children, malformed metadata and page mismatch refuse whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    const patch = c.field === 'requests' ? { state: 'unknown' } : { required: 'true' };
    assert.throws(() => project(c, envelope([{ ...c.row, ...patch }])), { code: 'upstream' });
    for (const change of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: [c.row, c.row, c.row, c.row] }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...change }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: captures deep immutable host child and pagination snapshots`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    if (c.field === 'requests') target.requests[0].branchId = 'other';
    else target[c.field][0] = 'other';
    target[c.field].push(c.field === 'requests' ? request(3) : 'child_3');
    target.pagination.page = 3;
    target.pagination.perPage = 10;
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], before.plan.target.pagination, before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0] = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.pagination.page = 3; }, TypeError);
    if (c.field === 'requests') {
      for (const row of before.plan.target.requests) assert.ok(Object.isFrozen(row));
      assert.throws(() => { before.plan.target.requests[0].number = 3; }, TypeError);
    }
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
      for (const key of c.field === 'requests' ? Object.keys(request()) : ['id']) {
        const target = targetFor(c);
        if (c.field === 'requests') target.requests[index][key] = key === 'number' ? 3 : 'other';
        else target[c.field][index] = 'other';
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

  test(`${c.operation}: caller cannot override bindings, page, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: c.children() }, { page: 1 }, { perPage: 10 },
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

  test(`${c.operation}: host child allowlists and pagination are unique, bounded and closed`, () => {
    const rows = n => Array.from({ length: n }, (_, i) => c.field === 'requests' ? request(i + 1) : `child_${i}`);
    const bad = [[], rows(33), [c.children()[0], c.children()[0]], ['../escape']];
    if (c.field === 'requests') bad.push([{ ...request(), approved: true }], [request(1), { ...request(2), number: 1 }],
      [{ ...request(), branch: '../escape' }], [{ ...request(), number: 0 }]);
    for (const children of bad) refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    let touched = false;
    const children = c.children();
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return c.children()[0]; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    assert.equal(touched, false);
    const max = { ...targetFor(c), [c.field]: rows(32), pagination: { page: 100, perPage: 10 } };
    assert.equal(c.bind(max)({}).plan.target[c.field].length, 32);
  });
}

test('lifecycle collection plans distinguish operations sharing a database resource', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(prepared[1].resource.id, prepared[2].resource.id);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('lifecycle child rebinding changes hashes even when the upstream collection request is unchanged', () => {
  for (const c of cases) {
    const original = c.bind(targetFor(c))({});
    const target = targetFor(c);
    if (c.field === 'requests') target.requests[0].id = 'other';
    else target[c.field][0] = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});

test('deploy list binds the exact ID, number and source tuple but not immutable destination or approval', () => {
  const c = cases[2];
  for (const patch of [{ number: 2 }, { branch: 'source-2' }, { branch_id: 'branch_2' }, { into_branch: 'other' }]) {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, ...patch }])), { code: 'scope' });
  }
  const result = project(c, envelope([{ ...c.row, approved: true, into_branch_id: 'unverified', organization_id: 'unverified' }]));
  assert.deepEqual(result.items[0], c.output);
  assert.equal(Object.hasOwn(result.items[0], 'approved'), false);
  assert.equal(Object.hasOwn(result.items[0], 'intoBranchId'), false);
});
