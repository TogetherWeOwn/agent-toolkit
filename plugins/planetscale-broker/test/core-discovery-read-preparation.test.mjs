import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListDatabasesPreparation, bindListBranchesPreparation, bindListDatabaseRegionsPreparation,
  bindListRegionsForOrganizationPreparation, bindListPublicRegionsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as databaseRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-databases.js';
import { prepare as branchRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-branches.js';
import { prepare as databaseRegionRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-database-regions.js';
import { prepare as organizationRegionRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-regions-for-organization.js';
import { prepare as publicRegionRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-public-regions.js';

const publicTarget = () => ({ revision: 'a'.repeat(64), pagination: { page: 2, perPage: 3 } });
const organization = () => ({ ...publicTarget(), organization: 'sample-org', organizationId: 'org_1' });
const database = () => ({ ...organization(), database: 'sample-db', databaseId: 'db_1' });
const children = () => [{ id: 'child_1', name: 'child-one' }, { id: 'child_2', name: 'child-two' }];
const root = '/v1/organizations/sample-org';
const cases = [
  { operation: 'list_databases', bind: bindListDatabasesPreparation, read: databaseRead, parent: organization,
    field: 'databases', resource: 'planetscale/organization/org_1', path: `${root}/databases`,
    row: { id: 'child_1', name: 'child-one', kind: 'postgresql', ready: true, deletion_protected: false },
    output: { id: 'child_1', name: 'child-one', kind: 'postgresql', ready: true, deletionProtected: false } },
  { operation: 'list_branches', bind: bindListBranchesPreparation, read: branchRead, parent: database,
    field: 'branches', resource: 'planetscale/database/db_1', path: `${root}/databases/sample-db/branches`,
    row: { id: 'child_1', name: 'child-one', ready: true, production: false, deletion_protected: false, safe_migrations: true },
    output: { id: 'child_1', name: 'child-one', ready: true, production: false, deletionProtected: false, safeMigrations: true } },
  ...[
    { operation: 'list_database_regions', bind: bindListDatabaseRegionsPreparation, read: databaseRegionRead, parent: database,
      resource: 'planetscale/database/db_1', path: `${root}/databases/sample-db/regions` },
    { operation: 'list_regions_for_organization', bind: bindListRegionsForOrganizationPreparation, read: organizationRegionRead,
      parent: organization, resource: 'planetscale/organization/org_1', path: `${root}/regions` },
    { operation: 'list_public_regions', bind: bindListPublicRegionsPreparation, read: publicRegionRead,
      parent: publicTarget, resource: 'planetscale/region-catalog/public', path: '/v1/regions' },
  ].map(c => ({ ...c, field: 'regions', row: { id: 'child_1', slug: 'child-one', enabled: true },
    output: { id: 'child_1', slug: 'child-one', enabled: true } })),
];
const targetFor = c => ({ ...c.parent(), [c.field]: children() });
const scopeFor = (c, t) => ({ ...(t.organization ? { organization: t.organization } : {}),
  ...(t.database ? { database: t.database } : {}), [c.field]: t[c.field] });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: binds host parents, child identities, revision and pagination to a fixed GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: child identity checks are not parent collection authority or non-waking proof`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-and-name-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: projection retains bound names and strict metadata, never secret or parent canaries`, () => {
    const result = project(c, envelope([{ ...c.row, password: 'synthetic-canary', connection_url: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', actor: 'synthetic-canary',
      created_at: 'synthetic-canary', config: { token: 'synthetic-canary' } }]));
    assert.deepEqual(result, { items: [c.output], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: whole-page projection refuses unknown or rebound children and invalid envelopes`, () => {
    const name = c.field === 'regions' ? 'slug' : 'name';
    for (const patch of [{ id: 'other' }, { [name]: 'other' }, { [name]: 'child-two' }]) {
      assert.throws(() => project(c, envelope([c.row, { ...c.row, ...patch }])), { code: 'scope' });
    }
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: [c.row, c.row, c.row, c.row] }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
    const flag = c.field === 'regions' ? 'enabled' : 'ready';
    assert.throws(() => project(c, envelope([{ ...c.row, [flag]: 'true' }])), { code: 'upstream' });
  });

  test(`${c.operation}: captures deep immutable children and page snapshots`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.field][0].id = 'other';
    target[c.field][0].name = 'other';
    target[c.field].push({ id: 'child_3', name: 'child-three' });
    target.pagination.page = 3;
    target.pagination.perPage = 10;
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], ...before.plan.target[c.field], before.plan.target.pagination, before.plan.proposedRequest]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target[c.field][0].id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.pagination.page = 3; }, TypeError);
  });

  test(`${c.operation}: every host parent, child, page and revision field affects plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [];
    for (const key of Object.keys(c.parent()).filter(k => k !== 'pagination')) {
      variants.push({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' });
    }
    for (const key of ['page', 'perPage']) {
      const target = targetFor(c);
      target.pagination[key] += 1;
      variants.push(target);
    }
    for (const index of [0, 1]) for (const key of ['id', 'name']) {
      const target = targetFor(c);
      target[c.field][index][key] = 'other';
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

  test(`${c.operation}: caller cannot change scope, pages, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: children() }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'POST' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
      refused(() => prepare(raw));
    }
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing, extra, unsafe and accessor host fields refuse without evaluation`, () => {
    for (const raw of [null, [], {}, { ...targetFor(c), approved: true }, { ...targetFor(c), credential: 'synthetic-canary' },
      { ...targetFor(c), revision: 'latest' }, { ...targetFor(c), [Symbol('scope')]: true },
      Object.defineProperty(targetFor(c), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c);
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });

  test(`${c.operation}: child allowlists and pagination stay bounded, unique and closed`, () => {
    for (const value of [[], Array.from({ length: 33 }, (_, i) => ({ id: `child_${i}`, name: `child-${i}` })),
      [children()[0], { id: 'child_1', name: 'other' }], [children()[0], { id: 'other', name: 'child-one' }],
      [{ ...children()[0], approved: true }], [{ id: 'child_1', name: '../escape' }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: value }));
    }
    for (const value of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) {
      refused(() => c.bind({ ...targetFor(c), pagination: value }));
    }
    let touched = false;
    const rows = children();
    Object.defineProperty(rows, '0', { enumerable: true, get() { touched = true; return children()[0]; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: rows }));
    assert.equal(touched, false);
    const max = { ...targetFor(c), [c.field]: Array.from({ length: 32 }, (_, i) => ({ id: `child_${i}`, name: `child-${i}` })),
      pagination: { page: 100, perPage: 10 } };
    assert.equal(c.bind(max)({}).plan.target[c.field].length, 32);
  });
}

test('discovery collection plans distinguish operations sharing a parent resource', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(prepared[0].resource.id, prepared[3].resource.id);
  assert.equal(prepared[1].resource.id, prepared[2].resource.id);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 5);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 5);
});

test('child allowlist rebinding changes hashes even when the collection request does not change', () => {
  for (const c of cases) {
    const original = c.bind(targetFor(c))({});
    const target = targetFor(c);
    target[c.field][0].id = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});
