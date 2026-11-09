import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonPermissionRevokeOperations } from '../dist/plugins/neon-broker/src/permission-revoke.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { permissionRevokeFixture as fixture, permissionRevokeArgs as args, permissionRevokeScope as scope,
  permissionRevokeReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { id: 'permission-a', acknowledged: true };
const listed = { project_permissions: [{ id: 'permission-a' }] };

test('permission revoke: bounded presence preflight precedes one exact bodyless DELETE', async () => {
  const f = fixture({ ...receipt, granted_to_email: canary, granted_at: canary, revoked_at: canary });
  assert.deepEqual(await f.run('revokePermissionFromProject', args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/permissions`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/permissions/permission-a`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('revokePermissionFromProject');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/permissions/permission-a/revoke');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  for (const name of ['listProjectPermissions', 'grantPermissionToProject', 'removeProjectMemberRole']) assert.equal(f.operation(name), undefined);
});

test('permission revoke: copied scope and exact plan reject target, authority and request overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonPermissionRevokeOperations(config, {});
  config.permissionId = 'other';
  config.projectId = 'other';
  assert.equal(op.prepare(args).plan.permission_id, 'permission-a');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, permission_id: 'other' },
    ...['', '../p', 'p?q', 'p\n', 'p'.repeat(81), 123, null].map(permission_id => ({ ...args, permission_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'user_id', 'email', 'force', 'timeout'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'permission_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('revokePermissionFromProject').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, permission_id: 'other' } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('revokePermissionFromProject').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('revokePermissionFromProject').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../p' }, { projectId: 'p\n' }, { projectId: 'Upper' }, { projectId: 'p'.repeat(61) },
    { permissionId: '-bad' }, { permissionId: 'p'.repeat(81) }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonPermissionRevokeOperations({ ...scope, ...change }, {}));
  }
});

test('permission revoke: absent, duplicate, malformed, foreign and paginated preflights refuse before DELETE', async () => {
  for (const raw of [null, {}, [], { project_permissions: [] }, { project_permissions: [{ id: 'other' }] },
    { project_permissions: [{ id: 'permission-a' }, { id: 'permission-a' }] }, { project_permissions: Array(31).fill(receipt) },
    ...[undefined, 123, '', 'bad\n', 'x'.repeat(257)].map(id => ({ project_permissions: [{ id }] })),
    ...[{ project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].flatMap(change => [
      { ...listed, ...change }, { project_permissions: [{ ...receipt, ...change }] }])]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('revokePermissionFromProject', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  const f = fixture((url, init) => response(init.method === 'DELETE' ? receipt : {
    project_permissions: [{ id: 'unselected opaque id' }, receipt] }));
  assert.deepEqual(await f.run('revokePermissionFromProject', args), expected);
});

test('permission revoke: ambiguity observes once and never upgrades absence or timestamp into success', async () => {
  for (const followup of [{ project_permissions: [] }, listed,
    { project_permissions: [{ ...receipt, revoked_at: '2026-11-09T02:00:00Z' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('revokePermissionFromProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('permission revoke: only exact HTTP200 bounded JSON and matching permission ID acknowledge', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[202, 302, 403, 404, 409, 422, 500].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, {}, { id: 'other' }, { id: 123 }, { ...receipt, project_id: 'other' }, { ...receipt, branch_id: 'br-a' },
      { ...receipt, pagination: {} }].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('revokePermissionFromProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('permission revoke: email, timestamps and credential extras are never evaluated', async () => {
  const raw = { ...receipt, project_id: 'project-a' };
  const permission = { ...raw };
  for (const value of [raw, permission]) for (const name of ['granted_to_email', 'granted_at', 'revoked_at', 'token', 'name', 'user']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonPermissionRevokeOperations(scope, {
    async listProjectPermissions() { return { project_permissions: [permission] }; }, async revokePermissionFromProject() { return raw; },
  });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
  assert.throws(() => op.project(Object.defineProperty({ ...receipt }, 'id', { get() { throw Error('getter'); }, enumerable: true })));
});

test('permission revoke: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'DELETE' ? receipt : listed); });
    await assert.rejects(f.run('revokePermissionFromProject', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('revokePermissionFromProject', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('permission revoke: path boundaries work; injection and header overrides refuse before fetch', async () => {
  for (const projectId of ['-', 'p'.repeat(60)]) for (const permissionId of ['a', 'p'.repeat(80)]) {
    const f = fixture({ id: permissionId }, { ...scope, projectId, permissionId });
    assert.deepEqual(await f.run('revokePermissionFromProject', { project_id: projectId, permission_id: permissionId }), { id: permissionId, acknowledged: true });
    assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/${projectId}/permissions/${permissionId}`);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../p', 'p?query', 'p\n', '-bad', 'p'.repeat(81)]) assert.throws(() => transport.revokePermissionFromProject('project-a', bad, options));
  for (const bad of ['', '../p', 'p?query', 'p\n', 'A', 'p'.repeat(61)]) assert.throws(() => transport.revokePermissionFromProject(bad, 'permission-a', options));
  await assert.rejects(transport.revokePermissionFromProject('project-a', 'permission-a', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.revokePermissionFromProject('project-a', 'permission-a', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
