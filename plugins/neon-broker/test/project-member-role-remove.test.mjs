import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectMemberRoleRemoveOperations } from '../dist/plugins/neon-broker/src/project-member-role-remove.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectMemberRoleRemoveFixture as fixture, projectMemberRoleRemoveArgs as args, projectMemberRoleRemoveScope as scope,
  projectMemberRoleRemoveMetadata as member, projectMemberRoleRemoveReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { member_id: scope.memberId, acknowledged: true };
const collection = `${NEON_ORIGIN}/api/v2/projects/project-a/members?limit=10`;
const path = `${NEON_ORIGIN}/api/v2/projects/project-a/members/${scope.memberId}/role`;
const page = (project_members, pagination) => ({ project_members, ...(pagination === undefined ? {} : { pagination }) });
const other = n => ({ member_id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  user_id: `00000000-0000-0000-0001-${String(n).padStart(12, '0')}`, org_role: 'viewer' });

test('project member role remove: exact explicit-grant preflight then one DELETE; defaults and self-lockout controls retained', async () => {
  for (const expectedPermission of ['VIEWER', 'EDITOR', 'ADMIN']) {
    const f = fixture(undefined, { ...scope, expectedPermission });
    assert.deepEqual(await f.run('removeProjectMemberRole', args), expected);
    assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[collection, 'GET'], [path, 'DELETE']]);
    for (const { init } of f.requests) {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${canary}`);
      assert.equal(init.body, undefined);
      assert.equal(init.headers['Content-Type'], undefined);
      assert.equal(init.headers['Idempotency-Key'], undefined);
    }
    const op = f.operation('removeProjectMemberRole');
    assert.equal(op.tier, 'reserved');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/members/${scope.memberId}/role/remove`);
    assert.equal(op.prepare(args).plan.expected_permission, expectedPermission);
    assert.equal(op.prepare(args).plan.organizationDefaultsRemain, true);
    assert.equal(op.prepare(args).plan.confirmSelfLockout, false);
    assert.equal(op.prepare(args).plan.connectionFence, false);
    for (const name of ['setProjectMemberRole', 'removeOrganizationMember', 'revokePermissionFromProject']) assert.equal(f.operation(name), undefined);
  }
});

