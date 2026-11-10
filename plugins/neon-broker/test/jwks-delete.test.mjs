import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonJWKSDeleteOperations } from '../dist/plugins/neon-broker/src/jwks-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { jwksDeleteFixture as fixture, jwksDeleteArgs as args, jwksDeleteScope as scope,
  jwksDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { ...metadata, acknowledged: true };
const listed = { jwks: [metadata] };

test('JWKS delete: bounded list preflight precedes one bodyless DELETE; exact echo acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run('deleteProjectJWKS', args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/jwks`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/jwks/jwks-a`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectJWKS');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/jwks/jwks-a/delete');
  assert.equal(op.prepare(args).plan.branch_id, scope.branchId);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  for (const name of ['getProjectJWKS', 'addProjectJWKS', 'deleteProject', 'revokeCredential']) assert.equal(f.operation(name), undefined);
});

test('JWKS delete: copied scope and exact plan reject identity, path and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonJWKSDeleteOperations(config, {});
  config.jwksId = 'other';
  config.branchId = 'other';
  assert.equal(op.prepare(args).plan.jwks_id, scope.jwksId);
  assert.equal(op.prepare(args).plan.branch_id, scope.branchId);
  for (const raw of [null, [], {}, ...['project_id', 'jwks_id'].map(key => ({ ...args, [key]: 'other' })),
    ...['branch_id', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'jwks_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectJWKS').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, jwks_id: 'other' } }, { plan: { ...p.plan, branch_id: null } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectJWKS').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectJWKS').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { branchId: 'x'.repeat(61) },
    ...['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81)].map(jwksId => ({ jwksId })), { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonJWKSDeleteOperations({ ...scope, ...change }, {}));
  }
});

test('JWKS delete: absent, duplicate, malformed, foreign, reassociated and paginated preflight refuses before DELETE', async () => {
  for (const raw of [null, {}, [], { jwks: [] }, { jwks: [metadata, metadata] },
    ...[{ id: 'other' }, { id: 123 }, { project_id: 'other' }, { branch_id: 'other' }, { branch_id: null }, { pagination: {} }].map(change => ({ jwks: [{ ...metadata, ...change }] })),
    { ...listed, pagination: {} }, { ...listed, project_id: 'other' }, { ...listed, branch_id: 'br-a' },
    { jwks: [metadata, { id: 'unselected', project_id: 'other' }] },
    { jwks: [metadata, { id: 'unselected', project_id: 'project-a', branch_id: 'bad\n' }] },
    { jwks: Array.from({ length: 31 }, (_, n) => ({ ...metadata, id: n === 0 ? metadata.id : `jwks-${n}` })) }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectJWKS', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectJWKS', args));
    assert.equal(f.requests.length, 1);
  }
});

test('JWKS delete: project-wide absent branch and bounded unselected JWKS identities are distinct', async () => {
  const config = { ...scope, branchId: null };
  const f = fixture(null, config);
  assert.deepEqual(await f.run('deleteProjectJWKS', args), { id: scope.jwksId, project_id: scope.projectId, acknowledged: true });
  const g = fixture(() => response(listed), config);
  await assert.rejects(g.run('deleteProjectJWKS', args));
  assert.equal(g.requests.length, 1);
  const h = fixture((url, init) => response(init.method === 'DELETE' ? metadata : { jwks: [metadata,
    ...Array.from({ length: 29 }, (_, n) => ({ id: `unselected-${n}`, project_id: scope.projectId, branch_id: 'br-b' }))] }));
  assert.deepEqual(await h.run('deleteProjectJWKS', args), expected);
});

test('JWKS delete: ambiguity observes once without retry or upgrading absence to success', async () => {
  for (const followup of [{ jwks: [] }, listed, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteProjectJWKS', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('JWKS delete: wrong receipt identity, HTTP204, redirects and malformed/oversize bodies stay uncertain', async () => {
  for (const make of [...[202, 302, 403, 404, 409, 422, 500].map(status => () => response(metadata, { status })),
    ...[null, {}, { ...metadata, id: 'other' }, { ...metadata, project_id: 'other' }, { ...metadata, branch_id: 'other' },
      { ...metadata, branch_id: undefined }, { ...metadata, pagination: {} }].map(raw => () => response(raw)),
    () => new Response(null, { status: 204 }), () => new Response('invalid', { headers: { 'content-type': 'application/json' } }),
    () => response(metadata, { headers: { 'content-type': 'text/plain' } }),
    () => response(metadata, { headers: { 'content-length': String(RESPONSE_BYTES + 1) } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteProjectJWKS', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('JWKS delete: URLs, provider names, audiences, roles, timestamps and secrets are never evaluated or emitted', async () => {
  const value = { ...metadata };
  for (const name of ['jwks_url', 'provider_name', 'jwt_audience', 'role_names', 'created_at', 'updated_at', 'token']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [direct] = createNeonJWKSDeleteOperations(scope, {
    async getProjectJWKS() { return { jwks: [value] }; }, async deleteProjectJWKS() { return value; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { ...metadata, project_id: 'other' },
    Object.defineProperty({}, 'id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  const f = fixture((url, init) => response(init.method === 'DELETE' ? { ...metadata, jwks_url: canary, role_names: [canary], token: canary } : listed));
  assert.deepEqual(await f.run('deleteProjectJWKS', args), expected);
});

test('JWKS delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'DELETE' ? metadata : listed);
    });
    await assert.rejects(f.run('deleteProjectJWKS', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteProjectJWKS', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('JWKS delete: maximum/minimum copied IDs work; path/header injection refuses before fetch', async () => {
  for (const config of [{ ...scope, projectId: '-', branchId: '-', jwksId: 'a' },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), jwksId: 'j'.repeat(80), revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('deleteProjectJWKS', { project_id: config.projectId, jwks_id: config.jwksId }),
      { id: config.jwksId, project_id: config.projectId, branch_id: config.branchId, acknowledged: true });
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81)]) assert.throws(() => transport.deleteProjectJWKS('project-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) assert.throws(() => transport.deleteProjectJWKS(bad, scope.jwksId, options));
  await assert.rejects(transport.deleteProjectJWKS('project-a', scope.jwksId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectJWKS('project-a', scope.jwksId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
