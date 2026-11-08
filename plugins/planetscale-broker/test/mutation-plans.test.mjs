import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  prepareDeleteBranch, prepareCreateBackup, prepareDisableSafeMigrations,
} from '../../../dist/plugins/planetscale-broker/src/mutation-plans.js';

const binding = {
  organization: 'example-org', database: 'example-db', branch: 'staging',
  branchId: 'branch123', revision: 'a'.repeat(64),
  production: false, deletionProtected: false, safeMigrations: true,
};
const base = '/v1/organizations/example-org/databases/example-db/branches/staging';
const fixtures = [
  [prepareDeleteBranch, {}, 'delete_branch', 'DELETE', `${base}?delete_descendants=false`, null, ['release-manager']],
  [prepareCreateBackup, { name: 'bounded-backup', retentionHours: 6 }, 'create_backup', 'POST', `${base}/backups`, { name: 'bounded-backup', retention_unit: 'hour', retention_value: 6, emergency: false }, ['release-manager', 'owner-money']],
  [prepareDisableSafeMigrations, {}, 'disable_safe_migrations', 'DELETE', `${base}/safe-migrations`, null, ['release-manager', 'owner-security']],
];

for (const [prepare, args, operationId, method, path, body, authorities] of fixtures) {
  test(`${operationId}: local plan fixes the operation and previews no authority`, () => {
    const result = prepare(binding, args);
    assert.equal(result.operationId, operationId);
    assert.equal(result.tool, `planetscale.${operationId}`);
    assert.equal(result.tier, 'reserved');
    assert.equal(result.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(result.providerDryRun, 'not-performed');
    assert.equal(result.execution, 'not-implemented');
    assert.equal(result.remotePreconditions, 'not-verified');
    assert.equal(result.execute, undefined);
    assert.equal(result.project, undefined);
    assert.deepEqual(result.proposedRequest, { method, origin: 'https://api.planetscale.com', path, body });
    assert.deepEqual(result.requiredAuthorities, authorities);
    assert.equal(result.target.branchId, binding.branchId);
    assert.equal(result.target.revision, binding.revision);
    assert.equal(result.target.production, false);
    for (const value of [result, result.target, result.arguments, result.proposedRequest, result.requiredAuthorities]) {
      assert.ok(Object.isFrozen(value));
    }
    if (body) assert.ok(Object.isFrozen(result.proposedRequest.body));
  });

  test(`${operationId}: production cannot downgrade or replace the required authorities`, () => {
    const result = prepare({ ...binding, production: true }, args);
    assert.equal(result.target.production, true);
    assert.deepEqual(result.requiredAuthorities, authorities);
    for (const key of ['approval', 'approved', 'authorities', 'production', 'agentId', 'resource', 'url', 'credential', 'sql', 'delete_descendants', 'emergency']) {
      assert.throws(() => prepare(binding, { ...args, [key]: true }));
    }
  });

  test(`${operationId}: target and arguments are strict bounded JSON`, () => {
    for (const value of [null, [], 'x', { ...binding, branch: '../foreign' }, { ...binding, branch: 'x%2fy' }, { ...binding, branch: 'x\n' }, { ...binding, branch: 'a'.repeat(64) }, { ...binding, production: 'false' }, { ...binding, revision: 'a'.repeat(63) }, { ...binding, branchId: '' }, { ...binding, approval: true }, { ...binding, agentId: 'other' }]) {
      assert.throws(() => prepare(value, args));
    }
    for (const value of [null, [], 'x', JSON.parse('{"__proto__":{}}')]) {
      assert.throws(() => prepare(binding, value));
    }
    let called = false;
    assert.throws(() => prepare({ ...binding, get branch() { called = true; return 'staging'; } }, args));
    assert.equal(called, false);
  });

  test(`${operationId}: immutable snapshots retain the original branch and plan`, () => {
    const scope = { ...binding };
    const mutableArgs = { ...args };
    const result = prepare(scope, mutableArgs);
    scope.branch = 'production';
    scope.branchId = 'other';
    scope.revision = 'b'.repeat(64);
    scope.production = true;
    mutableArgs.name = 'other';
    mutableArgs.retentionHours = 24;
    assert.equal(result.proposedRequest.path, path);
    assert.equal(result.target.branch, 'staging');
    assert.equal(result.target.branchId, 'branch123');
    assert.equal(result.target.revision, 'a'.repeat(64));
    assert.equal(result.target.production, false);
    assert.deepEqual(result.proposedRequest.body, body);
  });
}

test('branch deletion never disables protection or includes descendants', () => {
  assert.throws(() => prepareDeleteBranch({ ...binding, deletionProtected: true }, {}));
  for (const args of [{ deleteDescendants: true }, { delete_descendants: true }, { deletionProtected: false }, { force: true }]) {
    assert.throws(() => prepareDeleteBranch(binding, args));
  }
});

test('backup plan uses a narrow hourly cap and no emergency mode', () => {
  for (const retentionHours of [1, 24]) {
    const result = prepareCreateBackup(binding, { name: 'bounded-backup', retentionHours });
    assert.equal(result.proposedRequest.body.retention_value, retentionHours);
    assert.equal(result.proposedRequest.body.emergency, false);
  }
  for (const retentionHours of [0, -0, 25, 1.5, '6', Infinity]) {
    assert.throws(() => prepareCreateBackup(binding, { name: 'bounded-backup', retentionHours }));
  }
  assert.throws(() => prepareCreateBackup(binding, { name: 'x\n', retentionHours: 6 }));
});

test('safety-removal plan refuses an already-disabled source snapshot', () => {
  assert.throws(() => prepareDisableSafeMigrations({ ...binding, safeMigrations: false }, {}));
});

test('protected operation candidates preserve separate exact-decider obligations', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url), 'utf8'));
  const credentials = ['create_branch_log_signature', 'create_oauth_token', 'create_password', 'create_role', 'create_service_token', 'renew_password', 'renew_role', 'reset_default_role', 'reset_role'];
  const money = ['update_payment_method', 'delete_organization_billing_payment_method'];
  const security = ['disable_organization_sso', 'disable_organization_sso_directory'];
  const expected = [...credentials, ...money, ...security, ...fixtures.map(row => row[2])].sort();
  assert.deepEqual(map.operations.filter(row => row.policyCandidate).map(row => row.operationId).sort(), expected);
  for (const row of map.operations.filter(row => row.policyCandidate)) {
    const candidate = row.policyCandidate;
    assert.equal(candidate.status, 'unreviewed-not-runtime-policy');
    assert.equal(candidate.tier, 'reserved');
    assert.equal(row.tierReview, 'pending');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.implementation, 'missing');
    assert.notEqual(row.method, 'GET');
    if (credentials.includes(row.operationId)) assert.deepEqual(candidate.always, ['owner-credential']);
    if (money.includes(row.operationId)) assert.deepEqual(candidate.always, ['owner-money']);
    if (security.includes(row.operationId)) assert.deepEqual(candidate.always, ['owner-security']);
    assert.deepEqual(candidate.conjunctiveConditions, [
      { when: 'trusted-production-or-data-schema-deploy-impact', authority: 'release-manager' },
      { when: 'trusted-new-spend', authority: 'owner-money' },
      { when: 'trusted-security-weakening', authority: 'owner-security' },
      { when: 'approved-board-host-application-or-secret-placement', authority: 'operator' },
    ]);
    assert.ok(candidate.requirements.includes('atomic-expiring-single-use-consumption-and-durable-uncertain-recovery'));
  }
  // No candidate, scope table or HTTP verb silently classifies the remaining surface.
  assert.equal(map.operations.find(row => row.operationId === 'update_database_settings').tier, 'unresolved');
  assert.equal(map.operations.find(row => row.operationId === 'get_branch_metrics').tier, 'unresolved');
});

