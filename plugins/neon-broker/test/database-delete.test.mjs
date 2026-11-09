import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDatabaseDeleteOperations } from '../dist/plugins/neon-broker/src/database-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { databaseDeleteFixture as fixture, databaseDeleteArgs as args, databaseDeleteScope as scope,
  databaseDeleteReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { id: 123, branch_id: 'br-a', acknowledged: true,
  operations: receipt.operations.map(({ id, status }) => ({ id, status })) };

test('database deletion: immutable-ID/name/branch preflight then one bodyless DELETE acknowledges only', async () => {
  const f = fixture({ ...receipt, database: { ...receipt.database, owner_name: canary, created_at: canary } });
  assert.deepEqual(await f.run('deleteProjectBranchDatabase', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/databases/main`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchDatabase');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/databases/main/delete');
  assert.equal(op.prepare(args).plan.database_id, 123);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.deepEqual(await fixture({ ...receipt, operations: [] }).run('deleteProjectBranchDatabase', args), { ...expected, operations: [] });
});

test('database deletion: copied exact scope and plan reject identity, force, SQL and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonDatabaseDeleteOperations(config, {});
  config.databaseId = 456;
  assert.equal(op.prepare(args).plan.database_id, 123);
  for (const raw of [null, [], {}, { ...args, database_name: 'other' }, { ...args, branch_id: 'br-other' }, { ...args, project_id: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'database_id', 'sql', 'cascade', 'timeout']
      .map(key => ({ ...args, [key]: true })), Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'database_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranchDatabase').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, database_id: 456 } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectBranchDatabase').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectBranchDatabase').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '-project' }, { branchId: 'br-' }, { databaseName: '../db' }, { databaseName: 'x'.repeat(64) },
    ...[null, 0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123'].map(databaseId => ({ databaseId })), { approved: true }]) {
    assert.throws(() => createNeonDatabaseDeleteOperations({ ...scope, ...change }, {}));
  }
});

test('database deletion: mandatory preflight rejects same-name replacement and contradictory ancestry before mutation', async () => {
  for (const raw of [null, {}, { database: {} }, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' },
    ...[{ id: 456 }, { id: undefined }, { id: '123' }, { name: 'other' }, { branch_id: 'br-other' }, { branch_id: undefined },
      { database_id: 456 }, { database_name: 'other' }, { project_id: 'other' }, { pagination: {} }]
      .map(change => ({ database: { ...receipt.database, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchDatabase', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchDatabase', args));
    assert.equal(f.requests.length, 1);
  }
});

test('database deletion: ambiguity observes once, never retries or treats absence/replacement as completion', async () => {
  for (const followup of [receipt, null, { database: {} }, { database: { ...receipt.database, id: 456 } }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? receipt : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchDatabase', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
  }
  const f = fixture((url, init, n) => n === 1 ? response(receipt) : new Response(null, { status: init.method === 'DELETE' ? 204 : 404 }));
  await assert.rejects(f.run('deleteProjectBranchDatabase', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
});

test('database deletion: only HTTP200 bounded JSON acknowledges without provider refusal bypass', async () => {
  for (const make of [() => response(receipt, { status: 202 }), () => new Response(null, { status: 204 }),
    ...[403, 404, 409, 422, 500, 302].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(receipt));
    await assert.rejects(f.run('deleteProjectBranchDatabase', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('database deletion: closed receipt rejects malformed identity and duplicate/foreign/unbounded operations', async () => {
  const op = fixture().operation('deleteProjectBranchDatabase');
  for (const raw of [null, [], {}, { database: {} }, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' },
    ...[{ id: 456 }, { name: 'other' }, { branch_id: 'br-other' }].map(change => ({ ...receipt, database: { ...receipt.database, ...change } })),
    ...[undefined, null, [...receipt.operations, ...receipt.operations], Array(31).fill(receipt.operations[0]),
      ...[{ project_id: 'other' }, { branch_id: 'br-other' }, { id: 'bad' }, { status: 'unknown' }, { pagination: {} }]
        .map(change => [{ ...receipt.operations[0], ...change }])].map(operations => ({ ...receipt, operations }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('deleteProjectBranchDatabase', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => op.project(raw));
  }
  const database = { ...receipt.database };
  const operation = { ...receipt.operations[0] };
  for (const key of ['owner_name', 'created_at', 'updated_at', 'password', 'connection_uri']) {
    Object.defineProperty(database, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  for (const key of ['action', 'endpoint_id', 'error', 'created_at', 'total_duration_ms']) {
    Object.defineProperty(operation, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  assert.deepEqual(op.project({ database, operations: [operation] }), expected);
  assert.throws(() => op.project({ ...receipt, database: Object.defineProperty({ ...receipt.database }, 'id', { get() { throw Error('getter'); }, enumerable: true }) }));
});

test('database deletion: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(receipt); });
  await assert.rejects(f.run('deleteProjectBranchDatabase', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'DELETE') { during.abort(); throw Error(canary); }
    return response(receipt);
  });
  await assert.rejects(g.run('deleteProjectBranchDatabase', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(receipt));
  await assert.rejects(h.run('deleteProjectBranchDatabase', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('database deletion: accepted IDs and names fit GET and DELETE; path/header injection refuses', async () => {
  for (const [projectId, branchId, databaseName, databaseId] of [['p', 'br-0', '_', 1],
    ['p'.repeat(60), 'br-' + 'b'.repeat(57), 'D'.repeat(63), Number.MAX_SAFE_INTEGER]]) {
    const config = { ...scope, projectId, branchId, databaseName, databaseId };
    const raw = { database: { id: databaseId, branch_id: branchId, name: databaseName }, operations: [] };
    const f = fixture(raw, config);
    assert.deepEqual(await f.run('deleteProjectBranchDatabase', { project_id: projectId, branch_id: branchId, database_name: databaseName }),
      { id: databaseId, branch_id: branchId, acknowledged: true, operations: [] });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(64), 'é']) {
    assert.throws(() => transport.deleteProjectBranchDatabase('project-a', 'br-a', bad, options));
  }
  assert.throws(() => transport.deleteProjectBranchDatabase('x/y', 'br-a', 'main', options));
  assert.throws(() => transport.deleteProjectBranchDatabase('project-a', 'x/y', 'main', options));
  await assert.rejects(transport.deleteProjectBranchDatabase('project-a', 'br-a', 'main', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchDatabase('project-a', 'br-a', 'main', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
