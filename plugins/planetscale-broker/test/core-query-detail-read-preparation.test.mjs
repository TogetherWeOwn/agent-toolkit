import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetBranchQueryPreparation, bindGetBranchQueryTagPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as queryRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query.js';
import { prepare as tagRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query-tag.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'get_branch_query', bind: bindGetBranchQueryPreparation, read: queryRead,
    target: () => ({ ...branch(), queryId: 'record_1' }),
    selected: t => ({ queryId: t.queryId }), resource: 'planetscale/branch-query/record_1',
    path: `${path}/insights/queries/record_1`, identity: 'record-id-only-parent-not-verified',
    body: { id: 'record_1', explainable: true, truncated: false },
    output: { id: 'record_1', explainable: true, truncated: false, executionAuthority: 'not-established' },
    invalid: { explainable: 'true' }, invalidCode: 'upstream' },
  { operation: 'get_branch_query_tag', bind: bindGetBranchQueryTagPreparation, read: tagRead,
    target: () => ({ ...branch(), tag: { id: 'record_1', name: 'tag_name' } }),
    selected: t => ({ tag: t.tag }), resource: 'planetscale/branch-query-tag/record_1',
    path: `${path}/insights/tags/tag_name`, identity: 'record-and-name-parent-not-verified',
    body: { id: 'record_1', name: 'tag_name', source: 'sql' },
    output: { id: 'record_1', source: 'sql', executionAuthority: 'not-established' },
    invalid: { source: 'other' }, invalidCode: 'schema' },
];
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch, ...c.selected(t) });

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable parent/record IDs, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains identity/non-waking gaps without execution authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits query/password/tag/operational canaries`, () => {
    const output = c.read(scopeFor(c, c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent',
      sql: 'synthetic-canary', password: { value: 'synthetic-canary' }, fingerprint: 'synthetic-canary',
      values: ['synthetic-canary'], tags: [{ name: 'synthetic-canary' }], metrics: 'synthetic-canary',
      user: 'synthetic-canary', address: 'synthetic-canary', table: 'synthetic-canary',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', executionAuthority: 'synthetic-canary' })));
    assert.deepEqual(output, c.output);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses rebound identity and malformed selected fields`, () => {
    const read = c.read(scopeFor(c, c.target()), {});
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, id: 'other' }))), { code: 'scope' });
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...c.invalid }))), { code: c.invalidCode });
  });

  test(`${c.operation}: captured target and request remain deeply immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    if (target.tag) target.tag.name = 'other';
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest,
      ...(before.plan.target.tag ? [before.plan.target.tag] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.branchId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
    if (before.plan.target.tag) assert.throws(() => { before.plan.target.tag.name = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field affects plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      if (key === 'tag') continue;
      const prepared = c.bind({ ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
    if (target.tag) for (const key of ['id', 'name']) {
      const changed = c.target();
      changed.tag[key] = 'other';
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/selectors/authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { branchId: 'other' },
      { queryId: 'other' }, { tag: { id: 'other', name: 'other' } }, { summaryId: 'other' },
      { resource: 'other' }, { revision: 'b'.repeat(64) }, { method: 'POST' },
      { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), branch: '../other' },
      { ...c.target(), [Symbol('scope')]: true }, Object.defineProperty(c.target(), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });
}

test('query-tag preparation requires a closed non-accessor ID/name pair', () => {
  const c = cases[1];
  for (const tag of [null, [], {}, { id: 'record_1' }, { name: 'tag_name' },
    { id: 'record_1', name: 'tag_name', value: 'synthetic-canary' }, { id: 'record_1', name: '../other' },
    { id: '../other', name: 'tag_name' }, { id: 'record_1', name: 'tag_name', [Symbol('scope')]: true }]) {
    refused(() => c.bind({ ...c.target(), tag }));
  }
  for (const key of ['id', 'name']) {
    let touched = false;
    const tag = Object.defineProperty(c.target().tag, key, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...c.target(), tag }));
    assert.equal(touched, false);
  }
});

test('query-tag projection matches both ID and name; static summaries route refuses', () => {
  const c = cases[1];
  const read = c.read(scopeFor(c, c.target()), {});
  assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, name: 'other' }))), { code: 'scope' });
  assert.throws(() => c.bind({ ...c.target(), tag: { id: 'record_1', name: 'summaries' } }), { code: 'scope' });
  const prepared = c.bind({ ...c.target(), tag: { id: 'record_1', name: 'SUMMARY' } })({});
  assert.equal(prepared.plan.proposedRequest.path, `${path}/insights/tags/SUMMARY`);
});

test('query and query-tag preparations do not collide with equal record IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
});
