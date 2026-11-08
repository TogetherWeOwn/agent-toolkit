import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectAccessOperations, PROJECT_ACCESS_OPERATIONS, MAX_PROJECT_ACCESS_BINDINGS } from '../dist/plugins/neon-broker/src/project-access.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectAccessCases as cases, projectAccessFixture as fixture, projectAccessScope as scope, projectMember as member, canary, response } from './helpers.mjs';

const poison = { email: canary, name: canary, granted_to_email: canary, granted_at: canary, revoked_at: canary,
  project_role: canary, org_default_project_permission: canary, explicit_project_permission: canary,
  password: canary, connection_uri: canary, diagnostics: canary };
for (const [name, args, raw, expected] of cases) {
  const members = name === 'listProjectMembers';
  const collection = members ? 'project_members' : 'project_permissions';
  const suffix = members ? 'members' : 'permissions';
  const item = raw[collection][0];
  const wrap = value => ({ [collection]: [value] });
  test(`${name}: exact project collection GET and closed access metadata projection`, async () => {
    const f = fixture(wrap({ ...item, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/${suffix}${members ? '?limit=10' : ''}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: closed canonical arguments reject caller authority and arbitrary selection`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { project_id: 'other' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'branch_id', 'member_id', 'user_id', 'permission_id'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
      ...['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(61), 'prоject-a', 'Upper', 'has_underscore', true, null].map(project_id => ({ project_id })),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates resource/revision, arguments and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { project_id: 'other' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: duplicate identities, ancestry, malformed records and list bounds refuse`, async () => {
    for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-a' },
      { [collection]: [item, item] }, { [collection]: Array(members ? 11 : 31).fill(item) },
      wrap({ ...item, project_id: 'other' }), wrap({ ...item, branch_id: 'br-a' }), wrap({ ...item, pagination: {} }),
    ]) await assert.rejects(fixture(value).run(name, args));
    const op = fixture(raw).operation(name);
    for (const values of [new Array(1), Object.assign([item], { extra: canary }),
      Object.defineProperty([item], '0', { get() { throw Error('getter'); }, enumerable: true })]) {
      assert.throws(() => op.project({ [collection]: values }));
    }
    for (const key of [...Object.keys(item), 'project_id', 'branch_id', 'pagination']) {
      assert.throws(() => op.project(wrap(Object.defineProperty({ ...item }, key, { get() { throw Error('getter'); }, enumerable: true }))));
    }
    assert.deepEqual(op.project(wrap(Object.defineProperty({ ...item }, 'email', { get() { throw Error('unused getter'); }, enumerable: true }))), expected);
    assert.deepEqual(await fixture({ ...raw, project_id: 'project-a' }).run(name, args), expected);
    assert.deepEqual(await fixture({ [collection]: [] }).run(name, args), { [collection]: [] });
  });

  test(`${name}: unavailable never becomes empty success, fallback or mutation`, async () => {
    for (const status of [403, 404, 410, 500, 302]) {
      const f = fixture(() => response(poison, { status }));
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
      () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
  });
}

test('permission list filters explicit IDs, rejects pagination and never infers active access from timestamps', async () => {
  const [name, args, raw, expected] = cases[0];
  assert.deepEqual(await fixture({ project_permissions: [{ id: 'unselected/provider-id', ...poison }, { id: 'permission-a', ...poison }] }).run(name, args), expected);
  for (const pagination of [{}, { next: 'page-2' }, null]) await assert.rejects(fixture({ ...raw, pagination }).run(name, args));
  for (const id of [null, true, '', 'x\n', 'x'.repeat(257)]) await assert.rejects(fixture({ project_permissions: [{ id }] }).run(name, args));
  await assert.rejects(fixture({ project_permissions: [{ id: 'other' }, { id: 'other' }] }).run(name, args));
});

test('member ID/user bindings refuse reassociation even across unselected rows; optional status stays absent', async () => {
  const [name, args] = cases[1];
  const otherId = '00000000-0000-0000-0000-000000000003';
  const otherUser = '00000000-0000-0000-0000-000000000004';
  for (const changed of [{ user_id: otherUser }, { member_id: otherId }, { user_id: null }, { member_id: 'not-a-uuid' },
    { org_role: 'owner' }, { org_role: null }, { effective_project_permission: 'owner' }, { effective_project_permission: null },
    { grant_source: 'unknown' }, { grant_source: null }]) {
    await assert.rejects(fixture({ project_members: [{ ...member, ...changed }] }).run(name, args));
  }
  const unrelated = { member_id: otherId, user_id: otherUser, ...poison };
  assert.deepEqual(await fixture({ project_members: [unrelated, member] }).run(name, args), { project_members: [member] });
  for (const row of [{ ...unrelated, member_id: member.member_id }, { ...unrelated, user_id: member.user_id }]) {
    await assert.rejects(fixture({ project_members: [member, row] }).run(name, args));
  }
  const minimal = { member_id: member.member_id, user_id: member.user_id, org_role: 'collaborator' };
  assert.deepEqual(await fixture({ project_members: [minimal] }).run(name, args), { project_members: [minimal] });
  for (const grant_source of ['explicit', 'org_role_default', 'org_admin_override', 'unassigned']) {
    const value = { ...minimal, grant_source };
    assert.deepEqual(await fixture({ project_members: [value] }).run(name, args), { project_members: [value] });
  }
});

test('members follow encoded pagination.next, accept empty terminal pagination, refuse wrong fields and partial results', async () => {
  const [name, args] = cases[1];
  const cursor = 'opaque+/=&?cursor';
  const f = fixture((url, init, n) => response(n === 1 ? { project_members: [member], pagination: { next: cursor } } :
    { project_members: [], pagination: {} }));
  assert.deepEqual(await f.run(name, args), { project_members: [member] });
  assert.equal(f.requests.length, 2);
  const query = new URL(f.requests[1].url).searchParams;
  assert.equal(query.get('cursor'), cursor);
  assert.equal(query.get('limit'), '10');
  assert.equal(query.size, 2);
  for (const pagination of [{ cursor: 'wrong' }, { sort_by: 'name' }, null, { next: null }, { next: '' }, { next: 'x\n' }, { next: 'x'.repeat(257) }]) {
    const bad = fixture({ project_members: [member], pagination });
    await assert.rejects(bad.run(name, args));
    assert.equal(bad.requests.length, 1);
  }
  for (const kind of ['cycle', 'ceiling', 'duplicate', 'ancestry', 'unavailable', 'abort']) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (kind === 'abort') controller.abort();
      if (kind === 'unavailable' && n === 2) return response({}, { status: 404 });
      if (kind === 'duplicate') return response({ project_members: [member], pagination: n === 1 ? { next: 'page-2' } : {} });
      return response({ project_members: [], ...(kind === 'ancestry' && n === 2 ? { project_id: 'other' } : {}),
        pagination: { next: kind === 'cycle' ? 'same' : `page-${n + 1}` } });
    });
    await assert.rejects(f.run(name, args, controller.signal));
    assert.equal(f.requests.length, kind === 'ceiling' ? 3 : kind === 'abort' ? 1 : 2);
  }
});

