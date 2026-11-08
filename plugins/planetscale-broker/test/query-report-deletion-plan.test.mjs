import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { prepareDeleteQueryPatternsReport } from '../../../dist/plugins/planetscale-broker/src/query-report-deletion-plan.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'example-org', database: 'app', databaseId: 'database123', branch: 'staging', branchId: 'branch123', reportId: 'report123', revision: 'a'.repeat(64), production: false, state: 'completed' };
const path = '/v1/organizations/example-org/databases/app/branches/staging/query-patterns/report123';
async function schema() {
  return JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
}

test('query report deletion preview is immutable, bodyless and never executes or consumes authority', () => {
  const output = prepareDeleteQueryPatternsReport(target, {});
  assert.equal(output.kind, 'validated-local-plan-not-provider-dry-run');
  assert.equal(output.operationId, 'delete_query_patterns_report');
  assert.equal(output.tool, 'planetscale.delete_query_patterns_report');
  assert.equal(output.tier, 'reserved');
  assert.equal(Object.getPrototypeOf(output.target), null);
  assert.deepEqual({ ...output.target }, target);
  assert.deepEqual(output.arguments, {});
  assert.deepEqual(output.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com', path, body: null });
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.equal(output.effect, 'delete-one-query-patterns-report');
  assert.equal(output.execution, 'not-implemented');
  assert.equal(output.remotePreconditions, 'not-verified');
  assert.equal(output.providerDryRun, 'not-performed');
  for (const key of ['execute', 'project', 'approval', 'token', 'credential', 'url', 'rollback']) assert.equal(output[key], undefined);
  for (const value of [output, output.target, output.arguments, output.proposedRequest, output.requiredAuthorities]) assert.ok(Object.isFrozen(value));
});

test('query report deletion rejects caller selectors, downloads, authority and secret material', () => {
  for (const key of [...Object.keys(target), 'force', 'id', 'url', 'body', 'approval', 'authorities', 'agentId', 'credential', 'sql', 'download']) {
    assert.throws(() => prepareDeleteQueryPatternsReport(target, { [key]: canary }), error => !String(error).includes(canary));
  }
  for (const args of [undefined, null, [], 1, 'x', true, JSON.parse('{"__proto__":{}}')]) assert.throws(() => prepareDeleteQueryPatternsReport(target, args));
  let called = false;
  assert.throws(() => prepareDeleteQueryPatternsReport(target, { get force() { called = true; throw new Error(canary); } }), error => !String(error).includes(canary));
  assert.equal(called, false);
});

test('query report deletion requires every strictly typed immutable binding and revision', () => {
  for (const key of Object.keys(target)) {
    const incomplete = { ...target };
    delete incomplete[key];
    assert.throws(() => prepareDeleteQueryPatternsReport(incomplete, {}));
    for (const value of [null, {}, [], canary]) assert.throws(() => prepareDeleteQueryPatternsReport({ ...target, [key]: value }, {}), error => !String(error).includes(canary));
  }
  for (const key of ['organization', 'database', 'branch', 'databaseId', 'branchId', 'reportId']) {
    for (const value of ['', '../foreign', 'x/y', 'x%2fy', 'x?force=true', 'x#fragment', 'x\n', 'é', 'a'.repeat(81)]) assert.throws(() => prepareDeleteQueryPatternsReport({ ...target, [key]: value }, {}));
  }
  for (const revision of ['', 'a'.repeat(63), 'g'.repeat(64)]) assert.throws(() => prepareDeleteQueryPatternsReport({ ...target, revision }, {}));
  for (const value of [null, [], 'x', { ...target, approval: true }, { ...target, url: canary }, { ...target, download: true }]) assert.throws(() => prepareDeleteQueryPatternsReport(value, {}));
  assert.throws(() => prepareDeleteQueryPatternsReport({ ...target, production: 'false' }, {}));
});

test('query report deletion refuses scope accessors without invocation or reflection', () => {
  for (const key of Object.keys(target)) {
    let called = false;
    const hostile = Object.defineProperty({ ...target }, key, { enumerable: true, get() { called = true; throw new Error(canary); } });
    assert.throws(() => prepareDeleteQueryPatternsReport(hostile, {}), error => !String(error).includes(canary));
    assert.equal(called, false);
  }
});

test('query report deletion input mutation cannot retarget the request or downgrade authority', () => {
  const mutable = { ...target }, args = {}, output = prepareDeleteQueryPatternsReport(mutable, args);
  for (const key of Object.keys(mutable)) mutable[key] = 'foreign';
  args.force = true;
  assert.equal(output.proposedRequest.path, path);
  assert.equal(Object.getPrototypeOf(output.target), null);
  assert.deepEqual({ ...output.target }, target);
  assert.deepEqual(output.arguments, {});
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.throws(() => { output.target.reportId = 'foreign'; });
  assert.throws(() => { output.proposedRequest.path = '/foreign'; });
});

test('query report deletion production preview retains decider and precondition obligations', () => {
  const output = prepareDeleteQueryPatternsReport({ ...target, production: true }, {});
  assert.equal(output.target.production, true);
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.equal(output.execution, 'not-implemented');
  assert.equal(output.remotePreconditions, 'not-verified');
});

test('query report deletion accepts only broker-narrow terminal states, not pending generation', async () => {
  const definition = (await schema()).definitions.QueryPatternsDownload.properties;
  assert.deepEqual(definition.state.enum, ['pending', 'completed', 'failed']);
  for (const state of [...definition.state.enum, 'unknown', 'COMPLETED', 'cancelled', 'running']) {
    if (['completed', 'failed'].includes(state)) assert.equal(prepareDeleteQueryPatternsReport({ ...target, state }, {}).target.state, state);
    else assert.throws(() => prepareDeleteQueryPatternsReport({ ...target, state }, {}));
  }
  // No parent IDs are returned: these preview bindings cannot be inferred from report state.
  for (const key of ['branch_id', 'database_id']) assert.ok(!Object.hasOwn(definition, key));
});

test('query report deletion uses the pinned report-ID endpoint without download or optional parameters', async () => {
  const source = await schema();
  const operation = Object.entries(source.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === 'delete_query_patterns_report');
  assert.equal(operation.method, 'delete');
  assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'id' ? target.reportId : target[key]), path);
  assert.ok(!operation.value.parameters.some(p => p.in === 'query' || p.in === 'body'));
  assert.deepEqual(Object.keys(operation.value.responses).filter(code => /^2\d\d$/.test(code)), ['204']);
  assert.equal(operation.value.responses['204'].schema, undefined);
});

