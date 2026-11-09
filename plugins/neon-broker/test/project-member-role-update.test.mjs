import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectMemberRoleUpdateOperations } from '../dist/plugins/neon-broker/src/project-member-role-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectMemberRoleUpdateFixture as fixture, projectMemberRoleUpdateArgs as args, projectMemberRoleUpdateScope as scope,
  projectMemberRoleUpdateMetadata as member, projectMemberRoleUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { member_id: scope.memberId, acknowledged: true };
const path = `${NEON_ORIGIN}/api/v2/projects/project-a/members/${scope.memberId}/role`;
const collection = `${NEON_ORIGIN}/api/v2/projects/project-a/members?limit=10`;

test('project member viewer: terminal explicit EDITOR preflight then one fixed viewer PUT', async () => {
  for (const expectedOrgRole of ['member', 'editor']) {
    const f = fixture(null, { ...scope, expectedOrgRole });
    assert.deepEqual(await f.run('setProjectMemberRole', args), expected);
    assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[collection, 'GET'], [path, 'PUT']]);
    assert.equal(f.requests[0].init.body, undefined);
    assert.deepEqual(JSON.parse(f.requests[1].init.body), { role: 'viewer' });
    for (const { init, url } of f.requests) {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${canary}`);
      assert.equal(init.headers['Idempotency-Key'], undefined);
      assert.equal(new URL(url).searchParams.has('confirm_self_demotion'), false);
    }
    const op = f.operation('setProjectMemberRole');
    assert.equal(op.tier, 'reserved');
    assert.equal(op.lifecycle, 'none');
    const p = op.prepare(args);
    assert.equal(p.resource.id, `neon/projects/project-a/members/${scope.memberId}/role/viewer`);
    assert.deepEqual(p.plan.diff, { before: { explicit_project_permission: 'EDITOR' }, after: { explicit_project_permission: 'VIEWER' } });
    for (const k of ['confirmSelfDemotion', 'effectiveAccessVerified', 'sessionRevocationVerified', 'connectionFence']) assert.equal(p.plan[k], false);
    assert.equal(p.plan.organizationDefaultsRemain, true);
    for (const name of ['removeProjectMemberRole', 'updateOrganizationMember', 'grantPermissionToProject']) assert.equal(f.operation(name), undefined);
  }
});

test('project member viewer: copied scope, strict caller arguments and exact plan refuse overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonProjectMemberRoleUpdateOperations(config, {});
  config.memberId = scope.userId;
  config.userId = scope.memberId;
  config.expectedOrgRole = 'member';
  assert.equal(op.prepare(args).plan.expected_org_role, 'editor');
  assert.equal(op.prepare(args).plan.user_id, scope.userId);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, member_id: scope.userId },
    ...['', '../p', 'p?q', scope.memberId + '\n', 123, null].map(member_id => ({ ...args, member_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'user_id', 'role', 'force', 'confirm_self_demotion', 'expected_permission'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'member_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const operation = f.operation('setProjectMemberRole');
  const p = operation.prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, user_id: scope.memberId } }, { plan: { ...p.plan, diff: { ...p.plan.diff, after: { explicit_project_permission: 'ADMIN' } } } },
    { plan: { ...p.plan, confirmSelfDemotion: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(operation.execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(operation.execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../p' }, { projectId: 'p\n' }, { projectId: 'Upper' }, { projectId: 'p'.repeat(61) },
    { memberId: 'invalid' }, { userId: 'invalid' }, ...['admin', 'viewer', 'collaborator', 'owner', null].map(expectedOrgRole => ({ expectedOrgRole })),
    { revision: '' }, { role: 'viewer' }, { expectedPermission: 'ADMIN' }]) assert.throws(() => createNeonProjectMemberRoleUpdateOperations({ ...scope, ...change }, {}));
});

test('project member viewer: absent, reassociated or nonexplicit EDITOR preflight refuses before PUT', async () => {
  for (const raw of [null, [], {}, { project_members: [] }, { project_members: Array(11).fill(member) },
    ...[{ member_id: scope.userId }, { user_id: scope.memberId }, { project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} },
      { org_role: 'admin' }, { org_role: 'member' }, { explicit_project_permission: 'ADMIN' }, { explicit_project_permission: 'VIEWER' },
      { explicit_project_permission: null }, { grant_source: 'org_default' }, { grant_source: 'creator' }].map(change => ({ project_members: [{ ...member, ...change }] })),
    ...['member_id', 'user_id', 'org_role', 'grant_source', 'explicit_project_permission'].map(key => ({ project_members: [Object.fromEntries(Object.entries(member).filter(([k]) => k !== key))] })),
    { project_members: [member, member] }, { project_members: [member, { ...member, member_id: scope.userId }] },
    { project_members: [member], project_id: 'other' }, { project_members: [member], branch_id: 'br-a' }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('setProjectMemberRole', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  const f = fixture(() => response({ error: canary }, { status: 404 }));
  await assert.rejects(f.run('setProjectMemberRole', args));
  assert.equal(f.requests.length, 1);
});

test('project member viewer: terminal pagination, whole-list duplicates, cycle and page bounds precede mutation', async () => {
  const f = fixture((url, init, n) => init.method === 'PUT' ? response(receipt) :
    response(n === 1 ? { project_members: [], pagination: { next: 'next-a' } } : { project_members: [member], pagination: {} }));
  assert.deepEqual(await f.run('setProjectMemberRole', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'PUT']);
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), 'next-a');
  for (const raw of [{ project_members: [member], pagination: { cursor: 'x' } },
    { project_members: [member], pagination: { next: null } }, { project_members: [member], pagination: { next: 'x\n' } },
    { project_members: [member], pagination: { next: 'cycle' } }]) {
    const g = fixture(() => response(raw));
    await assert.rejects(g.run('setProjectMemberRole', args));
    assert.equal(g.requests.some(({ init }) => init.method === 'PUT'), false);
  }
  const duplicate = fixture((url, init, n) => response({ project_members: [member], ...(n === 1 ? { pagination: { next: 'next' } } : {}) }));
  await assert.rejects(duplicate.run('setProjectMemberRole', args));
  assert.equal(duplicate.requests.length, 2);
  const capped = fixture((url, init, n) => response({ project_members: n === 1 ? [member] : [], pagination: { next: `next-${n}` } }));
  await assert.rejects(capped.run('setProjectMemberRole', args));
  assert.equal(capped.requests.length, 3);
});

test('project member viewer: documented terminal and continuing sort metadata is bounded and stable', async () => {
  for (const pagination of [{ sort_order: 'asc' }, { sort_order: 'desc' }, { sort_by: 'member_id' }, { sort_by: 'x'.repeat(80), sort_order: 'asc' }]) {
    const f = fixture((url, init) => response(init.method === 'PUT' ? receipt : { project_members: [member], pagination }));
    assert.deepEqual(await f.run('setProjectMemberRole', args), expected);
    assert.equal(f.requests.length, 2);
  }
  const f = fixture((url, init, n) => response(init.method === 'PUT' ? receipt : n === 1 ? {
    project_members: [], pagination: { next: 'page-2', sort_by: 'member_id', sort_order: 'asc' },
  } : { project_members: [member], pagination: { sort_by: 'member_id', sort_order: 'asc' } }));
  assert.deepEqual(await f.run('setProjectMemberRole', args), expected);
  assert.equal(f.requests.length, 3);
  assert.equal(new URL(f.requests[1].url).search, '?limit=10&cursor=page-2');
  for (const pagination of [{ sort_by: null }, { sort_by: '' }, { sort_by: 'x'.repeat(81) }, { sort_by: 'name\n' },
    { sort_order: 'ASC' }, { sort_order: 'other' }, { sort_order: null }, { sort_order: 1 }]) {
    const g = fixture(() => response({ project_members: [member], pagination }));
    await assert.rejects(g.run('setProjectMemberRole', args));
    assert.equal(g.requests.length, 1);
  }
  for (const pagination of [{ sort_by: 'different', sort_order: 'asc' }, { sort_by: 'member_id', sort_order: 'desc' }]) {
    const g = fixture((url, init, n) => response(n === 1 ? {
      project_members: [member], pagination: { next: 'page-2', sort_by: 'member_id', sort_order: 'asc' },
    } : { project_members: [], pagination }));
    await assert.rejects(g.run('setProjectMemberRole', args));
    assert.equal(g.requests.length, 2);
    assert.equal(g.requests.some(({ init }) => init.method === 'PUT'), false);
  }
});

test('project member viewer: ambiguity observes one bounded list without upgrading viewer, absence or replacement', async () => {
  for (const followup of [[], [member], [{ ...member, explicit_project_permission: 'VIEWER' }], [{ ...member, user_id: scope.memberId }]]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PUT') throw Error(canary);
      return response({ project_members: n === 1 ? [member] : followup });
    });
    await assert.rejects(f.run('setProjectMemberRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PUT', 'GET']);
  }
});

test('project member viewer: only exact HTTP200 identity and explicit VIEWER echo acknowledges', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[201, 202, 302, 403, 404, 409, 422, 500].map(status => () => response(receipt, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ...receipt, ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, [], true, 1, {}, { ...receipt, member_id: scope.userId }, { ...receipt, user_id: scope.memberId },
      { ...receipt, project_id: 'other' }, { ...receipt, org_role: 'admin' }, { ...receipt, explicit_project_permission: 'EDITOR' },
      { ...receipt, explicit_project_permission: null }, { ...receipt, pagination: {} },
      ...['member_id', 'user_id', 'project_id', 'org_role', 'explicit_project_permission'].map(key => Object.fromEntries(Object.entries(receipt).filter(([k]) => k !== key)))].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response({ project_members: [member] }));
    await assert.rejects(f.run('setProjectMemberRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PUT').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('project member viewer: effective/default access and profiles never evaluate or enter closed output', async () => {
  const raw = { ...member }, ack = { ...receipt };
  for (const value of [raw, ack]) for (const name of ['email', 'name', 'project_role', 'effective_project_permission', 'org_default_project_permission',
    'credential_rotation_recommended', 'org_api_key_rotation_recommended', 'token', 'password']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonProjectMemberRoleUpdateOperations(scope, {
    async listProjectMembers() { return { project_members: [raw] }; }, async setProjectMemberRole() { return ack; },
  });
  const result = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(result, expected);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  let touched = false;
  const evil = Object.defineProperty({ ...receipt }, 'explicit_project_permission', { get() { touched = true; throw Error('consumed'); }, enumerable: true });
  assert.throws(() => op.project(evil));
  assert.equal(touched, false);
  assert.deepEqual(await fixture({ ...receipt, project_role: 'admin', effective_project_permission: 'ADMIN' }).run('setProjectMemberRole', args), expected);
});

test('project member viewer: cancellation and ignored PUT deadline bound sole mutation', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'PUT' ? receipt : { project_members: [member] }); });
    await assert.rejects(f.run('setProjectMemberRole', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'PUT' ? new Promise(() => {}) : response({ project_members: [member] }));
  await assert.rejects(f.run('setProjectMemberRole', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('project member viewer: path bounds work and direct transport refuses injection', async () => {
  for (const projectId of ['-', 'p'.repeat(60)]) {
    const f = fixture(null, { ...scope, projectId });
    assert.deepEqual(await f.run('setProjectMemberRole', { ...args, project_id: projectId }), expected);
    assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/${projectId}/members/${scope.memberId}/role`);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../p', 'p?query', scope.memberId + '\n', 'A' + scope.memberId.slice(1), 'p'.repeat(81)]) assert.throws(() => transport.setProjectMemberRole('project-a', bad, options));
  for (const bad of ['', '../p', 'p?query', 'p\n', 'A', 'p'.repeat(61)]) assert.throws(() => transport.setProjectMemberRole(bad, scope.memberId, options));
  await assert.rejects(transport.setProjectMemberRole('project-a', scope.memberId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.setProjectMemberRole('project-a', scope.memberId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
