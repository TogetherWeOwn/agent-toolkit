import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSnapshotDeleteOperations } from '../dist/plugins/neon-broker/src/snapshot-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { snapshotDeleteFixture as fixture, snapshotDeleteArgs as args, snapshotDeleteScope as scope,
  snapshotDeleteReceipt as receipt, snapshot, canary, response } from './helpers.mjs';

const expected = { accepted: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };

test('snapshot deletion: fixed preflight then single bodyless DELETE returns acceptance, never deletion completion', async () => {
  const f = fixture({ ...receipt, password: canary, operations: receipt.operations.map(op => ({ ...op, error: canary, retry_at: canary })) });
  assert.deepEqual(await f.run('deleteSnapshot', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/snapshots`);
  assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/project-a/snapshots/snap-a`);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteSnapshot');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/snapshots/snap-a/delete');
  assert.equal(op.prepare(args).plan.completion, 'acceptance_only');
  assert.deepEqual(await fixture({ operations: [] }).run('deleteSnapshot', args), { accepted: true, operations: [] });
  for (const state of ['scheduling', 'running', 'finished', 'failed', 'error', 'cancelling', 'cancelled', 'skipped']) {
    const raw = { operations: [{ ...receipt.operations[0], status: state }] };
    assert.equal((await fixture(raw).run('deleteSnapshot', args)).operations[0].status, state);
  }
});

test('snapshot deletion: strict copied target/plan rejects caller authority and detached tampering before any transport', async () => {
  const config = { ...scope };
  const operations = createNeonSnapshotDeleteOperations(config, {});
  config.snapshotId = 'other';
  assert.equal(operations[0].prepare(args).resource.revision, 'scope-v1');
  const f = fixture();
  const op = f.operation('deleteSnapshot');
  for (const raw of [null, [], {}, { ...args, snapshot_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  for (const key of Object.keys(args)) for (const value of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER', 'br-а', null]) {
    assert.throws(() => op.prepare({ ...args, [key]: value }));
  }
  const p = op.prepare(args);
  for (const changed of [{ resource: { ...p.resource, id: p.resource.id + '/other' } },
    { resource: { ...p.resource, revision: 'changed' } }, { plan: { ...p.plan, completion: 'deleted' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(op.execute({ ...p, ...changed }, canary, new AbortController().signal));
  }
  await assert.rejects(op.execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const changed of [{ approved: true }, { snapshotId: '../escape' }, { projectId: 'p'.repeat(61) }]) {
    assert.throws(() => createNeonSnapshotDeleteOperations({ ...scope, ...changed }, {}));
  }
});

test('snapshot deletion: missing/foreign/reassociated/duplicate/oversized preflight never reaches mutation', async () => {
  for (const raw of [{ snapshots: [] }, { snapshots: [{ ...snapshot, id: 'other' }] },
    { snapshots: [{ ...snapshot, source_branch_id: 'br-b' }] }, { snapshots: [snapshot, snapshot] },
    { snapshots: [snapshot], pagination: {} }, { snapshots: [snapshot], project_id: 'other' },
    { snapshots: [snapshot, { ...snapshot, id: 'other', project_id: 'other' }] },
    { snapshots: Array.from({ length: 31 }, (_, n) => ({ ...snapshot, id: `snap-${n}` })) },
    { snapshots: [snapshot, { ...snapshot, id: 'other', source_branch_id: null }] }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteSnapshot', args));
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].init.method, 'GET');
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteSnapshot', args));
    assert.equal(f.requests.length, 1);
  }
});

test('snapshot deletion: ambiguous DELETE reconciles once, but absence/presence/read failure never becomes success or retry', async () => {
  for (const followup of [{ snapshots: [] }, { snapshots: [snapshot] }, null, { snapshots: [snapshot], pagination: {} }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? { snapshots: [snapshot] } : followup);
    });
    await assert.rejects(f.run('deleteSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
  }
});

test('snapshot deletion: only HTTP202 JSON is an acknowledgement, no 404 idempotent-success fallback', async () => {
  for (const failure of [() => response(receipt, { status: 200 }), () => response(receipt, { status: 204 }),
    () => response(receipt, { status: 404 }), () => response(receipt, { status: 302 }),
    () => response(receipt, { headers: { 'content-type': 'text/plain' }, status: 202 }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }, { status: 202 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? failure() : response({ snapshots: [snapshot] }));
    await assert.rejects(f.run('deleteSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
  }
});

test('snapshot deletion: closed operation observations refuse duplicates, wrong ancestry and malformed receipts', async () => {
  for (const raw of [null, [], {}, { operations: receipt.operations, pagination: {} },
    { operations: [receipt.operations[0], receipt.operations[0]] },
    ...[{ project_id: 'other' }, { branch_id: 'br-b' }, { snapshot_id: 'other' }, { endpoint_id: 'ep-a' },
      { id: 'not-a-uuid' }, { status: 'future' }, { status: null }].map(change => ({ operations: [{ ...receipt.operations[0], ...change }] })),
    { operations: Array(31).fill(receipt.operations[0]) }]) {
    const f = fixture(raw);
    await assert.rejects(f.run('deleteSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => f.operation('deleteSnapshot').project(raw));
  }
  const op = fixture().operation('deleteSnapshot');
  const ignored = Object.defineProperty({ ...receipt.operations[0] }, 'error', { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(op.project({ operations: [ignored] }), expected);
  const consumed = Object.defineProperty({ ...receipt.operations[0] }, 'status', { get() { throw Error('getter'); }, enumerable: true });
  assert.throws(() => op.project({ operations: [consumed] }));
});

test('snapshot deletion: abort after preflight prevents DELETE and in-flight cancellation never retries', async () => {
  const before = new AbortController();
  const f = fixture(() => { before.abort(); return response({ snapshots: [snapshot] }); });
  await assert.rejects(f.run('deleteSnapshot', args, before.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'DELETE') { during.abort(); throw Error(canary); }
    return response({ snapshots: [snapshot] });
  });
  await assert.rejects(g.run('deleteSnapshot', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
});

test('snapshot deletion: deadline bounds ignored cancellation and leaves only one mutation attempt', async () => {
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response({ snapshots: [snapshot] }));
  await assert.rejects(f.run('deleteSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('snapshot deletion: direct transport refuses path/credential injection and pre-abort', async () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.deleteSnapshot(bad, 'snap-a', options));
    assert.throws(() => transport.deleteSnapshot('project-a', bad, options));
  }
  await assert.rejects(transport.deleteSnapshot('project-a', 'snap-a', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteSnapshot('project-a', 'snap-a', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
