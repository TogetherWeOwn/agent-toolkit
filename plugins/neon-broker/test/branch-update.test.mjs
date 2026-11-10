import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchUpdateOperations } from '../dist/plugins/neon-broker/src/branch-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { branchUpdateFixture as fixture, branchUpdateArgs as args, branchUpdateScope as scope,
  branchUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const before = { branch: { ...receipt.branch, name: scope.expectedName } };
const expected = { id: 'br-a', updated: true };

test('branch rename: fixed detail preflight then one name-only PATCH and closed acknowledgement', async () => {
  const f = fixture({ ...receipt, branch: { ...receipt.branch, protected: true, expires_at: canary, password: canary } });
  assert.deepEqual(await f.run('updateProjectBranch', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['If-Match'], undefined);
  }
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { branch: { name: 'after' } });
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  const op = f.operation('updateProjectBranch');
  assert.equal(op.tier, 'write');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/rename');
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'before', after: 'after' });
  assert.equal(op.prepare(args).plan.atomicCompareAndSwap, false);
  assert.equal(op.prepare(args).plan.protection, 'unchanged');
  assert.equal(op.prepare(args).plan.expiry, 'unchanged');
});

test('branch rename: copied exact arguments and plan refuse protection, expiry, authority and detached changes', async () => {
  const config = { ...scope };
  const [op] = createNeonBranchUpdateOperations(config, {});
  config.name = 'changed';
  assert.equal(op.prepare(args).plan.diff.after, 'after');
  const f = fixture();
  for (const raw of [null, [], {}, { ...args, name: 'different' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['protected', 'expires_at', 'approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'expected_name'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const p = f.operation('updateProjectBranch').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, protection: false } }, { plan: { ...p.plan, expiry: null } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('updateProjectBranch').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('updateProjectBranch').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ name: 'before' }, { name: '' }, { expectedName: 'x\n' }, { name: 'x'.repeat(81) }, { protected: false }, { expires_at: null }]) {
    assert.throws(() => createNeonBranchUpdateOperations({ ...scope, ...change }, {}));
  }
});

test('branch rename: stale labels, missing identity, wrong ancestry and pagination fail before PATCH', async () => {
  for (const raw of [null, {}, { branch: {} }, { ...before, pagination: {} }, { ...before, project_id: 'other' },
    ...[{ id: 'other' }, { project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-b' }, { name: 'changed' }, { name: 'after' }, { pagination: {} }]
      .map(change => ({ branch: { ...before.branch, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('updateProjectBranch', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
});

test('branch rename: ambiguity stays uncertain after desired state or failed observation, never retries', async () => {
  for (const followup of [before, receipt, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? before : followup);
    });
    await assert.rejects(f.run('updateProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
  }
});

test('branch rename: HTTP200 exact echo required, unrelated response fields never evaluated', async () => {
  for (const raw of [null, [], {}, { ...receipt, pagination: {} }, { ...receipt, branch_id: 'br-b' },
    ...[{ id: 'other' }, { project_id: 'other' }, { project_id: undefined }, { name: 'before' }, { name: canary }, { pagination: {} }]
      .map(change => ({ ...receipt, branch: { ...receipt.branch, ...change } }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('updateProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => f.operation('updateProjectBranch').project(raw));
  }
  for (const make of [() => response(receipt, { status: 202 }), () => response(receipt, { status: 404 }),
    () => response(receipt, { status: 302 }), () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run('updateProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
  }
  const ignored = Object.defineProperty({ ...receipt.branch }, 'protected', { get() { throw Error('unused'); }, enumerable: true });
  const raw = Object.defineProperty({ branch: ignored }, 'operations', { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(fixture().operation('updateProjectBranch').project(raw), expected);
});

test('branch rename: cancellation before and during mutation and ignored deadline stay bounded', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(before); });
  await assert.rejects(f.run('updateProjectBranch', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'PATCH') { during.abort(); throw Error(canary); }
    return response(before);
  });
  await assert.rejects(g.run('updateProjectBranch', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'PATCH' ? new Promise(() => {}) : response(before));
  await assert.rejects(h.run('updateProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('branch rename: direct transport refuses noncanonical IDs, labels and pre-abort before fetch', async () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.updateProjectBranch(bad, 'br-a', 'after', options));
    assert.throws(() => transport.updateProjectBranch('project-a', bad, 'after', options));
  }
  for (const bad of ['', 'x/y', 'x\n', 'x'.repeat(81), 'аfter', null]) assert.throws(() => transport.updateProjectBranch('project-a', 'br-a', bad, options));
  await assert.rejects(transport.updateProjectBranch('project-a', 'br-a', 'after', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.updateProjectBranch('project-a', 'br-a', 'after', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
