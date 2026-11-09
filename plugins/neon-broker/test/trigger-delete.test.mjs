import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonTriggerDeleteOperations } from '../dist/plugins/neon-broker/src/trigger-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { triggerDeleteFixture as fixture, triggerDeleteArgs as args, triggerDeleteScope as scope,
  triggerDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = { trigger: metadata };

test('Trigger delete: exact detail/version preflight precedes one bodyless DELETE and HTTP204 acknowledges only', async () => {
  const f = fixture();
  const result = await f.run('deleteProjectBranchTrigger', args);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/triggers/tr-a`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/triggers/tr-a`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchTrigger');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/triggers/tr-a/delete');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.equal(op.prepare(args).plan.committedInvocationsCancelled, false);
  assert.equal(op.prepare(args).plan.effect, 'request_branch_local_trigger_deletion');
  for (const name of ['getProjectBranchTrigger', 'createProjectBranchTrigger', 'updateProjectBranchTrigger']) assert.equal(f.operation(name), undefined);
});

test('Trigger delete: copied scope and exact plan reject identity, path and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonTriggerDeleteOperations(config, {});
  config.triggerId = 'other';
  config.branchId = 'other';
  config.expectedVersion = 2;
  assert.equal(op.prepare(args).plan.trigger_id, scope.triggerId);
  assert.equal(op.prepare(args).plan.version, 1);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'trigger_id'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'version', 'inherited', 'cancel'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'trigger_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranchTrigger').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['trigger_id', 'version', 'inherited', 'effect', 'committedInvocationsCancelled'].map(key => ({ plan: { ...p.plan, [key]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectBranchTrigger').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectBranchTrigger').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { branchId: 'x'.repeat(61) },
    { projectId: '-' }, { branchId: '-branch' }, { functionSlug: 'A' }, { functionSlug: 'f'.repeat(21) },
    ...['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81), 'id.with.dot'].map(triggerId => ({ triggerId })),
    ...[0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map(expectedVersion => ({ expectedVersion })),
    { expectedType: 'unknown' }, { expectedInherited: 'false' }, { expectedEnabled: null }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonTriggerDeleteOperations({ ...scope, ...change }, {}));
  }
});

test('Trigger delete: absent, drifted, reassociated and malformed detail refuses before DELETE', async () => {
  const changes = [{ trigger_id: 'other' }, { function_slug: 'other' }, { type: 'storage_object_created' }, { type: 'unknown' },
    { version: 2 }, { version: Number.MAX_SAFE_INTEGER + 1 }, { version: 0 }, { version: '1' },
    { inherited: true }, { inherited: null }, { enabled: false }, { enabled: 1 },
    { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }];
  for (const raw of [null, {}, [], { trigger: null }, ...changes.map(change => ({ trigger: { ...metadata, ...change } })),
    { ...listed, project_id: 'other' }, { ...listed, branch_id: 'other' }, { ...listed, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchTrigger', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchTrigger', args));
    assert.equal(f.requests.length, 1);
  }
});

test('Trigger delete: inherited and storage triggers require explicit effective-branch bindings and plan tombstones only there', async () => {
  for (const expectedInherited of [false, true]) {
    for (const expectedType of ['schedule', 'storage_object_created']) {
      const config = { ...scope, expectedInherited, expectedType, expectedEnabled: false };
      const f = fixture(null, config);
      const p = f.operation('deleteProjectBranchTrigger').prepare(args);
      assert.equal(p.plan.effect, expectedInherited ? 'request_branch_local_trigger_tombstone' : 'request_branch_local_trigger_deletion');
      assert.equal(p.plan.inherited, expectedInherited);
      assert.equal(p.plan.committedInvocationsCancelled, false);
      assert.deepEqual(await f.run('deleteProjectBranchTrigger', args), expected);
      assert.throws(() => f.operation('deleteProjectBranchTrigger').prepare({ ...args, branch_id: 'ancestor' }));
      assert(f.requests.every(({ url }) => url.includes('/branches/br-a/')));
    }
  }
});

test('Trigger delete: ambiguity observes once without retry or upgrading absence/disabled/version drift to success', async () => {
  for (const followup of [{}, listed, { trigger: { ...metadata, enabled: false } }, { trigger: { ...metadata, version: 2 } }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchTrigger', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Trigger delete: only empty HTTP204 acknowledges; echoes, failures, redirects and malformed lengths stay uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    () => new Response(null, { status: 204, headers: { 'content-length': '1' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': 'invalid' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteProjectBranchTrigger', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run('deleteProjectBranchTrigger', args), expected);
});

test('Trigger delete: names, function paths, cron, storage configuration and timestamps are never evaluated or emitted', async () => {
  const value = { ...metadata };
  for (const name of ['name', 'function_path', 'schedule', 'storage_object_created', 'next_run_at', 'created_at', 'secret']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [direct] = createNeonTriggerDeleteOperations(scope, {
    async getProjectBranchTrigger() { return { trigger: value }; }, async deleteProjectBranchTrigger() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, trigger_id: scope.triggerId },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonTriggerDeleteOperations(scope, {
    async getProjectBranchTrigger() { return { trigger: Object.defineProperty({ ...metadata }, 'version', { get() { throw Error('getter'); }, enumerable: true }) }; },
    async deleteProjectBranchTrigger() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ trigger: { ...metadata, name: canary, function_path: canary, schedule: { cron: canary } } }));
  assert.deepEqual(await f.run('deleteProjectBranchTrigger', args), expected);
});

test('Trigger delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('deleteProjectBranchTrigger', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteProjectBranchTrigger', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Trigger delete: maximum/minimum copied IDs work; path/header injection refuses before fetch', async () => {
  for (const config of [{ ...scope, projectId: 'a', branchId: 'a', triggerId: 'a' },
    { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), triggerId: 't'.repeat(80), functionSlug: 'f'.repeat(20),
      expectedVersion: Number.MAX_SAFE_INTEGER, revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('deleteProjectBranchTrigger', { project_id: config.projectId, branch_id: config.branchId, trigger_id: config.triggerId }), expected);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(81), 'id.with.dot']) assert.throws(() => transport.deleteProjectBranchTrigger('project-a', 'br-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) {
    assert.throws(() => transport.deleteProjectBranchTrigger(bad, 'br-a', scope.triggerId, options));
    assert.throws(() => transport.deleteProjectBranchTrigger('project-a', bad, scope.triggerId, options));
  }
  await assert.rejects(transport.deleteProjectBranchTrigger('project-a', 'br-a', scope.triggerId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchTrigger('project-a', 'br-a', scope.triggerId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
