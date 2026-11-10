import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { prepareDismissSchemaRecommendation } from '../../../dist/plugins/planetscale-broker/src/recommendation-dismissal-plan.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'example-org', database: 'app', databaseId: 'database123', recommendationId: 'recommendation123', number: 42, revision: 'a'.repeat(64), production: false, state: 'open' };
const path = '/v1/organizations/example-org/databases/app/schema-recommendations/42/dismiss';
async function schema() {
  return JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
}

test('recommendation dismissal preview is immutable and never executes or consumes authority', () => {
  const output = prepareDismissSchemaRecommendation(target, {});
  assert.equal(output.kind, 'validated-local-plan-not-provider-dry-run');
  assert.equal(output.operationId, 'dismiss_schema_recommendation');
  assert.equal(output.tool, 'planetscale.dismiss_schema_recommendation');
  assert.equal(output.tier, 'reserved');
  assert.equal(Object.getPrototypeOf(output.target), null);
  assert.deepEqual({ ...output.target }, target);
  assert.deepEqual(output.arguments, {});
  assert.deepEqual(output.proposedRequest, { method: 'POST', origin: 'https://api.planetscale.com', path, body: {} });
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.equal(output.effect, 'dismiss-one-open-schema-recommendation');
  assert.equal(output.execution, 'not-implemented');
  assert.equal(output.remotePreconditions, 'not-verified');
  assert.equal(output.providerDryRun, 'not-performed');
  for (const key of ['execute', 'project', 'approval', 'token', 'credential', 'ddl', 'rollback']) assert.equal(output[key], undefined);
  for (const value of [output, output.target, output.arguments, output.proposedRequest, output.proposedRequest.body, output.requiredAuthorities]) assert.ok(Object.isFrozen(value));
});

test('recommendation dismissal rejects selectors, free text, DDL and caller authority', () => {
  for (const key of [...Object.keys(target), 'reason', 'ddl_statement', 'force', 'url', 'body', 'approval', 'authorities', 'agentId', 'credential', 'sql']) {
    assert.throws(() => prepareDismissSchemaRecommendation(target, { [key]: canary }), error => !String(error).includes(canary));
  }
  for (const args of [undefined, null, [], 1, 'x', true, JSON.parse('{"__proto__":{}}')]) assert.throws(() => prepareDismissSchemaRecommendation(target, args));
  let called = false;
  assert.throws(() => prepareDismissSchemaRecommendation(target, { get reason() { called = true; throw new Error(canary); } }), error => !String(error).includes(canary));
  assert.equal(called, false);
});

test('recommendation dismissal requires all typed identity and revision bindings', () => {
  for (const key of Object.keys(target)) {
    const incomplete = { ...target };
    delete incomplete[key];
    assert.throws(() => prepareDismissSchemaRecommendation(incomplete, {}));
    for (const value of [null, {}, [], canary]) assert.throws(() => prepareDismissSchemaRecommendation({ ...target, [key]: value }, {}), error => !String(error).includes(canary));
  }
  for (const key of ['organization', 'database', 'databaseId', 'recommendationId']) {
    for (const value of ['', '../foreign', 'x/y', 'x%2fy', 'x?force=true', 'x#fragment', 'x\n', 'é', 'a'.repeat(81)]) assert.throws(() => prepareDismissSchemaRecommendation({ ...target, [key]: value }, {}));
  }
  for (const revision of ['', 'a'.repeat(63), 'g'.repeat(64)]) assert.throws(() => prepareDismissSchemaRecommendation({ ...target, revision }, {}));
  for (const value of [null, [], 'x', { ...target, reason: canary }, { ...target, ddl_statement: canary }]) assert.throws(() => prepareDismissSchemaRecommendation(value, {}));
  assert.throws(() => prepareDismissSchemaRecommendation({ ...target, production: 'false' }, {}));
});

test('recommendation dismissal refuses scope accessors without invocation or reflection', () => {
  for (const key of Object.keys(target)) {
    let called = false;
    const hostile = Object.defineProperty({ ...target }, key, { enumerable: true, get() { called = true; throw new Error(canary); } });
    assert.throws(() => prepareDismissSchemaRecommendation(hostile, {}), error => !String(error).includes(canary));
    assert.equal(called, false);
  }
});

