import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthUserRoleOperations } from '../dist/plugins/neon-broker/src/auth-user-role.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authUserRoleFixture as fixture, authUserRoleScope as scope, authUserRoleArgs as args,
  authUserRoleMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'updateNeonAuthUserRole';
const expected = { acknowledged: true };

// The schema echoes only ID, not assigned roles or independently observed effective access.
test('Auth user role: branch preflight then one fixed built-in user PUT acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/users/user_a/role`, 'PUT']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  assert.equal(f.requests[0].init.body, undefined);
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { roles: ['user'] });
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/auth/users/user_a/role/user');
  assert.deepEqual(p.plan.roles, ['user']);
  assert.equal(p.plan.reconciliation, 'user_read_unavailable_remain_uncertain_no_retry');
  for (const k of ['userPresenceVerified', 'previousRolesVerified', 'assignedRolesVerified', 'accessReductionVerified',
    'issuedTokensRevoked', 'sessionsRevoked', 'connectionFence', 'atomicCompareAndSwap']) assert.equal(p.plan[k], false);
});

test('Auth user role: copied strict target and role/body/native-plan overrides refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthUserRoleOperations(config, {});
  config.userId = 'other';
  assert.equal(op.prepare(args).arguments.auth_user_id, scope.userId);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' }, { ...args, auth_user_id: 'other' },
    ...['roles', 'role', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'provider', 'email', 'body'].map(k => ({ ...args, [k]: ['admin'] })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'auth_user_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/user', '/admin') } },
    ...['auth_user_id', 'roles', 'effect', 'previousRolesVerified', 'diff', 'reconciliation'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Auth user role: malformed or foreign branch preflight never changes a directory role', async () => {
  for (const raw of [null, {}, [], { branch: {} }, { branch: { id: 'other', project_id: 'project-a' } },
    { branch: { id: 'br-a', project_id: 'other' } },
    ...[{ project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ ...metadata, ...change })),
    ...[{ branch_id: 'other' }, { pagination: {} }].map(change => ({ branch: { ...metadata.branch, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Auth user role: ambiguity has no invented directory read, role retry or fallback', async () => {
  const f = fixture((url, init) => { if (init.method === 'PUT') throw Error(canary); return response(metadata); });
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PUT']);
});

test('Auth user role: only terminal JSON200 exact user ID acknowledges; other receipts stay uncertain', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, [], { id: 'other' }, { id: 1 }, { id: 'user_a', project_id: 'other' }, { id: 'user_a', branch_id: 'other' },
      { id: 'user_a', pagination: {} }].map(raw => () => response(raw)),
    () => response({ id: 'user_a' }, { headers: { 'content-type': 'text/plain' } }),
    () => new Response('{"id":"user_a"', { headers: { 'content-type': 'application/json' } }),
    () => response({ id: 'user_a', ignored: 'a'.repeat(66000) }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 2);
  }
  const f = fixture((url, init) => init.method === 'PUT' ?
    new Response('{"id":"user_a","id":"user_a"}', { headers: { 'content-type': 'application/json' } }) : response(metadata));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Auth user role: unused metadata never evaluates and exact-ID projection is closed', async () => {
  const branch = { ...metadata.branch };
  const raw = { id: 'user_a' };
  for (const k of ['name', 'roles', 'users', 'password', 'connection_uri', 'error']) {
    for (const value of [branch, raw]) Object.defineProperty(value, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonAuthUserRoleOperations(scope, {
    async getProjectBranch() { return { branch }; }, async updateNeonAuthUserRole() { return raw; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, { id: 'other' }, { acknowledged: true },
    Object.defineProperty({}, 'id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Auth user role: cancellation and ignored-fetch deadlines bound the sole PUT attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'PUT' ? { id: 'user_a' } : metadata); });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'PUT' ? new Promise(() => {}) : response(metadata));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 2);
});

test('Auth user role: canonical bounds and maximum trusted IDs agree with transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { branchId: '-b' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { userId: '' }, { userId: '../u' }, { userId: 'user/a' }, { userId: 'a'.repeat(65) }, { userId: 'a\n' }, { revision: '' }, { roles: ['admin'] }]) {
    assert.throws(() => createNeonAuthUserRoleOperations({ ...scope, ...change }, {}));
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), userId: size === 1 ? 'a' : 'a'.repeat(64) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, auth_user_id: config.userId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../u', 'user\n', 'user?x=y', 'a'.repeat(65)]) assert.throws(() => t.updateNeonAuthUserRole('project-a', 'br-a', bad, options));
  await assert.rejects(t.updateNeonAuthUserRole('project-a', 'br-a', 'user_a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
