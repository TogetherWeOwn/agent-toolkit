import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListBranchQueriesPreparation, bindListBranchQueryErrorsPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as summaryRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-queries.js';
import { prepare as errorRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-query-errors.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging/insights';
const cases = [
  { operation: 'list_branch_queries', bind: bindListBranchQueriesPreparation, read: summaryRead,
    key: 'summaryIds', path: root, identity: 'record-id-only-parent-not-verified',
    row: { id: 'summary_1', multishard: false }, expected: { id: 'summary_1', multishard: false, executionAuthority: 'not-established' } },
  { operation: 'list_branch_query_errors', bind: bindListBranchQueryErrorsPreparation, read: errorRead,
    key: 'errors', path: `${root}/errors`, identity: 'record-and-target-binding-parent-not-verified',
    row: { id: 'summary_1', error_fingerprint: 'fingerprint_1' }, expected: { id: 'summary_1', executionAuthority: 'not-established' } },
];
const bindings = (c, n) => Array.from({ length: n }, (_, i) => c.key === 'errors'
  ? { id: `summary_${i + 1}`, fingerprint: `fingerprint_${i + 1}` } : `summary_${i + 1}`);
const targetFor = c => ({ ...parent(), [c.key]: bindings(c, 2) });
const scopeFor = (c, target) => ({ organization: target.organization, database: target.database,
  branch: target.branch, [c.key]: target[c.key] });
const envelope = data => ({ type: 'list', prev_page: null, next_page: 2, data });
const project = (c, body, target = targetFor(c)) => c.read(scopeFor(c, target), {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: immutable parent and summary bindings fix the first-page request`, () => {
    const target = targetFor(c); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/br_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {}); assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: `${c.path}?page=1&per_page=10` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: pure preparation confers no collection, execution or non-waking authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented'); assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: receipts omit SQL, fingerprints, errors, metrics and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, sql: 'synthetic-canary', query: 'synthetic-canary',
      password: { value: 'synthetic-canary' }, fingerprint: 'synthetic-canary', error: 'synthetic-canary',
      metrics: 'synthetic-canary', actor: 'synthetic-canary', created_at: 'synthetic-canary', branch_id: 'unverified-parent' }]));
    assert.deepEqual(result, { items: [c.expected], hasMore: true, coverage: 'first-page-only' });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    assert.equal(JSON.stringify(result).includes('fingerprint_1'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], hasMore: false, coverage: 'first-page-only' });
  });

  test(`${c.operation}: unknown identities and rebound error fingerprints refuse the whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    if (c.key === 'errors') {
      for (const error_fingerprint of ['other', 'fingerprint_2']) assert.throws(() => project(c, envelope([{ ...c.row, error_fingerprint }])), { code: 'scope' });
    } else for (const multishard of ['false', null, 0]) assert.throws(() => project(c, envelope([{ ...c.row, multishard }])), { code: 'upstream' });
  });

  test(`${c.operation}: first-page envelope, duplicate and wire bounds fail closed`, () => {
    for (const patch of [{ type: 'other' }, { prev_page: 1 }, { next_page: 3 }, { data: [c.row, c.row] },
      { data: Array(11).fill(c.row) }, { data: {} }]) assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    assert.throws(() => project(c, [c.row]), { code: 'upstream' });
    assert.throws(() => c.read(scopeFor(c, targetFor(c)), {}).project(new Uint8Array(65537)), { code: 'upstream' });
  });

  test(`${c.operation}: later parent and summary mutations cannot rebind captured snapshots`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    for (const key of Object.keys(parent())) target[key] = 'other';
    if (c.key === 'errors') { target.errors[0].id = 'other'; target.errors[1].fingerprint = 'other'; }
    else target.summaryIds[0] = 'other';
    target[c.key].push('other'); assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.key], before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    if (c.key === 'errors') for (const child of before.plan.target.errors) assert.ok(Object.isFrozen(child));
    assert.throws(() => { before.plan.target[c.key][0] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every parent and summary binding changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) for (const key of c.key === 'errors' ? ['id', 'fingerprint'] : [null]) {
      const target = targetFor(c);
      if (key) target.errors[index][key] = 'other'; else target.summaryIds[index] = 'other';
      variants.push(target);
    }
    const reordered = targetFor(c); reordered[c.key].reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot inject page, filters, SQL, bindings or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.key]: bindings(c, 1) }, { page: 2 }, { perPage: 1 },
      { queryId: 'query_1' }, { sql: 'synthetic-canary' }, { fingerprint: 'other' }, { approved: true },
      { credential: 'synthetic-canary' }, { revision: 'b'.repeat(64) }, { method: 'POST' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 2; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host captures are closed, unique, bounded and data-only`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const children of [[], bindings(c, 33), [bindings(c, 1)[0], bindings(c, 1)[0]], [null]]) refused(() => c.bind({ ...targetFor(c), [c.key]: children }));
    const children = bindings(c, 2); let touched = false;
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.key]: children })); assert.equal(touched, false);
    for (const patch of [{ page: 2 }, { pagination: { page: 1, perPage: 10 } }, { queryId: 'query_1' },
      { approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.key]: bindings(c, 32) })({}).plan.target[c.key].length, 32);
  });
}

test('error summary captures reject duplicate fingerprints, unknown fields and accessors', () => {
  const c = cases[1];
  for (const errors of [[{ id: 'a', fingerprint: 'same' }, { id: 'b', fingerprint: 'same' }],
    [{ id: 'a', fingerprint: 'one', approved: true }], [{ id: 'a' }]]) refused(() => c.bind({ ...targetFor(c), errors }));
  for (const key of ['id', 'fingerprint']) {
    let touched = false;
    const child = Object.defineProperty({ ...bindings(c, 1)[0] }, key, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), errors: [child] })); assert.equal(touched, false);
  }
});

test('error list nullable optional pagination remains fixed to the first page', () => {
  const c = cases[1];
  for (const patch of [{}, { current_page: null, per_page: null }, { current_page: 1, per_page: 10 }])
    assert.deepEqual(project(c, { ...envelope([c.row]), ...patch }).items, [c.expected]);
  for (const patch of [{ current_page: 2 }, { per_page: 9 }]) assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
});

test('summary operations and response-only bindings remain distinct with identical resource or request', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.deepEqual(prepared[0].resource, prepared[1].resource);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
  for (const c of cases) {
    const target = targetFor(c);
    if (c.key === 'errors') target.errors[0].fingerprint = 'other'; else target.summaryIds[0] = 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});
