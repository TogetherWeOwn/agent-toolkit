import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetMoveTablesWorkflowStatusPreparation, bindGetKeyspaceVschemaPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as statusRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-move-tables-workflow-status.js';

const target = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64),
  workflow: 'copy-main', targetKeyspace: 'main', keyspaceId: 'keyspace_1' });
const scope = t => ({ organization: t.organization, database: t.database, branch: t.branch,
  branchId: t.branchId, workflow: t.workflow, targetKeyspace: t.targetKeyspace, keyspaceId: t.keyspaceId });
const bind = bindGetMoveTablesWorkflowStatusPreparation;
const refused = fn => assert.throws(fn, { code: 'schema' });
const project = (body, t = target()) => statusRead(scope(t), {}).project(Buffer.from(JSON.stringify(body)));
const output = { requestBranchId: 'branch_1', requestKeyspaceId: 'keyspace_1', trafficStateReported: false,
  tableCopyReported: false, shardStreamsReported: false, provenance: 'not-established', executionAuthority: 'not-established' };

test('MoveTables status: preparation captures parents, keyspace, revision and required query', () => {
  const t = target();
  const prepared = bind(t)({});
  assert.deepEqual(prepared.resource, { id: 'planetscale/keyspace/keyspace_1', revision: t.revision });
  assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), t);
  assert.deepEqual(prepared.arguments, {});
  assert.equal(prepared.artifactDigest, null);
  assert.equal(prepared.plan.operationId, 'get_move_tables_workflow_status');
  assert.equal(prepared.plan.tool, 'planetscale.get_move_tables_workflow_status');
  assert.deepEqual(prepared.plan.proposedRequest, statusRead(scope(t), {}).request);
  assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
    path: '/v1/organizations/sample-org/databases/sample-db/branches/staging/move-tables/workflows/copy-main/status?target_keyspace=main' });
  assert.equal(canonicalHash(prepared), canonicalHash(bind(t)(Object.create(null))));
});

test('MoveTables status: preparation declares absent response identity and no execution authority', () => {
  const prepare = bind(target());
  const prepared = prepare({});
  assert.equal(prepared.plan.kind, 'validated-local-read-plan');
  assert.equal(prepared.plan.execution, 'not-implemented');
  assert.equal(prepared.plan.responseIdentity, 'absent-request-bound-only');
  assert.equal(prepared.plan.nonWaking, 'not-verified');
  for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
  for (const key of ['approved', 'tier', 'credential', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
});

test('MoveTables status: all captured host fields affect plan and full hashes', () => {
  const original = bind(target())({});
  for (const key of Object.keys(target())) {
    const changed = bind({ ...target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' })({});
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});

test('MoveTables status: input mutation cannot retarget frozen snapshots or requests', () => {
  const t = target();
  const prepare = bind(t);
  const original = prepare({});
  for (const key of Object.keys(t)) t[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
  assert.deepEqual(prepare({}), original);
  for (const value of [original, original.resource, original.arguments, original.plan,
    original.plan.target, original.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { original.plan.target.keyspaceId = 'other'; }, TypeError);
  assert.throws(() => { original.plan.proposedRequest.path = '/other'; }, TypeError);
});

test('MoveTables status: missing, unsafe and unknown host fields refuse', () => {
  for (const raw of [null, [], {}, { ...target(), credential: 'synthetic-canary' },
    { ...target(), revision: 'latest' }, { ...target(), [Symbol('scope')]: true },
    Object.defineProperty(target(), 'hidden', { value: true })]) refused(() => bind(raw));
  for (const key of Object.keys(target())) {
    const missing = target();
    delete missing[key];
    refused(() => bind(missing));
    refused(() => bind({ ...target(), [key]: '../other' }));
  }
  for (const key of ['workflow', 'targetKeyspace']) {
    for (const value of ['main&force=true', 'main?other=true', 'main/other', 'main%2fother']) refused(() => bind({ ...target(), [key]: value }));
  }
});

test('MoveTables status: host accessors refuse without being invoked', () => {
  for (const key of Object.keys(target())) {
    let touched = false;
    refused(() => bind(Object.defineProperty(target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
    assert.equal(touched, false);
  }
});

test('MoveTables status: caller arguments cannot replace target, query, request or authority', () => {
  const prepare = bind(target());
  for (const raw of [null, [], { target: target() }, { approved: true }, { branchId: 'other' },
    { workflow: 'other' }, { target_keyspace: 'other' }, { keyspaceId: 'other' }, { revision: 'b'.repeat(64) },
    { resource: 'other' }, { method: 'POST' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
    { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
  let touched = false;
  refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return target(); } })));
  assert.equal(touched, false);
});

test('MoveTables status: projection omits names, progress, traffic, streams and parent canaries', () => {
  const result = project({ data: { traffic_state: 'synthetic-canary',
    table_copy_state: { 'synthetic-canary': { rows_copied: 123, rows_total: 456, rows_percentage: 27 } },
    shard_streams: { 'synthetic-canary': { secret: 'synthetic-canary' } },
    branch_id: 'unverified-parent', keyspace_id: 'unverified-parent', workflow: 'synthetic-canary' },
    id: 'unverified-parent', organization_id: 'unverified-parent', actor: 'synthetic-canary' });
  assert.deepEqual(result, { ...output, trafficStateReported: true, tableCopyReported: true, shardStreamsReported: true });
  assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
  assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(project({ data: {} }), output);
  assert.deepEqual(project({ data: { traffic_state: '' } }), output);
  assert.deepEqual(project({ data: {} }, { ...target(), branchId: 'other-branch', keyspaceId: 'other-keyspace' }),
    { ...output, requestBranchId: 'other-branch', requestKeyspaceId: 'other-keyspace' });
});

test('MoveTables status: malformed or oversized status fields refuse the whole response', () => {
  for (const data of [null, [], { traffic_state: true }, { traffic_state: 'x'.repeat(4097) },
    { table_copy_state: [] }, { shard_streams: null }, { table_copy_state: { table: { rows_copied: '1' } } },
    { table_copy_state: { table: { rows_percentage: '1' } } },
    { shard_streams: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`stream_${i}`, {}])) }]) {
    assert.throws(() => project({ data }), { code: 'upstream' });
  }
  assert.throws(() => project({}), { code: 'upstream' });
});

test('MoveTables status: equal keyspace resource does not collide with VSchema operation hash', () => {
  const { workflow, targetKeyspace, keyspaceId, ...branch } = target();
  const status = bind(target())({});
  const vschema = bindGetKeyspaceVschemaPreparation({ ...branch, keyspace: { id: keyspaceId, name: targetKeyspace } })({});
  assert.deepEqual(status.resource, vschema.resource);
  assert.notEqual(canonicalHash(status.plan), canonicalHash(vschema.plan));
  assert.notEqual(canonicalHash(status), canonicalHash(vschema));
});
