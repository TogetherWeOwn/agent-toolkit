import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectUpdateOperations } from '../dist/plugins/neon-broker/src/project-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectUpdateFixture as fixture, projectUpdateArgs as args, projectUpdateScope as scope,
  projectUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const before = { project: { ...receipt.project, name: scope.expectedName } };
const expected = { id: 'project-a', updated: true };

const unsupported = ['settings', 'allowed_ips', 'quota', 'default_endpoint_settings', 'history_retention_seconds'];

test('project rename: fixed detail preflight then one name-only PATCH and closed acknowledgement', async () => {
  const f = fixture({ ...receipt, project: { ...receipt.project, settings: { allowed_ips: [canary] }, password: canary } });
  assert.deepEqual(await f.run('updateProject', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['If-Match'], undefined);
  }
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { project: { name: 'after' } });
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  const op = f.operation('updateProject');
  assert.equal(op.tier, 'write');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/rename');
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'before', after: 'after' });
  assert.equal(op.prepare(args).plan.atomicCompareAndSwap, false);
  for (const field of ['settings', 'compute', 'retention']) assert.equal(op.prepare(args).plan[field], 'unchanged');
});

test('project rename: copied exact arguments and plan refuse settings, compute, retention and authority', async () => {
  const config = { ...scope };
  const [op] = createNeonProjectUpdateOperations(config, {});
  config.name = 'changed';
  config.expectedName = 'changed';
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'before', after: 'after' });
  const f = fixture();
  for (const raw of [null, [], {}, { ...args, name: 'different' }, { ...args, project_id: 'other' },
    ...[...unsupported, 'branch_id', 'approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'expected_name'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const p = f.operation('updateProject').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['settings', 'compute', 'retention'].map(key => ({ plan: { ...p.plan, [key]: null } })), { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('updateProject').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('updateProject').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ name: 'before' }, { name: '' }, { expectedName: 'x\n' }, { name: 'x'.repeat(81) },
    ...unsupported.map(key => ({ [key]: null }))]) assert.throws(() => createNeonProjectUpdateOperations({ ...scope, ...change }, {}));
});

test('project rename: stale labels, missing identity, wrong ancestry and pagination fail before PATCH', async () => {
  for (const raw of [null, {}, { project: {} }, { ...before, pagination: {} }, { ...before, project_id: 'other' },
    ...[{ id: 'other' }, { id: undefined }, { project_id: 'other' }, { name: 'changed' }, { name: 'after' }, { name: undefined }, { pagination: {} }]
      .map(change => ({ project: { ...before.project, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('updateProject', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
});

test('project rename: ambiguity stays uncertain after desired state or failed observation, never retries', async () => {
  for (const followup of [before, receipt, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? before : followup);
    });
    await assert.rejects(f.run('updateProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
  }
});

test('project rename: HTTP200 exact echo required, unrelated response fields never evaluated', async () => {
  for (const raw of [null, [], {}, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' },
    ...[{ id: 'other' }, { id: undefined }, { project_id: 'other' }, { name: 'before' }, { name: canary }, { pagination: {} }]
      .map(change => ({ ...receipt, project: { ...receipt.project, ...change } }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('updateProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => f.operation('updateProject').project(raw));
  }
  for (const make of [() => response(receipt, { status: 202 }), () => response(receipt, { status: 404 }),
    () => response(receipt, { status: 302 }), () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run('updateProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
  }
  const ignored = Object.defineProperty({ ...receipt.project }, 'settings', { get() { throw Error('unused'); }, enumerable: true });
  const raw = Object.defineProperty({ project: ignored }, 'operations', { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(fixture().operation('updateProject').project(raw), expected);
});

test('project rename: cancellation before and during mutation and ignored deadline stay bounded', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(before); });
  await assert.rejects(f.run('updateProject', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'PATCH') { during.abort(); throw Error(canary); }
    return response(before);
  });
  await assert.rejects(g.run('updateProject', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'PATCH' ? new Promise(() => {}) : response(before));
  await assert.rejects(h.run('updateProject', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('project rename: direct transport refuses noncanonical IDs, labels and pre-abort before fetch', async () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) {
    assert.throws(() => transport.updateProject(bad, 'after', options));
  }
  for (const bad of ['', 'x/y', 'x\n', 'x'.repeat(81), 'аfter', null]) assert.throws(() => transport.updateProject('project-a', bad, options));
  await assert.rejects(transport.updateProject('project-a', 'after', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.updateProject('project-a', 'after', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
