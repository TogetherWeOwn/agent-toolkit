import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationKeyRevokeOperations } from '../dist/plugins/neon-broker/src/organization-key-revoke.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationKeyRevokeFixture as fixture, organizationKeyRevokeArgs as args, organizationKeyRevokeScope as scope,
  organizationKeyRevokeReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { id: 123, acknowledged: true };

test('organization key revoke: exact organization key-list preflight precedes one bodyless DELETE', async () => {
  const f = fixture({ ...receipt, project_id: 'project-a', key: canary, name: canary, created_by: canary });
  assert.deepEqual(await f.run('revokeOrgApiKey', args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/organizations/org-a/api_keys`, 'GET'], [`${NEON_ORIGIN}/api/v2/organizations/org-a/api_keys/123`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('revokeOrgApiKey');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/organizations/org-a/api_keys/123/revoke');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  for (const name of ['listOrgApiKeys', 'revokeApiKey', 'createOrgApiKey', 'revealCredential']) assert.equal(f.operation(name), undefined);
});

test('organization key revoke: copied scope and exact plan reject identity, numeric-ID and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonOrganizationKeyRevokeOperations(config, {});
  config.keyId = 456;
  config.organizationId = 'other';
  assert.equal(op.prepare(args).plan.key_id, 123);
  for (const raw of [null, [], {}, { ...args, org_id: 'other' }, { ...args, key_id: 456 },
    ...[-0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123', NaN, Infinity, null].map(key_id => ({ ...args, key_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'user_id', 'project_id', 'force', 'key', 'timeout'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'key_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('revokeOrgApiKey').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, key_id: 456 } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('revokeOrgApiKey').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('revokeOrgApiKey').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ organizationId: '../org' }, { organizationId: 'o\n' }, { organizationId: 'Upper' }, { organizationId: 'x'.repeat(61) }, { keyId: -0 },
    { keyId: Number.MAX_SAFE_INTEGER + 1 }, { revision: '' }, { approved: true }]) assert.throws(() => createNeonOrganizationKeyRevokeOperations({ ...scope, ...change }, {}));
});

test('organization key revoke: preflight refuses absent, duplicate, unsafe, oversized, foreign and paginated keys before DELETE', async () => {
  for (const raw of [null, {}, [], [{ id: 456 }], [{ id: 123 }, { id: 123 }], Array(31).fill({ id: 123 }),
    ...[{ id: undefined }, { id: Number.MAX_SAFE_INTEGER + 1 }, { id: '123' }, { org_id: 'other' }, { user_id: 'user-a' }, { branch_id: 'br-a' }, { pagination: {} }]
      .map(change => [{ id: 123, ...change }]), { keys: [{ id: 123 }], pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('revokeOrgApiKey', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const make of [() => new Response('[{"id":-0}]', { headers: { 'content-type': 'application/json' } }),
    () => response({}, { status: 403 }), () => response({}, { status: 404 })]) {
    const f = fixture(make);
    await assert.rejects(f.run('revokeOrgApiKey', args));
    assert.equal(f.requests.length, 1);
  }
});

test('organization key revoke: ambiguous DELETE observes once without retry or upgrading absence/revoked observation to success', async () => {
  for (const followup of [[], [{ id: 123 }], [{ id: 123, revoked: true }], null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? [{ id: 123 }] : followup);
    });
    await assert.rejects(f.run('revokeOrgApiKey', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('organization key revoke: only exact HTTP200 bounded JSON and explicit revoked=true acknowledge', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[202, 302, 403, 404, 409, 422, 500].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, {}, { id: 456, revoked: true }, { ...receipt, revoked: false }, { ...receipt, revoked: 'true' }, { id: 123 },
      { ...receipt, org_id: 'other' }, { ...receipt, user_id: 'user-a' }, { ...receipt, pagination: {} }].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response([{ id: 123 }]));
    await assert.rejects(f.run('revokeOrgApiKey', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('organization key revoke: projection and preflight never evaluate legitimate project-scope or credential/profile extras', async () => {
  const op = fixture().operation('revokeOrgApiKey');
  const raw = { ...receipt, org_id: 'org-a' };
  const key = { id: 123, org_id: 'org-a' };
  for (const value of [raw, key]) for (const name of ['project_id', 'key', 'token', 'name', 'created_by', 'created_at', 'last_used_at', 'last_used_from_addr']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  assert.deepEqual(op.project(raw), expected);
  const [direct] = createNeonOrganizationKeyRevokeOperations(scope, {
    async listOrgApiKeys() { return [key]; }, async revokeOrgApiKey() { return raw; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const value of [{ ...receipt, org_id: 'other' }, { id: -0, revoked: true },
    Object.defineProperty({ ...receipt }, 'revoked', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(value));
});

test('organization key revoke: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'DELETE' ? receipt : [{ id: 123 }]); });
    await assert.rejects(f.run('revokeOrgApiKey', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response([{ id: 123 }]));
  await assert.rejects(f.run('revokeOrgApiKey', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('organization key revoke: numeric and organization boundaries work; path/header injection refuses before fetch', async () => {
  for (const keyId of [0, Number.MAX_SAFE_INTEGER]) {
    const f = fixture({ id: keyId, revoked: true }, { ...scope, keyId });
    assert.deepEqual(await f.run('revokeOrgApiKey', { ...args, key_id: keyId }), { id: keyId, acknowledged: true });
    assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/organizations/org-a/api_keys/${keyId}`);
  }
  for (const organizationId of ['-', 'a'.repeat(60)]) {
    const f = fixture(receipt, { ...scope, organizationId });
    assert.deepEqual(await f.run('revokeOrgApiKey', { ...args, org_id: organizationId }), expected);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of [-0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '123', '../key', '1?query', '1\n']) assert.throws(() => transport.revokeOrgApiKey('org-a', bad, options));
  for (const bad of ['', '../org', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) assert.throws(() => transport.revokeOrgApiKey(bad, 123, options));
  await assert.rejects(transport.revokeOrgApiKey('org-a', 123, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.revokeOrgApiKey('org-a', 123, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