test('offline read classification never implies reviewed policy or runtime enablement', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url), 'utf8'));
  const query = map.operations.find(row => row.operationId === 'get_branch_query');
  assert.equal(query.tier, 'read');
  assert.equal(query.adapter, 'src/tools/get-branch-query.ts');
  const reads = map.operations.filter(row => row.tier === 'read');
  assert.ok(reads.length > 0);
  for (const row of reads) {
    assert.equal(row.implementation, 'offline-adapter-only');
    assert.equal(row.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
    assert.equal(row.review, 'not-reviewed');
    assert.equal(row.tierReview, 'pending');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.policyCandidate, null);
  }
  const unresolved = map.operations.find(row => row.operationId === 'get_branch_metrics');
  assert.equal(unresolved.implementation, 'missing');
  assert.equal(unresolved.adapter, null);
  assert.equal(unresolved.enablement, 'disabled');
});

test('plan-only artifacts never count as implemented API adapters', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url), 'utf8'));
  const planned = map.operations.filter(row => row.localPlan !== null);
  assert.deepEqual(planned.map(row => row.operationId).sort(), fixtures.map(row => row[2]).sort());
  for (const row of planned) {
    assert.equal(row.adapter, null);
    assert.equal(row.implementation, 'missing');
    assert.equal(row.projectionCoverage, 'missing');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.tier, 'reserved');
    assert.equal(row.localPlan.source, 'src/mutation-plans.ts');
    assert.equal(row.localPlan.test, 'test/mutation-plans.test.mjs');
    assert.equal(row.localPlan.providerDryRun, 'not-performed');
    assert.equal(row.localPlan.execution, 'not-implemented');
    assert.equal(row.policyCandidate.status, 'unreviewed-not-runtime-policy');
    assert.deepEqual(row.policyCandidate.always, fixtures.find(fixture => fixture[2] === row.operationId)[6]);
  }
});
