import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { prepareCancelChangeRequest } from '../../../dist/plugins/planetscale-broker/src/change-cancel-plan.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'example-org', database: 'app', databaseId: 'database123', branch: 'staging', branchId: 'branch123', changeId: 'change123', revision: 'a'.repeat(64), production: false, state: 'draft', canDelete: true, changeType: 'NekiClusterChangeRequest', targetType: 'NekiCluster', targetId: 'cluster123', targetName: 'staging' };
const path = '/v1/organizations/example-org/databases/app/branches/staging/change-requests/change123';
async function schema() {
  return JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
}

test('individual cancellation preview is immutable, bodyless and never executes or consumes authority', () => {
  const output = prepareCancelChangeRequest(target, {});
  assert.equal(output.kind, 'validated-local-plan-not-provider-dry-run');
  assert.equal(output.operationId, 'cancel_change_request');
  assert.equal(output.tool, 'planetscale.cancel_change_request');
  assert.equal(output.tier, 'reserved');
  assert.equal(Object.getPrototypeOf(output.target), null);
  assert.deepEqual({ ...output.target }, target);
  assert.deepEqual(output.arguments, {});
  assert.deepEqual(output.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com', path, body: null });
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.equal(output.effect, 'cancel-individual-unapplied-change-request');
  assert.equal(output.execution, 'not-implemented');
  assert.equal(output.remotePreconditions, 'not-verified');
  assert.equal(output.providerDryRun, 'not-performed');
  for (const key of ['execute', 'project', 'approval', 'token', 'credential', 'rollback']) assert.equal(output[key], undefined);
  for (const value of [output, output.target, output.arguments, output.proposedRequest, output.requiredAuthorities]) assert.ok(Object.isFrozen(value));
});

test('individual cancellation rejects caller selectors, force, authority and secret material', () => {
  for (const key of [...Object.keys(target), 'force', 'id', 'url', 'body', 'approval', 'authorities', 'agentId', 'credential', 'sql', 'new_options']) {
    assert.throws(() => prepareCancelChangeRequest(target, { [key]: canary }), error => !String(error).includes(canary));
  }
  for (const args of [undefined, null, [], 1, 'x', true, JSON.parse('{"__proto__":{}}')]) assert.throws(() => prepareCancelChangeRequest(target, args));
  let called = false;
  assert.throws(() => prepareCancelChangeRequest(target, { get force() { called = true; throw new Error(canary); } }), error => !String(error).includes(canary));
  assert.equal(called, false);
});

test('individual cancellation requires every strictly typed immutable binding and revision', () => {
  for (const key of Object.keys(target)) {
    const incomplete = { ...target };
    delete incomplete[key];
    assert.throws(() => prepareCancelChangeRequest(incomplete, {}));
    for (const value of [null, {}, [], canary]) assert.throws(() => prepareCancelChangeRequest({ ...target, [key]: value }, {}), error => !String(error).includes(canary));
  }
  for (const key of ['organization', 'database', 'branch', 'databaseId', 'branchId', 'changeId', 'targetId', 'targetName']) {
    for (const value of ['', '../foreign', 'x/y', 'x%2fy', 'x?force=true', 'x#fragment', 'x\n', 'é', 'a'.repeat(81)]) assert.throws(() => prepareCancelChangeRequest({ ...target, [key]: value }, {}));
  }
  for (const revision of ['', 'a'.repeat(63), 'g'.repeat(64)]) assert.throws(() => prepareCancelChangeRequest({ ...target, revision }, {}));
  for (const value of [null, [], 'x', { ...target, approval: true }, { ...target, agentId: 'other' }, { ...target, new_options: {} }]) assert.throws(() => prepareCancelChangeRequest(value, {}));
  for (const key of ['production', 'canDelete']) assert.throws(() => prepareCancelChangeRequest({ ...target, [key]: 'false' }, {}));
});

test('individual cancellation refuses scope accessors without invocation or reflection', () => {
  for (const key of Object.keys(target)) {
    let called = false;
    const hostile = Object.defineProperty({ ...target }, key, { enumerable: true, get() { called = true; throw new Error(canary); } });
    assert.throws(() => prepareCancelChangeRequest(hostile, {}), error => !String(error).includes(canary));
    assert.equal(called, false);
  }
});

test('individual cancellation input mutation cannot retarget the request or downgrade authority', () => {
  const mutable = { ...target }, args = {}, output = prepareCancelChangeRequest(mutable, args);
  for (const key of Object.keys(mutable)) mutable[key] = 'foreign';
  args.force = true;
  assert.equal(output.proposedRequest.path, path);
  assert.equal(Object.getPrototypeOf(output.target), null);
  assert.deepEqual({ ...output.target }, target);
  assert.deepEqual(output.arguments, {});
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.throws(() => { output.target.changeId = 'foreign'; });
  assert.throws(() => { output.proposedRequest.path = '/foreign'; });
});

test('individual cancellation production preview retains all decider and precondition obligations', () => {
  const output = prepareCancelChangeRequest({ ...target, production: true }, {});
  assert.equal(output.target.production, true);
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.equal(output.execution, 'not-implemented');
  assert.equal(output.remotePreconditions, 'not-verified');
});

test('individual cancellation accepts only broker-narrow draft/pending states, never applying or terminal work', async () => {
  const definition = (await schema()).definitions.ChangeRequest.properties;
  for (const state of [...definition.state.enum, 'unknown', 'DRAFT', 'queued']) {
    if (['draft', 'pending'].includes(state)) assert.equal(prepareCancelChangeRequest({ ...target, state }, {}).target.state, state);
    else assert.throws(() => prepareCancelChangeRequest({ ...target, state }, {}));
  }
  assert.throws(() => prepareCancelChangeRequest({ ...target, canDelete: false }, {}));
});

test('individual cancellation requires matched official target/change type pairs and non-null target identity', async () => {
  const definition = (await schema()).definitions.ChangeRequest.properties;
  assert.equal(definition.target_type.enum.length, 6);
  for (const targetType of definition.target_type.enum) {
    const changeType = targetType + 'ChangeRequest';
    assert.ok(definition.type.enum.includes(changeType));
    const output = prepareCancelChangeRequest({ ...target, targetType, changeType }, {});
    assert.equal(output.target.targetType, targetType);
    assert.equal(output.target.changeType, changeType);
    for (const other of definition.type.enum.filter(value => value !== changeType)) assert.throws(() => prepareCancelChangeRequest({ ...target, targetType, changeType: other }, {}));
  }
  assert.throws(() => prepareCancelChangeRequest({ ...target, targetType: 'unknown' }, {}));
  assert.throws(() => prepareCancelChangeRequest({ ...target, targetId: null }, {}));
});

test('individual cancellation uses the pinned request-ID endpoint, not legacy collection cancellation', async () => {
  const source = await schema();
  const operation = Object.entries(source.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === 'cancel_change_request');
  assert.equal(operation.method, 'delete');
  assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'id' ? target.changeId : target[key]), path);
  assert.ok(!operation.value.parameters.some(p => p.in === 'query' || p.in === 'body'));
  assert.deepEqual(Object.keys(operation.value.responses).filter(code => /^2\d\d$/.test(code)), ['204']);
  assert.equal(operation.value.responses['204'].schema, undefined);
  assert.match(operation.value.responses['422'].description, /cannot be canceled/);
  // The official response has no branch/database IDs: an independent trusted binding remains necessary.
  for (const key of ['branch_id', 'database_id']) assert.ok(!Object.hasOwn(source.definitions.ChangeRequest.properties, key));
});

test('individual cancellation stays a separate unreviewed plan, never implemented or enabled coverage', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const row = map.operations.find(row => row.operationId === 'cancel_change_request');
  assert.equal(row.adapter, null);
  assert.equal(row.implementation, 'missing');
  assert.equal(row.projectionCoverage, 'missing');
  assert.equal(row.enablement, 'disabled');
  assert.equal(row.review, 'not-reviewed');
  assert.equal(row.tierReview, 'pending');
  assert.equal(row.tier, 'reserved');
  assert.equal(row.localPlan.source, 'src/change-cancel-plan.ts');
  assert.equal(row.localPlan.test, 'test/change-cancel-plan.test.mjs');
  assert.equal(row.localPlan.execution, 'not-implemented');
  assert.equal(row.localPlan.providerDryRun, 'not-performed');
  assert.deepEqual(row.policyCandidate.always, ['release-manager']);
  for (const operationId of ['cancel_branch_change_request', 'cancel_bouncer_resize_request', 'cancel_keyspace_resize_request']) {
    const legacy = map.operations.find(row => row.operationId === operationId);
    assert.equal(legacy.localPlan, null);
    assert.equal(legacy.implementation, 'missing');
    assert.equal(legacy.enablement, 'disabled');
  }
});
