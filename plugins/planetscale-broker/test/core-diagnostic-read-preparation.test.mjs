import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindLintBranchSchemaPreparation, bindCheckDeployRequestStoragePreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as lintRead } from '../../../dist/plugins/planetscale-broker/src/tools/lint-branch-schema.js';
import { prepare as storageRead } from '../../../dist/plugins/planetscale-broker/src/tools/check-deploy-request-storage.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db';
const lintRow = { keyspace_name: 'main', subject_type: 'table_error', lint_error: 'synthetic-canary',
  table_name: 'synthetic-canary', error_description: 'synthetic-canary', column_name: 'synthetic-canary' };
const cases = [
  { operation: 'lint_branch_schema', bind: bindLintBranchSchemaPreparation, read: lintRead,
    target: () => ({ ...database(), branch: 'staging', branchId: 'branch_1', keyspaceNames: ['main', 'archive'] }),
    scope: t => ({ organization: t.organization, database: t.database, branch: t.branch, keyspaceNames: t.keyspaceNames }),
    args: { page: 1, perPage: 10 }, resource: 'planetscale/branch/branch_1',
    path: `${path}/branches/staging/schema/lint?page=1&per_page=10`,
    identity: 'keyspace-name-only-parent-not-verified',
    body: { current_page: 1, per_page: 10, next_page: null, data: [lintRow] },
    invalid: { data: [{ ...lintRow, subject_type: 'approved' }] }, invalidCode: 'schema',
    output: { items: [{ keyspace: 'main', subjectType: 'table_error', deploymentAuthority: 'not-established' }],
      nextPage: null, complete: true } },
  { operation: 'check_deploy_request_storage', bind: bindCheckDeployRequestStoragePreparation, read: storageRead,
    target: () => ({ ...database(), requestId: 'request_1', number: 42 }),
    scope: t => ({ organization: t.organization, database: t.database, number: t.number }),
    args: {}, resource: 'planetscale/deploy-request/request_1', path: `${path}/deploy-requests/42/storage-check`,
    identity: 'absent-request-bound-only', body: { enough_storage: false, upgradeable: true },
    invalid: { enough_storage: 'false' }, invalidCode: 'upstream',
    output: { enoughStorage: false, upgradeable: true, deploymentAuthority: 'not-established' } },
];
const project = (c, body) => c.read(c.scope(c.target()), c.args).project(Buffer.from(JSON.stringify(body)));

for (const c of cases) {
  test(`${c.operation}: binds immutable host identity/revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), c.args).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: identity limitations and non-waking gap remain explicit`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'deploymentAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits diagnostic details and unverified response identity`, () => {
    const output = project(c, { ...c.body, id: 'unverified-parent', organization_id: 'unverified-parent',
      database_id: 'unverified-parent', branch_id: 'unverified-parent', request_id: 'unverified-parent',
      storage_report: { 'synthetic-canary': { value: 'synthetic-canary' } }, storage_bytes_needed: 123456,
      actor: 'synthetic-canary', created_at: 'synthetic-canary', next_page_url: 'synthetic-canary' });
    assert.deepEqual(output, c.output);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    for (const value of [output, ...(output.items ? [output.items, ...output.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${c.operation}: malformed diagnostic fields refuse`, () => {
    assert.throws(() => project(c, { ...c.body, ...c.invalid }), { code: c.invalidCode });
    assert.throws(() => project(c, {}), { code: 'upstream' });
  });

  test(`${c.operation}: target and fixed request remain captured and deeply frozen`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    if (target.keyspaceNames) { target.keyspaceNames[0] = 'other'; target.keyspaceNames.push('extra'); }
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest,
      ...(before.plan.target.keyspaceNames ? [before.plan.target.keyspaceNames] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.databaseId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'POST'; }, TypeError);
  });

  test(`${c.operation}: every variable host field affects plan and full hashes`, () => {
    const original = c.bind(c.target())({});
    for (const key of Object.keys(c.target())) {
      const value = key === 'revision' ? 'b'.repeat(64) : key === 'number' ? 43 : key === 'keyspaceNames' ? ['main'] : 'other';
      const prepared = c.bind({ ...c.target(), [key]: value })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot change target, page, request or authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { page: 2 }, { page: 1, perPage: 10 },
      { number: 43 }, { requestId: 'other' }, { keyspaceNames: ['other'] }, { approved: true },
      { artifactDigest: 'a'.repeat(64) }, { method: 'POST' }, { credential: 'synthetic-canary' },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse without invocation`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), database: '../other' },
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

test('lint capture reuses unique bounded keyspace names and refuses hostile arrays', () => {
  const c = cases[0];
  for (const keyspaceNames of [null, [], ['main', 'main'], Array.from({ length: 33 }, (_, i) => `keyspace-${i}`),
    ['../other'], [null], new Array(1), Object.assign(['main'], { extra: 'other' }),
    Object.assign(['main'], { [Symbol('scope')]: true }), Object.defineProperty(['main'], 'hidden', { value: true })]) refused(() => c.bind({ ...c.target(), keyspaceNames }));
  let touched = false;
  const keyspaceNames = Object.defineProperty(['main'], '0', { enumerable: true, get() { touched = true; return 'main'; } });
  refused(() => c.bind({ ...c.target(), keyspaceNames }));
  assert.equal(touched, false);
  assert.equal(c.bind({ ...c.target(), keyspaceNames: Array.from({ length: 32 }, (_, i) => `keyspace-${i}`) })({}).plan.target.keyspaceNames.length, 32);
});

test('lint is a fixed first-page read, not a completeness or ownership guarantee', () => {
  const c = cases[0];
  assert.deepEqual(project(c, { ...c.body, next_page: 2 }), { ...c.output, nextPage: 2, complete: false });
  assert.deepEqual(project(c, { ...c.body, data: [] }), { ...c.output, items: [] });
  assert.throws(() => project(c, { ...c.body, data: [lintRow, { ...lintRow, keyspace_name: 'foreign' }] }), { code: 'scope' });
  for (const change of [{ current_page: 2 }, { per_page: 9 }, { next_page: 3 }]) assert.throws(() => project(c, { ...c.body, ...change }));
});

test('storage binds request ID independently of the bounded sequence-addressed path', () => {
  const c = cases[1];
  const first = c.bind(c.target())({});
  const other = c.bind({ ...c.target(), requestId: 'other' })({});
  assert.deepEqual(first.plan.proposedRequest, other.plan.proposedRequest);
  assert.notEqual(first.resource.id, other.resource.id);
  assert.notEqual(canonicalHash(first.plan), canonicalHash(other.plan));
  for (const number of [0, -0, -1, 1.5, 2147483648, '42', null]) refused(() => c.bind({ ...c.target(), number }));
  for (const number of [1, 2147483647]) assert.ok(c.bind({ ...c.target(), number })({}).plan.proposedRequest.path.includes(`/${number}/storage-check`));
  for (const enough_storage of [true, false]) for (const upgradeable of [true, false]) assert.deepEqual(project(c, { enough_storage, upgradeable }),
    { enoughStorage: enough_storage, upgradeable, deploymentAuthority: 'not-established' });
});

test('diagnostic operations retain distinct resource kinds and hashes with equal opaque IDs', () => {
  const prepared = [cases[0].bind({ ...cases[0].target(), branchId: 'same' })({}),
    cases[1].bind({ ...cases[1].target(), requestId: 'same' })({})];
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 2);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
});
