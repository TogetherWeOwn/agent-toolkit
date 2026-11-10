import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthLocalhostDisableOperations } from '../dist/plugins/neon-broker/src/auth-localhost-disable.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authLocalhostDisableFixture as fixture, authLocalhostDisableArgs as args,
  authLocalhostDisableScope as scope, canary, response } from './helpers.mjs';

const name = 'updateNeonAuthAllowLocalhost';
const expected = { accepted: true };

test('Localhost disable: true preflight then one fixed false PATCH and acknowledgement only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/allow_localhost`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PATCH']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PATCH' ? '{"allow_localhost":false}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'PATCH' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/auth/allow_localhost/disable');
  assert.deepEqual(op.prepare(args).plan.diff, { before: { allow_localhost: true }, after: { allow_localhost: false } });
  assert.equal(op.prepare(args).plan.allow_localhost, false);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Localhost disable: strict copied scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthLocalhostDisableOperations(config, {});
  config.branchId = 'other';
  assert.equal(op.prepare(args).plan.branch_id, 'br-a');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' },
    ...['allow_localhost', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    { ...args, allow_localhost: false }, Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/disable', '') } },
    ...['branch_id', 'preflight', 'allow_localhost', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Localhost disable: missing, false, malformed or foreign preflight never mutates', async () => {
  for (const raw of [null, {}, [], { allow_localhost: false }, { allow_localhost: null }, { allow_localhost: 1 }, { allow_localhost: 'true' },
    ...[{ branch_id: 'other' }, { branch_id: null }, { project_id: 'other' }, { pagination: {} }].map(change => ({ allow_localhost: true, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response({ project_id: 'project-a', branch_id: 'br-a', allow_localhost: init.method !== 'PATCH' }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Localhost disable: ambiguity observes once without promoting false or absence to completion', async () => {
  for (const after of [{ allow_localhost: true }, { allow_localhost: false }, { allow_localhost: false, branch_id: 'other' }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? { allow_localhost: true } : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => response(init.method === 'PATCH' ? {} : { allow_localhost: true }, { status: n > 1 ? 404 : 200 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Localhost disable: only valid200 false echo accepts; body, status, redirect and bounds refuse', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, { allow_localhost: true }, { allow_localhost: null }, { allow_localhost: 0 },
      { allow_localhost: false, branch_id: 'other' }, { allow_localhost: false, pagination: {} }].map(raw => () => response(raw)),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response({ allow_localhost: false }, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response({ allow_localhost: false }, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response({ allow_localhost: true }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Localhost disable: ignored metadata never evaluates and acknowledgement output is closed', async () => {
  const row = value => {
    const raw = { allow_localhost: value };
    for (const k of ['url', 'client_secret', 'error', 'created_at', 'auth_data']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonAuthLocalhostDisableOperations(scope, {
    async getNeonAuthAllowLocalhost() { return row(true); }, async updateNeonAuthAllowLocalhost() { return row(false); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { allow_localhost: true }, { allow_localhost: false, project_id: 'other' },
    Object.defineProperty({}, 'allow_localhost', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ allow_localhost: false, ignored: canary }), expected);
});

test('Localhost disable: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response({ allow_localhost: init.method !== 'PATCH' });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response({ allow_localhost: true }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Localhost disable: canonical target bounds match transport without enabling override', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { branchId: '-b' }, { revision: '' }, { allow_localhost: false }, { allow_localhost: true }]) assert.throws(() => createNeonAuthLocalhostDisableOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) {
    assert.throws(() => t.updateNeonAuthAllowLocalhost(bad, 'br-a', options));
    assert.throws(() => t.updateNeonAuthAllowLocalhost('project-a', bad, options));
  }
  await assert.rejects(t.updateNeonAuthAllowLocalhost('project-a', 'br-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
