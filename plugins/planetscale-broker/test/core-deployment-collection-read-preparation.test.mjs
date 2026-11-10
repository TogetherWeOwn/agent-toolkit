import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetDeployQueuePreparation, bindListDeployOperationsPreparation,
  bindListDeployRequestReviewsPreparation, bindListSchemaRecommendationsPreparation,
} from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as queueRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-deploy-queue.js';
import { prepare as operationRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-deploy-operations.js';
import { prepare as reviewRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-deploy-request-reviews.js';
import { prepare as recommendationRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-schema-recommendations.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  revision: 'a'.repeat(64), pagination: { page: 2, perPage: 3 } });
const request = () => ({ id: 'request_1', number: 1, branch: 'source-1', branchId: 'branch_1', intoBranch: 'main' });
const deployment = (i = 1) => ({ id: `deployment_${i}`, number: i, intoBranch: 'main' });
const recommendation = (i = 1) => ({ id: `recommendation_${i}`, number: i });
const childParent = () => ({ ...database(), request: request() });
const root = '/v1/organizations/sample-org/databases/sample-db';
const cases = [
  { operation: 'get_deploy_queue', bind: bindGetDeployQueuePreparation, read: queueRead, parent: database,
    field: 'deployments', children: () => [deployment(1), deployment(2)], child: deployment,
    resource: 'planetscale/database/db_1', path: `${root}/deploy-queue`,
    identity: 'record-and-number-parent-and-destination-not-verified',
    row: { id: 'deployment_1', deploy_request_number: 1, into_branch: 'main', state: 'ready',
      auto_cutover: false, auto_delete_branch: false, queue_paused: true },
    output: { ...deployment(), state: 'ready', autoCutover: false, autoDeleteBranch: false, queuePaused: true } },
  { operation: 'list_deploy_operations', bind: bindListDeployOperationsPreparation, read: operationRead, parent: childParent,
    field: 'childIds', children: () => ['child_1', 'child_2'], child: i => `child_${i}`,
    resource: 'planetscale/deploy-request/request_1', path: `${root}/deploy-requests/1/operations`,
    identity: 'record-id-only-parent-not-verified',
    row: { id: 'child_1', state: 'complete', can_drop_data: true, table_locked: false },
    output: { id: 'child_1', state: 'complete', canDropData: true, tableLocked: false } },
  { operation: 'list_deploy_request_reviews', bind: bindListDeployRequestReviewsPreparation, read: reviewRead, parent: childParent,
    field: 'childIds', children: () => ['child_1', 'child_2'], child: i => `child_${i}`,
    resource: 'planetscale/deploy-request/request_1', path: `${root}/deploy-requests/1/reviews`,
    identity: 'record-id-only-parent-not-verified', row: { id: 'child_1', state: 'approved' },
    output: { id: 'child_1', providerState: 'approved', nativeApproval: 'not-established' } },
  { operation: 'list_schema_recommendations', bind: bindListSchemaRecommendationsPreparation, read: recommendationRead, parent: database,
    field: 'recommendations', children: () => [recommendation(1), recommendation(2)], child: recommendation,
    resource: 'planetscale/database/db_1', path: `${root}/schema-recommendations`,
    identity: 'record-and-number-parent-not-verified',
    row: { id: 'recommendation_1', number: 1, state: 'applied', recommendation_type: 'unused_table' },
    output: { ...recommendation(), state: 'applied', recommendationType: 'unused_table' } },
];
const targetFor = c => ({ ...c.parent(), [c.field]: c.children() });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database,
  ...(t.request ? { request: t.request } : {}), [c.field]: t[c.field] });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });
const leaves = (value, path = []) => value && typeof value === 'object'
  ? Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key])) : [[path, value]];
const setAt = (value, path, replacement) => {
  const parent = path.slice(0, -1).reduce((item, key) => item[key], value);
  parent[path.at(-1)] = replacement;
};

