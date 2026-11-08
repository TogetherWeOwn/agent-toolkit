import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as application from '../../../dist/plugins/planetscale-broker/src/tools/get-oauth-application.js';
import * as applications from '../../../dist/plugins/planetscale-broker/src/tools/list-oauth-applications.js';
import * as sso from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-sso.js';
import * as domain from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-sso-domain.js';
import * as domains from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-sso-domains.js';
import * as invitations from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-invitations.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const org = { organization: 'example-org' };
const prefix = '/v1/organizations/example-org';
const authority = { effectiveAuthority: 'not-established' };
const applicationRow = { id: 'app123', dcr: true, single_org_authorization: false, requires_org_scope: true, name: canary, client_id: canary, client_secret: canary, redirect_uri: canary, domain: canary, scopes: canary, scopes_by_resource: { secret: canary }, all_scopes_by_resource: { secret: canary }, mcp_tool_groups: [{ secret: canary }], avatar: canary, tokens: 5 };
const applicationExpected = { id: 'app123', dynamicRegistration: true, singleOrganization: false, requiresOrganizationScope: true, ...authority };
const domainRow = { type: 'OrganizationDomain', id: 'dom123', state: 'verified', verified_at: '2026-01-01T00:00:00Z', domain: canary, failure_reason: canary, created_at: canary, updated_at: canary };
const domainExpected = { id: 'dom123', state: 'verified', verificationRecorded: true };
const ssoRow = { type: 'OrganizationSSO', id: 'org123', enabled: true, configured: false, directory: true, has_verified_domain: true, domains: [domainRow], domain_verification_url: canary };
const ssoExpected = { id: 'org123', enabled: true, configured: false, directory: true, hasVerifiedDomain: true, ...authority };
const invitationRow = { id: 'inv123', role: 'member', expired: false, email: canary, sender: { email: canary, password: canary }, recipient: { email: canary }, expires_at: canary, created_at: canary, avatar_url: canary };
const invitationExpected = { id: 'inv123', role: 'member', expired: false, ...authority };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [application, { ...org, applicationId: 'app123' }, 'applicationId', applicationRow, applicationExpected, '/oauth-applications/app123', 'detail', ['dcr', 'single_org_authorization', 'requires_org_scope']],
  [applications, { ...org, applicationIds: ['app123'] }, 'applicationIds', applicationRow, applicationExpected, '/oauth-applications', 'page', ['dcr', 'single_org_authorization', 'requires_org_scope']],
  [sso, { ...org, organizationId: 'org123' }, 'organizationId', ssoRow, ssoExpected, '/sso', 'detail', ['enabled', 'configured', 'directory', 'has_verified_domain']],
  [domain, { ...org, domainId: 'dom123' }, 'domainId', domainRow, domainExpected, '/sso/domains/dom123', 'detail', ['state', 'verified_at']],
  [domains, { ...org, domainIds: ['dom123'] }, 'domainIds', domainRow, domainExpected, '/sso/domains', 'array', ['state', 'verified_at']],
  [invitations, { ...org, invitationIds: ['inv123'] }, 'invitationIds', invitationRow, invitationExpected, '/invitations', 'page', ['role', 'expired']],
];

for (const [adapter, scope, key, row, expected, path, kind, selected] of fixtures) {
  const list = kind !== 'detail';
  const args = kind === 'page' ? { page: 1, perPage: 2 } : {};
  const wrap = rows => kind === 'page' ? page(rows) : kind === 'array' ? rows : rows[0];
  const output = rows => kind === 'page' ? { items: rows, nextPage: null, complete: true } : kind === 'array' ? rows : rows[0];
  test(`${adapter.operationId}: fixed endpoint and bounded scalar projection without contact or verification material`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: prefix + path + (kind === 'page' ? '?page=1&per_page=2' : '') });
    const result = prepared.project(wire(wrap([row])));
    assert.deepEqual(result, output([expected]));
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(prepared));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(kind === 'page' ? result.items[0] : kind === 'array' ? result[0] : result));
    if (list) {
      assert.deepEqual(prepared.project(wire(wrap([]))), output([]));
      if (kind === 'page') assert.ok(Object.isFrozen(result.items));
    }
  });

  test(`${adapter.operationId}: unknown identity refuses entire response without reflection`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', null, {}, canary]) {
      assert.throws(() => prepared.project(wire(wrap(list ? [row, { ...row, id }] : [{ ...row, id }]))), error => !String(error).includes(canary));
    }
  });

  test(`${adapter.operationId}: selected fields and wire schema fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of selected) {
      for (const value of [undefined, {}, [], 1, canary, ...(field === 'verified_at' ? [] : [null])]) assert.throws(() => prepared.project(wire(wrap([{ ...row, [field]: value }]))), error => !String(error).includes(canary));
    }
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({}), wire(canary), new TextEncoder().encode('{')]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) assert.throws(() => prepared.project(wire(wrap([null]))));
    if (kind === 'array') {
      assert.throws(() => prepared.project(wire(page([row]))));
      assert.throws(() => prepared.project(wire(Array(33).fill(row))));
      assert.equal(prepared.project(wire(Array(32).fill(row))).length, 32);
    } else if (kind === 'page') {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), [row]]) assert.throws(() => prepared.project(wire(value)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    } else assert.throws(() => prepared.project(wire([row])));
  });

  test(`${adapter.operationId}: closed scope and arguments reject authority, target and credential overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'approval', 'agentId', 'production', 'all', key]) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, organization: 'x%2fy' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(invalid, args));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    for (const invalid of list ? [[], [row.id, row.id], Array(33).fill(row.id), ['../escape'], [canary]] : [null, '../escape', canary]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
    const invalidArgs = kind === 'page' ? [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }] : [{ page: 1 }, { perPage: 2 }];
    for (const invalid of invalidArgs) assert.throws(() => adapter.prepare(scope, invalid));
  });

  test(`${adapter.operationId}: trusted identity scope is snapshotted before caller mutation`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign';
    if (list) copied[key].push('foreign');
    else copied[key] = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, prefix + path + (kind === 'page' ? '?page=1&per_page=2' : ''));
    assert.deepEqual(prepared.project(wire(wrap([row]))), output([expected]));
    assert.throws(() => prepared.project(wire(wrap([{ ...row, id: 'foreign' }]))));
  });
}

