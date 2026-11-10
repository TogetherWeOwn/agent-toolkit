import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSnapshotScheduleUpdateOperations } from '../dist/plugins/neon-broker/src/snapshot-schedule-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { snapshotScheduleUpdateFixture as fixture, snapshotScheduleUpdateArgs as args,
  snapshotScheduleUpdateScope as scope, snapshotScheduleUpdateMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'setSnapshotSchedule';
const expected = { acknowledged: true };
const daily = metadata.schedule[0];

test('Snapshot schedule hour: exact single-daily preflight then one PUT with unchanged explicit retention', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/backup_schedule`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PUT']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PUT' ? '{"schedule":[{"frequency":"daily","hour":3,"retention_seconds":86400}]}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'PUT' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/backup_schedule/hour');
  assert.deepEqual(p.plan.diff, { before: metadata, after: { schedule: [{ ...daily, hour: 3 }] } });
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
  assert.equal(p.plan.scheduledExecutionVerified, false);
  assert.equal(p.plan.recoverabilityVerified, false);
});

test('Snapshot schedule hour: copied scope, strict args and nested prepared diff tampering refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonSnapshotScheduleUpdateOperations(config, {});
  config.retentionSeconds = 3600;
  assert.equal(op.prepare(args).plan.diff.after.schedule[0].retention_seconds, 86400);
  for (const raw of [null, [], {}, ...[{ project_id: 'other' }, { branch_id: 'other' }, { hour: 4 }, { hour: -0 }, { hour: '3' },
    ...['schedule', 'retention_seconds', 'frequency', 'expected_hour', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force'].map(k => ({ [k]: true }))].map(change => ({ ...args, ...change })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'hour', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const operation = f.operation(name);
  const p = operation.prepare(args);
  p.plan.diff.after.schedule[0].retention_seconds = 3600;
  await assert.rejects(operation.execute(p, canary, new AbortController().signal));
  assert.equal(operation.prepare(args).plan.diff.after.schedule[0].retention_seconds, 86400);
  const fresh = operation.prepare(args);
  for (const change of [{ resource: { ...fresh.resource, revision: 'other' } }, { resource: { ...fresh.resource, id: fresh.resource.id.replace('/hour', '') } },
    ...['hour', 'preflight', 'effect', 'diff', 'scheduledExecutionVerified'].map(k => ({ plan: { ...fresh.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(operation.execute({ ...fresh, ...change }, canary, new AbortController().signal));
  await assert.rejects(operation.execute(fresh, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Snapshot schedule hour: empty, multiple, defaulted, nondaily, extended or drifted schedules never mutate', async () => {
  for (const raw of [null, {}, [], { schedule: null }, { schedule: [] }, { schedule: [daily, daily] },
    ...[{ frequency: 'weekly' }, { frequency: 'monthly' }, { frequency: 'unknown' }, { hour: 3 }, { hour: 24 }, { hour: 1.5 },
      { hour: undefined }, { retention_seconds: undefined }, { retention_seconds: 3600 }, { retention_seconds: -0 },
      { day: 1 }, { month: 1 }, { extra: true }].map(change => ({ schedule: [{ ...daily, ...change }] })),
    ...[{ project_id: 'other' }, { branch_id: null }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response(init.method === 'PUT' ? {} : { ...metadata, project_id: 'project-a', branch_id: 'br-a' }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Snapshot schedule hour: ambiguity gets one observation without promoting desired hour or absence to success', async () => {
  for (const after of [metadata, { schedule: [{ ...daily, hour: 3 }] }, { schedule: [] }, {}, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PUT') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PUT', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Snapshot schedule hour: exact200 empty JSON only, malformed receipts and bounded transport failures stay uncertain', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, [], { acknowledged: true }, { schedule: [{ ...daily, hour: 3 }] }, { project_id: 'project-a' }].map(raw => () => response(raw)),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response({}, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response({}, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PUT').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Snapshot schedule hour: independent empty receipt projection is closed and ordinary, no schedule execution claim', async () => {
  const f = fixture();
  const op = f.operation(name);
  assert.deepEqual(op.project({}), expected);
  assert.equal(Object.getPrototypeOf(op.project({})), Object.prototype);
  for (const raw of [null, [], expected, { password: canary }, Object.assign(Object.create({ inherited: true }), {}),
    Object.defineProperty({}, 'unexpected', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  const [direct] = createNeonSnapshotScheduleUpdateOperations(scope, {
    async getSnapshotSchedule() { return metadata; }, async setSnapshotSchedule() { return {}; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
});

test('Snapshot schedule hour: abort and ignored fetch/body deadlines bound the single mutation', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'PUT' ? {} : metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Snapshot schedule hour: explicit hour/retention bounds and canonical targets agree with direct transport', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: '../b' }, { revision: '' },
    { hour: 2 }, { expectedHour: -0 }, { hour: 24 }, { hour: 0.5 }, { hour: '3' }, { retentionSeconds: 3599 },
    { retentionSeconds: 3024001 }, { retentionSeconds: null }, { schedule: [] }]) assert.throws(() => createNeonSnapshotScheduleUpdateOperations({ ...scope, ...change }, {}));
  for (const [hour, retentionSeconds] of [[0, 3600], [23, 3024000]]) {
    const config = { ...scope, hour, retentionSeconds, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), revision: 'r'.repeat(80) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, hour }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(81)]) {
    assert.throws(() => t.setSnapshotSchedule(bad, 'br-a', 3, 86400, options));
    assert.throws(() => t.setSnapshotSchedule('project-a', bad, 3, 86400, options));
  }
  for (const hour of [-0, -1, 24, 1.5, '3', NaN]) assert.throws(() => t.setSnapshotSchedule('project-a', 'br-a', hour, 86400, options));
  for (const retention of [3599, 3024001, 3600.5, null]) assert.throws(() => t.setSnapshotSchedule('project-a', 'br-a', 3, retention, options));
  await assert.rejects(t.setSnapshotSchedule('project-a', 'br-a', 3, 86400, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
