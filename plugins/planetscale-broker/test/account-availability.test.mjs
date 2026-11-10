import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as user from '../../../dist/plugins/planetscale-broker/src/tools/get-current-user.js';
import * as organizations from '../../../dist/plugins/planetscale-broker/src/tools/list-organizations.js';
import * as regions from '../../../dist/plugins/planetscale-broker/src/tools/list-read-only-regions.js';
import * as versions from '../../../dist/plugins/planetscale-broker/src/tools/list-postgres-versions.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const database = { organization: 'example-org', database: 'example-db' };
const organization = { id: 'org123', name: 'example-org' };
const region = { id: 'region123', name: 'eu-west' };
const regionRow = { id: region.id, slug: region.name, enabled: true, provider: canary, public_ip_addresses: [canary], display_name: canary, location: canary };
const regionExpected = { id: region.id, slug: region.name, enabled: true };
const fixtures = [
  [user, { user: { id: 'user123' } }, 'user', {}, '/v1/user', 'detail', { id: 'user123', two_factor_auth_configured: true, display_name: canary, name: canary, email: canary, avatar_url: canary, default_organization: { id: canary }, sso: canary }, { id: 'user123', twoFactorAuthConfigured: true }, ['two_factor_auth_configured']],
  [organizations, { organizations: [organization] }, 'organizations', { page: 1, perPage: 2 }, '/v1/organizations?page=1&per_page=2', 'page', { ...organization, sso: true, billing_email: canary, plan: canary, sso_portal_url: canary, features: { secret: canary }, invoice_budget_amount: canary, mcp_access_level: canary }, { ...organization, sso: true }, ['sso']],
  [regions, { ...database, regions: [{ id: 'readonly123', region }] }, 'regions', { page: 1, perPage: 2 }, '/v1/organizations/example-org/databases/example-db/read-only-regions?page=1&per_page=2', 'page', { id: 'readonly123', ready: true, region: regionRow, display_name: canary, actor: { id: canary }, ready_at: canary }, { id: 'readonly123', ready: true, region: regionExpected }, ['ready']],
  [versions, { engine: 'neki', versions: [{ id: 'version123' }] }, 'versions', {}, '/v1/postgres-versions?engine=neki', 'array', { id: 'version123', default: true, major_version: canary, minor_version: canary, version: canary }, { id: 'version123', default: true }, ['default']],
];
const page = data => ({ current_page: 1, per_page: 2, next_page: null, next_page_url: canary, data });

for (const [adapter, scope, key, args, path, kind, row, expected, flags] of fixtures) {
  const wrap = rows => kind === 'detail' ? rows[0] : kind === 'page' ? page(rows) : rows;
  const output = rows => kind === 'detail' ? rows[0] : kind === 'page' ? { items: rows, nextPage: null, complete: true } : rows;

  test(`${adapter.operationId}: fixed request and immutable bounded projection omit sensitive/free text`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
    const result = prepared.project(wire(wrap([row])));
    assert.deepEqual(result, output([expected]));
    assert.ok(!JSON.stringify(result).includes(canary));
    const projectedRow = kind === 'detail' ? result : kind === 'page' ? result.items[0] : result[0];
    for (const value of [prepared, prepared.request, result, projectedRow]) assert.ok(Object.isFrozen(value));
    if (key === 'regions') assert.ok(Object.isFrozen(projectedRow.region));
    if (kind !== 'detail') assert.deepEqual(prepared.project(wire(wrap([]))), output([]));
  });

  test(`${adapter.operationId}: mismatched identity refuses the whole response`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', null, {}, canary]) {
      const bad = { ...row, id };
      assert.throws(() => prepared.project(wire(wrap(kind === 'detail' ? [bad] : [row, bad]))), error => !String(error).includes(canary));
    }
    if (key === 'organizations') for (const name of ['foreign', null, canary]) assert.throws(() => prepared.project(wire(wrap([{ ...row, name }]))));
  });

  test(`${adapter.operationId}: selected flags and wire shapes fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of flags) for (const value of [undefined, null, 1, 'true', {}, [], canary]) assert.throws(() => prepared.project(wire(wrap([{ ...row, [field]: value }]))), error => !String(error).includes(canary));
    for (const body of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({}), wire(canary), new TextEncoder().encode('{')]) assert.throws(() => prepared.project(body), error => !String(error).includes(canary));
    if (kind === 'array') {
      assert.throws(() => prepared.project(wire(page([row]))));
      assert.throws(() => prepared.project(wire(Array(33).fill(row))));
      assert.throws(() => prepared.project(wire([row, null])));
    } else assert.throws(() => prepared.project(wire([row])));
    if (kind === 'page') {
      for (const body of [page([row, null]), page([row, row, row]), { ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }]) assert.throws(() => prepared.project(wire(body)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed arguments and nested bindings reject overrides`, () => {
    for (const field of ['url', 'sql', 'secret', 'approval', 'agentId', 'all', key, 'engine', 'q']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, approval: true }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(invalid, args));
    const accessor = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(accessor, args), error => !String(error).includes(canary));
    const entry = kind === 'detail' ? scope[key] : scope[key][0];
    const bad = [null, '../escape', { ...entry, id: canary }, { ...entry, approval: true }];
    for (const invalid of kind === 'detail' ? bad : [[], [entry, entry], Array(33).fill(entry), ...bad.map(value => [value])]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
    for (const invalid of kind === 'page' ? [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }] : [{ page: 1 }, { perPage: 2 }]) assert.throws(() => adapter.prepare(scope, invalid));
  });

  test(`${adapter.operationId}: prepared scope and argument snapshots cannot be widened`, () => {
    const copied = structuredClone(scope), copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    const entry = kind === 'detail' ? copied[key] : copied[key][0];
    entry.id = 'foreign';
    if (entry.name) entry.name = 'foreign';
    if (entry.region) { entry.region.id = 'foreign'; entry.region.name = 'foreign'; }
    if (kind !== 'detail') copied[key].push({ id: 'foreign' });
    if (copied.engine) copied.engine = 'foreign';
    if (copied.organization) copied.organization = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path);
    assert.deepEqual(prepared.project(wire(wrap([row]))), output([expected]));
    assert.throws(() => prepared.project(wire(wrap([{ ...row, id: 'foreign' }]))));
  });
}

