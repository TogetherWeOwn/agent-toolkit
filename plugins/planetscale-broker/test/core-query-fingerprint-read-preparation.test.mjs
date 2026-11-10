import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetQueryStatisticsPreparation, bindGetQuerySummaryPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as statisticsRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-query-statistics.js';
import { prepare as summaryRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-query-summary.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64),
  keyspace: 'main', keyspaceId: 'ks_1', fingerprint: 'fingerprint_1' });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging/insights/fingerprint_1';
const cases = [
  { operation: 'get_query_statistics', bind: bindGetQueryStatisticsPreparation, read: statisticsRead,
    key: 'queryIds', binding: ['query_1', 'query_2'], path: `${root}?keyspace=main&page=1&per_page=10`,
    row: { id: 'query_1', explainable: true, truncated: false },
    expected: { id: 'query_1', explainable: true, truncated: false, executionAuthority: 'not-established' } },
  { operation: 'get_query_summary', bind: bindGetQuerySummaryPreparation, read: summaryRead,
    key: 'summaryId', binding: 'summary_1', path: `${root}/summary?keyspace=main`,
    row: { id: 'summary_1', multishard: false }, expected: { id: 'summary_1', multishard: false, executionAuthority: 'not-established' } },
];
const targetFor = c => ({ ...parent(), [c.key]: structuredClone(c.binding) });
const scopeFor = (c, target) => ({ organization: target.organization, database: target.database,
  branch: target.branch, keyspace: target.keyspace, fingerprint: target.fingerprint, [c.key]: target[c.key] });
const envelope = data => ({ type: 'list', prev_page: null, next_page: 2, data });
const bodyFor = (c, patch = {}) => {
  const row = { ...c.row, fingerprint: 'fingerprint_1', keyspace: 'main', ...patch };
  return c.key === 'queryIds' ? envelope([row]) : row;
};
const project = (c, body, target = targetFor(c)) => c.read(scopeFor(c, target), {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: immutable parent, keyspace and fingerprint fix the request`, () => {
    const target = targetFor(c); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/br_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {}); assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: pure preparation grants no execution, collection or non-waking authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'record-and-target-binding-parent-not-verified');
    assert.equal(prepared.plan.execution, 'not-implemented'); assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: receipts omit SQL, fingerprints, keyspace text and parent claims`, () => {
    const result = project(c, bodyFor(c, { normalized_sql: 'synthetic-canary', password: { value: 'synthetic-canary' },
      error_message: 'synthetic-canary', tags: ['synthetic-canary'], query_count: 99,
      actor: 'synthetic-canary', started_at: 'synthetic-canary', branch_id: 'unverified-parent' }));
    assert.deepEqual(result, c.key === 'queryIds' ? { items: [c.expected], hasMore: true, coverage: 'first-page-only' } : c.expected);
    for (const text of ['synthetic-canary', 'unverified-parent', 'fingerprint_1', 'main']) assert.equal(JSON.stringify(result).includes(text), false);
    for (const value of [result, ...(result.items ? [result.items, ...result.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${c.operation}: response context and separate query/summary identities are confined`, () => {
    for (const patch of [{ fingerprint: 'other' }, { keyspace: 'other' }, { id: 'other' },
      { id: c.key === 'queryIds' ? 'summary_1' : 'query_1' }]) assert.throws(() => project(c, bodyFor(c, patch)), { code: 'scope' });
    for (const field of c.key === 'queryIds' ? ['explainable', 'truncated'] : ['multishard'])
      for (const value of [null, 0, 'false']) assert.throws(() => project(c, bodyFor(c, { [field]: value })), { code: 'upstream' });
  });

  test(`${c.operation}: malformed and oversized responses fail closed`, () => {
    for (const body of [null, [], {}, 'synthetic-canary']) assert.throws(() => project(c, body));
    assert.throws(() => c.read(scopeFor(c, targetFor(c)), {}).project(new Uint8Array(65537)), { code: 'upstream' });
  });

  test(`${c.operation}: later host mutations cannot rebind the captured snapshot`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    for (const key of Object.keys(parent())) target[key] = 'other';
    if (c.key === 'queryIds') { target.queryIds[0] = 'other'; target.queryIds.push('other'); }
    else target.summaryId = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.proposedRequest, ...(c.key === 'queryIds' ? [before.plan.target.queryIds] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.keyspace = 'other'; }, TypeError);
  });

  test(`${c.operation}: every parent, keyspace, fingerprint and child binding changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    if (c.key === 'queryIds') {
      for (const index of [0, 1]) { const target = targetFor(c); target.queryIds[index] = 'other'; variants.push(target); }
      const reordered = targetFor(c); reordered.queryIds.reverse(); variants.push(reordered);
    } else variants.push({ ...targetFor(c), summaryId: 'other' });
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot inject selectors, pages, SQL, identities or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.key]: c.binding }, { page: 2 }, { perPage: 1 },
      { fingerprint: 'other' }, { keyspace: 'other' }, { keyspaceId: 'other' }, { sql: 'synthetic-canary' },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'POST' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'fingerprint', { enumerable: true, get() { touched = true; return 'other'; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host captures are closed, required, injection-safe and data-only`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const patch of [{ page: 2 }, { pagination: { page: 1, perPage: 10 } }, { approved: true },
      { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    for (const key of ['keyspace', 'fingerprint']) for (const value of ['x&all=true', 'x?sql=select', 'x/y', 'x%2Fy'])
      refused(() => c.bind({ ...targetFor(c), [key]: value }));
  });
}

test('statistics query IDs remain unique, bounded and accessor-free', () => {
  const c = cases[0];
  for (const queryIds of [[], Array.from({ length: 33 }, (_, i) => `q_${i}`), ['same', 'same'], [null], Array(2)])
    refused(() => c.bind({ ...targetFor(c), queryIds }));
  const queryIds = ['query_1']; let touched = false;
  Object.defineProperty(queryIds, '0', { enumerable: true, get() { touched = true; return 'other'; } });
  refused(() => c.bind({ ...targetFor(c), queryIds })); assert.equal(touched, false);
  assert.equal(c.bind({ ...targetFor(c), queryIds: Array.from({ length: 32 }, (_, i) => `q_${i}`) })({}).plan.target.queryIds.length, 32);
});

test('statistics retain first-page envelope, nullable page metadata and whole-page refusal', () => {
  const c = cases[0]; const row = bodyFor(c).data[0];
  for (const patch of [{ type: 'other' }, { prev_page: 1 }, { next_page: 3 }, { current_page: 2 }, { per_page: 9 },
    { data: [row, row] }, { data: Array(11).fill(row) }, { data: [row, { ...row, id: 'other' }] }])
    assert.throws(() => project(c, { ...envelope([row]), ...patch }));
  for (const patch of [{}, { current_page: null, per_page: null }, { current_page: 1, per_page: 10 }])
    assert.deepEqual(project(c, { ...envelope([row]), ...patch }).items, [c.expected]);
  assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], hasMore: false, coverage: 'first-page-only' });
});

test('fingerprint operations and response-only bindings stay distinct under the same branch', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.deepEqual(prepared[0].resource, prepared[1].resource);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
  for (const c of cases) for (const key of ['keyspaceId', c.key]) {
    const target = targetFor(c); target[key] = key === 'queryIds' ? ['other'] : 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});
