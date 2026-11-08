import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchDeleteOperations } from '../dist/plugins/neon-broker/src/branch-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { branchDeleteFixture as fixture, branchDeleteArgs as args, branchDeleteScope as scope,
  branchDeleteReceipt as receipt, canary, response } from './helpers.mjs';

const before = { branch: receipt.branch };
const expected = { id: 'br-a', acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };

test('branch deletion: exact nonroot preflight then one bodyless DELETE acknowledges only, not completion or fencing', async () => {
  const f = fixture({ ...receipt, branch: { ...receipt.branch, name: canary, created_by: { name: canary } },
    operations: receipt.operations.map(op => ({ ...op, error: canary, retry_at: canary })) });
  assert.deepEqual(await f.run('deleteProjectBranch', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranch');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/delete');
  assert.equal(op.prepare(args).plan.parent_id, scope.parentId);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.equal(op.prepare(args).plan.cascade, false);
  assert.deepEqual(await fixture({ ...receipt, operations: [] }).run('deleteProjectBranch', args), { ...expected, operations: [] });
  for (const state of ['scheduling', 'running', 'finished', 'failed', 'error', 'cancelling', 'cancelled', 'skipped']) {
    const raw = { ...receipt, operations: [{ ...receipt.operations[0], status: state }] };
    assert.equal((await fixture(raw).run('deleteProjectBranch', args)).operations[0].status, state);
  }
});

test('branch deletion: copied exact scope and plan reject authority, protection and cascade overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonBranchDeleteOperations(config, {});
  config.parentId = 'br-other';
  assert.equal(op.prepare(args).plan.parent_id, 'br-parent');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'protected', 'default', 'cascade', 'parent_id', 'timeout']
      .map(key => ({ ...args, [key]: true })), Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranch').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, cascade: true } }, { plan: { ...p.plan, parent_id: 'br-other' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectBranch').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectBranch').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '-project' }, { branchId: 'wrong' }, { parentId: 'br-a' }, { parentId: null }, { approved: true },
    { projectId: 'p'.repeat(61) }, { branchId: 'br-а' }]) assert.throws(() => createNeonBranchDeleteOperations({ ...scope, ...change }, {}));
});

test('branch deletion: mandatory immutable ancestry and explicit default/protected false refuse before mutation', async () => {
  for (const raw of [null, {}, { branch: {} }, { ...before, pagination: {} }, { ...before, project_id: 'other' },
    ...[{ id: 'br-b' }, { id: undefined }, { project_id: 'other' }, { project_id: undefined }, { parent_id: 'br-other' },
      { parent_id: undefined }, { parent_id: null }, { default: true }, { default: undefined }, { default: 0 },
      { protected: true }, { protected: undefined }, { protected: 'false' }, { pagination: {} }]
      .map(change => ({ branch: { ...before.branch, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranch', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranch', args));
    assert.equal(f.requests.length, 1);
  }
});

test('branch deletion: ambiguity observes once but absence or ready state never proves deletion or triggers retry', async () => {
  for (const followup of [before, { branch: { ...receipt.branch, current_state: 'ready' } }, null, { branch: {} }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? before : followup);
    });
    await assert.rejects(f.run('deleteProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
  }
  const f = fixture((url, init, n) => n === 1 ? response(before) : new Response(null, { status: init.method === 'DELETE' ? 204 : 404 }));
  await assert.rejects(f.run('deleteProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
});

test('branch deletion: only HTTP200 bounded JSON acknowledges, provider child/default/protection refusal is never bypassed', async () => {
  for (const make of [() => response(receipt, { status: 202 }), () => new Response(null, { status: 204 }),
    ...[403, 404, 409, 422, 500, 302].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(before));
    await assert.rejects(f.run('deleteProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('branch deletion: bounded closed operation observations reject reassociation, duplicates and malformed receipts', async () => {
  const op = fixture().operation('deleteProjectBranch');
  for (const raw of [null, [], {}, { branch: {} }, { ...receipt, pagination: {} }, { ...receipt, branch_id: 'br-b' },
    { ...receipt, branch: { ...receipt.branch, parent_id: 'br-other' } }, { ...receipt, operations: undefined },
    { ...receipt, operations: [receipt.operations[0], receipt.operations[0]] }, { ...receipt, operations: Array(31).fill(receipt.operations[0]) },
    ...[{ project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-b' }, { id: 'bad' },
      { status: 'future' }, { status: null }, { pagination: {} }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('deleteProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => op.project(raw));
  }
  const ignored = { ...receipt.branch };
  for (const key of ['name', 'created_by', 'current_state', 'pending_state', 'default', 'protected', 'logical_size']) {
    Object.defineProperty(ignored, key, { get() { throw Error('unused'); }, enumerable: true, configurable: true });
  }
  const observation = { ...receipt.operations[0] };
  for (const key of ['endpoint_id', 'error', 'action', 'retry_at']) Object.defineProperty(observation, key, { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(op.project({ branch: ignored, operations: [observation] }), expected);
  const consumed = Object.defineProperty({ ...receipt.operations[0] }, 'status', { get() { throw Error('getter'); }, enumerable: true });
  assert.throws(() => op.project({ ...receipt, operations: [consumed] }));
  const { branch_id, ...unscoped } = receipt.operations[0];
  assert.deepEqual(op.project({ ...receipt, operations: [unscoped] }), expected);
});

test('branch deletion: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(before); });
  await assert.rejects(f.run('deleteProjectBranch', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'DELETE') { during.abort(); throw Error(canary); }
    return response(before);
  });
  await assert.rejects(g.run('deleteProjectBranch', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(before));
  await assert.rejects(h.run('deleteProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('branch deletion: accepted IDs fit GET and DELETE; path/header injection refuses', async () => {
  for (const projectId of ['p', '0', 'p-']) {
    const config = { ...scope, projectId, branchId: 'br-0' };
    const f = fixture({ branch: { id: config.branchId, project_id: projectId, parent_id: config.parentId }, operations: [] }, config);
    assert.deepEqual(await f.run('deleteProjectBranch', { project_id: projectId, branch_id: config.branchId }),
      { id: config.branchId, acknowledged: true, operations: [] });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.deleteProjectBranch(bad, 'br-a', options));
    assert.throws(() => transport.deleteProjectBranch('project-a', bad, options));
  }
  await assert.rejects(transport.deleteProjectBranch('project-a', 'br-a', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranch('project-a', 'br-a', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
