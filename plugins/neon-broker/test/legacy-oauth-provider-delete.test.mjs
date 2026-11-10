import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonLegacyOAuthProviderDeleteOperations } from '../dist/plugins/neon-broker/src/oauth-provider-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { legacyOAuthProviderDeleteFixture as fixture, legacyOAuthProviderDeleteArgs as args, legacyOAuthProviderDeleteScope as scope,
  oauthProviderDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteNeonAuthOauthProvider';
const expected = { acknowledged: true };
const listed = { providers: [metadata] };

test('legacy OAuth provider delete: project-only preflight and bodyless DELETE never use a branch fallback', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/auth/oauth_providers`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/auth/oauth_providers/google`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['Content-Type'], undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/auth/legacy/oauth_providers/google/delete');
  assert.deepEqual(op.prepare(args).plan.diff.before, metadata);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
  assert.equal(f.operation('deleteBranchNeonAuthOauthProvider'), undefined);
});

test('legacy OAuth provider delete: copied strict project scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonLegacyOAuthProviderDeleteOperations(config, {});
  config.expectedType = 'shared';
  config.oauthProviderId = 'github';
  assert.equal(op.prepare(args).plan.expectedType, 'standard');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, oauth_provider_id: 'github' },
    ...['branch_id', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'type', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'oauth_provider_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/legacy', '') } },
    ...['oauth_provider_id', 'expectedType', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('legacy OAuth provider delete: unavailable sunset endpoint and full-list binding/type errors refuse before mutation', async () => {
  for (const raw of [null, {}, [], { providers: null }, { providers: [] },
    ...[{ id: 'github' }, { id: null }, { type: 'shared' }, { type: 'unknown' },
      { project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ providers: [{ ...metadata, ...change }] })),
    { providers: [metadata, metadata] }, { providers: [metadata, { id: 'unknown', type: 'standard' }] },
    { providers: Array.from({ length: 6 }, () => metadata) },
    ...[{ project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...listed, ...change }))]) {
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

test('legacy OAuth provider delete: ambiguity observes once without upgrading absence or replacement to enforcement', async () => {
  for (const after of [{ providers: [] }, listed, { providers: [{ ...metadata, type: 'shared' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('legacy OAuth provider delete: only empty200 acknowledges; wrong status/body/redirect/encoding/length remain uncertain', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', JSON.stringify(expected), canary].map(body => () => new Response(body, { status: 200 })),
    ...['1', 'invalid', '65537'].map(length => () => new Response(null, { status: 200, headers: { 'content-length': length } })),
    () => new Response(null, { status: 200, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response('', { status: 200, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run(name, args), expected);
});

test('legacy OAuth provider delete: ignored secret metadata never evaluates and receipt remains closed', async () => {
  const row = { ...metadata };
  for (const k of ['client_id', 'client_secret', 'microsoft_tenant_id', 'apple_team_id', 'apple_key_id', 'error', 'url']) {
    Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonLegacyOAuthProviderDeleteOperations(scope, {
    async listNeonAuthOauthProviders() { return { providers: [row] }; }, async deleteNeonAuthOauthProvider() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, id: 'google' },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('legacy OAuth provider delete: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 200 }) : response(listed);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('legacy OAuth provider delete: canonical path/provider bounds and all known type controls', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'br-a' },
    { oauthProviderId: 'Google' }, { oauthProviderId: 'google/other' }, { expectedType: 'other' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonLegacyOAuthProviderDeleteOperations({ ...scope, ...change }, {}));
  }
  for (const oauthProviderId of ['google', 'github', 'microsoft', 'vercel', 'apple']) for (const expectedType of ['standard', 'shared']) {
    const f = fixture(null, { ...scope, oauthProviderId, expectedType });
    assert.deepEqual(await f.run(name, { ...args, oauth_provider_id: oauthProviderId }), expected);
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { ...args, project_id: config.projectId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['unknown', 'Google', '../google', 'google\n', 'google?x=y']) assert.throws(() => t.deleteNeonAuthOauthProvider('project-a', bad, options));
  await assert.rejects(t.deleteNeonAuthOauthProvider('project-a', 'google', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
