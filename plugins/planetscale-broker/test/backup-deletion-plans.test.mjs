import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { prepareDeleteBackup, prepareDeleteBackupPolicy } from '../../../dist/plugins/planetscale-broker/src/backup-deletion-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const parent = { organization: 'example-org', database: 'app', databaseId: 'database123', revision: 'a'.repeat(64) };
const backup = { ...parent, branch: 'staging', branchId: 'branch123', backupId: 'backup123', production: false, protected: false, required: false, state: 'success' };
const policy = { ...parent, policyId: 'policy123', target: 'development', required: false };
const fixtures = [
  [prepareDeleteBackup, backup, 'delete_backup', '/v1/organizations/example-org/databases/app/branches/staging/backups/backup123', 'delete-one-backup', ['release-manager']],
  [prepareDeleteBackupPolicy, policy, 'delete_backup_policy', '/v1/organizations/example-org/databases/app/backup-policies/policy123', 'remove-backup-policy', ['release-manager', 'owner-security']],
];

for (const [prepare, scope, operationId, path, effect, authorities] of fixtures) {
  test(`${operationId}: fixed immutable deletion preview is not an executor or grant`, () => {
    const output = prepare(scope, {});
    assert.equal(output.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(output.operationId, operationId);
    assert.equal(output.tool, 'planetscale.' + operationId);
    assert.equal(output.tier, 'reserved');
    assert.equal(output.effect, effect);
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, scope);
    assert.deepEqual(output.arguments, {});
    assert.deepEqual(output.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com', path, body: null });
    assert.deepEqual(output.requiredAuthorities, authorities);
    assert.equal(output.execution, 'not-implemented');
    assert.equal(output.remotePreconditions, 'not-verified');
    assert.equal(output.providerDryRun, 'not-performed');
    for (const key of ['execute', 'project', 'approval', 'token', 'credential']) assert.equal(output[key], undefined);
    for (const value of [output, output.target, output.arguments, output.proposedRequest, output.requiredAuthorities]) assert.ok(Object.isFrozen(value));
  });
  test(`${operationId}: closed arguments never accept force, selectors or authority`, () => {
    for (const key of ['id', 'backupId', 'policyId', 'branchId', 'databaseId', 'force', 'protected', 'required', 'delete_descendants', 'production', 'approval', 'authorities', 'agentId', 'revision', 'url', 'credential', 'sql']) assert.throws(() => prepare(scope, { [key]: canary }), error => !String(error).includes(canary));
    for (const args of [undefined, null, [], 1, 'x', true, JSON.parse('{"__proto__":{}}')]) assert.throws(() => prepare(scope, args));
    let called = false;
    assert.throws(() => prepare(scope, { get force() { called = true; throw new Error(canary); } }), error => !String(error).includes(canary));
    assert.equal(called, false);
  });
  test(`${operationId}: strict complete broker identity and revision snapshots only`, () => {
    for (const key of Object.keys(scope)) {
      const incomplete = { ...scope };
      delete incomplete[key];
      assert.throws(() => prepare(incomplete, {}));
      for (const value of [null, {}, [], canary]) assert.throws(() => prepare({ ...scope, [key]: value }, {}), error => !String(error).includes(canary));
    }
    for (const key of ['organization', 'database', ...Object.keys(scope).filter(key => key.endsWith('Id'))]) {
      for (const value of ['', '../foreign', 'x/y', 'x%2fy', 'x?force=true', 'x#fragment', 'x\n', 'é', 'a'.repeat(81)]) assert.throws(() => prepare({ ...scope, [key]: value }, {}));
    }
    for (const revision of ['', 'a'.repeat(63), 'g'.repeat(64)]) assert.throws(() => prepare({ ...scope, revision }, {}));
    for (const value of [null, [], 'x', { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => prepare(value, {}));
  });
  test(`${operationId}: accessors are refused without invocation or secret reflection`, () => {
    for (const key of Object.keys(scope)) {
      let called = false;
      const hostile = Object.defineProperty({ ...scope }, key, { enumerable: true, get() { called = true; throw new Error(canary); } });
      assert.throws(() => prepare(hostile, {}), error => !String(error).includes(canary));
      assert.equal(called, false);
    }
  });
  test(`${operationId}: later scope mutation cannot retarget the prepared plan`, () => {
    const mutable = { ...scope }, args = {}, output = prepare(mutable, args);
    for (const key of Object.keys(mutable)) mutable[key] = 'foreign';
    args.force = true;
    assert.equal(output.proposedRequest.path, path);
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, scope);
    assert.deepEqual(output.arguments, {});
    assert.deepEqual(output.requiredAuthorities, authorities);
  });
  test(`${operationId}: production scope cannot downgrade independent decider obligations`, () => {
    const production = operationId === 'delete_backup' ? { ...scope, production: true } : { ...scope, target: 'production' };
    const output = prepare(production, {});
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, production);
    assert.deepEqual(output.requiredAuthorities, authorities);
    assert.equal(output.execution, 'not-implemented');
    assert.equal(output.remotePreconditions, 'not-verified');
  });
  test(`${operationId}: request and missing-adapter status agree with pinned official contract`, async () => {
    const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === operationId);
    const fields = { ...scope, id: scope.backupId ?? scope.policyId };
    assert.equal(operation.method, 'delete');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => fields[key]), path);
    assert.ok(!operation.value.parameters.some(p => p.in === 'body' || p.in === 'query'));
    assert.equal(operation.value.responses['204'].schema, undefined);
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const row = map.operations.find(row => row.operationId === operationId);
    assert.equal(row.adapter, null);
    assert.equal(row.implementation, 'missing');
    assert.equal(row.projectionCoverage, 'missing');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.review, 'not-reviewed');
    assert.equal(row.tierReview, 'pending');
    assert.equal(row.tier, 'reserved');
    assert.equal(row.localPlan.source, 'src/backup-deletion-plans.ts');
    assert.equal(row.localPlan.test, 'test/backup-deletion-plans.test.mjs');
    assert.equal(row.localPlan.execution, 'not-implemented');
    assert.equal(row.localPlan.providerDryRun, 'not-performed');
    assert.deepEqual(row.policyCandidate.always, authorities);
  });
}

test('backup deletion refuses protected, required and non-success snapshots without a force path', () => {
  for (const key of ['protected', 'required']) {
    assert.throws(() => prepareDeleteBackup({ ...backup, [key]: true }, {}));
    for (const value of ['false', 0, 1]) assert.throws(() => prepareDeleteBackup({ ...backup, [key]: value }, {}));
  }
  for (const state of ['pending', 'running', 'failed', 'canceled', 'ignored', 'foreign']) assert.throws(() => prepareDeleteBackup({ ...backup, state }, {}));
});

test('backup policy deletion refuses required policies and undocumented target classes', () => {
  for (const required of [true, 'false', 0, 1]) assert.throws(() => prepareDeleteBackupPolicy({ ...policy, required }, {}));
  for (const target of ['staging', 'all', 'PRODUCTION', '']) assert.throws(() => prepareDeleteBackupPolicy({ ...policy, target }, {}));
});
