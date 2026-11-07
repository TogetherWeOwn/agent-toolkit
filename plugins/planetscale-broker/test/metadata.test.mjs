import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as organization from '../../../dist/plugins/planetscale-broker/src/tools/get-organization.js';
import * as database from '../../../dist/plugins/planetscale-broker/src/tools/get-database.js';
import * as branch from '../../../dist/plugins/planetscale-broker/src/tools/get-branch.js';
import * as roles from '../../../dist/plugins/planetscale-broker/src/tools/list-roles.js';
import * as role from '../../../dist/plugins/planetscale-broker/src/tools/get-role.js';
import * as passwords from '../../../dist/plugins/planetscale-broker/src/tools/list-passwords.js';
import * as password from '../../../dist/plugins/planetscale-broker/src/tools/get-password.js';
import * as relation from '../../../dist/plugins/planetscale-broker/src/tools/relation-exists.js';

const org = { organization: 'example-org' };
const db = { ...org, database: 'example-db' };
const target = { ...db, branch: 'staging' };
const roleTarget = { ...target, roleId: 'role123' };
const passwordTarget = { ...target, passwordId: 'password123' };
const pageArgs = { page: 1, perPage: 2 };
const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const roleRow = { id: 'role123', name: 'reader', ready: true, expired: false, inherited_roles: ['pg_monitor'], password: canary, access_host_url: canary, username: canary, query_safety_settings: { reflected: canary } };
const passwordRow = { id: 'password123', name: 'read-only', role: 'reader', expired: false, plain_text: canary, database_branch: { mysql_address: canary }, connection_strings: { dsn: canary } };
const page = (data, more = null) => ({ data, current_page: 1, per_page: 2, next_page: more, next_page_url: canary });
const fixtures = [
  [organization, org, {}, '/v1/organizations/example-org', { name: 'example-org', sso: true, billing_email: canary, features: { reflected: canary } }, { name: 'example-org', sso: true }],
  [database, db, {}, '/v1/organizations/example-org/databases/example-db', { name: 'example-db', kind: 'postgresql', ready: true, deletion_protected: true, url: canary, region: { reflected: canary } }, { name: 'example-db', kind: 'postgresql', ready: true, deletionProtected: true }],
  [branch, target, {}, '/v1/organizations/example-org/databases/example-db/branches/staging', { name: 'staging', ready: true, production: false, deletion_protected: true, safe_migrations: true, mysql_address: canary }, { name: 'staging', ready: true, production: false, deletionProtected: true, safeMigrations: true }],
  [roles, target, pageArgs, '/v1/organizations/example-org/databases/example-db/branches/staging/roles?page=1&per_page=2', page([roleRow]), { items: [{ id: 'role123', name: 'reader', ready: true, expired: false, inheritedRoles: ['pg_monitor'] }], nextPage: null, complete: true }],
  [role, roleTarget, {}, '/v1/organizations/example-org/databases/example-db/branches/staging/roles/role123', roleRow, { id: 'role123', name: 'reader', ready: true, expired: false, inheritedRoles: ['pg_monitor'] }],
  [passwords, target, pageArgs, '/v1/organizations/example-org/databases/example-db/branches/staging/passwords?page=1&per_page=2', page([passwordRow]), { items: [{ id: 'password123', name: 'read-only', role: 'reader', expired: false }], nextPage: null, complete: true }],
  [password, passwordTarget, {}, '/v1/organizations/example-org/databases/example-db/branches/staging/passwords/password123', passwordRow, { id: 'password123', name: 'read-only', role: 'reader', expired: false }],
  [relation, target, { relation: 'widgets' }, '/v1/organizations/example-org/databases/example-db/branches/staging/schema', { data: [{ name: 'widgets', raw: canary, html: canary }] }, { relation: 'widgets', exists: true }],
];

