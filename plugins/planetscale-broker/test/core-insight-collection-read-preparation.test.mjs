import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListBranchAnomaliesPreparation, bindListTrafficBudgetsPreparation,
  bindListGeneratedQueryPatternsReportsPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as anomalyRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-anomalies.js';
import { prepare as budgetRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-traffic-budgets.js';
import { prepare as reportRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-generated-query-patterns-reports.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64) });
const cases = [
  { operation: 'list_branch_anomalies', bind: bindListBranchAnomaliesPreparation, read: anomalyRead,
    field: 'anomalyIds', path: '/insights/anomalies?page=2&per_page=3', paginated: true,
    row: { id: 'record_1', active: true },
    output: { id: 'record_1', active: true, remediationAuthority: 'not-established' },
    malformed: { active: 'true' }, malformedCode: 'upstream' },
  { operation: 'list_traffic_budgets', bind: bindListTrafficBudgetsPreparation, read: budgetRead,
    field: 'budgetIds', path: '/traffic/budgets?page=2&per_page=3', paginated: true,
    row: { id: 'record_1', mode: 'warn' },
    output: { id: 'record_1', mode: 'warn', effectiveEnforcement: 'not-established' },
    malformed: { mode: 'unknown' }, malformedCode: 'schema' },
  { operation: 'list_generated_query_patterns_reports', bind: bindListGeneratedQueryPatternsReportsPreparation, read: reportRead,
    field: 'reportIds', path: '/query-patterns?limit=10', paginated: false,
    row: { id: 'record_1', state: 'completed' },
    output: { id: 'record_1', state: 'completed', downloadAuthority: 'not-established' },
    malformed: { state: 'unknown' }, malformedCode: 'schema' },
];
const ids = n => Array.from({ length: n }, (_, i) => `record_${i + 1}`);
const targetFor = c => ({ ...parent(), [c.field]: ids(2), ...(c.paginated ? { pagination: { page: 2, perPage: 3 } } : {}) });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch, [c.field]: t[c.field] });
const envelope = (c, data) => c.paginated ? { current_page: 2, per_page: 3, next_page: 3, data }
  : { type: 'list', has_prev: false, has_next: data.length > 0,
    cursor_start: data[0]?.id ?? null, cursor_end: data.at(-1)?.id ?? null, data };
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination ?? {})
  .project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: exact fixed collection GET and closed host resource`, () => {
    const target = targetFor(c); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/branch_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination ?? {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `/v1/organizations/sample-org/databases/sample-db/branches/staging${c.path}` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: child confinement is not parent, collection or native authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'remediationAuthority', 'downloadAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: frozen receipts omit SQL, rules, report and actor canaries`, () => {
    const result = project(c, envelope(c, [{ ...c.row, sql: 'synthetic-canary', correlations: ['synthetic-canary'],
      fingerprint: 'synthetic-canary', rules: [{ sql: 'synthetic-canary' }], tags: 'synthetic-canary',
      threshold: 'synthetic-canary', metrics: 'synthetic-canary', report: 'synthetic-canary', url: 'synthetic-canary',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', branch_id: 'unverified-parent' }]));
    assert.deepEqual(result, c.paginated ? { items: [c.output], nextPage: 3, complete: false }
      : { items: [c.output], hasMore: true, coverage: 'first-page-only-not-completeness-evidence' });
    for (const canary of ['synthetic-canary', 'unverified-parent']) assert.equal(JSON.stringify(result).includes(canary), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    const empty = envelope(c, []); if (c.paginated) empty.next_page = null;
    assert.deepEqual(project(c, empty), c.paginated ? { items: [], nextPage: null, complete: true }
      : { items: [], hasMore: false, coverage: 'first-page-only-not-completeness-evidence' });
  });

  test(`${c.operation}: unknown, duplicate or malformed children refuse the whole response`, () => {
    assert.throws(() => project(c, envelope(c, [c.row, { ...c.row, id: 'unknown' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope(c, [c.row, { ...c.row, id: 'record_2', ...c.malformed }])), { code: c.malformedCode });
    assert.throws(() => project(c, envelope(c, [c.row, c.row])), { code: 'upstream' });
    if (c.paginated) for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
      assert.throws(() => project(c, { ...envelope(c, [c.row]), ...patch }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: parents, child arrays and host page are captured and deeply frozen`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    target[c.field][0] = 'other'; target[c.field].push('third');
    if (c.paginated) { target.pagination.page = 3; target.pagination.perPage = 4; }
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], before.plan.proposedRequest,
      ...(c.paginated ? [before.plan.target.pagination] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field, child ID and order changes plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) { const target = targetFor(c); target[c.field][index] = 'other'; variants.push(target); }
    const reordered = targetFor(c); reordered[c.field].reverse(); variants.push(reordered);
    if (c.paginated) for (const key of ['page', 'perPage']) { const target = targetFor(c); target.pagination[key]++; variants.push(target); }
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot replace host IDs, page, request or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: ids(1) }, { branchId: 'other' }, { page: 1 }, { perPage: 10 },
      { cursor: 'record_1' }, { limit: 20 }, { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' },
      { revision: 'b'.repeat(64) }, { url: 'https://example.invalid' }, { [Symbol('scope')]: true },
      Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host input is closed, unique, bounded and accessor-free`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const children of [[], ids(33), ['same', 'same'], [null], ['../escape'], [{ id: 'one' }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    }
    const children = ids(2); let touched = false;
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children })); assert.equal(touched, false);
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: ids(32) })({}).plan.target[c.field].length, 32);
  });
}

test('anomaly and budget collections require bounded captured host pages', () => {
  for (const c of cases.filter(c => c.paginated)) for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 },
    { page: 2, perPage: 0 }, { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) {
    refused(() => c.bind({ ...targetFor(c), pagination }));
  }
});

test('report collection is fixed first page, never caller cursor or generic pagination', () => {
  const c = cases[2];
  for (const patch of [{ pagination: { page: 2, perPage: 3 } }, { cursor: 'record_1' }, { limit: 20 }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
  for (const patch of [{ type: 'page' }, { has_prev: true }, { has_next: 'true' }, { cursor_start: 'other' },
    { cursor_end: 'other' }, { data: Array(11).fill(c.row) }]) {
    assert.throws(() => project(c, { ...envelope(c, [c.row]), ...patch }), { code: 'upstream' });
  }
  assert.throws(() => project(c, { ...envelope(c, []), has_next: true }), { code: 'upstream' });
});

test('insight collections cannot collide despite sharing parent and child IDs', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, cases.length);
  assert.equal(new Set(prepared.map(p => canonicalHash(p))).size, cases.length);
});

test('independent parent and child IDs remain hashed when the collection request is unchanged', () => {
  for (const c of cases) for (const key of ['organizationId', 'databaseId', 'branchId', c.field]) {
    const target = targetFor(c); if (key === c.field) target[key][0] = 'other'; else target[key] = 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(changed.plan.proposedRequest, original.plan.proposedRequest);
    assert.notEqual(canonicalHash(changed.plan), canonicalHash(original.plan));
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
  }
});
