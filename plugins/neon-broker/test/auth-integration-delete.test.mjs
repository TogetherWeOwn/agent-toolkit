import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthIntegrationDeleteOperations } from '../dist/plugins/neon-broker/src/auth-integration-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authIntegrationDeleteFixture as fixture, authIntegrationDeleteArgs as args, authIntegrationDeleteScope as scope,
  authIntegrationDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteNeonAuthIntegration';
const expected = { accepted: true };
const acknowledged = () => new Response(null, { status: 200 });
const row = metadata.data[0];

test('Legacy integration delete: unique provider preflight then one DELETE explicitly forbids data erasure', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/auth/integrations`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/auth/integration/better_auth`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'DELETE' ? '{"delete_data":false}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'DELETE' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/auth/integration/better_auth/delete');
  assert.deepEqual(op.prepare(args).plan.diff.before, { branch_id: 'br-a', owned_by: 'neon' });
  assert.equal(op.prepare(args).plan.delete_data, false);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'dataPreservationVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Legacy integration delete: strict copied scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthIntegrationDeleteOperations(config, {});
  config.authProvider = 'stack';
  config.expectedBranchId = 'other';
  assert.equal(op.prepare(args).plan.expectedBranchId, 'br-a');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, auth_provider: 'stack' },
    ...['branch_id', 'delete_data', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'auth_provider', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/delete', '') } },
    ...['auth_provider', 'expectedBranchId', 'expectedOwnedBy', 'delete_data', 'effect', 'dataPreservationVerified'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Legacy integration delete: missing, foreign, drifted or transferring integration refuses before mutation', async () => {
  for (const raw of [null, {}, [], { data: [] }, { data: [null] },
    ...[{ branch_id: 'other' }, { branch_id: null }, { auth_provider: 'stack' }, { auth_provider: 'unknown' },
      { owned_by: 'user' }, { owned_by: null }, { transfer_status: 'initiated' }, { transfer_status: null },
      { transfer_status: 'unknown' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ data: [{ ...row, ...change }] })),
    ...[{ project_id: 'other' }, { pagination: {} }, { branch_id: 'br-a' }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const auth of ['mock', 'stack', 'better_auth']) for (const owner of ['user', 'neon']) {
    const config = { ...scope, authProvider: auth, expectedOwnedBy: owner };
    const f = fixture((url, init) => init.method === 'DELETE' ? acknowledged() :
      response({ data: [{ ...row, auth_provider: auth, owned_by: owner, project_id: 'project-a', transfer_status: 'finished' }] }), config);
    assert.deepEqual(await f.run(name, { ...args, auth_provider: auth }), expected);
  }
});

test('Legacy integration delete: complete bounded list validates before selecting a unique provider', async () => {
  for (const data of [[row, row], [row, { ...row, branch_id: 'br-b' }],
    [row, { ...row, auth_provider: 'stack', project_id: 'other' }],
    [row, { ...row, auth_provider: 'unknown' }],
    [row, ...Array.from({ length: 30 }, (_, i) => ({ ...row, auth_provider: 'stack', branch_id: `br-${i}` }))]]) {
    const f = fixture(() => response({ data }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const size of [2, 30]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? acknowledged() : response({ data: [row,
      ...Array.from({ length: size - 1 }, (_, i) => ({ ...row, auth_provider: 'stack', branch_id: `br-${i}` }))] }));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Legacy integration delete: ambiguity observes once without upgrading absence or replacement to completion', async () => {
  for (const after of [metadata, { data: [{ ...row, branch_id: 'other' }] }, { data: [{ ...row, transfer_status: 'initiated' }] }, { data: [] }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => init.method === 'DELETE' ? response({}, { status: 500 }) : response(metadata, { status: n > 2 ? 404 : 200 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Legacy integration delete: only empty200 accepts; wrong status, body, redirect, encoding and length refuse', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', canary].map(body => () => new Response(body, { status: 200 })),
    ...['invalid', '1', '65537'].map(length => () => new Response(null, { status: 200, headers: { 'content-length': length } })),
    () => new Response(null, { status: 200, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  for (const make of [acknowledged, () => new Response('', { status: 200 }),
    () => new Response(null, { status: 200, headers: { 'content-length': '0' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Legacy integration delete: sensitive unused fields never evaluate and acceptance remains closed', async () => {
  const value = { ...row };
  for (const k of ['db_name', 'auth_provider_project_id', 'jwks_url', 'base_url', 'created_at', 'name', 'secret', 'error']) {
    Object.defineProperty(value, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonAuthIntegrationDeleteOperations(scope, {
    async listNeonAuthIntegrations() { return { data: [value] }; }, async deleteNeonAuthIntegration() { return { acknowledged: true }; },
  });
  const result = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(result, expected);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  for (const raw of [null, [], {}, expected, { acknowledged: false }, { acknowledged: true, secret: canary },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Legacy integration delete: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? acknowledged() : response(metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Legacy integration delete: canonical target and provider/ownership bounds match transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { expectedBranchId: 'b'.repeat(61) },
    { expectedBranchId: '-b' }, { authProvider: 'unknown' }, { expectedOwnedBy: 'unknown' }, { authProvider: null },
    { revision: '' }, { delete_data: true }]) assert.throws(() => createNeonAuthIntegrationDeleteOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), expectedBranchId: 'b'.repeat(size) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { ...args, project_id: config.projectId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) assert.throws(() => t.deleteNeonAuthIntegration(bad, 'better_auth', options));
  for (const bad of ['../p', 'better_auth\n', 'other', '']) assert.throws(() => t.deleteNeonAuthIntegration('project-a', bad, options));
  await assert.rejects(t.deleteNeonAuthIntegration('project-a', 'better_auth', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
