import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonUserKeyRevokeOperations } from '../dist/plugins/neon-broker/src/user-key-revoke.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { userKeyRevokeFixture as fixture, userKeyRevokeArgs as args, userKeyRevokeScope as scope,
  userKeyRevokeReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { id: 123, acknowledged: true };
const identity = { id: 'user-a' };
function preflight(url) { return new URL(url).pathname.endsWith('/users/me') ? identity : [{ id: 123 }]; }

test('user key revoke: same-credential exact-user proof and key-list preflight precede one bodyless DELETE', async () => {
  const f = fixture({ ...receipt, key: canary, name: canary, created_by: canary, last_used_from_addr: canary });
  assert.deepEqual(await f.run('revokeApiKey', args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/users/me`, 'GET'], [`${NEON_ORIGIN}/api/v2/api_keys`, 'GET'], [`${NEON_ORIGIN}/api/v2/api_keys/123`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('revokeApiKey');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/users/user-a/api_keys/123/revoke');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  for (const name of ['listApiKeys', 'revokeOrgApiKey', 'createApiKey', 'revealCredential']) assert.equal(f.operation(name), undefined);
});

test('user key revoke: copied scope and exact plan reject identity, numeric-ID and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonUserKeyRevokeOperations(config, {});
  config.keyId = 456;
  assert.equal(op.prepare(args).plan.key_id, 123);
  for (const raw of [null, [], {}, { ...args, user_id: 'other' }, { ...args, key_id: 456 },
    ...[-0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123', NaN, Infinity, null].map(key_id => ({ ...args, key_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'org_id', 'force', 'key', 'timeout'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'key_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('revokeApiKey').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, key_id: 456 } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('revokeApiKey').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('revokeApiKey').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ userId: '../user' }, { userId: 'u\n' }, { userId: 'x'.repeat(81) }, { keyId: -0 }, { keyId: -1 },
    { keyId: Number.MAX_SAFE_INTEGER + 1 }, { revision: '' }, { approved: true }]) assert.throws(() => createNeonUserKeyRevokeOperations({ ...scope, ...change }, {}));
});

test('user key revoke: userless/wrong-user credentials stop before account-wide list or mutation', async () => {
  for (const raw of [null, {}, { id: 'other' }, { id: 'user-a', org_id: 'org-a' }, { id: 'user-a', pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('revokeApiKey', args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture(() => response({}, { status: 403 }));
  await assert.rejects(f.run('revokeApiKey', args));
  assert.equal(f.requests.length, 1);
});

test('user key revoke: preflight refuses absent, duplicate, unsafe, oversized, foreign and paginated keys before DELETE', async () => {
  for (const raw of [null, {}, [], [{ id: 456 }], [{ id: 123 }, { id: 123 }], Array(31).fill({ id: 123 }),
    ...[{ id: undefined }, { id: Number.MAX_SAFE_INTEGER + 1 }, { id: '123' }, { org_id: 'org-a' }, { user_id: 'other' }, { pagination: {} }]
      .map(change => [{ id: 123, ...change }]), { keys: [{ id: 123 }], pagination: {} }]) {
    const f = fixture((url, init, n) => response(n === 1 ? identity : raw));
    await assert.rejects(f.run('revokeApiKey', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET']);
  }
  const f = fixture((url, init, n) => n === 1 ? response(identity) : new Response('[{"id":-0}]', { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(f.run('revokeApiKey', args));
  assert.equal(f.requests.length, 2);
});

test('user key revoke: ambiguous DELETE observes once without retry or upgrading absence/revoked observation to success', async () => {
  for (const followup of [[], [{ id: 123 }], [{ id: 123, revoked: true }], null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n < 4 ? preflight(url) : followup);
    });
    await assert.rejects(f.run('revokeApiKey', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'DELETE', 'GET']);
  }
});

test('user key revoke: only exact HTTP200 bounded JSON and explicit revoked=true acknowledge', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[202, 302, 403, 404, 409, 422, 500].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, {}, { id: 456, revoked: true }, { ...receipt, revoked: false }, { ...receipt, revoked: 'true' }, { id: 123 },
      { ...receipt, org_id: 'org-a' }, { ...receipt, user_id: 'other' }, { ...receipt, pagination: {} }].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(preflight(url)));
    await assert.rejects(f.run('revokeApiKey', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 4);
  }
});

test('user key revoke: projection is closed and never evaluates credential/profile/usage extras', () => {
  const op = fixture().operation('revokeApiKey');
  const raw = { ...receipt };
  for (const key of ['key', 'token', 'name', 'created_by', 'created_at', 'last_used_at', 'last_used_from_addr']) {
    Object.defineProperty(raw, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  assert.deepEqual(op.project({ user: identity, revocation: raw }), expected);
  for (const value of [{ user: { id: 'other' }, revocation: receipt }, { user: identity, revocation: { id: -0, revoked: true } },
    { user: identity, revocation: Object.defineProperty({ ...receipt }, 'revoked', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(value));
});

test('user key revoke: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2, 3]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'DELETE' ? receipt : preflight(url)); });
    await assert.rejects(f.run('revokeApiKey', args, controller.signal), stopAt === 3 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(preflight(url)));
  await assert.rejects(f.run('revokeApiKey', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 4);
});

test('user key revoke: numeric ID boundaries work; path/header injection refuses before fetch', async () => {
  for (const keyId of [0, Number.MAX_SAFE_INTEGER]) {
    const f = fixture({ id: keyId, revoked: true }, { ...scope, keyId });
    assert.deepEqual(await f.run('revokeApiKey', { ...args, key_id: keyId }), { id: keyId, acknowledged: true });
    assert.equal(f.requests[2].url, `${NEON_ORIGIN}/api/v2/api_keys/${keyId}`);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of [-0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '123', '../key', '1?query', '1\n']) assert.throws(() => transport.revokeApiKey(bad, options));
  await assert.rejects(transport.revokeApiKey(123, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.revokeApiKey(123, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
