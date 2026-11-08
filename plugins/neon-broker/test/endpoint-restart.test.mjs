import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonEndpointRestartOperations } from '../dist/plugins/neon-broker/src/endpoint-restart.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { endpointRestartFixture as fixture, endpointRestartArgs as args, endpointRestartScope as scope,
  endpointRestartReceipt as receipt, canary, response } from './helpers.mjs';

const before = { endpoint: receipt.endpoint };
const expected = { id: 'ep-a', acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };

test('endpoint restart: fixed identity preflight then one bodyless POST gives acknowledgement, not fencing or completion', async () => {
  const f = fixture({ ...receipt, endpoint: { ...receipt.endpoint, host: canary, settings: { password: canary } },
    operations: receipt.operations.map(op => ({ ...op, error: canary, retry_at: canary })) });
  assert.deepEqual(await f.run('restartProjectEndpoint', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST']);
  assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/endpoints/ep-a`);
  assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/project-a/endpoints/ep-a/restart`);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('restartProjectEndpoint');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/endpoints/ep-a/restart');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.effect, 'request_endpoint_restart');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.equal(op.prepare(args).plan.readiness, false);
  assert.deepEqual(await fixture({ ...receipt, operations: [] }).run('restartProjectEndpoint', args), { ...expected, operations: [] });
  for (const state of ['scheduling', 'running', 'finished', 'failed', 'error', 'cancelling', 'cancelled', 'skipped']) {
    const raw = { ...receipt, operations: [{ ...receipt.operations[0], status: state }] };
    assert.equal((await fixture(raw).run('restartProjectEndpoint', args)).operations[0].status, state);
  }
});

test('endpoint restart: copied exact scope and plan reject authority, configuration and action overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonEndpointRestartOperations(config, {});
  config.endpointId = 'ep-b';
  assert.equal(op.prepare(args).resource.revision, 'scope-v1');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' }, { ...args, endpoint_id: 'ep-b' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'disabled', 'settings', 'action', 'timeout', 'current_state']
      .map(key => ({ ...args, [key]: true })), Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'endpoint_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('restartProjectEndpoint').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, connectionFence: true } }, { plan: { ...p.plan, effect: 'suspend_compute' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('restartProjectEndpoint').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('restartProjectEndpoint').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '-project' }, { branchId: 'wrong' }, { endpointId: 'wrong' }, { approved: true },
    { projectId: 'p'.repeat(61) }, { endpointId: 'ep-а' }]) assert.throws(() => createNeonEndpointRestartOperations({ ...scope, ...change }, {}));
});

test('endpoint restart: exact mandatory identity preflight refuses reassociation before mutation', async () => {
  for (const raw of [null, {}, { endpoint: {} }, { ...before, pagination: {} }, { ...before, project_id: 'other' },
    ...[{ id: 'ep-b' }, { id: undefined }, { project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-b' },
      { branch_id: undefined }, { pagination: {} }].map(change => ({ endpoint: { ...before.endpoint, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('restartProjectEndpoint', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('restartProjectEndpoint', args));
    assert.equal(f.requests.length, 1);
  }
});

test('endpoint restart: ambiguity reconciles once but active, idle, absence or read failure never becomes success or retry', async () => {
  for (const followup of [before, ...['active', 'idle'].map(current_state => ({ endpoint: { ...receipt.endpoint, current_state } })), null, { endpoint: {} }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? before : followup);
    });
    await assert.rejects(f.run('restartProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
  }
});

test('endpoint restart: only HTTP200 bounded JSON is an acknowledgement', async () => {
  for (const make of [() => response(receipt, { status: 202 }), () => response(receipt, { status: 204 }),
    () => response(receipt, { status: 404 }), () => response(receipt, { status: 302 }),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(before));
    await assert.rejects(f.run('restartProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
  }
});

test('endpoint restart: closed bounded operation observations refuse foreign targets, duplicates and malformed receipts', async () => {
  const op = fixture().operation('restartProjectEndpoint');
  for (const raw of [null, [], {}, { endpoint: {} }, { ...receipt, pagination: {} }, { ...receipt, endpoint_id: 'ep-b' },
    { ...receipt, endpoint: { ...receipt.endpoint, branch_id: 'br-b' } }, { ...receipt, operations: undefined },
    { ...receipt, operations: [receipt.operations[0], receipt.operations[0]] }, { ...receipt, operations: Array(31).fill(receipt.operations[0]) },
    ...[{ project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-b' }, { endpoint_id: 'ep-b' }, { id: 'bad' },
      { status: 'future' }, { status: null }, { pagination: {} }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('restartProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => op.project(raw));
  }
  const ignored = { ...receipt.endpoint };
  for (const key of ['host', 'settings', 'current_state', 'pending_state', 'disabled', 'passwordless_access']) {
    Object.defineProperty(ignored, key, { get() { throw Error('unused'); }, enumerable: true, configurable: true });
  }
  const observation = { ...receipt.operations[0] };
  for (const key of ['error', 'action', 'retry_at']) Object.defineProperty(observation, key, { get() { throw Error('unused'); }, enumerable: true });
  const singleObservation = { ...expected, operations: [expected.operations[0]] };
  assert.deepEqual(op.project({ endpoint: ignored, operations: [observation] }), singleObservation);
  const consumed = Object.defineProperty({ ...receipt.operations[0] }, 'status', { get() { throw Error('getter'); }, enumerable: true });
  assert.throws(() => op.project({ ...receipt, operations: [consumed] }));
  // Optional operation branch/endpoint ancestry can be absent, never contradictory.
  const { branch_id, endpoint_id, ...unscoped } = receipt.operations[0];
  assert.deepEqual(op.project({ ...receipt, operations: [unscoped] }), singleObservation);
});

test('endpoint restart: cancellation and ignored POST deadline bound the sole attempt', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(before); });
  await assert.rejects(f.run('restartProjectEndpoint', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'POST') { during.abort(); throw Error(canary); }
    return response(before);
  });
  await assert.rejects(g.run('restartProjectEndpoint', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'POST' ? new Promise(() => {}) : response(before));
  await assert.rejects(h.run('restartProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('endpoint restart: minimal accepted IDs fit GET and POST transports, path/header injection refuses', async () => {
  for (const projectId of ['p', '0', 'p-']) {
    const config = { ...scope, projectId, branchId: 'br-0', endpointId: 'ep-0' };
    const f = fixture({ endpoint: { id: config.endpointId, project_id: projectId, branch_id: config.branchId }, operations: [] }, config);
    assert.deepEqual(await f.run('restartProjectEndpoint', { project_id: projectId, branch_id: config.branchId, endpoint_id: config.endpointId }),
      { id: config.endpointId, acknowledged: true, operations: [] });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST']);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.restartProjectEndpoint(bad, 'ep-a', options));
    assert.throws(() => transport.restartProjectEndpoint('project-a', bad, options));
  }
  await assert.rejects(transport.restartProjectEndpoint('project-a', 'ep-a', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.restartProjectEndpoint('project-a', 'ep-a', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
