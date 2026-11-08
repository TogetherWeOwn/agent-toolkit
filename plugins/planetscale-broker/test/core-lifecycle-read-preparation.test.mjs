import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetBackupPreparation, bindGetBackupPolicyPreparation, bindGetDeployRequestPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as backupRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-backup.js';
import { prepare as policyRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-backup-policy.js';
import { prepare as deployRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-deploy-request.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1', revision: 'a'.repeat(64) });
const request = () => ({ id: 'request_1', number: 7, branch: 'feature', branchId: 'branch_1', intoBranch: 'main' });
const backup = () => ({ ...database(), branch: 'feature', branchId: 'branch_1', backupId: 'backup_1' });
const policy = () => ({ ...database(), policyId: 'policy_1' });
const deploy = () => ({ ...database(), request: request(), intoBranchId: 'destination_1' });
const refused = fn => assert.throws(fn, { code: 'schema' });
const cases = [
  { operation: 'get_backup', kind: 'backup', target: backup, id: t => t.backupId, bind: bindGetBackupPreparation,
    read: backupRead, scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, backupId: t.backupId }),
    identity: 'record-id-only-parent-not-verified',
    body: { id: 'backup_1', state: 'success', protected: true, required: true, emergency: false } },
  { operation: 'get_backup_policy', kind: 'backup-policy', target: policy, id: t => t.policyId, bind: bindGetBackupPolicyPreparation,
    read: policyRead, scope: t => ({ organization: t.organization, database: t.database, policyId: t.policyId }),
    identity: 'record-id-only-parent-not-verified', body: { id: 'policy_1', target: 'production', required: true } },
  { operation: 'get_deploy_request', kind: 'deploy-request', target: deploy, id: t => t.request.id, bind: bindGetDeployRequestPreparation,
    read: deployRead, scope: t => ({ organization: t.organization, database: t.database, request: t.request }),
    identity: 'record-and-source-ids-destination-not-verified',
    body: { id: 'request_1', number: 7, branch: 'feature', branch_id: 'branch_1', into_branch: 'main',
      state: 'open', deployment_state: 'pending', branch_deleted: false } },
];

for (const c of cases) {
  test(`${c.operation}: core snapshot binds existing fixed GET and every host identity`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: `planetscale/${c.kind}/${c.id(target)}`, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${c.operation}: preparation preserves projection limits and supplies no execution authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
    // The existing projections authenticate record IDs, not these parent/destination IDs.
    const output = c.read(c.scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      database_id: 'unverified-parent', into_branch_id: 'unverified-destination', password: 'synthetic-canary' })));
    assert.equal(output.id, c.id(c.target()));
    for (const key of ['database_id', 'into_branch_id', 'password']) assert.equal(Object.hasOwn(output, key), false);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
  });

  test(`${c.operation}: response projection still refuses another record ID`, () => {
    const read = c.read(c.scope(c.target()), {});
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, id: 'other' }))), { code: 'scope' });
  });

  test(`${c.operation}: closed deep snapshots survive mutation of input and refuse output mutation`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    if (target.request) target.request.id = 'other';
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    if (before.plan.target.request) {
      assert.ok(Object.isFrozen(before.plan.target.request));
      assert.throws(() => { before.plan.target.request.number = 8; }, TypeError);
    }
    assert.throws(() => { before.plan.target.databaseId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every host ID, name, number and revision changes plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    const paths = Object.keys(target).flatMap(key => key === 'request' ? Object.keys(target.request).map(child => ['request', child]) : [[key]]);
    for (const path of paths) {
      const changed = structuredClone(target);
      const parent = path.length === 1 ? changed : changed.request;
      const key = path.at(-1);
      parent[key] = key === 'revision' ? 'b'.repeat(64) : key === 'number' ? 8 : 'other';
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan), path.join('.'));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared), path.join('.'));
    }
  });

  test(`${c.operation}: caller cannot replace targets, requests, approvals or secrets`, () => {
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

  test(`${c.operation}: missing, extra and unsafe host fields refuse without invoking accessors`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' },
      { ...c.target(), databaseId: '../other' }]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const raw = c.target();
      delete raw[key];
      refused(() => c.bind(raw));
    }
    let touched = false;
    const raw = c.target();
    Object.defineProperty(raw, 'databaseId', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind(raw));
    assert.equal(touched, false);
  });
}

test('deploy detail preparation closes and captures every nested ID/number/source/destination binding', () => {
  for (const key of Object.keys(request())) {
    const target = deploy();
    delete target.request[key];
    refused(() => bindGetDeployRequestPreparation(target));
  }
  for (const value of [0, -1, 1.5, 2147483648, '7']) refused(() => bindGetDeployRequestPreparation({ ...deploy(), request: { ...request(), number: value } }));
  refused(() => bindGetDeployRequestPreparation({ ...deploy(), request: { ...request(), approved: true } }));
  let touched = false;
  const target = deploy();
  Object.defineProperty(target.request, 'id', { enumerable: true, get() { touched = true; return 'other'; } });
  refused(() => bindGetDeployRequestPreparation(target));
  assert.equal(touched, false);
  const read = deployRead(cases[2].scope(deploy()), {});
  for (const [key, value] of [['number', 8], ['branch_id', 'other'], ['branch', 'other'], ['into_branch', 'other']]) {
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...cases[2].body, [key]: value }))), { code: 'scope' });
  }
});

test('lifecycle detail resources with identical provider IDs retain separate kind namespaces', () => {
  const prepared = [bindGetBackupPreparation({ ...backup(), backupId: 'shared_1' })({}),
    bindGetBackupPolicyPreparation({ ...policy(), policyId: 'shared_1' })({}),
    bindGetDeployRequestPreparation({ ...deploy(), request: { ...request(), id: 'shared_1' } })({})];
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
