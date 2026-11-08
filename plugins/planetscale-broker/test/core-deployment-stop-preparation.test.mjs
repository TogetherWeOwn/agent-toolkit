import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindCloseDeployRequestPreparation, bindCancelDeployRequestPreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';
import { prepareCloseDeployRequest, prepareCancelDeployRequest } from '../../../dist/plugins/planetscale-broker/src/deployment-stop-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'sample-org', database: 'sample-db', databaseId: 'database_1',
  requestId: 'request_1', number: 17, revision: 'a'.repeat(64), branch: 'feature', branchId: 'branch_1',
  intoBranch: 'staging', intoBranchId: 'branch_2', production: false, branchDeleted: false,
  state: 'open', deploymentState: 'ready' };
const queued = { ...target, deploymentState: 'queued' };
const path = '/v1/organizations/sample-org/databases/sample-db/deploy-requests/17';
const fixtures = [
  { bind: bindCloseDeployRequestPreparation, preview: prepareCloseDeployRequest, scope: target,
    operation: 'close_deploy_request', method: 'PATCH', requestPath: path, body: { state: 'closed' },
    effect: 'close-undeployed-request' },
  { bind: bindCancelDeployRequestPreparation, preview: prepareCancelDeployRequest, scope: queued,
    operation: 'cancel_deploy_request', method: 'POST', requestPath: path + '/cancel', body: null,
    effect: 'cancel-queued-request' },
];
const refused = fn => assert.throws(fn, error => ['schema', 'scope', 'upstream'].includes(error.code)
  && !String(error).includes(canary));

for (const { bind, preview, scope, operation, method, requestPath, body, effect } of fixtures) {
  test(`${operation} core preparation: complete request preview and RM obligation are retained`, () => {
    const prepared = bind(scope)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/deploy-request/request_1', revision: scope.revision });
    assert.deepEqual(prepared.arguments, {});
    assert.deepEqual(prepared.plan, preview(scope, {}));
    assert.equal(prepared.plan.operationId, operation);
    assert.equal(prepared.plan.effect, effect);
    assert.equal(prepared.plan.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.remotePreconditions, 'not-verified');
    assert.equal(prepared.plan.providerDryRun, 'not-performed');
    assert.deepEqual(prepared.plan.requiredAuthorities, ['release-manager']);
    assert.deepEqual(prepared.plan.proposedRequest, { method, origin: 'https://api.planetscale.com', path: requestPath, body });
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
      before.plan.arguments, before.plan.proposedRequest, before.plan.proposedRequest.body,
      before.plan.requiredAuthorities].filter(Boolean)) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.resource.id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.intoBranchId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.requiredAuthorities.pop(); }, TypeError);
    if (body) assert.throws(() => { before.plan.proposedRequest.body.state = 'open'; }, TypeError);
  });

  test(`${operation} core preparation: callers cannot inject targets, credentials or authority`, () => {
    const prepare = bind(scope);
    for (const key of [...Object.keys(scope), 'target', 'resource', 'plan', 'arguments', 'artifactDigest',
      'approval', 'authorities', 'agentId', 'url', 'credential', 'sql', 'force', 'body', 'deployment_state']) {
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
      { ...scope, databaseId: '../foreign' }, { ...scope, revision: 'latest' }, { ...scope, number: 0 },
      { ...scope, branchDeleted: true }, { ...scope, state: 'closed' },
      { ...scope, intoBranch: scope.branch }, { ...scope, intoBranchId: scope.branchId }]) refused(() => bind(input));
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
    for (const delta of [{ organization: 'other-org' }, { database: 'other-db' }, { databaseId: 'database_2' },
      { requestId: 'request_2' }, { number: 18 }, { revision: 'b'.repeat(64) }, { branch: 'other-feature' },
      { branchId: 'branch_3' }, { intoBranch: 'other-staging' }, { intoBranchId: 'branch_4' }, { production: true }]) {
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

test('deployment-stop core preparations refuse cross-state binding and distinguish operations on the same resource', () => {
  refused(() => bindCloseDeployRequestPreparation(queued));
  refused(() => bindCancelDeployRequestPreparation(target));
  const close = bindCloseDeployRequestPreparation(target)({});
  const cancel = bindCancelDeployRequestPreparation(queued)({});
  assert.deepEqual(close.resource, cancel.resource);
  assert.notEqual(canonicalHash(close), canonicalHash(cancel));
  assert.notEqual(canonicalHash(close.plan.proposedRequest), canonicalHash(cancel.plan.proposedRequest));
  const hashes = new Set(['pending', 'ready', 'no_changes'].map(deploymentState =>
    canonicalHash(bindCloseDeployRequestPreparation({ ...target, deploymentState })({}))));
  assert.equal(hashes.size, 3);
});

test('deployment-stop core preparations refuse started or terminal work and invalid request numbers', () => {
  for (const { bind, scope } of fixtures) {
    for (const deploymentState of ['deploying', 'running', 'complete', 'failed', 'canceled', 'unknown']) {
      refused(() => bind({ ...scope, deploymentState }));
    }
    for (const number of [-0, -1, 1.5, '17', 2147483648, Infinity]) refused(() => bind({ ...scope, number }));
  }
});