for (const c of cases) {
  test(`${c.operation}: immutable host parent, child and page produce the existing fixed GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: no collection permission, executor, approval or non-waking claim`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: scalar projection omits SQL, actors, errors, times and parent assertions`, () => {
    const result = project(c, envelope([{ ...c.row, password: 'synthetic-canary', ddl: 'synthetic-canary',
      sql: 'synthetic-canary', actor: 'synthetic-canary', error: 'synthetic-canary', created_at: 'synthetic-canary',
      table: 'synthetic-canary', approved: true, organization_id: 'unverified-parent', database_id: 'unverified-parent',
      deploy_request_id: 'unverified-parent', into_branch_id: 'unverified-parent', metadata: { token: 'synthetic-canary' } }]));
    assert.deepEqual(result, { items: [c.output], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown children, malformed state and pagination refuse the entire page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope([{ ...c.row, state: 'unknown' }])), { code: 'schema' });
    for (const change of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: [c.row, c.row, c.row, c.row] }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...change }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: captures every nested host value before later mutation`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    for (const [path, value] of leaves(target)) setAt(target, path, typeof value === 'number' ? 10 : 'other');
    target[c.field].push(c.child(3));
    assert.deepEqual(prepare({}), before);
    const frozen = value => {
      if (!value || typeof value !== 'object') return;
      assert.ok(Object.isFrozen(value));
      for (const item of Object.values(value)) frozen(item);
    };
    frozen(before);
    assert.throws(() => { before.plan.target[c.field][0] = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.pagination.page = 3; }, TypeError);
  });

  test(`${c.operation}: every host leaf and child order affects plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [];
    for (const [path, value] of leaves(targetFor(c))) {
      const target = targetFor(c);
      setAt(target, path, typeof value === 'number' ? value + 10 : path.at(-1) === 'revision' ? 'b'.repeat(64) : 'other');
      // Keep the changed pagination within its separate ten-row cap.
      if (path.join('.') === 'pagination.perPage') target.pagination.perPage = 4;
      variants.push(target);
    }
    const reordered = targetFor(c);
    reordered[c.field].reverse();
    variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override bindings, transport, pagination or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: c.children() }, { request: request() },
      { page: 1 }, { perPage: 10 }, { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
      refused(() => prepare(raw));
    }
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing, extra and accessor host fields refuse without evaluation`, () => {
    for (const raw of [null, [], {}, { ...targetFor(c), approved: true }, { ...targetFor(c), credential: 'synthetic-canary' },
      { ...targetFor(c), revision: 'latest' }, { ...targetFor(c), [Symbol('scope')]: true },
      Object.defineProperty(targetFor(c), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c);
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });

  test(`${c.operation}: unique bounded children, nested captures and host pagination are closed`, () => {
    const rows = n => Array.from({ length: n }, (_, i) => c.child(i + 1));
    const bad = [[], rows(33), [c.child(1), c.child(1)], ['../escape']];
    if (c.field !== 'childIds') bad.push([{ ...c.child(1), approved: true }], [c.child(1), { ...c.child(2), number: 1 }],
      [{ ...c.child(1), number: 0 }]);
    for (const children of bad) refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    let touched = false;
    const children = c.children();
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return c.child(1); } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    assert.equal(touched, false);
    if (c.field === 'childIds') {
      for (const change of [{ number: 0 }, { id: '../escape' }, { branchId: '../escape' }, { approved: true }]) {
        refused(() => c.bind({ ...targetFor(c), request: { ...request(), ...change } }));
      }
    }
    const max = { ...targetFor(c), [c.field]: rows(32), pagination: { page: 100, perPage: 10 } };
    assert.equal(c.bind(max)({}).plan.target[c.field].length, 32);
  });
}

test('deployment collection operations sharing a resource cannot collide', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(prepared[0].resource.id, prepared[3].resource.id);
  assert.equal(prepared[1].resource.id, prepared[2].resource.id);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 4);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 4);
});

test('independent child and request-ID bindings change hashes even with identical collection paths', () => {
  for (const c of cases) {
    const original = c.bind(targetFor(c))({});
    const target = targetFor(c);
    if (c.field === 'childIds') target.childIds[0] = 'other';
    else target[c.field][0].id = 'other';
    const variants = [target];
    if (target.request) variants.push({ ...targetFor(c), request: { ...request(), id: 'other' } });
    for (const variant of variants) {
      const changed = c.bind(variant)({});
      assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  }
});

test('queue/recommendation tuples must match and provider approval is never native approval', () => {
  const queue = cases[0];
  for (const patch of [{ deploy_request_number: 2 }, { into_branch: 'other' }]) {
    assert.throws(() => project(queue, envelope([{ ...queue.row, ...patch }])), { code: 'scope' });
  }
  assert.throws(() => project(queue, envelope([{ ...queue.row, auto_cutover: 'true' }])), { code: 'upstream' });
  assert.throws(() => project(cases[3], envelope([{ ...cases[3].row, number: 2 }])), { code: 'scope' });
  assert.throws(() => project(cases[3], envelope([{ ...cases[3].row, recommendation_type: 'unknown' }])), { code: 'schema' });
  assert.throws(() => project(cases[1], envelope([{ ...cases[1].row, can_drop_data: 'true' }])), { code: 'upstream' });
  assert.equal(project(cases[2], envelope([cases[2].row])).items[0].nativeApproval, 'not-established');
});