test('query report deletion read-scope entitlement never becomes read policy or native authority', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const row = map.operations.find(row => row.operationId === 'delete_query_patterns_report');
  assert.deepEqual(row.documentedAuthorization.serviceTokenAnyOf, ['read_branch']);
  assert.equal(row.method, 'DELETE');
  assert.equal(row.tier, 'reserved');
  assert.equal(row.sideEffects, 'mutation-requires-operation-review');
  assert.match(row.policyCandidate.reason, /destructive.*despite-read-entitlement/);
  assert.deepEqual(row.policyCandidate.always, ['release-manager']);
  assert.ok(row.policyCandidate.conjunctiveConditions.some(rule => rule.authority === 'owner-security'));
  assert.equal(row.policyCandidate.status, 'unreviewed-not-runtime-policy');
});

test('query report deletion remains a separate missing adapter, never reviewed or enabled coverage', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const row = map.operations.find(row => row.operationId === 'delete_query_patterns_report');
  assert.equal(row.adapter, null);
  assert.equal(row.implementation, 'missing');
  assert.equal(row.projectionCoverage, 'missing');
  assert.equal(row.enablement, 'disabled');
  assert.equal(row.review, 'not-reviewed');
  assert.equal(row.tierReview, 'pending');
  assert.equal(row.localPlan.source, 'src/query-report-deletion-plan.ts');
  assert.equal(row.localPlan.test, 'test/query-report-deletion-plan.test.mjs');
  assert.equal(row.localPlan.execution, 'not-implemented');
  assert.equal(row.localPlan.providerDryRun, 'not-performed');
  for (const id of ['get_query_patterns_report', 'create_query_patterns_report']) {
    const other = map.operations.find(row => row.operationId === id);
    assert.ok(other);
    assert.equal(other.localPlan, null);
    assert.equal(other.implementation, 'missing');
    assert.equal(other.enablement, 'disabled');
  }
});
