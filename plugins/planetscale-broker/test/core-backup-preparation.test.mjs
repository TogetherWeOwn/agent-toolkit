import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindDeleteBackupPreparation, bindDeleteBackupPolicyPreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';
import { prepareDeleteBackup, prepareDeleteBackupPolicy } from '../../../dist/plugins/planetscale-broker/src/backup-deletion-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const parent = { organization: 'sample-org', database: 'sample-db', databaseId: 'database_1', revision: 'a'.repeat(64) };
const backup = { ...parent, branch: 'sample-branch', branchId: 'branch_1', backupId: 'backup_1',
  production: false, protected: false, required: false, state: 'success' };
const policy = { ...parent, policyId: 'policy_1', target: 'development', required: false };
const fixtures = [
  { bind: bindDeleteBackupPreparation, preview: prepareDeleteBackup, target: backup, operation: 'delete_backup',
    id: 'planetscale/backup/backup_1', authorities: ['release-manager'],
    path: '/v1/organizations/sample-org/databases/sample-db/branches/sample-branch/backups/backup_1',
    variants: [{ branch: 'other-branch' }, { branchId: 'branch_2' }, { backupId: 'backup_2' }, { production: true }] },
  { bind: bindDeleteBackupPolicyPreparation, preview: prepareDeleteBackupPolicy, target: policy, operation: 'delete_backup_policy',
    id: 'planetscale/backup-policy/policy_1', authorities: ['release-manager', 'owner-security'],
    path: '/v1/organizations/sample-org/databases/sample-db/backup-policies/policy_1',
    variants: [{ policyId: 'policy_2' }, { target: 'production' }] },
];
const refused = fn => assert.throws(fn, error => ['schema', 'scope', 'upstream'].includes(error.code)
  && !String(error).includes(canary));

for (const { bind, preview, target, operation, id, authorities, path, variants } of fixtures) {
  test(`${operation} core preparation: complete preview and independent obligations are retained`, () => {
    const prepared = bind(target)({});
    assert.deepEqual(prepared.resource, { id, revision: target.revision });
    assert.deepEqual(prepared.arguments, {});
    assert.deepEqual(prepared.plan, preview(target, {}));
    assert.equal(prepared.plan.operationId, operation);
    assert.equal(prepared.plan.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.remotePreconditions, 'not-verified');
    assert.equal(prepared.plan.providerDryRun, 'not-performed');
    assert.deepEqual(prepared.plan.requiredAuthorities, authorities);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com', path, body: null });
    assert.equal(prepared.artifactDigest, null);
    assert.equal(typeof canonicalHash(prepared), 'string');
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${operation} core preparation: host snapshot is captured before later mutation`, () => {
    const input = { ...target }, prepare = bind(input), before = prepare({});
    for (const key of Object.keys(input)) input[key] = canary;
    assert.deepEqual(prepare({}), before);
    assert.equal(Object.getPrototypeOf(before.plan.target), null);
    assert.deepEqual({ ...before.plan.target }, target);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.arguments, before.plan.proposedRequest, before.plan.requiredAuthorities]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.resource.id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.requiredAuthorities.pop(); }, TypeError);
    assert.throws(() => { before.plan.target.databaseId = 'other'; }, TypeError);
  });

  test(`${operation} core preparation: callers cannot inject targets, credentials or authority`, () => {
    const prepare = bind(target);
    for (const key of [...Object.keys(target), 'target', 'resource', 'plan', 'arguments', 'artifactDigest',
      'approval', 'authorities', 'agentId', 'url', 'credential', 'sql', 'force', 'delete_descendants']) {
      refused(() => prepare({ [key]: canary }));
    }
    for (const args of [undefined, null, [], 'x', 1, true, JSON.parse('{"__proto__":{}}')]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'approval', { enumerable: true,
      get() { touched = true; throw new Error(canary); } })));
    assert.equal(touched, false);
  });

  test(`${operation} core preparation: complete closed host identity and revision are mandatory`, () => {
    for (const key of Object.keys(target)) {
      const input = { ...target };
      delete input[key];
      refused(() => bind(input));
      for (const value of [null, {}, [], canary]) refused(() => bind({ ...target, [key]: value }));
    }
    for (const input of [null, {}, [], { ...target, credential: canary }, { ...target, approval: true },
      { ...target, databaseId: '../foreign' }, { ...target, revision: 'latest' }, { ...target, required: true }]) {
      refused(() => bind(input));
    }
  });

  test(`${operation} core preparation: host accessors refuse without invocation or reflection`, () => {
    for (const key of Object.keys(target)) {
      let touched = false;
      const input = Object.defineProperty({ ...target }, key, { enumerable: true,
        get() { touched = true; throw new Error(canary); } });
      refused(() => bind(input));
      assert.equal(touched, false);
    }
  });

  test(`${operation} core preparation: hash binds every mutable identity and classification`, () => {
    const original = bind(target)({});
    for (const delta of [{ organization: 'other-org' }, { database: 'other-db' }, { databaseId: 'database_2' },
      { revision: 'b'.repeat(64) }, ...variants]) {
      const changed = bind({ ...target, ...delta })({});
      assert.notEqual(canonicalHash(changed), canonicalHash(original));
      assert.deepEqual(changed.plan.requiredAuthorities, authorities);
    }
    const production = bind({ ...target, ...(operation === 'delete_backup' ? { production: true } : { target: 'production' }) })({});
    assert.deepEqual(production.plan.requiredAuthorities, authorities);
    assert.equal(production.plan.execution, 'not-implemented');
  });

  test(`${operation} core preparation: deterministic empty arguments without execution hooks`, () => {
    const prepare = bind(target);
    assert.deepEqual(prepare({}), prepare(Object.create(null)));
    assert.equal(canonicalHash(prepare({})), canonicalHash(prepare({})));
    for (const key of ['execute', 'project', 'credential', 'approval']) {
      assert.equal(Object.hasOwn(prepare, key), false);
      assert.equal(Object.hasOwn(prepare({}), key), false);
    }
  });
}

test('backup core preparations refuse protected/non-success targets and cross-operation bindings', () => {
  refused(() => bindDeleteBackupPreparation({ ...backup, protected: true }));
  for (const state of ['pending', 'running', 'failed', 'canceled', 'ignored']) {
    refused(() => bindDeleteBackupPreparation({ ...backup, state }));
  }
  refused(() => bindDeleteBackupPreparation(policy));
  refused(() => bindDeleteBackupPolicyPreparation(backup));
  const sameIdBackup = bindDeleteBackupPreparation({ ...backup, backupId: 'same_1' })({});
  const sameIdPolicy = bindDeleteBackupPolicyPreparation({ ...policy, policyId: 'same_1' })({});
  assert.notEqual(sameIdBackup.resource.id, sameIdPolicy.resource.id);
  assert.notEqual(canonicalHash(sameIdBackup), canonicalHash(sameIdPolicy));
});