test('read-only region identity is bound independently of its parent region ID and slug', () => {
  const [, scope, , args, , , row] = fixtures[2];
  const prepared = regions.prepare(scope, args);
  for (const value of [null, [], { ...regionRow, id: 'foreign' }, { ...regionRow, slug: 'foreign' }, { ...regionRow, enabled: null }]) assert.throws(() => prepared.project(wire(page([{ ...row, region: value }]))));
  for (const value of [null, { ...region, id: canary }, { ...region, name: '../foreign' }, { ...region, url: canary }]) assert.throws(() => regions.prepare({ ...scope, regions: [{ id: 'readonly123', region: value }] }, args));
  for (const field of ['organization', 'database']) for (const value of ['../foreign', 'x%2fy', canary]) assert.throws(() => regions.prepare({ ...scope, [field]: value }, args));
});

test('organization lists reject rebound names and duplicate name bindings', () => {
  assert.throws(() => organizations.prepare({ organizations: [organization, { id: 'other', name: organization.name }] }, { page: 1, perPage: 2 }));
  for (const name of ['../foreign', 'x%2fy', canary, null]) assert.throws(() => organizations.prepare({ organizations: [{ ...organization, name }] }, { page: 1, perPage: 2 }));
});

test('Postgres availability fixes the sole documented engine in trusted scope, not tool arguments', () => {
  const [, scope] = fixtures[3];
  for (const engine of [undefined, null, 'postgresql', 'mysql', canary]) assert.throws(() => versions.prepare({ ...scope, engine }, {}));
});

test('configuration/availability flags never produce effective authority or upgrade readiness', () => {
  for (const [adapter, scope, , args, , kind, row, expected, flags] of fixtures) {
    for (const value of [true, false]) {
      const changed = { ...row, [flags[0]]: value, approval: 'accepted' };
      const result = adapter.prepare(scope, args).project(wire(kind === 'detail' ? changed : kind === 'page' ? page([changed]) : [changed]));
      const projected = kind === 'detail' ? result : kind === 'page' ? result.items[0] : result[0];
      assert.deepEqual(projected, { ...expected, [adapter === user ? 'twoFactorAuthConfigured' : flags[0]]: value });
    }
  }
});

test('account and availability reads retain official paths, query shapes and scope uncertainty', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, scope, , , path, kind] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), path.split('?')[0]);
    assert.deepEqual(operation.value.parameters.filter(item => item.in === 'query').map(item => item.name).sort(), kind === 'page' ? ['page', 'per_page'] : adapter === versions ? ['engine'] : []);
    if (kind === 'array') assert.equal(operation.value.responses['200'].schema.type, 'array');
    const mapped = map.operations.find(item => item.operationId === adapter.operationId);
    assert.equal(mapped.credentialEntitlement, 'unknown-awaiting-operator-metadata');
    assert.equal(mapped.enablement, 'disabled');
  }
  assert.ok(schema.paths['/user'].get.description.includes('`read_user`'));
  assert.ok(schema.paths['/organizations'].get.description.includes('`read_organizations`'));
  const versionsRow = map.operations.find(item => item.operationId === versions.operationId);
  assert.deepEqual(versionsRow.documentedAuthorization.serviceTokenAnyOf, []);
  assert.equal(versionsRow.documentedAuthorization.serviceTokenDocumentation, 'not-listed-not-proof-of-denial');
  assert.deepEqual(versionsRow.documentedAuthorization.oauthAlternatives, []);
  assert.deepEqual(schema.paths['/postgres-versions'].get.parameters[0].enum, ['neki']);
});
