import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetKeyspaceVschemaPreparation, bindGetDataTopologyPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as vschemaRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-keyspace-vschema.js';
import { prepare as topologyRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-data-topology.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64) });
const keyspace = () => ({ id: 'keyspace_1', name: 'main' });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'get_keyspace_vschema', bind: bindGetKeyspaceVschemaPreparation, read: vschemaRead,
    target: () => ({ ...branch(), keyspace: keyspace() }), selected: t => ({ keyspace: t.keyspace }),
    resource: 'planetscale/keyspace/keyspace_1', path: `${path}/keyspaces/main/vschema`,
    body: { raw: 'synthetic-canary' }, invalid: { raw: true },
    output: { requestKeyspaceId: 'keyspace_1', rawReported: true,
      provenance: 'not-established', executionAuthority: 'not-established' } },
  { operation: 'get_data_topology', bind: bindGetDataTopologyPreparation, read: topologyRead,
    target: branch, selected: t => ({ branchId: t.branchId }),
    resource: 'planetscale/branch/branch_1', path: `${path}/data-topology`,
    body: { data_topology: { 'synthetic-canary': { secret: 'synthetic-canary' } }, synced_at: 'synthetic-canary' },
    invalid: { data_topology: [] }, output: { requestBranchId: 'branch_1', topologyReported: true,
      syncTimeReported: true, freshness: 'not-established', provenance: 'not-established' } },
];
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch, ...c.selected(t) });
const project = (c, body, target = c.target()) => c.read(scopeFor(c, target), {}).project(Buffer.from(JSON.stringify(body)));

for (const c of cases) {
  test(`${c.operation}: preparation binds parents, resource, revision and fixed GET`, () => {
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

  test(`${c.operation}: preparation states absent response identity without granting authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'absent-request-bound-only');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'executionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: presence projection omits raw contents and unverified parent canaries`, () => {
    const output = project(c, { ...c.body, id: 'unverified-parent', organization_id: 'unverified-parent',
      database_id: 'unverified-parent', branch_id: 'unverified-parent', keyspace_id: 'unverified-parent',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', metadata: { value: 'synthetic-canary' } });
    assert.deepEqual(output, c.output);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses malformed availability fields`, () => {
    assert.throws(() => project(c, { ...c.body, ...c.invalid }), { code: 'upstream' });
    assert.throws(() => project(c, {}), { code: 'upstream' });
  });

  test(`${c.operation}: captured target and request remain deeply immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    if (target.keyspace) target.keyspace.name = 'other';
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest,
      ...(before.plan.target.keyspace ? [before.plan.target.keyspace] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.branchId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
    if (before.plan.target.keyspace) assert.throws(() => { before.plan.target.keyspace.id = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field affects plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      if (key === 'keyspace') continue;
      const prepared = c.bind({ ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
    if (target.keyspace) for (const key of ['id', 'name']) {
      const prepared = c.bind({ ...c.target(), keyspace: { ...keyspace(), [key]: 'other' } })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/selectors/authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { branchId: 'other' },
      { keyspace: keyspace() }, { raw: 'synthetic-canary' }, { data_topology: {} }, { resource: 'other' },
      { revision: 'b'.repeat(64) }, { method: 'POST' }, { credential: 'synthetic-canary' },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
      refused(() => prepare(raw));
    }
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

test('VSchema preparation requires closed non-accessor keyspace ID/name binding', () => {
  const c = cases[0];
  for (const binding of [null, [], {}, { ...keyspace(), id: '../other' }, { ...keyspace(), name: '../other' },
    { ...keyspace(), raw: 'synthetic-canary' }, { ...keyspace(), [Symbol('scope')]: true },
    Object.defineProperty(keyspace(), 'hidden', { value: true })]) refused(() => c.bind({ ...c.target(), keyspace: binding }));
  for (const key of ['id', 'name']) {
    const missing = keyspace();
    delete missing[key];
    refused(() => c.bind({ ...c.target(), keyspace: missing }));
    let touched = false;
    const binding = Object.defineProperty(keyspace(), key, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...c.target(), keyspace: binding }));
    assert.equal(touched, false);
  }
});

test('availability IDs are request-bound only; empty and non-time strings retain presence semantics', () => {
  const [v, t] = cases;
  assert.deepEqual(project(v, { raw: '' }), { ...v.output, rawReported: false });
  assert.deepEqual(project(v, v.body, { ...v.target(), keyspace: { ...keyspace(), id: 'other' } }),
    { ...v.output, requestKeyspaceId: 'other' });
  for (const synced_at of [null, '']) assert.deepEqual(project(t, { data_topology: {}, synced_at }),
    { ...t.output, topologyReported: false, syncTimeReported: false });
  assert.deepEqual(project(t, { data_topology: {}, synced_at: 'not-a-time' }, { ...t.target(), branchId: 'other' }),
    { ...t.output, requestBranchId: 'other', topologyReported: false });
});

test('availability operations have distinct plan hashes even with equal opaque IDs', () => {
  const prepared = [cases[0].bind({ ...branch(), keyspace: { ...keyspace(), id: 'branch_1' } })({}),
    cases[1].bind(branch())({})];
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 2);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
});
