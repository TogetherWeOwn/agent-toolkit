import assert from 'node:assert/strict';
import test from 'node:test';
import * as databases from '../../../dist/plugins/planetscale-broker/src/tools/list-databases.js';
import * as branches from '../../../dist/plugins/planetscale-broker/src/tools/list-branches.js';
import * as databaseRegions from '../../../dist/plugins/planetscale-broker/src/tools/list-database-regions.js';
import * as organizationRegions from '../../../dist/plugins/planetscale-broker/src/tools/list-regions-for-organization.js';
import * as publicRegions from '../../../dist/plugins/planetscale-broker/src/tools/list-public-regions.js';
import * as defaultRole from '../../../dist/plugins/planetscale-broker/src/tools/get-default-role.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const args = { page: 1, perPage: 2 };
const page = (data, more = null) => ({ data, current_page: 1, per_page: 2, next_page: more, next_page_url: canary });
const databaseRow = { id: 'db123', name: 'example-db', kind: 'postgresql', ready: true, deletion_protected: true, url: canary, region: { public_ip_addresses: [canary] } };
const branchRow = { id: 'br123', name: 'staging', ready: true, production: false, deletion_protected: true, safe_migrations: true, mysql_address: canary, actor: { display_name: canary } };
const regionRow = { id: 'region123', slug: 'example-region', enabled: true, display_name: canary, provider: canary, public_ip_addresses: [canary] };
const regionScope = { regions: [{ id: 'region123', name: 'example-region' }] };
const regionExpected = { id: 'region123', slug: 'example-region', enabled: true };
const fixtures = [
  [databases, { organization: 'example-org', databases: [{ id: 'db123', name: 'example-db' }] }, 'databases', '/v1/organizations/example-org/databases', databaseRow, { id: 'db123', name: 'example-db', kind: 'postgresql', ready: true, deletionProtected: true }],
  [branches, { organization: 'example-org', database: 'example-db', branches: [{ id: 'br123', name: 'staging' }] }, 'branches', '/v1/organizations/example-org/databases/example-db/branches', branchRow, { id: 'br123', name: 'staging', ready: true, production: false, deletionProtected: true, safeMigrations: true }],
  [databaseRegions, { organization: 'example-org', database: 'example-db', ...regionScope }, 'regions', '/v1/organizations/example-org/databases/example-db/regions', regionRow, regionExpected],
  [organizationRegions, { organization: 'example-org', ...regionScope }, 'regions', '/v1/organizations/example-org/regions', regionRow, regionExpected],
  [publicRegions, regionScope, 'regions', '/v1/regions', regionRow, regionExpected],
];

for (const [adapter, scope, bindingKey, path, row, expected] of fixtures) {
  test(`${adapter.operationId}: fixed collection and allowlisted output only`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + '?page=1&per_page=2' });
    const result = prepared.project(wire(page([row])));
    assert.deepEqual(result, { items: [expected], nextPage: null, complete: true });
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(result.items[0]));
    assert.deepEqual(prepared.project(wire(page([]))), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: entire page refuses unknown or rebound child identity`, () => {
    const prepared = adapter.prepare(scope, args);
    const nameKey = bindingKey === 'regions' ? 'slug' : 'name';
    for (const invalid of [{ ...row, id: 'foreign' }, { ...row, [nameKey]: 'foreign' }, { ...row, id: null }, { ...row, [nameKey]: '../escape' }, { ...row, [nameKey]: canary }]) {
      assert.throws(() => prepared.project(wire(page([row, invalid]))), error => !String(error).includes(canary));
    }
    // Shape checks cannot authenticate this trusted scope or grant upstream list access.
  });

  test(`${adapter.operationId}: closed args cannot supply identity, scope or filters`, () => {
    for (const extra of ['agentId', 'resource', bindingKey, 'url', 'approval', 'q', 'production', 'kind', 'headers', 'credential']) {
      assert.throws(() => adapter.prepare(scope, { ...args, [extra]: canary }));
    }
    for (const invalid of [null, [], { ...args, page: 0 }, { ...args, page: 101 }, { ...args, perPage: 11 }, { ...args, perPage: '2' }]) assert.throws(() => adapter.prepare(scope, invalid));
    for (const invalid of [null, [], { ...scope, extra: true }, { ...scope, [bindingKey]: [] }, { ...scope, [bindingKey]: [scope[bindingKey][0], scope[bindingKey][0]] }, { ...scope, [bindingKey]: Array(33).fill(scope[bindingKey][0]) }, { ...scope, [bindingKey]: [{ id: 'x', name: 'x', approval: true }] }]) {
      assert.throws(() => adapter.prepare(invalid, args));
    }
    for (const key of ['id', 'name']) {
      const duplicate = { ...scope[bindingKey][0], [key === 'id' ? 'name' : 'id']: 'other' };
      assert.throws(() => adapter.prepare({ ...scope, [bindingKey]: [scope[bindingKey][0], duplicate] }, args));
    }
  });

  test(`${adapter.operationId}: pagination caps, malformed data and overflow refuse`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.project(wire(page([row], 2))), { items: [expected], nextPage: 2, complete: false });
    for (const value of [page([row], 1), page([row], 3), page([row, row, row]), { ...page([row]), current_page: 2 }, { ...page([row]), per_page: 20 }, page([null]), page([[]]), page([{}]), null, []]) assert.throws(() => prepared.project(wire(value)));
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row], 101), current_page: 100 })));
  });

  test(`${adapter.operationId}: prepared scope snapshots cannot be widened later`, () => {
    const copy = structuredClone(scope);
    const prepared = adapter.prepare(copy, args);
    copy[bindingKey][0].id = 'foreign';
    copy[bindingKey].push({ id: 'foreign2', name: 'foreign' });
    assert.deepEqual(prepared.project(wire(page([row]))).items, [expected]);
    assert.throws(() => prepared.project(wire(page([{ ...row, id: 'foreign' }]))));
  });
}

test('default role metadata does not expose the documented password or connection fields', () => {
  const scope = { organization: 'example-org', database: 'example-db', branch: 'staging' };
  const prepared = defaultRole.prepare(scope, {});
  assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: '/v1/organizations/example-org/databases/example-db/branches/staging/roles/default' });
  const response = { id: 'role123', name: 'default', default: true, ready: true, expired: false, inherited_roles: ['pg_monitor'], password: canary, access_host_url: canary, username: canary, branch: { reflected: canary } };
  assert.deepEqual(prepared.project(wire(response)), { id: 'role123', name: 'default', ready: true, expired: false, inheritedRoles: ['pg_monitor'] });
  for (const invalid of [false, 'true', null, undefined]) assert.throws(() => prepared.project(wire({ ...response, default: invalid })));
  for (const invalid of [{ roleId: 'arbitrary' }, { approval: true }, { sql: canary }, null]) assert.throws(() => defaultRole.prepare(scope, invalid));
  assert.throws(() => defaultRole.prepare({ ...scope, branch: '../main' }, {}));
  assert.throws(() => prepared.project(new Uint8Array(65537)));
});
