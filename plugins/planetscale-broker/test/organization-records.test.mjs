import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as membership from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-membership.js';
import * as memberships from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-members.js';
import * as team from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-team.js';
import * as teams from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-teams.js';
import * as member from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-team-member.js';
import * as members from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-team-members.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const org = { organization: 'example-org' };
const orgPath = '/v1/organizations/example-org';
const membershipBinding = { id: 'om123', userId: 'us123' };
const teamBinding = { id: 'tm123', slug: 'engineering' };
const memberBinding = { id: 'mt123', userId: 'us123' };
const user = { id: 'us123', display_name: canary, name: canary, email: canary, avatar_url: canary, default_organization: { id: canary }, two_factor_auth_configured: true, sso: true, managed: true, directory_managed: true, email_verified: true };
const membershipRow = { id: 'om123', user, role: 'admin', created_at: canary, updated_at: canary };
const membershipExpected = { id: 'om123', userId: 'us123', role: 'admin', effectiveAuthority: 'not-established' };
const teamRow = { id: 'tm123', slug: 'engineering', managed: true, name: canary, display_name: canary, description: canary, creator: { id: canary }, members: [user], databases: [{ id: canary, url: canary }], analyst_databases: [{ id: canary, url: canary }], created_at: canary, updated_at: canary };
const teamExpected = { id: 'tm123', slug: 'engineering', managed: true, effectiveAuthority: 'not-established' };
const memberRow = { id: 'mt123', user, actor: { id: canary }, passwords: [{ plain_text: canary, username: canary, cidrs: [canary], access_host_url: canary, database_branch: { production: true } }], created_at: canary, updated_at: canary };
const memberExpected = { id: 'mt123', userId: 'us123', effectiveAuthority: 'not-established' };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [membership, { ...org, membership: membershipBinding }, 'membership', membershipRow, membershipExpected, orgPath + '/members/om123', false, 'OrganizationMembership'],
  [memberships, { ...org, memberships: [membershipBinding] }, 'memberships', membershipRow, membershipExpected, orgPath + '/members', true, 'OrganizationMembership'],
  [team, { ...org, team: teamBinding }, 'team', teamRow, teamExpected, orgPath + '/teams/engineering', false, 'OrganizationTeam'],
  [teams, { ...org, teams: [teamBinding] }, 'teams', teamRow, teamExpected, orgPath + '/teams', true, 'OrganizationTeam'],
  [member, { ...org, team: teamBinding, membership: memberBinding }, 'membership', memberRow, memberExpected, orgPath + '/teams/engineering/members/mt123', false, 'OrganizationTeamMembership'],
  [members, { ...org, team: teamBinding, memberships: [memberBinding] }, 'memberships', memberRow, memberExpected, orgPath + '/teams/engineering/members', true, 'OrganizationTeamMembership'],
];

