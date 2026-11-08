import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { prepareCancelBranchConfigChange, prepareCancelKeyspaceConfigChange } from '../../../dist/plugins/planetscale-broker/src/configuration-cancel-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'example-org', database: 'app', databaseId: 'database123', branch: 'staging', branchId: 'branch123', changeId: 'change123', revision: 'a'.repeat(64), production: false, state: 'draft', changeType: 'vtgate' };
const base = '/v1/organizations/example-org/databases/app/branches/staging';
const fixtures = [
  [prepareCancelBranchConfigChange, target, 'cancel_branch_config_change_request', base + '/config-changes/change123', 'BranchConfigChangeRequest'],
  [prepareCancelKeyspaceConfigChange, { ...target, keyspace: 'main', keyspaceId: 'keyspace123', changeType: 'mysqld' }, 'cancel_keyspace_config_change_request', base + '/keyspaces/main/config-changes/change123', 'KeyspaceConfigChangeRequest'],
];

for (const [prepare, scope, operationId, path, definition] of fixtures) {
  test(`${operationId}: closed immutable preview never executes or consumes authority`, () => {
    const output = prepare(scope, {});
    assert.equal(output.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(output.operationId, operationId);
    assert.equal(output.tool, 'planetscale.' + operationId);
    assert.equal(output.tier, 'reserved');
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, scope);
    assert.deepEqual(output.arguments, {});
    assert.deepEqual(output.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com', path, body: null });
    assert.deepEqual(output.requiredAuthorities, ['release-manager']);
    assert.equal(output.effect, 'cancel-unapplied-config-request');
    assert.equal(output.execution, 'not-implemented');
    assert.equal(output.remotePreconditions, 'not-verified');
    assert.equal(output.providerDryRun, 'not-performed');
    for (const key of ['execute', 'project', 'approval', 'token', 'credential', 'rollback']) assert.equal(output[key], undefined);
    for (const value of [output, output.target, output.arguments, output.proposedRequest, output.requiredAuthorities]) assert.ok(Object.isFrozen(value));
  });
  test(`${operationId}: no caller selector, values, force, approval or credential fields`, () => {
    for (const key of [...Object.keys(scope), 'force', 'id', 'new_options', 'previous_options', 'url', 'body', 'approval', 'authorities', 'agentId', 'credential', 'sql']) assert.throws(() => prepare(scope, { [key]: canary }), error => !String(error).includes(canary));
    for (const args of [undefined, null, [], 1, 'x', true, JSON.parse('{"__proto__":{}}')]) assert.throws(() => prepare(scope, args));
    let called = false;
    assert.throws(() => prepare(scope, { get force() { called = true; throw new Error(canary); } }), error => !String(error).includes(canary));
    assert.equal(called, false);
  });
  test(`${operationId}: complete strictly typed broker identity and revision are required`, () => {
    for (const key of Object.keys(scope)) {
      const incomplete = { ...scope };
      delete incomplete[key];
      assert.throws(() => prepare(incomplete, {}));
      for (const value of [null, {}, [], canary]) assert.throws(() => prepare({ ...scope, [key]: value }, {}), error => !String(error).includes(canary));
    }
    for (const key of ['organization', 'database', 'branch', ...Object.keys(scope).filter(key => key.endsWith('Id') || key === 'keyspace')]) {
      for (const value of ['', '../foreign', 'x/y', 'x%2fy', 'x?force=true', 'x#fragment', 'x\n', 'é', 'a'.repeat(81)]) assert.throws(() => prepare({ ...scope, [key]: value }, {}));
    }
    for (const revision of ['', 'a'.repeat(63), 'g'.repeat(64)]) assert.throws(() => prepare({ ...scope, revision }, {}));
    for (const value of [null, [], 'x', { ...scope, approval: true }, { ...scope, agentId: 'other' }, { ...scope, new_options: {} }]) assert.throws(() => prepare(value, {}));
    assert.throws(() => prepare({ ...scope, production: 'false' }, {}));
  });
  test(`${operationId}: scope accessors refuse without invocation or secret reflection`, () => {
    for (const key of Object.keys(scope)) {
      let called = false;
      const hostile = Object.defineProperty({ ...scope }, key, { enumerable: true, get() { called = true; throw new Error(canary); } });
      assert.throws(() => prepare(hostile, {}), error => !String(error).includes(canary));
      assert.equal(called, false);
    }
  });
  test(`${operationId}: later input changes cannot retarget request or authority`, () => {
    const mutable = { ...scope }, args = {}, output = prepare(mutable, args);
    for (const key of Object.keys(mutable)) mutable[key] = 'foreign';
    args.force = true;
    assert.equal(output.proposedRequest.path, path);
    assert.equal(output.proposedRequest.body, null);
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, scope);
    assert.deepEqual(output.arguments, {});
    assert.deepEqual(output.requiredAuthorities, ['release-manager']);
    assert.throws(() => { output.target.changeId = 'foreign'; });
    assert.throws(() => { output.proposedRequest.path = '/foreign'; });
  });
  test(`${operationId}: production never downgrades decider or precondition obligations`, () => {
    const output = prepare({ ...scope, production: true }, {});
    assert.equal(output.target.production, true);
    assert.deepEqual(output.requiredAuthorities, ['release-manager']);
    assert.equal(output.execution, 'not-implemented');
    assert.equal(output.remotePreconditions, 'not-verified');
  });
  test(`${operationId}: permits draft/pending only, never queued/applying or terminal work`, async () => {
    const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
    for (const state of [...schema.definitions[definition].properties.state.enum, 'unknown', 'DRAFT']) {
      if (['draft', 'pending'].includes(state)) assert.equal(prepare({ ...scope, state }, {}).target.state, state);
      else assert.throws(() => prepare({ ...scope, state }, {}));
    }
  });
  test(`${operationId}: path, verb, empty body and state restriction match pinned official contract`, async () => {
    const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === operationId);
    assert.equal(operation.method, 'delete');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'id' ? scope.changeId : scope[key]), path);
    assert.ok(!operation.value.parameters.some(p => p.in === 'query' || p.in === 'body'));
    assert.deepEqual(Object.keys(operation.value.responses).filter(code => /^2\d\d$/.test(code)), ['204']);
    assert.equal(operation.value.responses['204'].schema, undefined);
    assert.match(operation.value.summary, /draft or pending/);
    assert.ok(schema.definitions[definition].properties.change_type.enum.includes(scope.changeType));
    assert.ok(!Object.hasOwn(schema.definitions[definition].properties, 'branch_id'));
    if (scope.keyspaceId) assert.ok(!Object.hasOwn(schema.definitions[definition].properties, 'keyspace_id'));
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const row = map.operations.find(row => row.operationId === operationId);
    assert.equal(row.adapter, null);
    assert.equal(row.implementation, 'missing');
    assert.equal(row.projectionCoverage, 'missing');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.review, 'not-reviewed');
    assert.equal(row.tierReview, 'pending');
    assert.equal(row.tier, 'reserved');
    assert.equal(row.localPlan.source, 'src/configuration-cancel-plans.ts');
    assert.equal(row.localPlan.test, 'test/configuration-cancel-plans.test.mjs');
    assert.equal(row.localPlan.execution, 'not-implemented');
    assert.equal(row.localPlan.providerDryRun, 'not-performed');
    assert.deepEqual(row.policyCandidate.always, ['release-manager']);
  });
}

test('branch config cancellation supports vtgate only and refuses keyspace selectors', () => {
  for (const changeType of ['mysqld', 'vttablet', 'unknown']) assert.throws(() => prepareCancelBranchConfigChange({ ...target, changeType }, {}));
  for (const key of ['keyspace', 'keyspaceId', 'keyspace_name']) assert.throws(() => prepareCancelBranchConfigChange({ ...target, [key]: 'main' }, {}));
});

test('keyspace config cancellation supports mysqld/vttablet only with independent keyspace identity', () => {
  const scope = fixtures[1][1];
  for (const changeType of ['mysqld', 'vttablet']) assert.equal(prepareCancelKeyspaceConfigChange({ ...scope, changeType }, {}).target.changeType, changeType);
  for (const changeType of ['vtgate', 'unknown']) assert.throws(() => prepareCancelKeyspaceConfigChange({ ...scope, changeType }, {}));
  assert.throws(() => prepareCancelKeyspaceConfigChange(target, {}));
});
