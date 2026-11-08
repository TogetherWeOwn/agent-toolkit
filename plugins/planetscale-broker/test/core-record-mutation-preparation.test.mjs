import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindCancelChangeRequestPreparation, bindDeleteQueryPatternsReportPreparation, bindDismissSchemaRecommendationPreparation,
  bindCancelBranchConfigChangePreparation, bindCancelKeyspaceConfigChangePreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';
import { prepareCancelChangeRequest } from '../../../dist/plugins/planetscale-broker/src/change-cancel-plan.js';
import { prepareDeleteQueryPatternsReport } from '../../../dist/plugins/planetscale-broker/src/query-report-deletion-plan.js';
import { prepareDismissSchemaRecommendation } from '../../../dist/plugins/planetscale-broker/src/recommendation-dismissal-plan.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const parent = { organization: 'sample-org', database: 'sample-db', databaseId: 'database_1',
  revision: 'a'.repeat(64), production: false };
const branch = { ...parent, branch: 'feature', branchId: 'branch_1' };
const change = { ...branch, changeId: 'record_1', state: 'draft', canDelete: true,
  changeType: 'NekiClusterChangeRequest', targetType: 'NekiCluster', targetId: 'cluster_1', targetName: 'main' };
const report = { ...branch, reportId: 'record_1', state: 'completed' };
const recommendation = { ...parent, recommendationId: 'record_1', number: 7, state: 'open' };
const basePath = '/v1/organizations/sample-org/databases/sample-db';
const fixtures = [
  { bind: bindCancelChangeRequestPreparation, preview: prepareCancelChangeRequest, scope: change,
    operation: 'cancel_change_request', resource: 'planetscale/change-request/record_1',
    effect: 'cancel-individual-unapplied-change-request', method: 'DELETE', body: null,
    path: basePath + '/branches/feature/change-requests/record_1',
    deltas: [{ branch: 'other-feature' }, { branchId: 'branch_2' }, { changeId: 'record_2' },
      { state: 'pending' }, { targetId: 'cluster_2' }, { targetName: 'other' },
      { targetType: 'NekiRouter', changeType: 'NekiRouterChangeRequest' }] },
  { bind: bindDeleteQueryPatternsReportPreparation, preview: prepareDeleteQueryPatternsReport, scope: report,
    operation: 'delete_query_patterns_report', resource: 'planetscale/query-patterns-report/record_1',
    effect: 'delete-one-query-patterns-report', method: 'DELETE', body: null,
    path: basePath + '/branches/feature/query-patterns/record_1',
    deltas: [{ branch: 'other-feature' }, { branchId: 'branch_2' }, { reportId: 'record_2' }, { state: 'failed' }] },
  { bind: bindDismissSchemaRecommendationPreparation, preview: prepareDismissSchemaRecommendation, scope: recommendation,
    operation: 'dismiss_schema_recommendation', resource: 'planetscale/schema-recommendation/record_1',
    effect: 'dismiss-one-open-schema-recommendation', method: 'POST', body: {},
    path: basePath + '/schema-recommendations/7/dismiss',
    deltas: [{ recommendationId: 'record_2' }, { number: 8 }] },
];
const refused = fn => assert.throws(fn, error => ['schema', 'scope', 'upstream'].includes(error.code)
  && !String(error).includes(canary));

