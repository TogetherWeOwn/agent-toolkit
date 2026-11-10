import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as deployment from '../../../dist/plugins/planetscale-broker/src/tools/get-deployment.js';
import * as queue from '../../../dist/plugins/planetscale-broker/src/tools/get-deploy-queue.js';
import * as operations from '../../../dist/plugins/planetscale-broker/src/tools/list-deploy-operations.js';
import * as reviews from '../../../dist/plugins/planetscale-broker/src/tools/list-deploy-request-reviews.js';
import * as recommendations from '../../../dist/plugins/planetscale-broker/src/tools/list-schema-recommendations.js';
import * as recommendation from '../../../dist/plugins/planetscale-broker/src/tools/get-schema-recommendation.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const db = { organization: 'example-org', database: 'example-db' };
const dbPath = '/v1/organizations/example-org/databases/example-db';
const request = { id: 'dr123', number: 7, branch: 'staging', branchId: 'br123', intoBranch: 'main' };
const deploymentBinding = { id: 'dp123', number: 7, intoBranch: 'main' };
const recommendationBinding = { id: 'sr123', number: 9 };
const deploymentRow = { id: 'dp123', deploy_request_number: 7, into_branch: 'main', state: 'ready', auto_cutover: false, auto_delete_branch: true, queue_paused: false, actor: { name: canary }, deploy_check_errors: canary, deploy_operations: [{ ddl_statement: canary }], locked_table_name: canary, queue_pause_reason: canary, deployable: true };
const deploymentExpected = { ...deploymentBinding, state: 'ready', autoCutover: false, autoDeleteBranch: true, queuePaused: false };
const operationRow = { id: 'op123', state: 'in_progress', can_drop_data: true, table_locked: false, ddl_statement: canary, syntax_highlighted_ddl: canary, table_name: canary, keyspace_name: canary, operation_name: canary, deploy_errors: canary, deploy_error_docs_url: canary, removed_foreign_key_names: [canary] };
const operationExpected = { id: 'op123', state: 'in_progress', canDropData: true, tableLocked: false };
const reviewRow = { id: 'rv123', state: 'approved', body: canary, html_body: canary, actor: { name: canary }, approval: { token: canary } };
const reviewExpected = { id: 'rv123', providerState: 'approved', nativeApproval: 'not-established' };
const recommendationRow = { id: 'sr123', number: 9, state: 'open', recommendation_type: 'new_index', title: canary, table_name: canary, keyspace: canary, ddl_statement: canary, html_url: canary, closed_by_deploy_request: { notes: canary }, dismissed_by: { name: canary } };
const recommendationExpected = { ...recommendationBinding, state: 'open', recommendationType: 'new_index' };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [deployment, { ...db, deployment: deploymentBinding }, 'deployment', deploymentRow, deploymentExpected, dbPath + '/deploy-requests/7/deployment', false],
  [queue, { ...db, deployments: [deploymentBinding] }, 'deployments', deploymentRow, deploymentExpected, dbPath + '/deploy-queue', true],
  [operations, { ...db, request, childIds: ['op123'] }, 'childIds', operationRow, operationExpected, dbPath + '/deploy-requests/7/operations', true],
  [reviews, { ...db, request, childIds: ['rv123'] }, 'childIds', reviewRow, reviewExpected, dbPath + '/deploy-requests/7/reviews', true],
  [recommendations, { ...db, recommendations: [recommendationBinding] }, 'recommendations', recommendationRow, recommendationExpected, dbPath + '/schema-recommendations', true],
  [recommendation, { ...db, recommendation: recommendationBinding }, 'recommendation', recommendationRow, recommendationExpected, dbPath + '/schema-recommendations/9', false],
];