for (const [adapter, scope, args, path, response, expected] of fixtures) {
  test(`${adapter.operationId}: fixed request and metadata-only projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
    assert.deepEqual(prepared.project(wire(response)), expected);
    assert.ok(!JSON.stringify(prepared.project(wire(response))).includes(canary));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(prepared.project(wire(response))));
  });

  test(`${adapter.operationId}: closed arguments and trusted scope shape`, () => {
    for (const invalid of [null, [], 1, 'x', { ...args, approval: true }, { ...args, agentId: 'other' }, { ...args, url: 'https://example.com' }, JSON.parse('{"__proto__":{}}')]) {
      assert.throws(() => adapter.prepare(scope, invalid));
    }
    for (const invalid of [null, [], { ...scope, agentId: 'other' }, { ...scope, organization: '../foreign' }, { ...scope, organization: 'x%2fy' }, { ...scope, organization: 'é' }, { ...scope, organization: 'x\n' }, { ...scope, organization: 'a'.repeat(64) }]) {
      assert.throws(() => adapter.prepare(invalid, args));
    }
    // These tests verify shape/target construction, not host identity or policy.
  });

  test(`${adapter.operationId}: bounded wire decode and fixed errors`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const invalid of [wire(null), wire([]), wire({}), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) {
      assert.throws(() => prepared.project(invalid), error => !String(error).includes(canary));
    }
  });
}

test('detail projections reject a different returned resource', () => {
  assert.throws(() => organization.prepare(org, {}).project(wire({ name: 'foreign', sso: true })));
  assert.throws(() => database.prepare(db, {}).project(wire({ name: 'foreign', kind: 'mysql', ready: true, deletion_protected: true })));
  assert.throws(() => branch.prepare(target, {}).project(wire({ name: 'foreign', ready: true, production: false, deletion_protected: true, safe_migrations: true })));
  assert.throws(() => role.prepare(roleTarget, {}).project(wire({ ...roleRow, id: 'foreign' })));
  assert.throws(() => password.prepare(passwordTarget, {}).project(wire({ ...passwordRow, id: 'foreign' })));
});

test('database metadata accepts every documented engine kind, not an arbitrary kind', () => {
  const prepared = database.prepare(db, {});
  for (const kind of ['mysql', 'postgresql', 'neki']) {
    assert.equal(prepared.project(wire({ name: 'example-db', kind, ready: true, deletion_protected: true })).kind, kind);
  }
  assert.throws(() => prepared.project(wire({ name: 'example-db', kind: 'unknown', ready: true, deletion_protected: true })));
});

test('pagination never follows provider URLs or claims a partial page is complete', () => {
  for (const adapter of [roles, passwords]) {
    const row = adapter === roles ? roleRow : passwordRow;
    const prepared = adapter.prepare(target, pageArgs);
    assert.equal(prepared.project(wire(page([row], 2))).complete, false);
    assert.equal(prepared.project(wire(page([row], 2))).nextPage, 2);
    for (const invalid of [page([row, row, row]), page([row], 1), page([row], 3), { ...page([row]), current_page: 2 }, { ...page([row]), per_page: 100 }, { ...page([row]), next_page: '2' }, { ...page([row]), next_page: undefined }]) {
      assert.throws(() => prepared.project(wire(invalid)));
    }
    for (const args of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: 1, perPage: 1.5 }, { page: '1', perPage: 2 }, { page: 1, perPage: -0 }, { page: Infinity, perPage: 2 }]) {
      assert.throws(() => adapter.prepare(target, args));
    }
    assert.throws(() => adapter.prepare(target, { page: 100, perPage: 2 }).project(wire({ ...page([row], 101), current_page: 100 })));
  }
});

test('role metadata is not an effective ACL receipt; only documented role enums survive', () => {
  assert.throws(() => role.prepare(roleTarget, {}).project(wire({ ...roleRow, inherited_roles: ['arbitrary_sql'] })));
  assert.throws(() => role.prepare(roleTarget, {}).project(wire({ ...roleRow, inherited_roles: Array(13).fill('pg_monitor') })));
  assert.throws(() => password.prepare(passwordTarget, {}).project(wire({ ...passwordRow, role: 'superuser' })));
  assert.throws(() => role.prepare(roleTarget, {}).project(wire({ ...roleRow, ready: 'true' })));
});

test('relation existence never exposes DDL and rejects ambiguous or oversized catalogs', () => {
  const prepared = relation.prepare(target, { relation: 'widgets' });
  assert.deepEqual(prepared.project(wire({ data: [{ name: 'other', raw: canary }] })), { relation: 'widgets', exists: false });
  assert.deepEqual(prepared.project(wire({ data: [] })), { relation: 'widgets', exists: false });
  for (const data of [[{ name: 'widgets' }, { name: 'widgets' }], [{ name: 'x;DROP' }], Array(1001).fill({ name: 'x' })]) {
    assert.throws(() => prepared.project(wire({ data })));
  }
  assert.throws(() => relation.prepare(target, { relation: 'public.widgets' }));
  assert.throws(() => relation.prepare(target, { relation: 'widgets', sql: 'select 1' }));
});

test('complete official map distinguishes mapped, source-adapted, reviewed and enabled', async () => {
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url), 'utf8'));
  assert.equal(map.source.sha256, 'ae45866599cb5d248fadb9d7f0ed30fd6aed440a17ec0950c4e9e0d58da4cb73');
  assert.equal(map.source.operationCount, 291);
  assert.equal(map.operations.length, 291);
  assert.equal(new Set(map.operations.map(row => row.operationId)).size, 291);
  assert.equal(new Set(map.operations.map(row => row.method + ' ' + row.path)).size, 291);
  assert.equal(map.credentialScopeReceipt, null);
  assert.equal(map.commonCoreContract, null);
  const implemented = map.operations.filter(row => row.implementation === 'offline-adapter-only');
  assert.deepEqual(implemented.map(row => row.operationId).sort(), fixtures.map(([adapter]) => adapter.operationId).sort());
  for (const row of map.operations) {
    assert.equal(row.credentialEntitlement, 'unknown-awaiting-operator-metadata');
    assert.equal(row.review, 'not-reviewed');
    assert.equal(row.enablement, 'disabled');
    assert.equal(row.tierReview, 'pending');
    assert.match(row.operationSha256, /^[a-f0-9]{64}$/);
    assert.ok(row.areas.length > 0);
    assert.ok(row.prerequisites.length > 0);
    assert.ok(row.path.startsWith('/v1/'));
    if (row.adapter) {
      assert.equal(row.tier, 'read');
      assert.equal(row.method, 'GET');
      assert.equal(row.test, 'test/metadata.test.mjs');
      const adapter = fixtures.find(([adapter]) => adapter.operationId === row.operationId)[0];
      assert.equal(row.tool, adapter.tool);
      await readFile(new URL('../' + row.adapter, import.meta.url));
    } else {
      assert.equal(row.implementation, 'missing');
      assert.equal(row.tier, 'unresolved');
      assert.equal(row.test, null);
    }
  }
  const getDatabase = map.operations.find(row => row.operationId === 'get_database');
  assert.ok(getDatabase.documentedAuthorization.serviceTokenAnyOf.includes('read_database'));
  assert.deepEqual(getDatabase.documentedAuthorization.oauthAlternatives.find(row => row.resource === 'Organization').anyOf, ['read_databases']);
  assert.ok(map.operations.some(row => row.areas.includes('Invoices')));
  assert.ok(map.operations.some(row => row.areas.includes('Service tokens')));
  assert.ok(map.operations.some(row => row.areas.includes('Organization SSO')));
  assert.ok(map.operations.some(row => row.areas.includes('Backups')));
});
