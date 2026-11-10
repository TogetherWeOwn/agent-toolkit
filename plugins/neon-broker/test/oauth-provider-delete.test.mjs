import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOAuthProviderDeleteOperations } from '../dist/plugins/neon-broker/src/oauth-provider-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { oauthProviderDeleteFixture as fixture, oauthProviderDeleteArgs as args, oauthProviderDeleteScope as scope,
  oauthProviderDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteBranchNeonAuthOauthProvider';
const expected = { acknowledged: true };
const listed = { providers: [metadata] };

test('OAuth provider delete: exact presence/type precedes one bodyless DELETE and empty200 acknowledgement', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/oauth_providers`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/oauth_providers/google`, 'DELETE']]);
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
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/auth/oauth_providers/google/delete');
  assert.deepEqual(op.prepare(args).plan.diff.before, { id: 'google', type: 'standard' });
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
  assert.equal(f.operation('deleteNeonAuthOauthProvider'), undefined);
});

test('OAuth provider delete: copied scope and strict target/plan boundaries refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonOAuthProviderDeleteOperations(config, {});
  config.expectedType = 'shared';
  config.oauthProviderId = 'github';
  assert.equal(op.prepare(args).plan.expectedType, 'standard');
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'oauth_provider_id'].map(k => ({ ...args, [k]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'type', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'oauth_provider_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['oauth_provider_id', 'expectedType', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('OAuth provider delete: absent/type drift/duplicate/foreign/malformed/oversize/pagination lists refuse before DELETE', async () => {
  for (const raw of [null, {}, [], { providers: null }, { providers: [] },
    ...[{ id: 'github' }, { id: null }, { type: 'shared' }, { type: 'unknown' },
      { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ providers: [{ ...metadata, ...change }] })),
    { providers: [metadata, metadata] }, { providers: [metadata, { ...metadata, type: 'shared' }] },
    { providers: [metadata, { id: 'unknown', type: 'standard' }] },
    { providers: Array.from({ length: 6 }, () => metadata) },
    ...[{ project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ ...listed, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 200 }) :
    response({ providers: [metadata, { id: 'github', type: 'shared' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('OAuth provider delete: ambiguity observes once and never upgrades absence, presence or replacement to success', async () => {
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

test('OAuth provider delete: only terminal empty200 acknowledges; JSON/status/redirect/length/encoding/body errors stay uncertain', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
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
  for (const make of [() => new Response(null, { status: 200, headers: { 'content-length': '0' } }),
    () => new Response('', { status: 200 }),
    () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(0)); c.close(); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('OAuth provider delete: ignored provider secrets and metadata are never evaluated or projected', async () => {
  const row = { ...metadata };
  for (const k of ['client_id', 'client_secret', 'microsoft_tenant_id', 'apple_team_id', 'apple_key_id', 'error', 'url']) {
    Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonOAuthProviderDeleteOperations(scope, {
    async listBranchNeonAuthOauthProviders() { return { providers: [row] }; }, async deleteBranchNeonAuthOauthProvider() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, id: 'google' },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonOAuthProviderDeleteOperations(scope, {
    async listBranchNeonAuthOauthProviders() { return { providers: [Object.defineProperty({ ...metadata }, 'type', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async deleteBranchNeonAuthOauthProvider() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
});

test('OAuth provider delete: abort and ignored fetch/empty-response deadlines bound one attempt', async () => {
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

test('OAuth provider delete: canonical provider/path/scope bounds and all known ID/type controls', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'B' },
    { branchId: 'b'.repeat(61) }, { oauthProviderId: 'Google' }, { oauthProviderId: 'google/other' }, { expectedType: 'other' },
    { revision: '' }, { approved: true }]) assert.throws(() => createNeonOAuthProviderDeleteOperations({ ...scope, ...change }, {}));
  for (const oauthProviderId of ['google', 'github', 'microsoft', 'vercel', 'apple']) {
    for (const expectedType of ['standard', 'shared']) {
      const config = { ...scope, oauthProviderId, expectedType };
      const f = fixture(null, config);
      assert.deepEqual(await f.run(name, { ...args, oauth_provider_id: oauthProviderId }), expected);
    }
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { ...args, project_id: config.projectId, branch_id: config.branchId }), expected);
    assert(f.operation(name).prepare({ ...args, project_id: config.projectId, branch_id: config.branchId }).resource.id.length <= 256);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['unknown', 'Google', '../google', 'google\n', 'google?x=y']) assert.throws(() => t.deleteBranchNeonAuthOauthProvider('project-a', 'br-a', bad, options));
  await assert.rejects(t.deleteBranchNeonAuthOauthProvider('project-a', 'br-a', 'google', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
