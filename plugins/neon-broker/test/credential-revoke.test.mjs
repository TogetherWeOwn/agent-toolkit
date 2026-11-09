import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonCredentialRevokeOperations } from '../dist/plugins/neon-broker/src/credential-revoke.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { credentialRevokeFixture as fixture, credentialRevokeArgs as args, credentialRevokeScope as scope,
  credentialRevokeMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = { credentials: [metadata] };

test('credential revoke: exact anchor/user preflight precedes one bodyless DELETE and documented HTTP204 acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run('revokeCredential', args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/credentials`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/credentials/credential-id-fixture`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('revokeCredential');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/credentials/credential-id-fixture/revoke');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  for (const name of ['listCredentials', 'createCredential', 'rotateCredential', 'revealCredential']) assert.equal(f.operation(name), undefined);
});

test('credential revoke: copied scope and exact plan reject identity, path and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonCredentialRevokeOperations(config, {});
  config.tokenId = 'other';
  config.branchId = 'other';
  assert.equal(op.prepare(args).plan.token_id, scope.tokenId);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'token_id'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'principal_type'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'token_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('revokeCredential').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, token_id: 'other' } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('revokeCredential').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('revokeCredential').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { branchId: 'x'.repeat(61) },
    ...['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81)].map(tokenId => ({ tokenId })), { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonCredentialRevokeOperations({ ...scope, ...change }, {}));
  }
});

test('credential revoke: preflight refuses absent, duplicate, oversized, foreign, missing anchor and non-user credentials before DELETE', async () => {
  for (const raw of [null, {}, { credentials: [] }, { credentials: [{ ...metadata, token_id: 'other' }] },
    { credentials: [metadata, metadata] }, { credentials: Array(31).fill(metadata) }, { ...listed, pagination: {} },
    { ...listed, project_id: 'other' }, { ...listed, branch_id: 'other' },
    ...[{ token_id: undefined }, { token_id: 123 }, { project_id: 'other' }, { branch_id: 'other' }, { branch_id: undefined },
      { principal_type: undefined }, { principal_type: 'system' }, { principal_type: 'function' }, { principal_type: 'future' }, { pagination: {} }]
      .map(change => ({ credentials: [{ ...metadata, ...change }] }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('revokeCredential', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('revokeCredential', args));
    assert.equal(f.requests.length, 1);
  }
});

test('credential revoke: ambiguity observes once without retry or upgrading absence/revoked metadata to success', async () => {
  for (const followup of [{ credentials: [] }, listed, { credentials: [{ ...metadata, revoked_at: '2026-11-09T00:00:00Z' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('revokeCredential', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('credential revoke: only empty HTTP204 acknowledges; JSON echoes, HTTP404, redirects and malformed lengths stay uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    () => new Response(null, { status: 204, headers: { 'content-length': '1' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': 'invalid' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('revokeCredential', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run('revokeCredential', args), expected);
});

test('credential revoke: preflight ignores scopes including future values, labels, dates and secrets without evaluating them', async () => {
  const value = { ...metadata };
  for (const name of ['scopes', 'name', 'function_id', 'created_at', 'revoked_at', 'api_token', 's3_secret_access_key']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [direct] = createNeonCredentialRevokeOperations(scope, {
    async listCredentials() { return { credentials: [value] }; }, async revokeCredential() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, token_id: scope.tokenId },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ credentials: [{ ...metadata, scopes: ['future:scope'], api_token: canary, s3_secret_access_key: canary }] }));
  assert.deepEqual(await f.run('revokeCredential', args), expected);
});

test('credential revoke: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('revokeCredential', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('revokeCredential', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('credential revoke: maximum/minimum copied IDs work; path/header injection refuses before fetch', async () => {
  for (const config of [{ ...scope, projectId: '-', branchId: '-', tokenId: 'a' },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), tokenId: 'c'.repeat(80), revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('revokeCredential', { project_id: config.projectId, branch_id: config.branchId, token_id: config.tokenId }), expected);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81)]) assert.throws(() => transport.revokeCredential('project-a', 'br-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) {
    assert.throws(() => transport.revokeCredential(bad, 'br-a', scope.tokenId, options));
    assert.throws(() => transport.revokeCredential('project-a', bad, scope.tokenId, options));
  }
  await assert.rejects(transport.revokeCredential('project-a', 'br-a', scope.tokenId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.revokeCredential('project-a', 'br-a', scope.tokenId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
