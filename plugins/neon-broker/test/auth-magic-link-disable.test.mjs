import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthMagicLinkDisableOperations } from '../dist/plugins/neon-broker/src/auth-magic-link-disable.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authMagicLinkDisableFixture as fixture, authMagicLinkDisableScope as scope, authMagicLinkDisableArgs as args,
  authMagicLinkDisableMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'updateNeonAuthMagicLinkPlugin';
const expected = { acknowledged: true };

 test('Auth magic-link disable: better_auth preflight then one fixed false PATCH acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/plugins/magic-link`, 'PATCH']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  assert.equal(f.requests[0].init.body, undefined);
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { enabled: false });
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/auth/plugins/magic-link/disable');
  assert.equal(p.plan.enabled, false);
  assert.equal(p.plan.diff.before, 'magic_link_state_unverified');
  assert.equal(p.plan.reconciliation, 'status_read_unavailable_remain_uncertain_no_retry');
  for (const k of ['previousStateVerified', 'authenticationRefusalVerified', 'outstandingLinksInvalidated', 'configurationPreserved',
    'sessionsRevoked', 'connectionFence', 'atomicCompareAndSwap']) assert.equal(p.plan[k], false);
});

test('Auth magic-link disable: copied target and enabling, expiry, sign-up or authority overrides refuse', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthMagicLinkDisableOperations(config, {});
  config.branchId = 'other';
  assert.equal(op.prepare(args).arguments.branch_id, scope.branchId);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' },
    ...['enabled', 'expires_in', 'disable_sign_up', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'provider', 'body'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/disable', '/enable') } },
    ...['enabled', 'effect', 'configurationPreserved', 'diff', 'reconciliation'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Auth magic-link disable: malformed, foreign, non-better_auth or transferring preflight never mutates', async () => {
  for (const raw of [null, {}, [], { branch_id: 'br-a' },
    ...[{ branch_id: 'other' }, { project_id: 'other' }, { auth_provider: 'stack' }, { auth_provider: 'mock' },
      { auth_provider: null }, { pagination: {} }, { transfer_status: 'initiated' }, { transfer_status: 'unknown' }, { transfer_status: null }]
      .map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response(init.method === 'PATCH' ? { enabled: false, expires_in: 1440, disable_sign_up: true } : { ...metadata, transfer_status: 'finished' }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Auth magic-link disable: ambiguity has no invented status read, aggregate read, retry or fallback', async () => {
  const f = fixture((url, init) => { if (init.method === 'PATCH') throw Error(canary); return response(metadata); });
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH']);
});

test('Auth magic-link disable: only terminal JSON200 false echo acknowledges; other receipts stay uncertain', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, [], { enabled: true }, { enabled: 0 }, { enabled: 'false' }, { enabled: false, project_id: 'other' },
      { enabled: false, branch_id: 'other' }, { enabled: false, pagination: {} }].map(raw => () => response(raw)),
    () => response({ enabled: false }, { headers: { 'content-type': 'text/plain' } }),
    () => new Response('{"enabled":false', { headers: { 'content-type': 'application/json' } }),
    () => response({ enabled: false, ignored: 'a'.repeat(66000) }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 2);
  }
});

test('Auth magic-link disable: unused policy and auth metadata never evaluate and projection is closed', async () => {
  const auth = { ...metadata };
  const raw = { enabled: false };
  for (const k of ['owned_by', 'database_name', 'jwks_url', 'base_url', 'password', 'expires_in', 'disable_sign_up', 'error']) {
    for (const value of [auth, raw]) Object.defineProperty(value, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonAuthMagicLinkDisableOperations(scope, {
    async getNeonAuth() { return auth; }, async updateNeonAuthMagicLinkPlugin() { return raw; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, { enabled: true }, { acknowledged: true },
    Object.defineProperty({}, 'enabled', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Auth magic-link disable: cancellation and ignored-fetch deadlines bound the sole PATCH attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'PATCH' ? { enabled: false } : metadata); });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'PATCH' ? new Promise(() => {}) : response(metadata));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 2);
});

test('Auth magic-link disable: canonical bounds and maximum trusted IDs agree with transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { branchId: '-b' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { branchId: 'br-a\n' }, { revision: '' }, { enabled: true }]) assert.throws(() => createNeonAuthMagicLinkDisableOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'project?x=y', 'a'.repeat(61)]) assert.throws(() => t.updateNeonAuthMagicLinkPlugin(bad, 'br-a', options));
  await assert.rejects(t.updateNeonAuthMagicLinkPlugin('project-a', 'br-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
