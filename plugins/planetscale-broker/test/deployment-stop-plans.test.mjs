import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { prepareCloseDeployRequest, prepareCancelDeployRequest } from '../../../dist/plugins/planetscale-broker/src/deployment-stop-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'example-org', database: 'app', databaseId: 'database123', requestId: 'request123', number: 17, revision: 'a'.repeat(64), branch: 'feature', branchId: 'branch123', intoBranch: 'staging', intoBranchId: 'branch456', production: false, branchDeleted: false, state: 'open', deploymentState: 'ready' };
const path = '/v1/organizations/example-org/databases/app/deploy-requests/17';
const fixtures = [
  [prepareCloseDeployRequest, target, 'close_deploy_request', 'PATCH', path, { state: 'closed' }, 'close-undeployed-request'],
  [prepareCancelDeployRequest, { ...target, deploymentState: 'queued' }, 'cancel_deploy_request', 'POST', path + '/cancel', null, 'cancel-queued-request'],
];

for (const [prepare, scope, operationId, method, requestPath, body, effect] of fixtures) {
  test(`${operationId}: closed immutable preview is not execution, approval or provider dry-run`, () => {
    const output = prepare(scope, {});
    assert.equal(output.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(output.operationId, operationId);
    assert.equal(output.tool, 'planetscale.' + operationId);
    assert.equal(output.tier, 'reserved');
    assert.equal(output.effect, effect);
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, scope);
    assert.deepEqual(output.arguments, {});
    assert.deepEqual(output.proposedRequest, { method, origin: 'https://api.planetscale.com', path: requestPath, body });
    assert.deepEqual(output.requiredAuthorities, ['release-manager']);
    assert.equal(output.execution, 'not-implemented');
    assert.equal(output.remotePreconditions, 'not-verified');
    assert.equal(output.providerDryRun, 'not-performed');
    for (const key of ['execute', 'project', 'approval', 'token', 'credential', 'rollback']) assert.equal(output[key], undefined);
    for (const value of [output, output.target, output.arguments, output.proposedRequest, output.requiredAuthorities, output.proposedRequest.body].filter(Boolean)) assert.ok(Object.isFrozen(value));
  });
  test(`${operationId}: no caller selectors, force, state, approval or credential fields`, () => {
    for (const key of [...Object.keys(scope), 'force', 'state', 'deployment_state', 'url', 'body', 'approval', 'authorities', 'agentId', 'credential', 'sql']) assert.throws(() => prepare(scope, { [key]: canary }), error => !String(error).includes(canary));
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
    for (const key of ['organization', 'database', 'branch', 'intoBranch', ...Object.keys(scope).filter(key => key.endsWith('Id'))]) {
      for (const value of ['', '../foreign', 'x/y', 'x%2fy', 'x?force=true', 'x#fragment', 'x\n', 'é', 'a'.repeat(81)]) assert.throws(() => prepare({ ...scope, [key]: value }, {}));
    }
    for (const number of [0, -0, -1, 1.5, '17', 2147483648, Infinity]) assert.throws(() => prepare({ ...scope, number }, {}));
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
  test(`${operationId}: later input changes cannot retarget paths, body or approvals`, () => {
    const mutable = { ...scope }, args = {}, output = prepare(mutable, args);
    for (const key of Object.keys(mutable)) mutable[key] = 'foreign';
    args.force = true;
    assert.equal(output.proposedRequest.path, requestPath);
    assert.deepEqual(output.proposedRequest.body, body);
    assert.equal(Object.getPrototypeOf(output.target), null);
    assert.deepEqual({ ...output.target }, scope);
    assert.deepEqual(output.arguments, {});
    assert.deepEqual(output.requiredAuthorities, ['release-manager']);
    assert.throws(() => { output.target.intoBranchId = 'foreign'; });
    if (body) assert.throws(() => { output.proposedRequest.body.state = 'open'; });
  });
  test(`${operationId}: production cannot downgrade decider or remote-precondition obligations`, () => {
    const output = prepare({ ...scope, production: true }, {});
    assert.equal(output.target.production, true);
    assert.deepEqual(output.requiredAuthorities, ['release-manager']);
    assert.equal(output.execution, 'not-implemented');
    assert.equal(output.remotePreconditions, 'not-verified');
  });
  test(`${operationId}: deleted or ambiguous source/destination and closed requests refuse`, () => {
    for (const patch of [{ branchDeleted: true }, { branchDeleted: 'false' }, { production: 'false' }, { state: 'closed' }, { intoBranch: scope.branch }, { intoBranchId: scope.branchId }]) assert.throws(() => prepare({ ...scope, ...patch }, {}));
  });
  test(`${operationId}: request matches pinned official path, verb, body and response contract`, async () => {
    const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === operationId);
    assert.equal(operation.method.toUpperCase(), method);
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), requestPath);
    assert.ok(!operation.value.parameters.some(p => p.in === 'query'));
    const bodies = operation.value.parameters.filter(p => p.in === 'body');
    assert.equal(bodies.length, body ? 1 : 0);
    if (body) {
      assert.deepEqual(Object.keys(bodies[0].schema.properties), ['state']);
      assert.deepEqual(bodies[0].schema.properties.state.enum, [body.state]);
    }
    assert.equal(operation.value.responses['200'].schema.$ref, '#/definitions/DatabaseDeployRequest');
    assert.ok(!Object.hasOwn(schema.definitions.DatabaseDeployRequest.properties, 'into_branch_id'));
    for (const key of ['state', 'deployment_state']) {
      const name = key === 'state' ? 'state' : 'deploymentState';
      assert.ok(schema.definitions.DatabaseDeployRequest.properties[key].enum.includes(scope[name]));
    }
    const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
    const row = map.operations.find(row => row.operationId === operationId);
    assert.equal(row.adapter, null);
    assert.equal(row.implementation, 'missing');
    assert.equal(row.projectionCoverage, 'missing');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.review, 'not-reviewed');
    assert.equal(row.tierReview, 'pending');
    assert.equal(row.tier, 'reserved');
    assert.equal(row.localPlan.source, 'src/deployment-stop-plans.ts');
    assert.equal(row.localPlan.test, 'test/deployment-stop-plans.test.mjs');
    assert.equal(row.localPlan.execution, 'not-implemented');
    assert.equal(row.localPlan.providerDryRun, 'not-performed');
    assert.deepEqual(row.policyCandidate.always, ['release-manager']);
  });
}

test('close plan permits only pending, ready and no_changes; never queued or started work', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const deploymentState of [...schema.definitions.DatabaseDeployRequest.properties.deployment_state.enum, 'unknown', 'READY']) {
    const scope = { ...target, deploymentState };
    if (['pending', 'ready', 'no_changes'].includes(deploymentState)) assert.equal(prepareCloseDeployRequest(scope, {}).target.deploymentState, deploymentState);
    else assert.throws(() => prepareCloseDeployRequest(scope, {}));
  }
});

test('cancel plan permits queued only; never running cutover, revert or completed states', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const deploymentState of [...schema.definitions.DatabaseDeployRequest.properties.deployment_state.enum, 'unknown', 'QUEUED']) {
    const scope = { ...target, deploymentState };
    if (deploymentState === 'queued') assert.equal(prepareCancelDeployRequest(scope, {}).target.deploymentState, deploymentState);
    else assert.throws(() => prepareCancelDeployRequest(scope, {}));
  }
});
