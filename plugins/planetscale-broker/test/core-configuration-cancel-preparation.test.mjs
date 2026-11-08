import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindCancelBranchConfigChangePreparation, bindCancelKeyspaceConfigChangePreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';
import { prepareCancelBranchConfigChange, prepareCancelKeyspaceConfigChange } from '../../../dist/plugins/planetscale-broker/src/configuration-cancel-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'sample-org', database: 'sample-db', databaseId: 'database_1',
  branch: 'feature', branchId: 'branch_1', changeId: 'change_1', revision: 'a'.repeat(64),
  production: false, state: 'draft', changeType: 'vtgate' };
const keyspace = { ...target, keyspace: 'main', keyspaceId: 'keyspace_1', changeType: 'mysqld' };
const path = '/v1/organizations/sample-org/databases/sample-db/branches/feature';
const fixtures = [
  { bind: bindCancelBranchConfigChangePreparation, preview: prepareCancelBranchConfigChange, scope: target,
    operation: 'cancel_branch_config_change_request', resource: 'planetscale/branch-config-change/change_1',
    requestPath: path + '/config-changes/change_1' },
  { bind: bindCancelKeyspaceConfigChangePreparation, preview: prepareCancelKeyspaceConfigChange, scope: keyspace,
    operation: 'cancel_keyspace_config_change_request', resource: 'planetscale/keyspace-config-change/change_1',
    requestPath: path + '/keyspaces/main/config-changes/change_1' },
];
const refused = fn => assert.throws(fn, error => ['schema', 'scope', 'upstream'].includes(error.code)
  && !String(error).includes(canary));

for (const { bind, preview, scope, operation, resource, requestPath } of fixtures) {
  test(`${operation} core preparation: complete fixed preview and RM obligation are retained`, () => {
    const prepared = bind(scope)({});
    assert.deepEqual(prepared.resource, { id: resource, revision: scope.revision });
    assert.deepEqual(prepared.arguments, {});
    assert.deepEqual(prepared.plan, preview(scope, {}));
    assert.equal(prepared.plan.operationId, operation);
    assert.equal(prepared.plan.effect, 'cancel-unapplied-config-request');
    assert.equal(prepared.plan.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.remotePreconditions, 'not-verified');
    assert.equal(prepared.plan.providerDryRun, 'not-performed');
    assert.deepEqual(prepared.plan.requiredAuthorities, ['release-manager']);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com',
      path: requestPath, body: null });
    assert.equal(prepared.artifactDigest, null);
    assert.equal(typeof canonicalHash(prepared), 'string');
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${operation} core preparation: host snapshot is captured before later mutation`, () => {
    const input = { ...scope }, prepare = bind(input), before = prepare({});
    for (const key of Object.keys(input)) input[key] = canary;
    assert.deepEqual(prepare({}), before);
    assert.equal(Object.getPrototypeOf(before.plan.target), null);
    assert.deepEqual({ ...before.plan.target }, scope);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.arguments, before.plan.proposedRequest, before.plan.requiredAuthorities]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.resource.id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.changeId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.path = '/other'; }, TypeError);
    assert.throws(() => { before.plan.requiredAuthorities.pop(); }, TypeError);
  });

  test(`${operation} core preparation: callers cannot inject targets, credentials or authority`, () => {
    const prepare = bind(scope);
    for (const key of [...Object.keys(scope), 'target', 'resource', 'plan', 'arguments', 'artifactDigest',
      'approval', 'authorities', 'agentId', 'url', 'credential', 'sql', 'force', 'body', 'values']) {
      refused(() => prepare({ [key]: canary }));
    }
    for (const args of [undefined, null, [], 'x', 1, true, JSON.parse('{"__proto__":{}}')]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'approval', { enumerable: true,
      get() { touched = true; throw new Error(canary); } })));
    assert.equal(touched, false);
  });

  test(`${operation} core preparation: complete closed host identity and revision are mandatory`, () => {
    for (const key of Object.keys(scope)) {
      const input = { ...scope };
      delete input[key];
      refused(() => bind(input));
      for (const value of [null, {}, [], canary]) refused(() => bind({ ...scope, [key]: value }));
    }
    for (const input of [null, {}, [], { ...scope, credential: canary }, { ...scope, approval: true },
      { ...scope, databaseId: '../foreign' }, { ...scope, revision: 'latest' }, { ...scope, values: {} }]) refused(() => bind(input));
  });

  test(`${operation} core preparation: host accessors refuse without invocation or reflection`, () => {
    for (const key of Object.keys(scope)) {
      let touched = false;
      const input = Object.defineProperty({ ...scope }, key, { enumerable: true,
        get() { touched = true; throw new Error(canary); } });
      refused(() => bind(input));
      assert.equal(touched, false);
    }
  });

  test(`${operation} core preparation: hash binds every variable identity and classification`, () => {
    const original = bind(scope)({});
    const deltas = [{ organization: 'other-org' }, { database: 'other-db' }, { databaseId: 'database_2' },
      { branch: 'other-feature' }, { branchId: 'branch_2' }, { changeId: 'change_2' },
      { revision: 'b'.repeat(64) }, { production: true }, { state: 'pending' }];
    if (scope.keyspace) deltas.push({ keyspace: 'other' }, { keyspaceId: 'keyspace_2' }, { changeType: 'vttablet' });
    for (const delta of deltas) {
      const changed = bind({ ...scope, ...delta })({});
      assert.notEqual(canonicalHash(changed), canonicalHash(original));
      assert.deepEqual(changed.plan.requiredAuthorities, ['release-manager']);
      assert.equal(changed.plan.execution, 'not-implemented');
    }
  });

  test(`${operation} core preparation: deterministic empty arguments without execution hooks`, () => {
    const prepare = bind(scope);
    assert.deepEqual(prepare({}), prepare(Object.create(null)));
    assert.equal(canonicalHash(prepare({})), canonicalHash(prepare({})));
    for (const key of ['execute', 'project', 'credential', 'approval']) {
      assert.equal(Object.hasOwn(prepare, key), false);
      assert.equal(Object.hasOwn(prepare({}), key), false);
    }
  });
}

test('configuration-cancel core preparations distinguish resource kinds and refuse cross-type binding', () => {
  refused(() => bindCancelBranchConfigChangePreparation(keyspace));
  refused(() => bindCancelKeyspaceConfigChangePreparation(target));
  refused(() => bindCancelBranchConfigChangePreparation({ ...target, changeType: 'mysqld' }));
  refused(() => bindCancelBranchConfigChangePreparation({ ...target, changeType: 'vttablet' }));
  refused(() => bindCancelKeyspaceConfigChangePreparation({ ...keyspace, changeType: 'vtgate' }));
  const branchPrepared = bindCancelBranchConfigChangePreparation(target)({});
  const keyspacePrepared = bindCancelKeyspaceConfigChangePreparation(keyspace)({});
  assert.notEqual(branchPrepared.resource.id, keyspacePrepared.resource.id);
  assert.notEqual(canonicalHash(branchPrepared), canonicalHash(keyspacePrepared));
  assert.notEqual(canonicalHash(branchPrepared.plan.proposedRequest), canonicalHash(keyspacePrepared.plan.proposedRequest));
});

test('configuration-cancel core preparations refuse queued, applying, terminal and unknown work', () => {
  for (const { bind, scope } of fixtures) {
    for (const state of ['queued', 'applying', 'complete', 'failed', 'cancelled', 'unknown', '']) {
      refused(() => bind({ ...scope, state }));
    }
    for (const changeType of ['unknown', '', 'VTGATE', 'MYSqlD']) refused(() => bind({ ...scope, changeType }));
  }
});
