import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchDefaultOperations } from '../dist/plugins/neon-broker/src/branch-default.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { branchDefaultFixture as fixture, branchDefaultArgs as args, branchDefaultScope as scope,
  branchDefaultReceipt as receipt, canary, response } from './helpers.mjs';

const previous = { branch: { id: scope.previousDefaultId, project_id: scope.projectId, default: true } };
const target = { branch: { id: scope.branchId, project_id: scope.projectId, default: false } };
const expected = { id: 'br-a', default: true, acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };
const preflight = n => n === 1 ? previous : target;

test('branch default: exact previous and target preflights then one bodyless POST acknowledge only', async () => {
  const f = fixture({ ...receipt, branch: { ...receipt.branch, name: canary, created_by: { name: canary } },
    operations: receipt.operations.map(op => ({ ...op, error: canary, action: canary })) });
  assert.deepEqual(await f.run('setDefaultProjectBranch', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST']);
  assert.deepEqual(f.requests.map(({ url }) => url), [
    `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-previous`,
    `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`,
    `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/set_as_default`]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('setDefaultProjectBranch');
  const p = op.prepare(args);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(p.resource.id, 'neon/projects/project-a/default-branch/br-previous/to/br-a');
  assert.equal(p.plan.previous_default_id, 'br-previous');
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.deepEqual(p.plan.diff, { before: { default_branch_id: 'br-previous' }, after: { default_branch_id: 'br-a' } });
  for (const key of ['previousRemovalVerified', 'persistenceVerified', 'routingVerified']) assert.equal(p.plan[key], false);
  assert.deepEqual(await fixture().run('setDefaultProjectBranch', args), { ...expected, operations: [] });
  for (const status of ['scheduling', 'running', 'finished', 'failed', 'error', 'cancelling', 'cancelled', 'skipped']) {
    assert.equal((await fixture({ ...receipt, operations: [{ ...receipt.operations[0], status }] }).run('setDefaultProjectBranch', args)).operations[0].status, status);
  }
});

test('branch default: copied canonical scope and exact plan reject identity, discovery and configuration overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonBranchDefaultOperations(config, {});
  config.previousDefaultId = 'br-other';
  assert.equal(op.prepare(args).plan.previous_default_id, scope.previousDefaultId);
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'protected', 'default', 'previous_default_id', 'timeout']
      .map(key => ({ ...args, [key]: true })), Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('setDefaultProjectBranch').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, previous_default_id: 'br-other' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('setDefaultProjectBranch').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('setDefaultProjectBranch').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '-project' }, { branchId: 'wrong' }, { previousDefaultId: 'br-a' }, { previousDefaultId: null },
    { previousDefaultId: 'br-а' }, { approved: true }, { projectId: 'p'.repeat(61) }]) {
    assert.throws(() => createNeonBranchDefaultOperations({ ...scope, ...change }, {}));
  }
});

