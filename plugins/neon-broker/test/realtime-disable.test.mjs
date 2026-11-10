import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonRealtimeDisableOperations } from '../dist/plugins/neon-broker/src/realtime-disable.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { realtimeDisableFixture as fixture, realtimeDisableArgs as args, realtimeDisableScope as scope,
  canary, response } from './helpers.mjs';

const name = 'disableProjectBranchRealtime';
const expected = { accepted: true };
const metadata = { enabled: true, pending: false, revision: 7 };
const queued = () => new Response(null, { status: 202 });

test('Realtime disable: exact ready deployment preflight and one bodyless DELETE accept asynchronously only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/realtime`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/realtime`, 'DELETE']]);
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
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/realtime/disable');
  assert.deepEqual(op.prepare(args).plan.diff.before, metadata);
  assert.equal(op.prepare(args).plan.completion, 'asynchronous_acceptance_only');
  for (const k of ['enforcementVerified', 'secretDiscardVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Realtime disable: copied strict scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonRealtimeDisableOperations(config, {});
  config.expectedRevision = 8;
  config.branchId = 'other';
  assert.equal(op.prepare(args).plan.expectedRevision, 7);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/disable', '') } },
    ...['branch_id', 'expectedRevision', 'effect', 'secretDiscardVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Realtime disable: disabled, pending, revision drift, malformed state and foreign ancestry refuse before mutation', async () => {
  for (const raw of [null, {}, [], { enabled: true, pending: false },
    ...[{ enabled: false }, { enabled: 'true' }, { pending: true }, { pending: null },
      { revision: 8 }, { revision: 0 }, { revision: 2147483648 }, { revision: 1.5 },
      { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? queued() : response({ ...metadata, ...args }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Realtime disable: ambiguity observes once without upgrading disabled, absent or changed state to completion', async () => {
  for (const after of [metadata, { ...metadata, enabled: false }, { ...metadata, pending: true }, { ...metadata, revision: 8 }, null, {}]) {
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

test('Realtime disable: only empty202 accepts; wrong status, nonempty, redirected, encoded and malformed length refuse', async () => {
  for (const make of [...[200, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', canary].map(body => () => new Response(body, { status: 202 })),
    ...['invalid', '1', '65537'].map(length => () => new Response(null, { status: 202, headers: { 'content-length': length } })),
    () => new Response(null, { status: 202, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 202, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 202 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  for (const make of [queued, () => new Response('', { status: 202 }),
    () => new Response(null, { status: 202, headers: { 'content-length': '0' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Realtime disable: unused fields never evaluate and normalized acceptance remains closed', async () => {
  const row = { ...metadata };
  for (const k of ['invocation_url', 'allowed_origins', 'secret', 'error']) {
    Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonRealtimeDisableOperations(scope, {
    async getProjectBranchRealtime() { return row; }, async disableProjectBranchRealtime() { return { acknowledged: true }; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { acknowledged: false }, { acknowledged: true, secret: canary },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Realtime disable: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? queued() : response(metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 202 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Realtime disable: canonical path/revision bounds and maximum valid target match transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { branchId: '-b' }, { expectedRevision: 0 }, { expectedRevision: -0 }, { expectedRevision: 2147483648 },
    { expectedRevision: 1.5 }, { expectedRevision: '7' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonRealtimeDisableOperations({ ...scope, ...change }, {}));
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), expectedRevision: 2147483647 };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) assert.throws(() => t.disableProjectBranchRealtime(bad, 'br-a', options));
  await assert.rejects(t.disableProjectBranchRealtime('project-a', 'br-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