test('access scope copies bounded unique permission and paired member identities without exposing write descriptors', () => {
  const config = structuredClone(scope);
  const operations = createNeonProjectAccessOperations(config, {});
  config.permissionIds[0] = 'changed';
  config.members[0].userId = '00000000-0000-0000-0000-000000000099';
  for (const [index, entry] of cases.entries()) assert.deepEqual(operations[index].project(entry[2]), entry[3]);
  for (const changed of [{ permissionIds: ['permission-a', 'permission-a'] }, { members: [scope.members[0], scope.members[0]] },
    { members: [scope.members[0], { ...scope.members[0], memberId: '00000000-0000-0000-0000-000000000099' }] },
    { permissionIds: ['unsupported/id'] }, { members: [{ memberId: member.member_id }] }, { members: new Array(1) }, { approved: true },
    ...['permissionIds', 'members'].map(key => ({ [key]: Array(MAX_PROJECT_ACCESS_BINDINGS + 1).fill(scope[key][0]) })),
  ]) assert.throws(() => createNeonProjectAccessOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(operations.map(op => op.name), PROJECT_ACCESS_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['grantPermissionToProject', 'revokePermissionFromProject', 'setProjectMemberRole', 'getProjectAdvisorSecurityIssues', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('access transport validates pinned project and cursor bounds before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', 'Upper', 'has_underscore', '../escape', 'x/y', 'x\n', 'x'.repeat(61)]) {
    assert.throws(() => transport.listProjectPermissions(value, options));
    assert.throws(() => transport.listProjectMembers(value, null, options));
  }
  for (const cursor of ['', 'x\n', 'x'.repeat(257), 1]) assert.throws(() => transport.listProjectMembers('project-a', cursor, options));
  assert.equal(calls, 0);
});
