import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonUserOrganizationOperations, USER_ORGANIZATION_OPERATIONS } from '../dist/plugins/neon-broker/src/user-organizations.js';
import { NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { userOrganizationCases as cases, userOrganizationFixture as fixture, userOrganizationScope as scope,
  canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { name: canary, handle: canary, plan: canary, managed_by: canary, created_at: canary,
  updated_at: canary, require_mfa: canary, allow_hipaa_projects: canary, password: canary, message: canary };

test('user organizations: prove exact user before fixed catalog GET with the same credential; ID-only selection', async () => {
  const f = fixture({ user: { ...raw.user, email: canary }, catalog: { organizations: [
    { id: 'org-a', ...poison }, { id: 'unselected', ...poison }], ...poison } });
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(r => r.url), [`${NEON_ORIGIN}/api/v2/users/me`, `${NEON_ORIGIN}/api/v2/users/me/organizations`]);
  for (const { url, init } of f.requests) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!url.includes('user-a'));
  }
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/users/user-a/organizations', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  for (const organizations of [[], [{ id: 'unselected' }]]) {
    assert.deepEqual(await fixture({ ...raw, catalog: { organizations } }).run(name, args), { organizations: [] });
  }
});

test('user organizations: strict user argument excludes account, organization, transport and authority overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { user_id: 'other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', true, null, 'x'.repeat(81)].map(user_id => ({ user_id })),
    ...['agent', 'approved', 'credential', 'url', 'org_id', 'organization_ids', 'project_id', 'cursor', 'limit'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'user_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('user organizations: copies bounded unique trusted selections, exact identity and revision at construction', async () => {
  const config = structuredClone(scope);
  const transport = { async getCurrentUserInfo() { return raw.user; }, async getCurrentUserOrganizations() { return raw.catalog; } };
  const operations = createNeonUserOrganizationOperations(config, transport);
  config.userId = 'other'; config.revision = 'scope-v2'; config.organizationIds[0] = 'other'; config.organizationIds.push('unselected');
  const op = operations[0];
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/users/user-a/organizations', revision: 'scope-v1' });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
  for (const change of [{ extra: true }, { userId: '' }, { userId: 'x'.repeat(81) }, { userId: 'x\n' }, { revision: '' },
    { organizationIds: null }, { organizationIds: ['org-a', 'org-a'] }, { organizationIds: ['UPPER'] },
    { organizationIds: ['x'.repeat(61)] }, { organizationIds: ['x\n'] }, { organizationIds: ['аbc'] },
    { organizationIds: Array.from({ length: 31 }, (_, n) => `org-${n}`) }, { organizationIds: new Array(2) },
  ]) assert.throws(() => createNeonUserOrganizationOperations({ ...scope, ...change }, {}));
  assert.deepEqual(operations.map(op => op.name), USER_ORGANIZATION_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['getCurrentUserInfo', 'getOrganization', 'getAuthDetails', 'listProjects', 'listApiKeys']) assert.equal(fixture(raw).operation(other), undefined);
});

test('user organizations: userless and wrong-user credentials refuse before catalog with no fallback', async () => {
  for (const identity of [null, [], {}, { id: 'other' }, { id: null }, { ...raw.user, pagination: {} }]) {
    const f = fixture({ ...raw, user: identity });
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
    assert(f.requests[0].url.endsWith('/users/me'));
  }
  for (const status of [401, 403, 404, 410, 500, 302]) {
    const f = fixture(() => response(poison, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('user organizations: detached execution revalidates arguments/resource/revision and abort before either GET', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/users/user-a/profile' },
    { ...prepared.resource, id: 'neon/users/other/organizations' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { user_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  const controller = new AbortController();
  let catalogCalls = 0;
  const [op] = createNeonUserOrganizationOperations(scope, {
    async getCurrentUserInfo() { controller.abort(); return raw.user; },
    async getCurrentUserOrganizations() { catalogCalls++; return raw.catalog; },
  });
  await assert.rejects(op.execute(op.prepare(args), canary, controller.signal));
  assert.equal(catalogCalls, 0);
});

test('user organizations: malformed/duplicate/contradictory/unexpected-pagination rows refuse before filtering', async () => {
  const invalid = [null, [], {}, { organizations: null }, { organizations: Array(31).fill({ id: 'unselected' }) },
    { organizations: [{ id: 'org-a' }, { id: 'org-a' }] }, { organizations: [{ id: 'unselected' }, { id: 'unselected' }] },
    ...[null, {}, { id: 'UPPER' }, { id: 'x\n' }, { id: 'x'.repeat(61) }, { id: 'org-a', org_id: 'other' },
      { id: 'unselected', user_id: 'other' }, { id: 'org-a', project_id: 'project-a' }, { id: 'org-a', pagination: {} }].map(row => ({ organizations: [row] })),
    ...[{ user_id: 'other' }, { project_id: 'project-a' }, { branch_id: 'br-a' }, { pagination: {} }].map(extra => ({ ...raw.catalog, ...extra })),
  ];
  for (const catalog of invalid) {
    const f = fixture({ ...raw, catalog });
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
  const { project } = fixture(raw).operation(name);
  assert.throws(() => project({ ...raw, user: { id: 'other' } }));
  assert.throws(() => project({ ...raw, pagination: {} }));
  assert.throws(() => project({ ...raw, catalog: { organizations: new Array(2) } }));
  for (const key of ['id', 'org_id', 'user_id', 'pagination']) {
    assert.throws(() => project({ ...raw, catalog: { organizations: [Object.defineProperty({ id: 'org-a' }, key,
      { get() { throw Error('getter'); }, enumerable: true })] } }));
  }
  for (const key of Object.keys(poison)) {
    const row = Object.defineProperty({ id: 'org-a' }, key, { get() { throw Error('unused getter'); }, enumerable: true });
    assert.deepEqual(project({ ...raw, catalog: { organizations: [row] } }), expected);
  }
  assert.throws(() => project({ ...raw, catalog: Object.assign(Object.create({ inherited: true }), raw.catalog) }));
});

test('user organizations: exact 30-row bound is enforced before selection without truncation', async () => {
  const organizations = Array.from({ length: 30 }, (_, n) => ({ id: `org-${n}` }));
  const config = { ...scope, organizationIds: organizations.map(row => row.id) };
  assert.deepEqual(await fixture({ ...raw, catalog: { organizations } }, config).run(name, args), { organizations });
  const f = fixture({ ...raw, catalog: { organizations: [...organizations, { id: 'extra' }] } }, config);
  await assert.rejects(f.run(name, args));
  assert.equal(f.requests.length, 2);
});

test('user organizations: catalog transport errors never fabricate empty success or switch to organization keys', async () => {
  for (const fail of [() => { throw Error(canary); }, ...[403, 404, 410, 500, 302].map(status => () => response(poison, { status })),
    () => new Response(JSON.stringify(raw.catalog), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw.catalog, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init, n) => n === 1 ? response(raw.user) : fail());
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 2);
  }
});
