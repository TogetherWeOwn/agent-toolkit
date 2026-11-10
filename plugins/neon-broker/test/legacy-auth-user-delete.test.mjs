import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonLegacyAuthUserDeleteOperations, createNeonAuthUserDeleteOperations } from '../dist/plugins/neon-broker/src/auth-user-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { legacyAuthUserDeleteFixture as fixture, legacyAuthUserDeleteScope as scope, legacyAuthUserDeleteArgs as args,
  legacyAuthUserDeleteMetadata as metadata, authUserDeleteScope, canary, response } from './helpers.mjs';

const name = 'deleteNeonAuthUser';
const expected = { acknowledged: true };
const reply = () => new Response(null, { status: 204 });

test('Legacy auth user delete: exact project preflight then one bodyless project-user DELETE acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/auth/users/user_a`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.body, undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/auth/users/user_a/delete');
  assert.equal(op.prepare(args).plan.operation, name);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.preflight, 'exact_project_identity_trusted_user_binding_only');
  assert.equal(op.prepare(args).plan.reconciliation, 'user_read_unavailable_remain_uncertain_no_retry');
  for (const k of ['userPresenceVerified', 'deletionVerified', 'issuedTokensRevoked', 'sessionsRevoked', 'connectionFence', 'atomicCompareAndSwap']) {
    assert.equal(op.prepare(args).plan[k], false);
  }
});

test('Legacy auth user delete: strict copied target and tampered plan refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonLegacyAuthUserDeleteOperations(config, {});
  config.userId = 'other';
  assert.equal(op.prepare(args).arguments.auth_user_id, scope.userId);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, auth_user_id: 'other' },
    ...['branch_id', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'provider', 'email', 'body'].map(k => ({ ...args, [k]: {} })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'auth_user_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/delete', '/reveal') } },
    ...['operation', 'auth_user_id', 'effect', 'userPresenceVerified', 'diff', 'reconciliation'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Legacy auth user delete: malformed or foreign project preflight never deletes a user', async () => {
  for (const raw of [null, {}, [], { project: {} }, { project: { id: 'other' } },
    ...[{ project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...metadata, ...change })),
    ...[{ project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ project: { ...metadata.project, ...change } }))]) {
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

test('Legacy auth user delete: ambiguity stays uncertain with no invented user read, retry or branch fallback', async () => {
  const f = fixture((url, init) => { if (init.method === 'DELETE') throw Error(canary); return response(metadata); });
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
});

test('Legacy auth user delete: only terminal empty204 acknowledges; statuses, bodies and redirects stay uncertain', async () => {
  for (const make of [...[200, 201, 202, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: null, headers: new Headers({ 'content-length': '1' }) })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 2);
  }
});

test('Legacy auth user delete: unused metadata never evaluates and acknowledgement projection stays closed', async () => {
  const project = { ...metadata.project };
  for (const k of ['name', 'roles', 'users', 'password', 'connection_uri', 'error']) {
    Object.defineProperty(project, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonLegacyAuthUserDeleteOperations(scope, {
    async getProject() { return { project }; }, async deleteNeonAuthUser() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, { acknowledged: false }, { ...expected, user_id: 'user_a' },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Legacy auth user delete: cancellation and ignored-fetch deadlines bound the only mutation attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return init.method === 'DELETE' ? reply() : response(metadata); });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(metadata));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 2);
});

test('Legacy auth user delete: canonical bounds and maximum trusted IDs agree with transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'br-a' },
    { userId: '' }, { userId: '../u' }, { userId: 'user/a' }, { userId: 'a'.repeat(65) }, { userId: 'a\n' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonLegacyAuthUserDeleteOperations({ ...scope, ...change }, {}));
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), userId: size === 1 ? 'a' : 'a'.repeat(64) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, auth_user_id: config.userId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../u', 'user\n', 'user?x=y', 'a'.repeat(65)]) assert.throws(() => t.deleteNeonAuthUser('project-a', bad, options));
  await assert.rejects(t.deleteNeonAuthUser('project-a', 'user_a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});

test('Legacy auth user delete: factories cannot exchange branch arguments, scope or prepared requests', async () => {
  assert.throws(() => createNeonLegacyAuthUserDeleteOperations(authUserDeleteScope, {}));
  assert.throws(() => createNeonAuthUserDeleteOperations(scope, {}));
  const [legacy] = createNeonLegacyAuthUserDeleteOperations(scope, {});
  const [branch] = createNeonAuthUserDeleteOperations(authUserDeleteScope, {});
  const branchArgs = { ...args, branch_id: 'br-a' };
  assert.throws(() => legacy.prepare(branchArgs));
  assert.throws(() => branch.prepare(args));
  await assert.rejects(branch.execute(legacy.prepare(args), canary, new AbortController().signal));
  await assert.rejects(legacy.execute(branch.prepare(branchArgs), canary, new AbortController().signal));
});
