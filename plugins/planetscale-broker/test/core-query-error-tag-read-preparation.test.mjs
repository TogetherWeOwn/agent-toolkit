import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetBranchQueryErrorPreparation, bindListBranchQueryTagsPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as errorRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query-error.js';
import { prepare as tagRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-query-tags.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'br_1', revision: 'a'.repeat(64) });
const root = '/v1/organizations/sample-org/databases/sample-db/branches/staging/insights';
const cases = [
  { operation: 'get_branch_query_error', bind: bindGetBranchQueryErrorPreparation, read: errorRead,
    key: 'queryIds', extra: { errorFingerprint: 'error_1' }, path: `${root}/errors/error_1`,
    identity: 'record-id-only-parent-not-verified', row: { id: 'query_1', explainable: false, truncated: true },
    expected: { id: 'query_1', explainable: false, truncated: true, executionAuthority: 'not-established' } },
  { operation: 'list_branch_query_tags', bind: bindListBranchQueryTagsPreparation, read: tagRead,
    key: 'tags', extra: {}, path: `${root}/tags`, identity: 'record-and-name-parent-not-verified',
    row: { id: 'tag_1', name: 'name_1', source: 'sql' },
    expected: { id: 'tag_1', source: 'sql', executionAuthority: 'not-established' } },
];
const bindings = (c, n) => Array.from({ length: n }, (_, i) => c.key === 'tags'
  ? { id: `tag_${i + 1}`, name: `name_${i + 1}` } : `query_${i + 1}`);
const targetFor = c => ({ ...parent(), ...c.extra, [c.key]: bindings(c, 2) });
const scopeFor = (c, target) => ({ organization: target.organization, database: target.database,
  branch: target.branch, ...c.extra, [c.key]: target[c.key],
  ...(c.key === 'queryIds' ? { errorFingerprint: target.errorFingerprint } : {}) });
const envelope = data => ({ type: 'list', prev_page: null, next_page: 2, data });
const project = (c, body, target = targetFor(c)) => c.read(scopeFor(c, target), {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: immutable host captures fix a first-page GET with empty arguments`, () => {
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

  test(`${c.operation}: preparation has no executor, projection or authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented'); assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: receipts omit SQL, tag text, error fingerprints and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, sql: 'synthetic-canary', query: 'synthetic-canary',
      password: { value: 'synthetic-canary' }, fingerprint: 'synthetic-canary', error_fingerprint: 'synthetic-canary',
      value: 'synthetic-canary', metrics: 'synthetic-canary', actor: 'synthetic-canary',
      created_at: 'synthetic-canary', branch_id: 'unverified-parent' }]));
    assert.deepEqual(result, { items: [c.expected], hasMore: true, coverage: 'first-page-only' });
    for (const text of ['synthetic-canary', 'unverified-parent', 'name_1', 'error_1']) assert.equal(JSON.stringify(result).includes(text), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], hasMore: false, coverage: 'first-page-only' });
  });

  test(`${c.operation}: unknown IDs and malformed metadata refuse the whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    if (c.key === 'tags') {
      for (const name of ['other', 'name_2']) assert.throws(() => project(c, envelope([{ ...c.row, name }])), { code: 'scope' });
      for (const source of ['other', false, null]) assert.throws(() => project(c, envelope([{ ...c.row, source }])), { code: 'schema' });
    } else for (const key of ['explainable', 'truncated']) for (const value of ['false', null, 0])
      assert.throws(() => project(c, envelope([{ ...c.row, [key]: value }])), { code: 'upstream' });
  });

  test(`${c.operation}: pagination, duplicate IDs and wire bounds fail closed`, () => {
    for (const patch of [{ type: 'other' }, { prev_page: 1 }, { next_page: 3 }, { current_page: 2 },
      { per_page: 9 }, { data: [c.row, c.row] }, { data: Array(11).fill(c.row) }, { data: {} }])
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    for (const patch of [{}, { current_page: null, per_page: null }, { current_page: 1, per_page: 10 }])
      assert.deepEqual(project(c, { ...envelope([c.row]), ...patch }).items, [c.expected]);
    assert.throws(() => project(c, [c.row]), { code: 'upstream' });
    assert.throws(() => c.read(scopeFor(c, targetFor(c)), {}).project(new Uint8Array(65537)), { code: 'upstream' });
  });

  test(`${c.operation}: later parent and child mutations cannot rebind frozen captures`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    for (const key of Object.keys(parent())) target[key] = 'other';
    if (c.key === 'tags') { target.tags[0].id = 'other'; target.tags[1].name = 'other'; }
    else { target.queryIds[0] = 'other'; target.errorFingerprint = 'other'; }
    target[c.key].push('other'); assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.key], before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    if (c.key === 'tags') for (const tag of before.plan.target.tags) assert.ok(Object.isFrozen(tag));
    assert.throws(() => { before.plan.target[c.key][0] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field changes plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [...Object.keys(parent()), ...Object.keys(c.extra)].map(key =>
      ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) for (const key of c.key === 'tags' ? ['id', 'name'] : [null]) {
      const target = targetFor(c);
      if (key) target.tags[index][key] = 'other'; else target.queryIds[index] = 'other';
      variants.push(target);
    }
    const reordered = targetFor(c); reordered[c.key].reverse(); variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot inject page, selectors, SQL, scope or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.key]: bindings(c, 1) }, { page: 2 }, { perPage: 1 },
      { queryId: 'query_1' }, { sql: 'synthetic-canary' }, { errorFingerprint: 'other' }, { approved: true },
      { credential: 'synthetic-canary' }, { revision: 'b'.repeat(64) }, { method: 'POST' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 2; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host captures reject missing, unknown, duplicate and accessor fields`, () => {
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

test('query-tag host captures reject duplicate names, unknown fields and nested accessors', () => {
  const c = cases[1];
  for (const tags of [[{ id: 'a', name: 'same' }, { id: 'b', name: 'same' }],
    [{ id: 'a', name: 'one', approved: true }], [{ id: 'a' }]]) refused(() => c.bind({ ...targetFor(c), tags }));
  for (const key of ['id', 'name']) {
    let touched = false;
    const child = Object.defineProperty({ ...bindings(c, 1)[0] }, key, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), tags: [child] })); assert.equal(touched, false);
  }
});

test('error-query response fingerprints do not authenticate the error-fingerprint route', () => {
  const c = cases[0];
  const rows = ['other-error', 'query-fingerprint', null].map(fingerprint => ({ ...c.row, fingerprint, error_fingerprint: fingerprint }));
  for (const row of rows) assert.deepEqual(project(c, envelope([row])).items, [c.expected]);
  const target = { ...targetFor(c), errorFingerprint: 'other' };
  assert.notDeepEqual(c.bind(target)({}).plan.proposedRequest, c.bind(targetFor(c))({}).plan.proposedRequest);
  assert.equal(c.bind(target)({}).plan.responseIdentity, 'record-id-only-parent-not-verified');
});

test('query collections and response-only bindings remain distinct with identical resource or request', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.deepEqual(prepared[0].resource, prepared[1].resource);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
  for (const c of cases) {
    const target = targetFor(c);
    if (c.key === 'tags') target.tags[0].name = 'other'; else target.queryIds[0] = 'other';
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});