test('SSO and domain resource types must match; nested domains are not projected', () => {
  for (const type of [undefined, null, 'OrganizationDomain', canary]) assert.throws(() => sso.prepare({ ...org, organizationId: 'org123' }, {}).project(wire({ ...ssoRow, type })));
  for (const type of [undefined, null, 'OrganizationSSO', canary]) assert.throws(() => domain.prepare({ ...org, domainId: 'dom123' }, {}).project(wire({ ...domainRow, type })));
  assert.deepEqual(sso.prepare({ ...org, organizationId: 'org123' }, {}).project(wire({ ...ssoRow, domains: [{ id: 'foreign', domain: canary }] })), ssoExpected);
});

test('domain state and verification presence never establish native acceptance or effective enforcement', () => {
  const prepared = domain.prepare({ ...org, domainId: 'dom123' }, {});
  for (const state of ['pending', 'verified', 'failed']) {
    for (const verified_at of [null, '2000-01-01T00:00:00Z', '2099-12-31T23:59:59Z']) assert.deepEqual(prepared.project(wire({ ...domainRow, state, verified_at })), { id: 'dom123', state, verificationRecorded: verified_at !== null });
  }
  assert.throws(() => prepared.project(wire({ ...domainRow, state: 'approved' })));
});

test('application flags and invitation roles remain informational regardless of provider status', () => {
  for (const value of [true, false]) {
    const result = application.prepare({ ...org, applicationId: 'app123' }, {}).project(wire({ ...applicationRow, dcr: value, single_org_authorization: value, requires_org_scope: value }));
    assert.equal(result.dynamicRegistration, value);
    assert.equal(result.effectiveAuthority, 'not-established');
    for (const role of ['admin', 'analyst', 'member']) {
      const invited = invitations.prepare({ ...org, invitationIds: ['inv123'] }, { page: 1, perPage: 2 }).project(wire(page([{ ...invitationRow, role, expired: value, effectiveAuthority: 'accepted' }]))).items[0];
      assert.deepEqual(invited, { id: 'inv123', role, expired: value, ...authority });
    }
  }
  assert.throws(() => invitations.prepare({ ...org, invitationIds: ['inv123'] }, { page: 1, perPage: 2 }).project(wire(page([{ ...invitationRow, role: 'owner' }]))));
});

test('organization security endpoints, list shapes and enums match pinned official contracts', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , path, kind] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { organization: scope.organization, application_id: scope.applicationId, id: scope.domainId };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), prefix + path);
    assert.deepEqual(operation.value.parameters.filter(item => item.in === 'query').map(item => item.name).sort(), kind === 'page' ? ['page', 'per_page'] : []);
    if (kind === 'array') assert.equal(operation.value.responses['200'].schema.type, 'array');
  }
  assert.deepEqual(schema.definitions.OrganizationDomain.properties.state.enum, ['pending', 'verified', 'failed']);
  assert.deepEqual(schema.definitions.PaginatedOrganizationInvitation.properties.data.items.properties.role.enum, ['admin', 'analyst', 'member']);
  for (const field of ['dcr', 'single_org_authorization', 'requires_org_scope']) assert.ok(schema.definitions.OauthApplication.required.includes(field));
});