test('project member role remove: copied scope and exact plan reject caller target, grant and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonProjectMemberRoleRemoveOperations(config, {});
  config.memberId = scope.userId;
  config.userId = scope.memberId;
  config.expectedOrgRole = 'admin';
  config.expectedPermission = 'ADMIN';
  assert.equal(op.prepare(args).plan.expected_org_role, 'editor');
  assert.equal(op.prepare(args).plan.expected_permission, 'EDITOR');
  assert.equal(op.prepare(args).plan.user_id, scope.userId);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, member_id: scope.userId },
    ...['', '../p', 'p?q', scope.memberId + '\n', 123, null].map(member_id => ({ ...args, member_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'user_id', 'role', 'permission', 'confirm_self_lockout', 'timeout'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'member_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('removeProjectMemberRole').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, user_id: scope.memberId } }, { plan: { ...p.plan, expected_permission: 'ADMIN' } },
    { plan: { ...p.plan, confirmSelfLockout: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('removeProjectMemberRole').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('removeProjectMemberRole').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../p' }, { projectId: 'p\n' }, { projectId: 'Upper' }, { projectId: 'p'.repeat(61) },
    { memberId: 'invalid' }, { userId: 'invalid' }, { expectedOrgRole: 'owner' }, { expectedPermission: 'editor' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonProjectMemberRoleRemoveOperations({ ...scope, ...change }, {}));
  }
});

test('project member role remove: absent, reassociated, changed or non-explicit grants refuse before DELETE', async () => {
  for (const raw of [null, [], {}, page([]), page([{ ...member, member_id: scope.userId }]), page([{ ...member, user_id: scope.memberId }]),
    ...[{ org_role: 'admin' }, { explicit_project_permission: 'ADMIN' }, { grant_source: 'org_role_default' },
      { grant_source: 'org_admin_override' }, { project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => page([{ ...member, ...change }])),
    ...['member_id', 'user_id', 'org_role', 'explicit_project_permission', 'grant_source'].map(key => page([Object.fromEntries(Object.entries(member).filter(([k]) => k !== key))])),
    { ...page([member]), project_id: 'other' }, { ...page([member]), branch_id: 'br-a' }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('removeProjectMemberRole', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404]) {
    const f = fixture(() => response({ error: canary }, { status }));
    await assert.rejects(f.run('removeProjectMemberRole', args));
    assert.equal(f.requests.length, 1);
  }
});

test('project member role remove: terminal bounded next pagination precedes DELETE; later duplicates, cycles and ceilings refuse', async () => {
  const good = fixture((url, init, n) => response(init.method === 'DELETE' ? receipt : n === 1 ? page([other(1)], { next: 'next a' }) : page([member])));
  assert.deepEqual(await good.run('removeProjectMemberRole', args), expected);
  assert.deepEqual(good.requests.map(({ init }) => init.method), ['GET', 'GET', 'DELETE']);
  assert.equal(good.requests[1].url, collection + '&cursor=next+a');
  const terminal = fixture((url, init, n) => response(init.method === 'DELETE' ? receipt : n === 1 ? page([member], { next: 'last' }) : page([])));
  assert.deepEqual(await terminal.run('removeProjectMemberRole', args), expected);
  for (const nextPage of [page([member]), page([{ ...other(2), user_id: scope.userId }]), page([other(2)], { next: 'again' }),
    page([other(2)], { cursor: 'wrong-field' }), page([other(2)], { next: null }), page(Array.from({ length: 11 }, (_, n) => other(n + 2)))]) {
    const f = fixture((url, init, n) => response(n === 1 ? page([member], { next: 'again' }) : nextPage));
    await assert.rejects(f.run('removeProjectMemberRole', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET']);
  }
  const cap = fixture((url, init, n) => response(page(n === 1 ? [member] : [other(n)], { next: `page-${n}` })));
  await assert.rejects(cap.run('removeProjectMemberRole', args));
  assert.equal(cap.requests.length, 3);
  const boundary = fixture((url, init, n) => response(init.method === 'DELETE' ? receipt : page(n === 3 ? [member] : Array.from({ length: 10 }, (_, i) => other(n * 10 + i)), n < 3 ? { next: `page-${n}` } : undefined)));
  assert.deepEqual(await boundary.run('removeProjectMemberRole', args), expected);
  assert.equal(boundary.requests.length, 4);
});

test('project member role remove: ambiguity observes once and never upgrades absence, default access or matching state', async () => {
  for (const followup of [page([]), page([member]), page([{ ...member, grant_source: 'org_role_default', explicit_project_permission: undefined }])]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? page([member]) : followup);
    });
    await assert.rejects(f.run('removeProjectMemberRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
  }
});

test('project member role remove: HTTP200 exact identity acknowledges only; provider self-lockout denial stays uncertain', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[202, 302, 403, 404, 409, 422, 500].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ...receipt, ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, [], {}, { ...receipt, member_id: scope.userId }, { ...receipt, user_id: scope.memberId }, { ...receipt, org_role: 'admin' },
      { ...receipt, project_id: 'other' }, { ...receipt, branch_id: 'br-a' }, { ...receipt, pagination: {} }].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(page([member])));
    await assert.rejects(f.run('removeProjectMemberRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
    assert.equal(new URL(f.requests[1].url).search, '');
  }
  const f = fixture({ ...receipt, project_role: 'editor', effective_project_permission: 'EDITOR', credential_rotation_recommended: true });
  assert.deepEqual(await f.run('removeProjectMemberRole', args), expected);
});

test('project member role remove: profiles, default/effective permissions and rotation hints are not evaluated or emitted', async () => {
  const raw = { ...member };
  const result = { ...receipt };
  for (const obj of [raw, result]) for (const name of ['email', 'name', 'project_role', 'org_default_project_permission', 'effective_project_permission',
    'credential_rotation_recommended', 'org_api_key_rotation_recommended', 'created_at', 'token']) {
    Object.defineProperty(obj, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonProjectMemberRoleRemoveOperations(scope, {
    async listProjectMembers() { return page([raw]); }, async removeProjectMemberRole() { return result; },
  });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
});

test('project member role remove: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'DELETE' ? receipt : page([member])); });
    await assert.rejects(f.run('removeProjectMemberRole', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(page([member])));
  await assert.rejects(f.run('removeProjectMemberRole', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('project member role remove: path boundaries work; injection and header overrides refuse before fetch', async () => {
  for (const projectId of ['-', 'p'.repeat(60)]) {
    const f = fixture(undefined, { ...scope, projectId });
    assert.deepEqual(await f.run('removeProjectMemberRole', { ...args, project_id: projectId }), expected);
    assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/${projectId}/members/${scope.memberId}/role`);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../p', 'p?query', scope.memberId + '\n', 'A' + scope.memberId.slice(1), 'p'.repeat(81)]) assert.throws(() => transport.removeProjectMemberRole('project-a', bad, options));
  for (const bad of ['', '../p', 'p?query', 'p\n', 'A', 'p'.repeat(61)]) assert.throws(() => transport.removeProjectMemberRole(bad, scope.memberId, options));
  await assert.rejects(transport.removeProjectMemberRole('project-a', scope.memberId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.removeProjectMemberRole('project-a', scope.memberId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