test('recommendation dismissal snapshots number and IDs without caller retargeting', () => {
  const mutable = { ...target }, args = {}, output = prepareDismissSchemaRecommendation(mutable, args);
  for (const key of Object.keys(mutable)) mutable[key] = 'foreign';
  args.reason = canary;
  assert.equal(output.proposedRequest.path, path);
  assert.equal(Object.getPrototypeOf(output.target), null);
  assert.deepEqual({ ...output.target }, target);
  assert.deepEqual(output.arguments, {});
  assert.deepEqual(output.proposedRequest.body, {});
  assert.throws(() => { output.target.number = 7; });
  assert.throws(() => { output.proposedRequest.body.reason = canary; });
});

test('recommendation dismissal production preview retains unverified preconditions and RM route', () => {
  const output = prepareDismissSchemaRecommendation({ ...target, production: true }, {});
  assert.equal(output.target.production, true);
  assert.deepEqual(output.requiredAuthorities, ['release-manager']);
  assert.equal(output.execution, 'not-implemented');
  assert.equal(output.remotePreconditions, 'not-verified');
});

test('recommendation dismissal accepts only locally restricted open state and positive safe sequence', async () => {
  const definition = (await schema()).definitions.SchemaRecommendation.properties;
  assert.deepEqual(definition.state.enum, ['open', 'applied', 'dismissed', 'stale']);
  for (const state of [...definition.state.enum, 'unknown', 'OPEN']) {
    if (state === 'open') assert.equal(prepareDismissSchemaRecommendation({ ...target, state }, {}).target.state, state);
    else assert.throws(() => prepareDismissSchemaRecommendation({ ...target, state }, {}));
  }
  for (const number of [0, -0, -1, 1.5, '42', Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) assert.throws(() => prepareDismissSchemaRecommendation({ ...target, number }, {}));
  for (const number of [1, Number.MAX_SAFE_INTEGER]) assert.equal(prepareDismissSchemaRecommendation({ ...target, number }, {}).target.number, number);
  assert.ok(!Object.hasOwn(definition, 'database_id'));
});

test('recommendation dismissal pins number-addressed POST and omits the optional reason', async () => {
  const source = await schema();
  const operation = Object.entries(source.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === 'dismiss_schema_recommendation');
  assert.equal(operation.method, 'post');
  assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => target[key]), path);
  const body = operation.value.parameters.find(p => p.in === 'body');
  assert.deepEqual(Object.keys(body.schema.properties), ['reason']);
  assert.equal(body.schema.required, undefined);
  assert.ok(!operation.value.parameters.some(p => p.in === 'query'));
  assert.equal(operation.value.responses['200'].schema.$ref, '#/definitions/SchemaRecommendation');
});

test('recommendation dismissal metadata change retains reserved conjunctive policy candidates', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const row = map.operations.find(row => row.operationId === 'dismiss_schema_recommendation');
  assert.deepEqual(row.documentedAuthorization.serviceTokenAnyOf, ['write_database']);
  assert.equal(row.tier, 'reserved');
  assert.equal(row.sideEffects, 'mutation-requires-operation-review');
  assert.equal(row.policyCandidate.reason, 'schema-recommendation-dismissal-not-ddl-execution');
  assert.deepEqual(row.policyCandidate.always, ['release-manager']);
  assert.ok(row.policyCandidate.conjunctiveConditions.some(rule => rule.authority === 'owner-security'));
  assert.equal(row.policyCandidate.status, 'unreviewed-not-runtime-policy');
});

test('recommendation dismissal remains missing, disabled, unreviewed and separate from adapter coverage', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const row = map.operations.find(row => row.operationId === 'dismiss_schema_recommendation');
  assert.equal(row.adapter, null);
  assert.equal(row.implementation, 'missing');
  assert.equal(row.projectionCoverage, 'missing');
  assert.equal(row.enablement, 'disabled');
  assert.equal(row.review, 'not-reviewed');
  assert.equal(row.tierReview, 'pending');
  assert.equal(row.localPlan.source, 'src/recommendation-dismissal-plan.ts');
  assert.equal(row.localPlan.test, 'test/recommendation-dismissal-plan.test.mjs');
  assert.equal(row.localPlan.execution, 'not-implemented');
  assert.equal(row.localPlan.providerDryRun, 'not-performed');
});
