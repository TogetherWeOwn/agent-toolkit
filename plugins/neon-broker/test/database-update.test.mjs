import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDatabaseUpdateOperations } from '../dist/plugins/neon-broker/src/database-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { databaseUpdateFixture as fixture, databaseUpdateArgs as args, databaseUpdateScope as scope,
  databaseUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'updateProjectBranchDatabase';
const before = { database: { id: 123, branch_id: 'br-a', name: 'before' } };
const expected = { id: 123, branch_id: 'br-a', acknowledged: true,
  operations: receipt.operations.map(({ id, status }) => ({ id, status })) };

test('Database rename: numeric identity preflight then one name-only PATCH and closed operation acknowledgement', async () => {
  const f = fixture(receipt);
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/databases/before`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PATCH']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PATCH' ? '{"database":{"name":"after"}}' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'write');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/databases/before/rename');
  assert.deepEqual(p.plan.diff, { before: 'before', after: 'after' });
  assert.equal(p.plan.database_id, 123);
  assert.equal(p.plan.owner, 'unchanged');
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Database rename: copied scope, owner overrides and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonDatabaseUpdateOperations(config, {});
  config.name = 'different';
  assert.equal(op.prepare(args).plan.name, 'after');
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'database_name', 'name'].map(k => ({ ...args, [k]: 'other' })),
    ...['database_id', 'owner_name', 'database', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture(receipt);
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/rename', '/delete') } },
    ...['database_id', 'name', 'preflight', 'owner', 'diff'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Database rename: stale names, replacement IDs, missing/foreign identity and unavailable preflight never mutate', async () => {
  for (const raw of [null, {}, [], { database: {} }, ...[{ id: 456 }, { id: '123' }, { name: 'after' }, { name: 'other' },
    { branch_id: 'br-b' }, { project_id: 'other' }, { database_name: 'other' }, { database_id: 456 }, { pagination: {} }].map(change => ({ database: { ...before.database, ...change } })),
    ...[{ project_id: 'other' }, { branch_id: 'br-b' }, { database_name: 'other' }, { database_id: 456 }, { pagination: {} }].map(change => ({ ...before, ...change }))]) {
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

test('Database rename: ambiguity observes old name once and never promotes absence, replacement or desired state to success', async () => {
  for (const after of [before, receipt, { database: { ...before.database, id: 456 } }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? before : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => response(n === 1 ? before : {}, { status: n === 1 ? 200 : 404 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Database rename: only exact200 identity/name and bounded unique operation observations acknowledge', async () => {
  for (const raw of [null, {}, { database: receipt.database }, { ...receipt, database: { ...receipt.database, name: 'before' } },
    ...[{ id: 456 }, { branch_id: 'br-b' }, { project_id: 'other' }].map(change => ({ ...receipt, database: { ...receipt.database, ...change } })),
    { ...receipt, pagination: {} }, ...[null, {}, Array(31).fill(receipt.operations[0]), [receipt.operations[0], receipt.operations[0]],
      ...[{ id: 'bad' }, { status: 'unknown' }, { project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(change => [{ ...receipt.operations[0], ...change }])].map(operations => ({ ...receipt, operations }))]) {
    const f = fixture((url, init) => response(init.method === 'PATCH' ? raw : before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
  }
  for (const status of ['scheduling', 'running', 'finished', 'failed', 'error', 'cancelling', 'cancelled', 'skipped']) {
    const f = fixture({ ...receipt, operations: [{ ...receipt.operations[0], status }] });
    assert.equal((await f.run(name, args)).operations[0].status, status);
  }
  assert.deepEqual(await fixture().run(name, args), { ...expected, operations: [] });
});

test('Database rename: transport status, MIME, redirect and response bounds fail uncertain without mutation retry', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Database rename: owner/credential/diagnostic fields never evaluate; output excludes names and uses ordinary closed objects', async () => {
  const row = (value, operations = []) => {
    const database = { ...value.database };
    for (const k of ['owner_name', 'password', 'connection_uri', 'error', 'created_at']) Object.defineProperty(database, k, { get() { throw Error('unused'); }, enumerable: true });
    return { database, operations };
  };
  const [op] = createNeonDatabaseUpdateOperations(scope, {
    async getProjectBranchDatabase() { return row(before); }, async updateProjectBranchDatabase() { return row(receipt, receipt.operations); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, Object.defineProperty({}, 'database', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Database rename: abort and ignored fetch/body deadlines bound a single mutation attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'PATCH' ? receipt : before);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Database rename: canonical ID/name bounds align with transport and refuse owner/SQL/URL overrides', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b' }, { branchId: 'br-' },
    { branchId: 'b'.repeat(61) }, { databaseId: 0 }, { databaseId: 1.5 }, { databaseId: Number.MAX_SAFE_INTEGER + 1 },
    { databaseName: '../db' }, { databaseName: 'd'.repeat(64) }, { name: 'n'.repeat(64) }, { name: 'before' },
    { name: 'a;DROP' }, { name: 'https://example.invalid' }, { revision: '' }, { owner_name: 'role' }]) assert.throws(() => createNeonDatabaseUpdateOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: `br-${'b'.repeat(size === 1 ? 1 : 57)}`,
      databaseName: size === 1 ? '_' : 'd'.repeat(63), name: size === 1 ? 'N' : 'n'.repeat(63), databaseId: Number.MAX_SAFE_INTEGER };
    const value = await fixture(null, config).run(name, { project_id: config.projectId, branch_id: config.branchId, database_name: config.databaseName, name: config.name });
    assert.equal(value.id, config.databaseId);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../db', 'a;DROP', 'db\n', 'd'.repeat(64)]) {
    assert.throws(() => t.updateProjectBranchDatabase('project-a', 'br-a', bad, 'after', options));
    assert.throws(() => t.updateProjectBranchDatabase('project-a', 'br-a', 'before', bad, options));
  }
  await assert.rejects(t.updateProjectBranchDatabase('project-a', 'br-a', 'before', 'after', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