for (const [adapter, scope, key, row, expected, path, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const project = (prepared, rows) => prepared.project(wire(list ? page(rows) : rows[0]));
  const output = list ? { items: [expected], nextPage: null, complete: true } : expected;
  test(`${adapter.operationId}: fixed GET and immutable contact/credential-free projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, output);
    assert.ok(!JSON.stringify(result).includes(canary));
    for (const value of [prepared, prepared.request, result, list ? result.items : result, list ? result.items[0] : result]) assert.ok(Object.isFrozen(value));
    if (list) assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: unknown/rebound identities refuse the whole page`, () => {
    const prepared = adapter.prepare(scope, args);
    const bad = [{ ...row, id: 'foreign' }, { ...row, id: canary }, { ...row, id: null }];
    if (row.user) for (const value of [null, {}, [], { id: 'foreign' }, { id: canary }]) bad.push({ ...row, user: value });
    else for (const value of ['foreign', null, canary]) bad.push({ ...row, slug: value });
    for (const value of bad) assert.throws(() => project(prepared, list ? [row, value] : [value]), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: malformed selected fields, wire/page caps refuse`, () => {
    const prepared = adapter.prepare(scope, args);
    if (row.role) for (const role of [null, undefined, 'owner', canary, 1]) assert.throws(() => project(prepared, [{ ...row, role }]), error => !String(error).includes(canary));
    if ('managed' in row) for (const managed of [null, undefined, canary, 1, {}]) assert.throws(() => project(prepared, [{ ...row, managed }]));
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.deepEqual(prepared.project(wire({ ...page([row]), next_page: 2 })), { items: [expected], nextPage: 2, complete: false });
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed arguments and broker scope reject overrides/accessors`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'team', 'user_id', 'role', 'q']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }]) assert.throws(() => adapter.prepare(value, args));
    const binding = list ? scope[key][0] : scope[key];
    const bad = [{ ...binding, id: '../escape' }, { ...binding, extra: true }, {}];
    if (binding.slug) bad.push({ ...binding, slug: '../escape' });
    if (binding.userId) bad.push({ ...binding, userId: '../escape' });
    for (const value of bad) assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [value] : value }, args));
    if (list) {
      const secondKey = binding.slug ? 'slug' : 'userId';
      for (const value of [[], [binding, binding], [binding, { ...binding, id: 'other' }], [binding, { ...binding, [secondKey]: 'other' }], Array(33).fill(binding)]) assert.throws(() => adapter.prepare({ ...scope, [key]: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    }
    const hostile = Object.defineProperty({ ...binding }, 'id', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare({ ...scope, [key]: list ? [hostile] : hostile }, args), error => !String(error).includes(canary));
    if (scope.team) for (const value of [{ ...scope.team, slug: '../escape' }, { ...scope.team, id: '../escape' }, { ...scope.team, extra: true }]) assert.throws(() => adapter.prepare({ ...scope, team: value }, args));
  });

  test(`${adapter.operationId}: later input mutation cannot widen/retarget bindings`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign';
    const binding = list ? copied[key][0] : copied[key];
    binding.id = 'foreign';
    if (binding.slug) binding.slug = 'foreign';
    if (binding.userId) binding.userId = 'foreign';
    if (copied.team) { copied.team.id = 'foreign'; copied.team.slug = 'foreign'; }
    if (list) copied[key].push({ ...binding, id: 'another' });
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), output);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });
}

test('provider admin/managed flags and nested grants never establish native authority', () => {
  for (const role of ['member', 'admin']) assert.deepEqual(membership.prepare({ ...org, membership: membershipBinding }, {}).project(wire({ ...membershipRow, role })), { ...membershipExpected, role });
  assert.deepEqual(team.prepare({ ...org, team: teamBinding }, {}).project(wire({ ...teamRow, managed: false })), { ...teamExpected, managed: false });
  assert.deepEqual(member.prepare({ ...org, team: teamBinding, membership: memberBinding }, {}).project(wire({ ...memberRow, passwords: [{ plain_text: canary, role: 'admin' }], approval: true })), memberExpected);
});

test('organization record endpoints/selected fields and enums match pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, key, , , path, list, definitionName] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const binding = list ? scope[key][0] : scope[key];
    const parameters = { organization: scope.organization, team: scope.team?.slug, id: binding.id };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), path);
    const queries = operation.value.parameters.filter(value => value.in === 'query').map(value => value.name);
    if (list) for (const name of ['page', 'per_page']) assert.ok(queries.includes(name));
    else assert.deepEqual(queries, []);
    const definition = schema.definitions[definitionName];
    for (const field of ['id', ...(definitionName === 'OrganizationTeam' ? ['slug', 'managed'] : ['user'])]) assert.ok(definition.required.includes(field));
    if (definitionName !== 'OrganizationTeam') assert.ok(definition.properties.user.required.includes('id'));
    const resultSchema = operation.value.responses['200'].schema;
    if (list) assert.deepEqual(schema.definitions[resultSchema.$ref.split('/').at(-1)].properties.data.items, definition);
    else assert.equal(resultSchema.$ref, '#/definitions/' + definitionName);
  }
  assert.deepEqual(schema.definitions.OrganizationMembership.properties.role.enum, ['member', 'admin']);
  assert.ok(schema.definitions.OrganizationTeamMembership.properties.passwords.items.properties.plain_text);
});