test('branch default: previous-default identity and explicit true flag refuse before target or mutation', async () => {
  for (const raw of [null, {}, { branch: {} }, { ...previous, pagination: {} }, { ...previous, project_id: 'other' },
    ...[{ id: 'br-other' }, { project_id: undefined }, { project_id: 'other' }, { default: false }, { default: undefined },
      { default: 1 }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ branch: { ...previous.branch, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('setDefaultProjectBranch', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('setDefaultProjectBranch', args));
    assert.equal(f.requests.length, 1);
  }
});

test('branch default: exact target must be explicitly nondefault; no already-default success or fallback', async () => {
  for (const raw of [null, {}, { branch: {} }, { ...target, pagination: {} }, { ...target, branch_id: 'br-previous' },
    ...[{ id: 'br-other' }, { project_id: undefined }, { project_id: 'other' }, { default: true }, { default: undefined },
      { default: 0 }, { pagination: {} }].map(change => ({ branch: { ...target.branch, ...change } }))]) {
    const f = fixture((url, init, n) => response(n === 1 ? previous : raw));
    await assert.rejects(f.run('setDefaultProjectBranch', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET']);
  }
  const f = fixture((url, init, n) => n === 1 ? response(previous) : response({}, { status: 404 }));
  await assert.rejects(f.run('setDefaultProjectBranch', args));
  assert.equal(f.requests.length, 2);
});

test('branch default: ambiguity observes target once, never proves causation or retries even at desired state', async () => {
  for (const observed of [target, { branch: receipt.branch }, null, {}, { branch: { ...receipt.branch, id: 'br-other' } }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n <= 2 ? preflight(n) : observed);
    });
    await assert.rejects(f.run('setDefaultProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
    assert.equal(f.requests[3].url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`);
  }
});

test('branch default: only documented HTTP200 bounded JSON acknowledges the one POST', async () => {
  for (const make of [() => response(receipt, { status: 201 }), () => response(receipt, { status: 202 }),
    () => new Response(null, { status: 204 }), ...[403, 404, 409, 422, 500, 302].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init, n) => init.method === 'POST' ? make() : response(preflight(n)));
    await assert.rejects(f.run('setDefaultProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
    assert.equal(f.requests.length, 4);
  }
});

test('branch default: closed bounded receipt refuses wrong target, false default and malformed observations', async () => {
  const op = fixture().operation('setDefaultProjectBranch');
  for (const raw of [null, [], {}, { branch: {} }, { ...receipt, pagination: {} }, { ...receipt, branch_id: 'br-previous' },
    { ...receipt, branch: { ...receipt.branch, default: false } }, { ...receipt, branch: { ...receipt.branch, default: undefined } },
    { ...receipt, branch: { ...receipt.branch, id: 'br-other' } }, { ...receipt, operations: undefined },
    { ...receipt, operations: [receipt.operations[0], receipt.operations[0]] }, { ...receipt, operations: Array(31).fill(receipt.operations[0]) },
    ...[{ project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-previous' }, { id: 'bad' },
      { status: 'future' }, { status: null }, { pagination: {} }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))]) {
    const f = fixture((url, init, n) => response(init.method === 'POST' ? raw : preflight(n)));
    await assert.rejects(f.run('setDefaultProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
    assert.throws(() => op.project(raw));
  }
  const ignored = { ...receipt.branch };
  for (const key of ['name', 'created_by', 'current_state', 'pending_state', 'protected', 'logical_size']) {
    Object.defineProperty(ignored, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  const observation = { ...receipt.operations[0] };
  for (const key of ['endpoint_id', 'error', 'action', 'retry_at']) Object.defineProperty(observation, key, { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(op.project({ branch: ignored, operations: [observation] }), expected);
  const consumed = Object.defineProperty({ ...receipt.branch }, 'default', { get() { throw Error('getter'); }, enumerable: true });
  assert.throws(() => op.project({ ...receipt, branch: consumed }));
  const { branch_id, ...unscoped } = receipt.operations[0];
  assert.deepEqual(op.project({ ...receipt, operations: [unscoped] }), expected);
});

test('branch default: cancellation and ignored POST deadline bound attempts and reconciliation', async () => {
  for (const at of [1, 2]) {
    const abort = new AbortController();
    const f = fixture((url, init, n) => { if (n === at) abort.abort(); return response(preflight(n)); });
    await assert.rejects(f.run('setDefaultProjectBranch', args, abort.signal));
    assert.equal(f.requests.length, at);
  }
  const during = new AbortController();
  const g = fixture((url, init, n) => {
    if (init.method === 'POST') { during.abort(); throw Error(canary); }
    return response(preflight(n));
  });
  await assert.rejects(g.run('setDefaultProjectBranch', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 3);
  const h = fixture((url, init, n) => init.method === 'POST' ? new Promise(() => {}) : response(preflight(n)));
  await assert.rejects(h.run('setDefaultProjectBranch', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 4);
});

test('branch default: accepted IDs fit both GET and POST while path and header injection refuse', async () => {
  for (const projectId of ['p', '0', 'p-']) {
    const config = { ...scope, projectId, branchId: 'br-0' };
    const f = fixture(null, config);
    assert.deepEqual(await f.run('setDefaultProjectBranch', { project_id: projectId, branch_id: config.branchId }),
      { id: 'br-0', default: true, acknowledged: true, operations: [] });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST']);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.setDefaultProjectBranch(bad, 'br-a', options));
    assert.throws(() => transport.setDefaultProjectBranch('project-a', bad, options));
  }
  await assert.rejects(transport.setDefaultProjectBranch('project-a', 'br-a', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.setDefaultProjectBranch('project-a', 'br-a', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
