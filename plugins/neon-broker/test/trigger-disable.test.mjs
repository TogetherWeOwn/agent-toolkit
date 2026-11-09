import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonTriggerDisableOperations } from '../dist/plugins/neon-broker/src/trigger-disable.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { triggerDisableFixture as fixture, triggerDisableArgs as args, triggerDisableScope as scope,
  triggerDisableMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'updateProjectBranchTrigger';
const expected = { accepted: true };
const before = { trigger: metadata };
const after = { trigger: { ...metadata, enabled: false, version: 2 } };

test('Trigger disable: exact local enabled detail/version preflight then one fixed type/false PATCH and acknowledgement only', async () => {
  for (const expectedType of ['schedule', 'storage_object_created']) {
    const f = fixture(null, { ...scope, expectedType });
    assert.deepEqual(await f.run(name, args), expected);
    const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/triggers/tr-a`;
    assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PATCH']]);
    for (const { init } of f.requests) {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${canary}`);
      assert.equal(init.headers['Idempotency-Key'], undefined);
      assert.equal(init.body, init.method === 'PATCH' ? JSON.stringify({ type: expectedType, enabled: false }) : undefined);
      assert.equal(init.headers['Content-Type'], init.method === 'PATCH' ? 'application/json' : undefined);
    }
    const op = f.operation(name);
    assert.equal(op.tier, 'reserved');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/triggers/tr-a/disable');
    assert.deepEqual(op.prepare(args).plan.diff, { before: { enabled: true }, after: { enabled: false } });
    assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
    for (const k of ['enabled', 'inherited', 'configurationReplaced', 'enforcementVerified', 'committedInvocationsCancelled', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
  }
});

test('Trigger disable: copied scope and exact plan refuse target, authority, enable and configuration overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonTriggerDisableOperations(config, {});
  config.triggerId = 'other'; config.expectedVersion = 2;
  assert.equal(op.prepare(args).plan.trigger_id, 'tr-a');
  assert.equal(op.prepare(args).plan.version, 1);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'trigger_id'].map(k => ({ ...args, [k]: 'other' })),
    ...['enabled', 'inherited', 'type', 'version', 'name', 'function_slug', 'function_path', 'schedule', 'storage_object_created', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    { ...args, enabled: false }, Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'trigger_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/disable', '/delete') } },
    ...['trigger_id', 'version', 'inherited', 'enabled', 'type', 'effect', 'configurationReplaced', 'committedInvocationsCancelled'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Trigger disable: absent, inherited, disabled, drifted or foreign preflight never mutates', async () => {
  for (const raw of [null, {}, [], { trigger: null }, ...[{ trigger_id: 'other' }, { function_slug: 'other' }, { type: 'storage_object_created' },
    { type: 'unknown' }, { enabled: false }, { enabled: null }, { enabled: 1 }, { inherited: true }, { inherited: null },
    { version: 2 }, { version: 0 }, { version: '1' }, { version: Number.MAX_SAFE_INTEGER + 1 },
    { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ trigger: { ...metadata, ...change } })),
    ...[{ project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ ...before, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Trigger disable: exact disabled local echo and type-specific safe monotonic version required', async () => {
  for (const change of [{ trigger_id: 'other' }, { function_slug: 'other' }, { type: 'storage_object_created' }, { enabled: true }, { enabled: 0 },
    { inherited: true }, { version: 1 }, { version: 0 }, { version: '2' }, { version: Number.MAX_SAFE_INTEGER + 1 }, { branch_id: 'other' }, { pagination: {} }]) {
    const f = fixture((url, init) => response(init.method === 'PATCH' ? { trigger: { ...after.trigger, ...change } } : before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
  for (const observedVersion of [2, 4, Number.MAX_SAFE_INTEGER]) {
    const f = fixture((url, init) => response(init.method === 'PATCH' ? { trigger: { ...after.trigger, version: observedVersion } } : before));
    assert.deepEqual(await f.run(name, args), expected);
  }
  const config = { ...scope, expectedType: 'storage_object_created', expectedVersion: 2 };
  for (const observedVersion of [1, 2, 3]) {
    const f = fixture((url, init) => response({ trigger: { ...metadata, type: config.expectedType,
      version: init.method === 'PATCH' ? observedVersion : 2, enabled: init.method !== 'PATCH' } }), config);
    if (observedVersion === 1) await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    else assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Trigger disable: ambiguity observes once without promoting disabled or absence to completion', async () => {
  for (const followup of [before, after, { trigger: { ...after.trigger, inherited: true } }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? before : followup);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => response(n === 1 ? before : {}, { status: n === 1 ? 200 : 404 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Trigger disable: only valid200 echo accepts; malformed body, status, redirect and response bounds refuse', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, { trigger: null }, { ...after, branch_id: 'other' }, { ...after, pagination: {} }].map(raw => () => response(raw)),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(after, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(after, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Trigger disable: names, function paths, schedule, storage and timestamp metadata never evaluate and output is closed', async () => {
  const row = updated => {
    const raw = { trigger: { ...metadata, enabled: !updated, version: updated ? 2 : 1 } };
    for (const k of ['name', 'function_path', 'schedule', 'storage_object_created', 'next_run_at', 'created_at', 'secret']) {
      Object.defineProperty(raw.trigger, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonTriggerDisableOperations(scope, {
    async getProjectBranchTrigger() { return row(false); }, async updateProjectBranchTrigger() { return row(true); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, before,
    { trigger: Object.defineProperty({ ...after.trigger }, 'version', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ trigger: { ...after.trigger, name: canary, schedule: canary, ignored: canary } }), expected);
  let writes = 0;
  const [poisoned] = createNeonTriggerDisableOperations(scope, {
    async getProjectBranchTrigger() { return { trigger: Object.defineProperty({ ...metadata }, 'version', { get() { throw Error('getter'); }, enumerable: true }) }; },
    async updateProjectBranchTrigger() { writes++; return after; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(writes, 0);
});

test('Trigger disable: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'PATCH' ? after : before);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Trigger disable: canonical identity/version bounds fit transport; unsafe paths, types and headers never fetch', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) }, { branchId: '-b' },
    { functionSlug: 'A' }, { functionSlug: 'f'.repeat(21) }, { expectedType: 'unknown' }, { expectedVersion: Number.MAX_SAFE_INTEGER },
    ...[0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map(expectedVersion => ({ expectedVersion })),
    ...['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81), 'id.with.dot'].map(triggerId => ({ triggerId })),
    { revision: '' }, { expectedInherited: false }, { expectedEnabled: true }, { enabled: false }]) assert.throws(() => createNeonTriggerDisableOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), triggerId: 't'.repeat(80), functionSlug: 'f'.repeat(20), expectedVersion: Number.MAX_SAFE_INTEGER - 1 };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, trigger_id: config.triggerId }), expected);
  }
  const storage = fixture(null, { ...scope, expectedType: 'storage_object_created', expectedVersion: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(await storage.run(name, args), expected);
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81), 'id.with.dot']) assert.throws(() => t.updateProjectBranchTrigger('project-a', 'br-a', bad, 'schedule', options));
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) {
    assert.throws(() => t.updateProjectBranchTrigger(bad, 'br-a', 'tr-a', 'schedule', options));
    assert.throws(() => t.updateProjectBranchTrigger('project-a', bad, 'tr-a', 'schedule', options));
  }
  assert.throws(() => t.updateProjectBranchTrigger('project-a', 'br-a', 'tr-a', 'unknown', options));
  await assert.rejects(t.updateProjectBranchTrigger('project-a', 'br-a', 'tr-a', 'schedule', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