for (const [adapter, scope, bindingKey, row, expected, path, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const response = rows => list ? page(rows) : rows[0];
  const project = (prepared, rows) => prepared.project(wire(response(rows)));
  test(`${adapter.operationId}: fixed endpoint and metadata projection exclude DDL and free text`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(list ? result.items[0] : result));
    if (list) {
      assert.ok(Object.isFrozen(result.items));
      assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
    }
  });

  test(`${adapter.operationId}: mismatched identity refuses the entire response`, () => {
    const prepared = adapter.prepare(scope, args);
    const changes = [{ id: 'foreign' }, { id: null }, { id: canary }];
    if (bindingKey.startsWith('deployment')) changes.push({ deploy_request_number: 8 }, { deploy_request_number: '7' }, { into_branch: 'foreign' });
    if (bindingKey.startsWith('recommendation')) changes.push({ number: 8 }, { number: '9' });
    for (const change of changes) assert.throws(() => project(prepared, list ? [row, { ...row, ...change }] : [{ ...row, ...change }]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: malformed selected fields and bounded wire refuse without reflection`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const key of Object.keys(expected).filter(key => key !== 'nativeApproval')) {
      const wireKey = ({ number: bindingKey.startsWith('deployment') ? 'deploy_request_number' : 'number', intoBranch: 'into_branch', autoCutover: 'auto_cutover', autoDeleteBranch: 'auto_delete_branch', queuePaused: 'queue_paused', canDropData: 'can_drop_data', tableLocked: 'table_locked', providerState: 'state', recommendationType: 'recommendation_type' })[key] ?? key;
      for (const value of [null, {}, canary]) assert.throws(() => project(prepared, [{ ...row, [wireKey]: value }]), error => !String(error).includes(canary));
    }
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed input cannot carry target overrides or authority`, () => {
    for (const key of ['sql', 'ddl', 'branch', 'state', 'number', 'credential', 'url', 'approval', 'agentId', 'production', 'all']) assert.throws(() => adapter.prepare(scope, { ...args, [key]: canary }));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, database: 'a?b' }]) assert.throws(() => adapter.prepare(value, args));
    const hostile = Object.defineProperty({ ...scope }, bindingKey, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    if (list) {
      for (const value of [[], [scope[bindingKey][0], scope[bindingKey][0]], Array(33).fill(scope[bindingKey][0]), ['../escape']]) assert.throws(() => adapter.prepare({ ...scope, [bindingKey]: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    } else {
      for (const value of [{ ...scope[bindingKey], number: 0 }, { ...scope[bindingKey], number: -0 }, { ...scope[bindingKey], number: 2147483648 }, { ...scope[bindingKey], approval: true }]) assert.throws(() => adapter.prepare({ ...scope, [bindingKey]: value }, args));
    }
  });

  test(`${adapter.operationId}: prepared scope and pagination are immutable snapshots`, () => {
    const copiedScope = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copiedScope, copiedArgs);
    copiedScope.organization = 'foreign';
    copiedScope.database = 'foreign';
    if (bindingKey === 'childIds') { copiedScope.childIds.push('foreign'); copiedScope.request.number = 9; }
    else if (list) { copiedScope[bindingKey][0].id = 'foreign'; copiedScope[bindingKey].push({ ...copiedScope[bindingKey][0], id: 'foreign', number: 8 }); }
    else copiedScope[bindingKey].id = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });
}

test('deployment and recommendation list bindings refuse duplicate ID or number independently', () => {
  for (const [adapter, key, binding] of [[queue, 'deployments', deploymentBinding], [recommendations, 'recommendations', recommendationBinding]]) {
    for (const second of [{ ...binding, id: 'other' }, { ...binding, number: 8 }]) assert.throws(() => adapter.prepare({ ...db, [key]: [binding, second] }, { page: 1, perPage: 2 }));
  }
});

test('provider review approval is informational even when extra authority is supplied', () => {
  const result = reviews.prepare({ ...db, request, childIds: ['rv123'] }, { page: 1, perPage: 2 }).project(wire(page([{ ...reviewRow, nativeApproval: 'accepted', approved: true }])));
  assert.equal(result.items[0].providerState, 'approved');
  assert.equal(result.items[0].nativeApproval, 'not-established');
  assert.ok(!Object.hasOwn(result.items[0], 'approved'));
});

test('deployment detail enum projections cover the pinned schema without broadening values', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const entries = [
    [deployment, { ...db, deployment: deploymentBinding }, {}, deploymentRow, schema.definitions.Deployment.properties.state.enum, 'state', 'state'],
    [operations, { ...db, request, childIds: ['op123'] }, { page: 1, perPage: 2 }, operationRow, schema.definitions.PaginatedDeployOperation.properties.data.items.properties.state.enum, 'state', 'state'],
    [reviews, { ...db, request, childIds: ['rv123'] }, { page: 1, perPage: 2 }, reviewRow, schema.definitions.DeployRequestReview.properties.state.enum, 'state', 'providerState'],
    [recommendation, { ...db, recommendation: recommendationBinding }, {}, recommendationRow, schema.definitions.SchemaRecommendation.properties.state.enum, 'state', 'state'],
    [recommendation, { ...db, recommendation: recommendationBinding }, {}, recommendationRow, schema.definitions.SchemaRecommendation.properties.recommendation_type.enum, 'recommendation_type', 'recommendationType'],
  ];
  for (const [adapter, scope, args, row, values, key, outputKey] of entries) {
    const prepared = adapter.prepare(scope, args);
    const project = value => prepared.project(wire(Object.hasOwn(args, 'page') ? page([{ ...row, [key]: value }]) : { ...row, [key]: value }));
    for (const value of values) {
      const result = project(value);
      assert.equal((Object.hasOwn(args, 'page') ? result.items[0] : result)[outputKey], value);
    }
    assert.throws(() => project('unknown-new-state'));
  }
});