for (const { bind, preview, scope, operation, resource, effect, method, body, path, deltas } of fixtures) {
  test(`${operation} core preparation: complete fixed preview and unconsumed RM obligation`, () => {
    const prepared = bind(scope)({});
    assert.deepEqual(prepared.resource, { id: resource, revision: scope.revision });
    assert.deepEqual(prepared.arguments, {});
    assert.deepEqual(prepared.plan, preview(scope, {}));
    assert.equal(prepared.plan.operationId, operation);
    assert.equal(prepared.plan.tool, `planetscale.${operation}`);
    assert.equal(prepared.plan.tier, 'reserved');
    assert.equal(prepared.plan.effect, effect);
    assert.equal(prepared.plan.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.remotePreconditions, 'not-verified');
    assert.equal(prepared.plan.providerDryRun, 'not-performed');
    assert.deepEqual(prepared.plan.requiredAuthorities, ['release-manager']);
    assert.deepEqual(prepared.plan.proposedRequest, { method, origin: 'https://api.planetscale.com', path, body });
    assert.equal(prepared.artifactDigest, null);
    assert.equal(typeof canonicalHash(prepared), 'string');
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${operation} core preparation: deeply frozen host snapshot survives later mutation`, () => {
    const input = { ...scope }, prepare = bind(input), before = prepare({});
    for (const key of Object.keys(input)) input[key] = canary;
    assert.deepEqual(prepare({}), before);
    assert.equal(Object.getPrototypeOf(before.plan.target), null);
    assert.deepEqual({ ...before.plan.target }, scope);
    const values = [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.arguments, before.plan.proposedRequest, before.plan.requiredAuthorities];
    if (body !== null) values.push(before.plan.proposedRequest.body);
    for (const value of values) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.resource.id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.databaseId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.path = '/other'; }, TypeError);
    assert.throws(() => { before.plan.requiredAuthorities.pop(); }, TypeError);
    if (body !== null) assert.throws(() => { before.plan.proposedRequest.body.reason = canary; }, TypeError);
  });

  test(`${operation} core preparation: caller injection cannot retarget or supply authority`, () => {
    const prepare = bind(scope);
    for (const key of [...Object.keys(scope), 'target', 'resource', 'plan', 'arguments', 'artifactDigest',
      'approval', 'authorities', 'agentId', 'url', 'credential', 'sql', 'force', 'body', 'reason']) refused(() => prepare({ [key]: canary }));
    for (const args of [undefined, null, [], 'x', 1, true, JSON.parse('{"__proto__":{}}')]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'approval', { enumerable: true,
      get() { touched = true; throw new Error(canary); } })));
    assert.equal(touched, false);
  });

  test(`${operation} core preparation: complete closed host identity and revision required`, () => {
    for (const key of Object.keys(scope)) {
      const input = { ...scope };
      delete input[key];
      refused(() => bind(input));
      for (const value of [null, {}, [], canary]) refused(() => bind({ ...scope, [key]: value }));
    }
    for (const input of [null, {}, [], { ...scope, credential: canary }, { ...scope, approval: true },
      { ...scope, databaseId: '../foreign' }, { ...scope, revision: 'latest' }, { ...scope, reason: canary }]) refused(() => bind(input));
  });

  test(`${operation} core preparation: host accessors refused without invocation`, () => {
    for (const key of Object.keys(scope)) {
      let touched = false;
      const input = Object.defineProperty({ ...scope }, key, { enumerable: true,
        get() { touched = true; throw new Error(canary); } });
      refused(() => bind(input));
      assert.equal(touched, false);
    }
  });

  test(`${operation} core preparation: full hash binds identity and classification changes`, () => {
    const original = bind(scope)({});
    for (const delta of [{ organization: 'other-org' }, { database: 'other-db' }, { databaseId: 'database_2' },
      { revision: 'b'.repeat(64) }, { production: true }, ...deltas]) {
      const changed = bind({ ...scope, ...delta })({});
      assert.notEqual(canonicalHash(changed), canonicalHash(original));
      assert.deepEqual(changed.plan.requiredAuthorities, ['release-manager']);
      assert.equal(changed.plan.execution, 'not-implemented');
    }
  });

  test(`${operation} core preparation: deterministic closed arguments without execution hooks`, () => {
    const prepare = bind(scope);
    assert.deepEqual(prepare({}), prepare(Object.create(null)));
    assert.equal(canonicalHash(prepare({})), canonicalHash(prepare({})));
    for (const key of ['execute', 'project', 'credential', 'approval']) {
      assert.equal(Object.hasOwn(prepare, key), false);
      assert.equal(Object.hasOwn(prepare({}), key), false);
    }
  });
}

test('record-mutation core preparations separate equal IDs across resource kinds and closed targets', () => {
  const prepared = fixtures.map(({ bind, scope }) => bind(scope)({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
  for (const fixture of fixtures) {
    for (const other of fixtures.filter(f => f !== fixture)) refused(() => fixture.bind(other.scope));
  }
  const config = { ...branch, changeId: 'record_1', state: 'draft', changeType: 'vtgate' };
  const configKeyspace = { ...config, keyspace: 'main', keyspaceId: 'keyspace_1', changeType: 'mysqld' };
  for (const scope of [config, configKeyspace]) refused(() => bindCancelChangeRequestPreparation(scope));
  refused(() => bindCancelBranchConfigChangePreparation(change));
  refused(() => bindCancelKeyspaceConfigChangePreparation(change));
  const all = [...prepared, bindCancelBranchConfigChangePreparation(config)({}), bindCancelKeyspaceConfigChangePreparation(configKeyspace)({})];
  assert.equal(new Set(all.map(p => p.resource.id)).size, 5);
  assert.equal(new Set(all.map(canonicalHash)).size, 5);
});

test('individual change core preparation requires deletable matching documented target types', () => {
  for (const targetType of ['NekiAdmin', 'NekiCluster', 'NekiConfigurationProfile', 'NekiExternalShard', 'NekiRouter', 'PostgresBouncer']) {
    const prepared = bindCancelChangeRequestPreparation({ ...change, targetType, changeType: `${targetType}ChangeRequest` })({});
    assert.equal(prepared.plan.target.targetType, targetType);
    assert.equal(prepared.plan.target.changeType, `${targetType}ChangeRequest`);
    for (const state of ['queued', 'applying', 'complete', 'failed', 'cancelled', 'unknown', '']) {
      refused(() => bindCancelChangeRequestPreparation({ ...change, targetType, changeType: `${targetType}ChangeRequest`, state }));
    }
    refused(() => bindCancelChangeRequestPreparation({ ...change, targetType, changeType: 'UnknownChangeRequest' }));
  }
  refused(() => bindCancelChangeRequestPreparation({ ...change, canDelete: false }));
  refused(() => bindCancelChangeRequestPreparation({ ...change, targetId: null }));
  refused(() => bindCancelChangeRequestPreparation({ ...change, targetType: 'NekiRouter' }));
});

test('query-report core preparation refuses unfinished or unknown state despite read entitlement', () => {
  for (const state of ['pending', 'draft', 'queued', 'running', 'cancelled', 'unknown', '']) {
    refused(() => bindDeleteQueryPatternsReportPreparation({ ...report, state }));
  }
  assert.equal(bindDeleteQueryPatternsReportPreparation(report)({}).plan.tier, 'reserved');
});

test('recommendation core preparation binds immutable ID independently from number-addressed request', () => {
  const original = bindDismissSchemaRecommendationPreparation(recommendation)({});
  const rebound = bindDismissSchemaRecommendationPreparation({ ...recommendation, recommendationId: 'record_2' })({});
  assert.notEqual(original.resource.id, rebound.resource.id);
  assert.deepEqual(original.plan.proposedRequest, rebound.plan.proposedRequest);
  assert.notEqual(canonicalHash(original), canonicalHash(rebound));
  const renumbered = bindDismissSchemaRecommendationPreparation({ ...recommendation, number: 8 })({});
  assert.deepEqual(original.resource, renumbered.resource);
  assert.notEqual(canonicalHash(original), canonicalHash(renumbered));
  for (const number of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '7']) {
    refused(() => bindDismissSchemaRecommendationPreparation({ ...recommendation, number }));
  }
  for (const state of ['pending', 'dismissed', 'applied', 'closed', 'unknown', '']) {
    refused(() => bindDismissSchemaRecommendationPreparation({ ...recommendation, state }));
  }
});
