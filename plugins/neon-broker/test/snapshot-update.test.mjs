import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSnapshotUpdateOperations } from '../dist/plugins/neon-broker/src/snapshot-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { snapshotUpdateFixture as fixture, snapshotUpdateArgs as args, snapshotUpdateScope as scope,
  snapshotUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const before = { ...receipt.snapshot, name: scope.expectedName };
const expected = { id: 'snap-a', updated: true };

test('snapshot rename: fixed preflight then one name-only PATCH, closed receipt omits labels and expiry', async () => {
  const f = fixture({ snapshot: { ...receipt.snapshot, expires_at: canary, password: canary, lsn: canary } });
  assert.deepEqual(await f.run('updateSnapshot', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH']);
  assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/snapshots`);
  assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/project-a/snapshots/snap-a`);
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { snapshot: { name: 'after' } });
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  assert.equal(f.requests[1].init.headers['Idempotency-Key'], undefined);
  assert.equal(f.requests[1].init.headers['If-Match'], undefined);
  assert.equal(f.requests[1].init.redirect, 'error');
  const op = f.operation('updateSnapshot');
  assert.equal(op.tier, 'write');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/snapshots/snap-a/rename');
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'before', after: 'after' });
  assert.equal(op.prepare(args).plan.atomicCompareAndSwap, false);
  assert.equal(op.prepare(args).plan.expiry, 'unchanged');
});

test('snapshot rename: copied exact arguments and plan refuse expiry, authority and detached changes', async () => {
  const config = { ...scope };
  const [op] = createNeonSnapshotUpdateOperations(config, {});
  config.name = 'changed';
  assert.equal(op.prepare(args).plan.diff.after, 'after');
  const f = fixture();
  for (const raw of [null, [], {}, { ...args, name: 'different' }, { ...args, snapshot_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['expires_at', 'approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'expected_name'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const p = f.operation('updateSnapshot').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, expiry: null } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('updateSnapshot').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('updateSnapshot').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ name: 'before' }, { name: '' }, { expectedName: 'x\n' }, { name: 'x'.repeat(81) }, { expires_at: null }]) {
    assert.throws(() => createNeonSnapshotUpdateOperations({ ...scope, ...change }, {}));
  }
});

test('snapshot rename: stale labels, missing/foreign/duplicate/bounded-list failures precede PATCH', async () => {
  for (const raw of [{ snapshots: [] }, { snapshots: [{ ...before, id: 'other' }] },
    { snapshots: [{ ...before, name: 'changed' }] }, { snapshots: [{ ...before, name: 'after' }] },
    { snapshots: [{ ...before, source_branch_id: 'br-b' }] }, { snapshots: [before, before] },
    { snapshots: [before], pagination: {} }, { snapshots: [before], project_id: 'other' },
    { snapshots: [before, { ...before, id: 'other', project_id: 'other' }] },
    { snapshots: Array.from({ length: 31 }, (_, n) => ({ ...before, id: `snap-${n}` })) }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('updateSnapshot', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
});

test('snapshot rename: ambiguity stays uncertain even after observing desired label, never retries', async () => {
  for (const followup of [{ snapshots: [] }, { snapshots: [before] }, { snapshots: [receipt.snapshot] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? { snapshots: [before] } : followup);
    });
    await assert.rejects(f.run('updateSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
  }
});

test('snapshot rename: HTTP200 JSON exact receipt required; wrong echo/status/ancestry never implies success', async () => {
  for (const raw of [null, [], {}, { ...receipt, pagination: {} },
    ...[{ id: 'other' }, { source_branch_id: 'br-b' }, { name: 'before' }, { name: canary }, { project_id: 'other' }]
      .map(change => ({ snapshot: { ...receipt.snapshot, ...change } }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('updateSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => f.operation('updateSnapshot').project(raw));
  }
  for (const make of [() => response(receipt, { status: 202 }), () => response(receipt, { status: 404 }),
    () => response(receipt, { status: 302 }), () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response({ snapshots: [before] }));
    await assert.rejects(f.run('updateSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
  }
  const ignored = Object.defineProperty({ ...receipt.snapshot }, 'expires_at', { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(fixture().operation('updateSnapshot').project({ snapshot: ignored }), expected);
});

test('snapshot rename: abort before mutation and ignored cancellation deadline stay bounded', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response({ snapshots: [before] }); });
  await assert.rejects(f.run('updateSnapshot', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'PATCH') { during.abort(); throw Error(canary); }
    return response({ snapshots: [before] });
  });
  await assert.rejects(g.run('updateSnapshot', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'PATCH' ? new Promise(() => {}) : response({ snapshots: [before] }));
  await assert.rejects(h.run('updateSnapshot', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('snapshot rename: direct transport rejects noncanonical targets/labels and pre-abort without fetch', async () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.updateSnapshot(bad, 'snap-a', 'after', options));
    assert.throws(() => transport.updateSnapshot('project-a', bad, 'after', options));
  }
  for (const bad of ['', 'x/y', 'x\n', 'x'.repeat(81), 'аfter', null]) assert.throws(() => transport.updateSnapshot('project-a', 'snap-a', bad, options));
  await assert.rejects(transport.updateSnapshot('project-a', 'snap-a', 'after', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.updateSnapshot('project-a', 'snap-a', 'after', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
