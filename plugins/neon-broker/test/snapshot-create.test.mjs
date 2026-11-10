import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSnapshotCreateOperations } from '../dist/plugins/neon-broker/src/snapshot-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { snapshotCreateFixture as fixture, snapshotCreateArgs as args, snapshotCreateScope as scope,
  snapshotCreateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'createSnapshot';
const expected = { id: 'snap-new', acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };
const snapshot = receipt.snapshot;
const branch = { id: 'br-a', project_id: 'project-a' };
const preflight = (url, snapshots = []) => url.endsWith('/snapshots') ? { snapshots } : { branch };

test('Snapshot create: branch identity and complete name-absence GETs then one explicit-time bodyless POST', async () => {
  const f = fixture(receipt);
  assert.deepEqual(await f.run(name, args), expected);
  const root = `${NEON_ORIGIN}/api/v2/projects/project-a`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${root}/branches/br-a`, 'GET'], [`${root}/snapshots`, 'GET'],
    [`${root}/branches/br-a/snapshot?name=backup-a&timestamp=2026-11-08T12%3A00%3A00Z&expires_at=2026-11-09T12%3A00%3A00Z`, 'POST'],
  ]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'write');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/snapshots/backup-a/create');
  assert.equal(p.plan.completion, 'acknowledgement_only');
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.recoverabilityVerified, false);
  assert.equal(p.plan.expiry, 'eligible_for_deletion_not_guaranteed_teardown');
});

test('Snapshot create: copied exact scope, strict arguments and prepared plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonSnapshotCreateOperations(config, {});
  config.expiresAt = '2027-01-01T00:00:00Z';
  assert.equal(op.prepare(args).plan.expires_at, scope.expiresAt);
  for (const raw of [null, [], {}, ...Object.keys(args).map(k => ({ ...args, [k]: 'other' })),
    ...['lsn', 'body', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'timestamp', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/create', '') } },
    ...['timestamp', 'expires_at', 'preflight', 'effect', 'recoverabilityVerified', 'diff'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Snapshot create: canonical real UTC seconds and explicit expiry ordering, no LSN or retention defaults', () => {
  for (const timestamp of ['', 'now', '2026-02-30T00:00:00Z', '2026-11-08T24:00:00Z', '2026-11-08T12:00:60Z',
    '2026-11-08T12:00:00+00:00', '2026-11-08T12:00:00.000Z', '2026-11-08T12:00:00Z\n']) {
    assert.throws(() => createNeonSnapshotCreateOperations({ ...scope, timestamp }, {}));
    assert.throws(() => createNeonSnapshotCreateOperations({ ...scope, expiresAt: timestamp }, {}));
  }
  for (const expiresAt of [scope.timestamp, '2026-11-08T11:59:59Z']) assert.throws(() => createNeonSnapshotCreateOperations({ ...scope, expiresAt }, {}));
  assert.doesNotThrow(() => createNeonSnapshotCreateOperations({ ...scope, timestamp: '2024-02-29T23:59:59Z' }, {}));
});

test('Snapshot create: wrong branch identity or malformed branch response refuses before list or POST', async () => {
  for (const raw of [null, {}, { branch: null }, ...[{ id: 'br-b' }, { project_id: 'other' }, { project_id: null }, { pagination: {} }].map(change => ({ branch: { ...branch, ...change } })),
    { branch, project_id: 'other' }, { branch, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Snapshot create: whole project list validates before absence, existing names on any branch refuse', async () => {
  for (const source_branch_id of ['br-a', 'br-b']) {
    const f = fixture(url => response(preflight(url, [{ ...snapshot, source_branch_id }])));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET']);
  }
  const other = { ...snapshot, name: 'other' };
  for (const raw of [null, {}, { snapshots: null }, { snapshots: [other, other] },
    { snapshots: Array.from({ length: 31 }, (_, n) => ({ ...other, id: `snap-${n}` })) },
    ...[{ id: '' }, { name: '' }, { name: 'x\n' }, { source_branch_id: null }, { source_branch_id: 'bad' }, { project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(change => ({ snapshots: [{ ...other, ...change }] })),
    { snapshots: [], project_id: 'other' }, { snapshots: [], pagination: {} }]) {
    const f = fixture(url => response(url.endsWith('/snapshots') ? raw : { branch }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
  const f = fixture((url, init) => response(init.method === 'POST' ? receipt : preflight(url, [{ ...other, source_branch_id: 'br-b' }])));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Snapshot create: ambiguity observes one list only, never promotes presence/absence/replacement to success', async () => {
  for (const after of [[], [snapshot], [{ ...snapshot, id: 'replacement' }], null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 4 ? { snapshots: after } : preflight(url));
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
    assert.equal(f.requests[3].url, f.requests[1].url);
  }
});

test('Snapshot create: exact200 identity/time/expiry echoes and bounded operations required', async () => {
  const bad = [null, {}, { snapshot: null }, ...[{ id: '' }, { name: 'other' }, { source_branch_id: 'br-b' },
    { timestamp: undefined }, { expires_at: undefined }, { timestamp: '2026-11-08T13:00:00Z' }, { expires_at: null }, { project_id: 'other' }].map(change => ({ ...receipt, snapshot: { ...snapshot, ...change } })),
    ...[{ operations: null }, { operations: [receipt.operations[0], receipt.operations[0]] },
      { operations: Array.from({ length: 31 }, () => receipt.operations[0]) }, { project_id: 'other' }, { pagination: {} }].map(change => ({ ...receipt, ...change })),
    ...[{ id: 'bad' }, { status: 'unknown' }, { project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))];
  for (const make of [...bad.map(raw => () => response(raw)),
    ...[201, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(preflight(url)));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
  }
});

test('Snapshot create: unused sizes/LSN/diagnostics never evaluated; output and independent projection closed', async () => {
  const ignored = raw => {
    for (const k of ['created_at', 'manual', 'lsn', 'full_size', 'diff_size', 'password', 'error', 'action']) Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    return raw;
  };
  const [op] = createNeonSnapshotCreateOperations(scope, {
    async getProjectBranch() { return { branch: ignored({ ...branch }) }; },
    async listSnapshots() { return { snapshots: [ignored({ ...snapshot, id: 'other', name: 'other' })] }; },
    async createSnapshot() { return ignored({ snapshot: ignored({ ...snapshot }), operations: receipt.operations.map(({ id, project_id, status }) => ignored({ id, project_id, status })) }); },
  });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
  assert.equal(Object.getPrototypeOf(op.project(receipt)), Object.prototype);
  for (const raw of [null, [], {}, expected, { ...receipt, snapshot: { ...snapshot, expires_at: null } }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...receipt, ignored: canary }), expected);
});

test('Snapshot create: cancellation and ignored fetch/body deadlines bound the single mutation', async () => {
  for (const stopAt of [1, 2, 3]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'POST' ? receipt : preflight(url));
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 3 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(preflight(url)));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
});

test('Snapshot create: canonical direct transport parsers and maximal composed target budgets', async () => {
  for (const change of [{ projectId: '-p' }, { branchId: 'br-' }, { revision: '' }, { name: '../x' }, { name: 'x'.repeat(81) }, { lsn: '0/1' }]) assert.throws(() => createNeonSnapshotCreateOperations({ ...scope, ...change }, {}));
  const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'br-' + 'b'.repeat(57), name: 'n'.repeat(80), revision: 'r'.repeat(80) };
  const f = fixture(null, config);
  assert.deepEqual(await f.run(name, { ...args, project_id: config.projectId, branch_id: config.branchId, name: config.name }), { ...expected, operations: [] });
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(81)]) {
    assert.throws(() => t.createSnapshot(bad, 'br-a', scope.name, scope.timestamp, scope.expiresAt, options));
    assert.throws(() => t.createSnapshot('project-a', bad, scope.name, scope.timestamp, scope.expiresAt, options));
    assert.throws(() => t.createSnapshot('project-a', 'br-a', bad, scope.timestamp, scope.expiresAt, options));
  }
  assert.throws(() => t.createSnapshot('project-a', 'br-a', scope.name, 'now', scope.expiresAt, options));
  assert.throws(() => t.createSnapshot('project-a', 'br-a', scope.name, scope.timestamp, scope.timestamp, options));
  await assert.rejects(t.createSnapshot('project-a', 'br-a', scope.name, scope.timestamp, scope.expiresAt, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
