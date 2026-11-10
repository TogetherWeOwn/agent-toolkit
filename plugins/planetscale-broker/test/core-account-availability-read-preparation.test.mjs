import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetCurrentUserPreparation, bindListOrganizationsPreparation,
  bindListReadOnlyRegionsPreparation, bindListPostgresVersionsPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as userRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-current-user.js';
import { prepare as organizationRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-organizations.js';
import { prepare as regionRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-read-only-regions.js';
import { prepare as versionRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-postgres-versions.js';

const revision = 'a'.repeat(64);
const pagination = () => ({ page: 1, perPage: 2 });
const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1', revision });
const cases = [
  { operation: 'get_current_user', bind: bindGetCurrentUserPreparation, read: userRead, kind: 'detail',
    target: () => ({ user: { id: 'user_1' }, revision }), scope: t => ({ user: t.user }),
    resource: 'planetscale/user/user_1', path: '/v1/user', identity: 'user-id-only-principal-not-verified',
    row: { id: 'user_1', two_factor_auth_configured: true }, flag: 'two_factor_auth_configured',
    expected: { id: 'user_1', twoFactorAuthConfigured: true } },
  { operation: 'list_organizations', bind: bindListOrganizationsPreparation, read: organizationRead, kind: 'page', key: 'organizations',
    target: () => ({ userId: 'user_1', revision, organizations: [{ id: 'org_1', name: 'sample-org' }, { id: 'org_2', name: 'other-org' }], pagination: pagination() }),
    scope: t => ({ organizations: t.organizations }), resource: 'planetscale/user/user_1',
    path: '/v1/organizations?page=1&per_page=2', identity: 'record-and-name-parent-not-verified',
    row: { id: 'org_1', name: 'sample-org', sso: true }, flag: 'sso',
    expected: { id: 'org_1', name: 'sample-org', sso: true } },
  { operation: 'list_read_only_regions', bind: bindListReadOnlyRegionsPreparation, read: regionRead, kind: 'page', key: 'regions',
    target: () => ({ ...parent(), regions: [{ id: 'readonly_1', region: { id: 'region_1', name: 'eu-west' } },
      { id: 'readonly_2', region: { id: 'region_2', name: 'us-east' } }], pagination: pagination() }),
    scope: t => ({ organization: t.organization, database: t.database, regions: t.regions }),
    resource: 'planetscale/database/db_1', path: '/v1/organizations/sample-org/databases/sample-db/read-only-regions?page=1&per_page=2',
    identity: 'record-and-region-binding-parent-not-verified', flag: 'ready',
    row: { id: 'readonly_1', ready: true, region: { id: 'region_1', slug: 'eu-west', enabled: true } },
    expected: { id: 'readonly_1', ready: true, region: { id: 'region_1', slug: 'eu-west', enabled: true } } },
  { operation: 'list_postgres_versions', bind: bindListPostgresVersionsPreparation, read: versionRead, kind: 'array', key: 'versions',
    target: () => ({ revision, engine: 'neki', versions: [{ id: 'version_1' }, { id: 'version_2' }] }),
    scope: t => ({ engine: t.engine, versions: t.versions }), resource: 'planetscale/version-catalog/postgres',
    path: '/v1/postgres-versions?engine=neki', identity: 'record-id-only-parent-not-verified',
    row: { id: 'version_1', default: true }, flag: 'default', expected: { id: 'version_1', default: true } },
];
const wrap = (c, rows) => c.kind === 'detail' ? rows[0] : c.kind === 'array' ? rows
  : { current_page: 1, per_page: 2, next_page: null, data: rows };
const output = (c, rows) => c.kind === 'detail' ? rows[0] : c.kind === 'array' ? rows
  : { items: rows, nextPage: null, complete: true };
const project = (c, body) => c.read(c.scope(c.target()), c.kind === 'page' ? pagination() : {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });
function frozenTree(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozenTree(child);
}
function leaves(value, prefix = []) {
  return Object.entries(value).flatMap(([key, child]) => child !== null && typeof child === 'object'
    ? leaves(child, [...prefix, key]) : [[...prefix, key]]);
}

for (const c of cases) {
  test(`${c.operation}: closed host capture fixes the request, resource and empty arguments`, () => {
    const target = c.target(); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision });
    assert.deepEqual(prepared.arguments, {}); assert.equal(prepared.artifactDigest, null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.equal(prepared.plan.operationId, c.operation); assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), target.pagination ?? {}).request);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: pure preparation grants neither execution nor authority`, () => {
    const prepare = c.bind(c.target()); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified'); assert.equal(prepared.plan.execution, 'not-implemented');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['credential', 'approved', 'tier', 'collectionAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projections omit personal, connection, billing and version canaries`, () => {
    const result = project(c, wrap(c, [{ ...c.row, email: 'synthetic-canary', display_name: 'synthetic-canary',
      avatar_url: 'synthetic-canary', password: 'synthetic-canary', dsn: 'synthetic-canary',
      billing_email: 'synthetic-canary', major_version: 'synthetic-canary', version: 'synthetic-canary',
      default_organization: { id: 'synthetic-canary' }, created_at: 'synthetic-canary', approval: true }]));
    assert.deepEqual(result, output(c, [c.expected])); assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    frozenTree(result);
    if (c.kind !== 'detail') assert.deepEqual(project(c, wrap(c, [])), output(c, []));
  });

  test(`${c.operation}: unknown identity and malformed flags refuse the entire response`, () => {
    assert.throws(() => project(c, wrap(c, c.kind === 'detail' ? [{ ...c.row, id: 'other' }] : [c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    for (const value of [null, 0, 'true']) assert.throws(() => project(c, wrap(c, [{ ...c.row, [c.flag]: value }])), { code: 'upstream' });
    if (c.key === 'organizations') assert.throws(() => project(c, wrap(c, [{ ...c.row, name: 'other-org' }])), { code: 'scope' });
    if (c.key === 'regions') for (const patch of [{ id: 'other' }, { slug: 'us-east' }])
      assert.throws(() => project(c, wrap(c, [{ ...c.row, region: { ...c.row.region, ...patch } }])), { code: 'scope' });
  });

  test(`${c.operation}: envelope and wire bounds fail closed`, () => {
    const read = c.read(c.scope(c.target()), c.kind === 'page' ? pagination() : {});
    assert.throws(() => read.project(new Uint8Array(65537)), { code: 'upstream' });
    assert.throws(() => project(c, c.kind === 'array' ? {} : []), { code: 'upstream' });
    if (c.kind === 'array') assert.throws(() => project(c, Array(33).fill(c.row)), { code: 'upstream' });
    if (c.kind === 'page') {
      for (const patch of [{ current_page: 2 }, { per_page: 3 }, { next_page: 3 }, { data: Array(3).fill(c.row) }])
        assert.throws(() => project(c, { ...wrap(c, [c.row]), ...patch }), { code: 'upstream' });
      assert.deepEqual(project(c, { ...wrap(c, [c.row]), next_page: 2 }), { items: [c.expected], nextPage: 2, complete: false });
    }
  });

  test(`${c.operation}: later host mutations cannot widen deeply frozen snapshots`, () => {
    const target = c.target(); const prepare = c.bind(target); const before = prepare({});
    for (const path of leaves(target)) {
      const holder = path.slice(0, -1).reduce((v, key) => v[key], target); holder[path.at(-1)] = 'other';
    }
    if (c.key) target[c.key].push({ id: 'other' });
    assert.deepEqual(prepare({}), before); frozenTree(before);
    assert.throws(() => { before.plan.target.revision = 'b'.repeat(64); }, TypeError);
  });

  test(`${c.operation}: every variable host leaf changes both hashes`, () => {
    const original = c.bind(c.target())({});
    for (const path of leaves(c.target())) {
      if (path.at(-1) === 'engine') continue;
      const target = c.target(); const holder = path.slice(0, -1).reduce((v, key) => v[key], target);
      const key = path.at(-1); holder[key] = key === 'revision' ? 'b'.repeat(64) : typeof holder[key] === 'number' ? holder[key] + 1 : 'other';
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
    if (c.key) {
      const target = c.target(); target[c.key].reverse();
      assert.notEqual(canonicalHash(original.plan), canonicalHash(c.bind(target)({}).plan));
      assert.notEqual(canonicalHash(original), canonicalHash(c.bind(target)({})));
    }
  });

  test(`${c.operation}: caller cannot inject pagination, scope, engine, secrets or approval`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { page: 2 }, { userId: 'other' }, { engine: 'neki' },
      { sql: 'synthetic-canary' }, { credential: 'synthetic-canary' }, { approved: true },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 2; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host capture rejects missing, unknown and accessor properties`, () => {
    for (const key of Object.keys(c.target())) {
      const missing = c.target(); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const patch of [{ approved: true }, { secret: 'synthetic-canary' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...c.target(), ...patch }));
    if (c.key) {
      const rows = c.target()[c.key];
      for (const value of [[], [rows[0], rows[0]], Array(33).fill(rows[0]), [null]]) refused(() => c.bind({ ...c.target(), [c.key]: value }));
      let touched = false;
      Object.defineProperty(rows, '0', { enumerable: true, get() { touched = true; return null; } });
      refused(() => c.bind({ ...c.target(), [c.key]: rows })); assert.equal(touched, false);
    }
  });
}

test('account and availability host-only bindings remain hashed when the request is identical', () => {
  for (const c of cases) {
    const original = c.bind(c.target())({}); const target = c.target();
    if (c.operation === 'get_current_user') target.user.id = 'other';
    else if (c.operation === 'list_organizations') target.userId = 'other';
    else target[c.key][0].id = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
  const sameUser = cases.slice(0, 2).map(c => c.bind(c.target())({}));
  assert.deepEqual(sameUser[0].resource, sameUser[1].resource);
  assert.notEqual(canonicalHash(sameUser[0]), canonicalHash(sameUser[1]));
});

test('organization names and nested read-only-region tuples remain closed and independently bound', () => {
  const org = cases[1], region = cases[2];
  const target = org.target(); target.organizations[1].name = target.organizations[0].name;
  refused(() => org.bind(target));
  for (const c of [cases[0], org, region, cases[3]]) {
    const t = c.target(); const row = c.key ? t[c.key][0] : t.user;
    row.approved = true; refused(() => c.bind(t));
  }
  for (const path of [['regions', '0', 'region'], ['regions', '0', 'region', 'id'], ['user', 'id']]) {
    const c = path[0] === 'user' ? cases[0] : region; const t = c.target();
    const holder = path.slice(0, -1).reduce((v, key) => v[key], t); let touched = false;
    Object.defineProperty(holder, path.at(-1), { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind(t)); assert.equal(touched, false);
  }
});

test('Postgres catalog fixes the documented engine and has no invented pagination or remote identity', () => {
  const c = cases[3];
  for (const engine of [null, 'postgresql', 'mysql', 'other']) refused(() => c.bind({ ...c.target(), engine }));
  refused(() => c.bind({ ...c.target(), pagination: pagination() }));
  assert.equal(c.bind(c.target())({}).resource.id, 'planetscale/version-catalog/postgres');
  assert.equal(Object.hasOwn(project(c, [c.row])[0], 'engine'), false);
});
