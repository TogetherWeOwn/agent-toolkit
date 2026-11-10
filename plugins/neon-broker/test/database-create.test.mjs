import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDatabaseCreateOperations } from '../dist/plugins/neon-broker/src/database-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { databaseCreateFixture as fixture, databaseCreateArgs as args, databaseCreateScope as scope,
  databaseCreateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'createProjectBranchDatabase';
const expected = { id: 123, branch_id: 'br-a', acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };
const database = receipt.database;

test('Database create: bounded absence GET then one exact-owner POST, exact201 acknowledgement only', async () => {
  const f = fixture(receipt);
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/databases`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'POST']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'POST' ? '{"database":{"name":"newdb","owner_name":"owner_a"}}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'POST' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'write');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/databases/newdb/create');
  assert.deepEqual(p.plan.diff, { before: 'selected_database_absent', after: { name: 'newdb', owner_name: 'owner_a' } });
  assert.equal(p.plan.completion, 'acknowledgement_only');
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.persistenceVerified, false);
  assert.equal(p.plan.accessEnforcementVerified, false);
});

test('Database create: copied scope, strict arguments and exact prepared plan reject overrides before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonDatabaseCreateOperations(config, {});
  config.ownerName = 'other';
  assert.equal(op.prepare(args).plan.owner_name, 'owner_a');
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'database_name', 'owner_name'].map(k => ({ ...args, [k]: 'other' })),
    ...['database', 'name', 'password', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'owner_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/create', '') } },
    ...['owner_name', 'preflight', 'effect', 'persistenceVerified', 'diff'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Database create: existing name refuses regardless of owner; unrelated databases permit creation', async () => {
  for (const owner_name of ['owner_a', 'other']) {
    const f = fixture(() => response({ databases: [{ ...database, owner_name }] }));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) :
    response({ databases: [{ ...database, name: 'other' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Database create: entire nonpaginated bounded database list validates before absence decision', async () => {
  const other = { ...database, name: 'other' };
  for (const raw of [null, {}, [], { databases: null }, { databases: [other, other] },
    { databases: [other, { ...other, name: 'different' }] }, { databases: [other, { ...other, id: 124 }] },
    { databases: Array.from({ length: 31 }, (_, n) => ({ ...other, id: n + 1, name: `other${n}` })) },
    ...[{ name: '' }, { name: 'x'.repeat(64) }, { name: 'x\n' }, { id: 0 }, { id: 1.5 }, { id: Number.MAX_SAFE_INTEGER + 1 },
      { branch_id: 'other' }, { branch_id: null }, { project_id: 'other' }, { pagination: {} }].map(change => ({ databases: [{ ...other, ...change }] })),
    ...[{ project_id: 'other' }, { branch_id: null }, { pagination: {} }].map(change => ({ databases: [], ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(() => response({ databases: [] }, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Database create: ambiguous POST observes once and never promotes presence/absence/replacement to success', async () => {
  for (const after of [{ databases: [] }, { databases: [database] }, { databases: [{ ...database, owner_name: 'other' }] }, null, {}, { databases: [], branch_id: 'other' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? { databases: [] } : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Database create: exact201 identity/owner/ID and bounded operation observations required', async () => {
  const bad = [null, {}, { database: null }, ...[{ name: 'other' }, { owner_name: 'other' }, { owner_name: null }, { branch_id: 'other' },
    { id: 0 }, { id: -1 }, { id: 1.5 }, { id: Number.MAX_SAFE_INTEGER + 1 }, { project_id: 'other' }].map(change => ({ ...receipt, database: { ...database, ...change } })),
    ...[{ operations: null }, { operations: [receipt.operations[0], receipt.operations[0]] },
      { operations: Array.from({ length: 31 }, () => receipt.operations[0]) }, { project_id: 'other' }, { pagination: {} }].map(change => ({ ...receipt, ...change })),
    ...[{ id: 'bad' }, { status: 'unknown' }, { project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))];
  for (const make of [...bad.map(raw => () => response(raw, { status: 201 })),
    ...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    () => new Response(canary, { status: 201, headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { status: 201, headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { status: 201, headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { status: 201, headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response({ databases: [] }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
  }
});

test('Database create: unused metadata never evaluated; closed output and independent project validation', async () => {
  const ignored = raw => {
    for (const k of ['created_at', 'updated_at', 'password', 'connection_uri', 'error', 'endpoint_id', 'action']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonDatabaseCreateOperations(scope, {
    async listProjectBranchDatabases() { return { databases: [ignored({ id: 1, branch_id: 'br-a', name: 'other' })] }; },
    async createProjectBranchDatabase() { return ignored({ database: ignored({ ...database }), operations: receipt.operations.map(({ id, project_id, status }) => ignored({ id, project_id, status })) }); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { ...receipt, database: { ...database, owner_name: 'other' } },
    { ...receipt, database: Object.defineProperty({}, 'id', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...receipt, ignored: canary }), expected);
  assert.deepEqual(op.project({ ...receipt, operations: [] }), { ...expected, operations: [] });
});

test('Database create: cancellation and ignored fetch/body deadlines bound the single mutation', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? response(receipt, { status: 201 }) : response({ databases: [] });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response({ databases: [] }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Database create: shared canonical database/owner parsers, maximal budgets and unsafe direct transport refusals', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b' }, { branchId: 'br-' },
    { revision: '' }, { databaseName: '../x' }, { databaseName: 'x'.repeat(64) }, { ownerName: 'owner\n' }, { ownerName: '' }, { password: 'unused' }]) assert.throws(() => createNeonDatabaseCreateOperations({ ...scope, ...change }, {}));
  for (const databaseName of ['a', '_', 'a'.repeat(63)]) {
    const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'br-' + 'b'.repeat(57), databaseName, ownerName: 'o'.repeat(63), revision: 'r'.repeat(80) };
    const f = fixture(null, config);
    const result = await f.run(name, { project_id: config.projectId, branch_id: config.branchId, database_name: databaseName, owner_name: config.ownerName });
    assert.deepEqual(result, { id: 123, branch_id: config.branchId, acknowledged: true, operations: [] });
    assert.deepEqual(JSON.parse(f.requests[1].init.body), { database: { name: databaseName, owner_name: config.ownerName } });
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(64)]) {
    assert.throws(() => t.createProjectBranchDatabase(bad, 'br-a', 'newdb', 'owner_a', options));
    assert.throws(() => t.createProjectBranchDatabase('project-a', bad, 'newdb', 'owner_a', options));
    assert.throws(() => t.createProjectBranchDatabase('project-a', 'br-a', bad, 'owner_a', options));
    assert.throws(() => t.createProjectBranchDatabase('project-a', 'br-a', 'newdb', bad, options));
  }
  await assert.rejects(t.createProjectBranchDatabase('project-a', 'br-a', 'newdb', 'owner_a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
