import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDataAPIDeleteOperations } from '../dist/plugins/neon-broker/src/data-api-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { dataAPIDeleteFixture as fixture, dataAPIDeleteArgs as args, dataAPIDeleteScope as scope,
  canary, response } from './helpers.mjs';

const name = 'deleteProjectBranchDataAPI';
const expected = { acknowledged: true };
const metadata = { status: 'ready' };

test('Data API delete: exact database preflight and one bodyless DELETE acknowledge only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/data-api/main`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/data-api/main`, 'DELETE']]);
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
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/data-api/main/delete');
  assert.deepEqual(op.prepare(args).plan.diff.before, metadata);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Data API delete: copied strict scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonDataAPIDeleteOperations(config, {});
  config.expectedStatus = 'other';
  config.databaseName = 'other';
  assert.equal(op.prepare(args).plan.expectedStatus, 'ready');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' }, { ...args, database_name: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'status', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'database_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/delete', '') } },
    ...['database_name', 'expectedStatus', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Data API delete: unavailable or malformed status and ancestry refuse before mutation', async () => {
  for (const raw of [null, {}, [], { status: null }, { status: 'other' }, { status: 'ready\n' }, { status: 'r'.repeat(65) },
    ...[{ project_id: 'other' }, { branch_id: 'other' }, { database_name: 'other' }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response(init.method === 'DELETE' ? {} : { ...metadata, ...args }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Data API delete: ambiguity observes once without upgrading absence or replacement to enforcement', async () => {
  for (const after of [metadata, { status: 'other' }, null, {}]) {
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

test('Data API delete: only empty JSON200 acknowledges; wrong status/body/redirect/length refuse', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...[null, [], true, { ...expected }, { error: canary }].map(body => () => response(body)),
    ...['', ' ', canary].map(body => () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })),
    ...['invalid', '65537'].map(length => () => response({}, { headers: { 'content-length': length } })),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 200, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Data API delete: unused configuration never evaluates and acknowledgement remains closed', async () => {
  const row = { ...metadata };
  for (const k of ['url', 'settings', 'available_schemas', 'observed_at', 'auth_provider', 'jwks_url', 'provider_name', 'jwt_audience', 'error']) {
    Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonDataAPIDeleteOperations(scope, {
    async getProjectBranchDataAPI() { return row; }, async deleteProjectBranchDataAPI() { return {}; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], expected, { id: 'main' },
    Object.defineProperty({}, 'error', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Data API delete: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'DELETE' ? {} : metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }),
    { status: 200, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Data API delete: canonical path/status bounds and maximum valid names match transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { databaseName: '../db' }, { databaseName: 'a'.repeat(64) }, { databaseName: 'a.b' }, { databaseName: '1db' },
    { expectedStatus: 'Ready' }, { expectedStatus: 'ready\n' }, { expectedStatus: '' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonDataAPIDeleteOperations({ ...scope, ...change }, {}));
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), databaseName: '_'.repeat(size === 1 ? 1 : 63) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, database_name: config.databaseName }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../db', 'main\n', 'main?x=y', 'a'.repeat(64)]) assert.throws(() => t.deleteProjectBranchDataAPI('project-a', 'br-a', bad, options));
  await assert.rejects(t.deleteProjectBranchDataAPI('project-a', 'br-a', 'main', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
