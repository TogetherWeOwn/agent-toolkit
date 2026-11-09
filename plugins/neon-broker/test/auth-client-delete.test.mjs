import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthClientDeleteOperations } from '../dist/plugins/neon-broker/src/auth-client-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { authClientDeleteFixture as fixture, authClientDeleteArgs as args, authClientDeleteScope as scope,
  authClientDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = metadata;

test('OAuth client delete: exact client-detail preflight precedes one bodyless DELETE and documented HTTP204 acknowledges only', async () => {
  const f = fixture();
  const result = await f.run('deleteNeonAuthOAuthClient', args);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/oauth-provider/clients/clientA`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/oauth-provider/clients/clientA`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteNeonAuthOAuthClient');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients/clientA/delete');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.equal(op.prepare(args).plan.issuedTokensRevoked, false);
  for (const name of ['getNeonAuthOAuthClient', 'createNeonAuthOAuthClient', 'rotateNeonAuthOAuthClientSecret', 'updateNeonAuthOAuthClient']) assert.equal(f.operation(name), undefined);
});

test('OAuth client delete: copied scope and exact plan reject identity, path and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthClientDeleteOperations(config, {});
  config.clientId = 'other';
  config.branchId = 'other';
  assert.equal(op.prepare(args).plan.client_id, scope.clientId);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'client_id'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'issuedTokensRevoked'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'client_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteNeonAuthOAuthClient').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, client_id: 'other' } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteNeonAuthOAuthClient').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteNeonAuthOAuthClient').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { branchId: 'x'.repeat(61) },
    ...['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(65)].map(clientId => ({ clientId })), { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonAuthClientDeleteOperations({ ...scope, ...change }, {}));
  }
});

test('OAuth client delete: malformed, absent, foreign and paginated detail refuses before DELETE', async () => {
  for (const raw of [null, {}, [], { client_id: 'other' }, { client_id: 123 },
    { ...metadata, pagination: {} }, { ...metadata, project_id: 'other' }, { ...metadata, branch_id: 'other' }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteNeonAuthOAuthClient', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteNeonAuthOAuthClient', args));
    assert.equal(f.requests.length, 1);
  }
});

test('OAuth client delete: ambiguity observes once without retry or upgrading absence/disabled metadata to success', async () => {
  for (const followup of [{}, listed, { ...metadata, disabled: true }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteNeonAuthOAuthClient', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('OAuth client delete: only empty HTTP204 acknowledges; JSON echoes, HTTP404, redirects and malformed lengths stay uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    () => new Response(null, { status: 204, headers: { 'content-length': '1' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': 'invalid' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteNeonAuthOAuthClient', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run('deleteNeonAuthOAuthClient', args), expected);
});

test('OAuth client delete: preflight ignores flags, redirects, names, timestamps and secrets without evaluating them', async () => {
  const value = { ...metadata };
  for (const name of ['type', 'name', 'redirect_uris', 'resources', 'skip_consent', 'disabled', 'created_at', 'client_secret']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [direct] = createNeonAuthClientDeleteOperations(scope, {
    async getNeonAuthOAuthClient() { return value; }, async deleteNeonAuthOAuthClient() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, client_id: scope.clientId },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ ...metadata, name: canary, redirect_uris: [canary], client_secret: canary }));
  assert.deepEqual(await f.run('deleteNeonAuthOAuthClient', args), expected);
});

test('OAuth client delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('deleteNeonAuthOAuthClient', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteNeonAuthOAuthClient', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('OAuth client delete: maximum/minimum copied IDs work; path/header injection refuses before fetch', async () => {
  for (const config of [{ ...scope, projectId: '-', branchId: '-', clientId: 'a' },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), clientId: 'c'.repeat(64), revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('deleteNeonAuthOAuthClient', { project_id: config.projectId, branch_id: config.branchId, client_id: config.clientId }), expected);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(65)]) assert.throws(() => transport.deleteNeonAuthOAuthClient('project-a', 'br-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) {
    assert.throws(() => transport.deleteNeonAuthOAuthClient(bad, 'br-a', scope.clientId, options));
    assert.throws(() => transport.deleteNeonAuthOAuthClient('project-a', bad, scope.clientId, options));
  }
  await assert.rejects(transport.deleteNeonAuthOAuthClient('project-a', 'br-a', scope.clientId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteNeonAuthOAuthClient('project-a', 'br-a', scope.clientId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
