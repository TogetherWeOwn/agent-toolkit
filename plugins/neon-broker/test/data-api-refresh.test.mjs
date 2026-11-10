import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDataAPIRefreshOperations } from '../dist/plugins/neon-broker/src/data-api-refresh.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { dataAPIRefreshFixture as fixture, dataAPIRefreshArgs as args, dataAPIRefreshScope as scope,
  canary, response } from './helpers.mjs';

const name = 'updateProjectBranchDataAPI';
const expected = { acknowledged: true };
const metadata = { status: 'ready' };
const reply = (body = {}) => response(body, { status: 201 });

test('Data API refresh: exact database preflight then one empty-object PATCH acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/data-api/main`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/data-api/main`, 'PATCH']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PATCH' ? '{}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'PATCH' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/data-api/main/refresh');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['cacheFreshnessVerified', 'configurationPreservationVerified', 'persistenceVerified', 'nonWakingVerified', 'atomicCompareAndSwap']) {
    assert.equal(op.prepare(args).plan[k], false);
  }
});

test('Data API refresh: copied strict scope and tampered plan refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonDataAPIRefreshOperations(config, {});
  config.expectedStatus = 'other';
  config.databaseName = 'other';
  assert.equal(op.prepare(args).plan.expectedStatus, 'ready');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' }, { ...args, database_name: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'status', 'settings', 'schemas', 'auth', 'body'].map(k => ({ ...args, [k]: {} })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'database_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/refresh', '/delete') } },
    ...['database_name', 'expectedStatus', 'effect', 'cacheFreshnessVerified', 'diff'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Data API refresh: unavailable or malformed status and ancestry refuse before mutation', async () => {
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
  const f = fixture((url, init) => init.method === 'PATCH' ? reply() : response({ ...metadata, ...args }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Data API refresh: ambiguity observes once and never infers cache freshness from status', async () => {
  for (const after of [metadata, { status: 'other' }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Data API refresh: only empty JSON201 acknowledges; wrong status/body/redirect/length refuse', async () => {
  for (const make of [...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...[null, [], true, { ...expected }, { error: canary }].map(body => () => reply(body)),
    ...['', ' ', canary].map(body => () => new Response(body, { status: 201, headers: { 'content-type': 'application/json' } })),
    ...['invalid', '65537'].map(length => () => response({}, { status: 201, headers: { 'content-length': length } })),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Data API refresh: unused configuration never evaluates and acknowledgement remains closed', async () => {
  const row = { ...metadata };
  for (const k of ['url', 'settings', 'available_schemas', 'observed_at', 'auth_provider', 'jwks_url', 'provider_name', 'jwt_audience', 'error']) {
    Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonDataAPIRefreshOperations(scope, {
    async getProjectBranchDataAPI() { return row; }, async updateProjectBranchDataAPI() { return {}; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], expected, { id: 'main' },
    Object.defineProperty({}, 'error', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Data API refresh: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'PATCH' ? reply() : response(metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }),
    { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Data API refresh: canonical bounds and maximum names agree with transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { branchId: '-b' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { databaseName: '../db' }, { databaseName: 'a'.repeat(64) }, { databaseName: 'a.b' }, { databaseName: '1db' },
    { expectedStatus: 'Ready' }, { expectedStatus: 'ready\n' }, { expectedStatus: '' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonDataAPIRefreshOperations({ ...scope, ...change }, {}));
  }
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), databaseName: '_'.repeat(size === 1 ? 1 : 63) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, database_name: config.databaseName }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../db', 'main\n', 'main?x=y', 'a'.repeat(64)]) assert.throws(() => t.updateProjectBranchDataAPI('project-a', 'br-a', bad, options));
  await assert.rejects(t.updateProjectBranchDataAPI('project-a', 'br-a', 'main', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
