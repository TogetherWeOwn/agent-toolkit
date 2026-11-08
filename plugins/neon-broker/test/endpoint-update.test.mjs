import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonEndpointUpdateOperations } from '../dist/plugins/neon-broker/src/endpoint-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { endpointUpdateFixture as fixture, endpointUpdateArgs as args, endpointUpdateScope as scope,
  endpointUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const before = { endpoint: { ...receipt.endpoint, name: scope.expectedName } };
const expected = { id: 'ep-a', updated: true };
const unsupported = ['settings', 'autoscaling_limit_min_cu', 'autoscaling_limit_max_cu', 'suspend_timeout_seconds',
  'disabled', 'passwordless_access', 'pooler_enabled', 'pooler_mode', 'provisioner'];

test('endpoint rename: fixed detail preflight then one name-only PATCH and acknowledgement, not readiness', async () => {
  const f = fixture({ ...receipt, endpoint: { ...receipt.endpoint, host: canary, settings: { password: canary } }, operations: [canary] });
  assert.deepEqual(await f.run('updateProjectEndpoint', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/endpoints/ep-a`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['If-Match'], undefined);
  }
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { endpoint: { name: 'after' } });
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  const op = f.operation('updateProjectEndpoint');
  assert.equal(op.tier, 'write');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/endpoints/ep-a/rename');
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'before', after: 'after' });
  assert.equal(op.prepare(args).plan.atomicCompareAndSwap, false);
  assert.equal(op.prepare(args).plan.configuration, 'unchanged');
  assert.equal(op.prepare(args).plan.computeActivation, 'possible');
});

test('endpoint rename: copied exact target and plan refuse compute, connection, branch and authority changes', async () => {
  const config = { ...scope };
  const [op] = createNeonEndpointUpdateOperations(config, {});
  config.name = 'changed';
  config.branchId = 'br-b';
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'before', after: 'after' });
  for (const raw of [null, [], {}, { ...args, name: 'different' }, { ...args, project_id: 'other' },
    { ...args, branch_id: 'br-b' }, { ...args, endpoint_id: 'ep-b' },
    ...[...unsupported, 'approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'expected_name'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('updateProjectEndpoint').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, configuration: null } }, { plan: { ...p.plan, computeActivation: 'impossible' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('updateProjectEndpoint').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('updateProjectEndpoint').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ name: 'before' }, { name: '' }, { expectedName: null }, { expectedName: 'x\n' }, { name: 'x'.repeat(65) },
    { projectId: '-project' }, { branchId: 'wrong' }, { endpointId: 'wrong' }, ...unsupported.map(key => ({ [key]: null }))]) {
    assert.throws(() => createNeonEndpointUpdateOperations({ ...scope, ...change }, {}));
  }
});

test('endpoint rename: minimal accepted IDs fit both preflight and mutation transports', async () => {
  for (const projectId of ['p', '0', 'p-']) {
    const config = { ...scope, projectId, branchId: 'br-0', endpointId: 'ep-0' };
    const f = fixture({ endpoint: { id: config.endpointId, project_id: projectId, branch_id: config.branchId, name: config.name } }, config);
    assert.deepEqual(await f.run('updateProjectEndpoint', { ...args, project_id: projectId, branch_id: config.branchId, endpoint_id: config.endpointId }), { id: config.endpointId, updated: true });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH']);
  }
});

test('endpoint rename: stale or unnamed endpoint, missing identity and reassociation fail before PATCH', async () => {
  for (const raw of [null, {}, { endpoint: {} }, { ...before, pagination: {} }, { ...before, project_id: 'other' },
    { ...before, branch_id: 'br-b' }, { ...before, endpoint_id: 'ep-b' },
    ...[{ id: 'ep-b' }, { id: undefined }, { project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-b' },
      { branch_id: undefined }, { name: 'changed' }, { name: 'after' }, { name: undefined }, { name: null }, { pagination: {} }]
      .map(change => ({ endpoint: { ...before.endpoint, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('updateProjectEndpoint', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
});

test('endpoint rename: ambiguity remains uncertain on desired state, absence or failed observation; no retry', async () => {
  for (const followup of [before, receipt, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? before : followup);
    });
    await assert.rejects(f.run('updateProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
  }
});

test('endpoint rename: exact HTTP200 target and name echo required, unused fields never evaluated', async () => {
  for (const raw of [null, [], {}, { ...receipt, pagination: {} }, { ...receipt, branch_id: 'br-b' },
    ...[{ id: 'ep-b' }, { id: undefined }, { project_id: 'other' }, { project_id: undefined }, { branch_id: 'br-b' },
      { branch_id: undefined }, { name: 'before' }, { name: canary }, { pagination: {} }]
      .map(change => ({ ...receipt, endpoint: { ...receipt.endpoint, ...change } }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('updateProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => f.operation('updateProjectEndpoint').project(raw));
  }
  for (const make of [() => response(receipt, { status: 202 }), () => response(receipt, { status: 404 }),
    () => response(receipt, { status: 302 }), () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run('updateProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
  }
  const ignored = { ...receipt.endpoint };
  for (const key of ['host', 'settings', 'current_state', 'pending_state', ...unsupported]) {
    Object.defineProperty(ignored, key, { get() { throw Error('unused'); }, enumerable: true, configurable: true });
  }
  const raw = Object.defineProperty({ endpoint: ignored }, 'operations', { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(fixture().operation('updateProjectEndpoint').project(raw), expected);
});

test('endpoint rename: cancellation and an ignored mutation deadline stay bounded', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(before); });
  await assert.rejects(f.run('updateProjectEndpoint', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'PATCH') { during.abort(); throw Error(canary); }
    return response(before);
  });
  await assert.rejects(g.run('updateProjectEndpoint', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'PATCH' ? new Promise(() => {}) : response(before));
  await assert.rejects(h.run('updateProjectEndpoint', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('endpoint rename: direct transport refuses invalid path, labels, credential and pre-abort before fetch', async () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.updateProjectEndpoint(bad, 'ep-a', 'after', options));
    assert.throws(() => transport.updateProjectEndpoint('project-a', bad, 'after', options));
  }
  for (const bad of ['', 'x/y', 'x\n', 'x'.repeat(65), 'аfter', null]) assert.throws(() => transport.updateProjectEndpoint('project-a', 'ep-a', bad, options));
  await assert.rejects(transport.updateProjectEndpoint('project-a', 'ep-a', 'after', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.updateProjectEndpoint('project-a', 'ep-a', 'after', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
