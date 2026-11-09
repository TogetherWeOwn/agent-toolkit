import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonFunctionDeleteOperations } from '../dist/plugins/neon-broker/src/function-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { functionDeleteFixture as fixture, functionDeleteArgs as args, functionDeleteScope as scope,
  functionDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = { function: metadata };

test('Function delete: exact stable-ID/slug preflight precedes one bodyless DELETE and HTTP204 acknowledges only', async () => {
  const f = fixture();
  const result = await f.run('deleteProjectBranchFunction', args);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/functions/hello`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/functions/hello`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchFunction');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/functions/hello/delete');
  assert.equal(op.prepare(args).plan.function_id, scope.functionId);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const key of ['invocationRefusalVerified', 'committedWorkCancellationVerified', 'connectionFence']) assert.equal(op.prepare(args).plan[key], false);
  for (const name of ['getProjectBranchFunction', 'createProjectBranchFunctionDeployment', 'updateProjectBranchFunction']) assert.equal(f.operation(name), undefined);
});

test('Function delete: copied scope and exact plan reject identity, path and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonFunctionDeleteOperations(config, {});
  config.functionId = 'other';
  config.functionSlug = 'other';
  assert.equal(op.prepare(args).plan.function_id, scope.functionId);
  assert.equal(op.prepare(args).plan.slug, scope.functionSlug);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'slug'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'function_id', 'cascade'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'slug', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranchFunction').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['function_id', 'slug', 'effect', 'invocationRefusalVerified'].map(key => ({ plan: { ...p.plan, [key]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectBranchFunction').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectBranchFunction').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { branchId: 'x'.repeat(61) },
    { projectId: '-' }, { branchId: '-branch' },
    ...['', 'A', 'hello-world', '../id', 'a?query', 'a\n', 'a'.repeat(21)].map(functionSlug => ({ functionSlug })),
    ...['', '../id', '-id', 'id.with.dot', 'a'.repeat(81)].map(functionId => ({ functionId })),
    { revision: '' }, { approved: true }]) assert.throws(() => createNeonFunctionDeleteOperations({ ...scope, ...change }, {}));
});

test('Function delete: absent, replaced, reassociated and malformed detail refuses before DELETE', async () => {
  const changes = [{ id: 'replacement' }, { slug: 'other' }, { id: null }, { slug: null },
    { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }];
  for (const raw of [null, {}, [], { function: null }, ...changes.map(change => ({ function: { ...metadata, ...change } })),
    { ...listed, project_id: 'other' }, { ...listed, branch_id: 'other' }, { ...listed, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchFunction', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchFunction', args));
    assert.equal(f.requests.length, 1);
  }
});

test('Function delete: ambiguity observes once without retry or upgrading absence/replacement to success', async () => {
  for (const followup of [{}, listed, { function: { ...metadata, id: 'replacement' } }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchFunction', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Function delete: only empty HTTP204 acknowledges; echoes, failures, redirects and malformed lengths stay uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    () => new Response(null, { status: 204, headers: { 'content-length': '1' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': 'invalid' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteProjectBranchFunction', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run('deleteProjectBranchFunction', args), expected);
});

test('Function delete: invocation URLs, names, deployments, environment and errors are never evaluated or emitted', async () => {
  const value = { ...metadata };
  for (const name of ['name', 'invocation_url', 'current_deployment', 'active_deployment', 'environment', 'error', 'created_at', 'secret']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [direct] = createNeonFunctionDeleteOperations(scope, {
    async getProjectBranchFunction() { return { function: value }; }, async deleteProjectBranchFunction() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, function_id: scope.functionId },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonFunctionDeleteOperations(scope, {
    async getProjectBranchFunction() { return { function: Object.defineProperty({ ...metadata }, 'id', { get() { throw Error('getter'); }, enumerable: true }) }; },
    async deleteProjectBranchFunction() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response({ function: { ...metadata, name: canary, invocation_url: canary, current_deployment: { error: canary } } }));
  assert.deepEqual(await f.run('deleteProjectBranchFunction', args), expected);
});

test('Function delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('deleteProjectBranchFunction', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteProjectBranchFunction', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Function delete: maximum/minimum copied IDs work; slug/path/header injection refuses before fetch', async () => {
  for (const config of [{ ...scope, projectId: 'a', branchId: 'a', functionId: 'a', functionSlug: 'a' },
    { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), functionId: 'f'.repeat(80), functionSlug: 's'.repeat(20), revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('deleteProjectBranchFunction', { project_id: config.projectId, branch_id: config.branchId, slug: config.functionSlug }), expected);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(21), 'id.with.dot', 'A']) assert.throws(() => transport.deleteProjectBranchFunction('project-a', 'br-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) {
    assert.throws(() => transport.deleteProjectBranchFunction(bad, 'br-a', scope.functionSlug, options));
    assert.throws(() => transport.deleteProjectBranchFunction('project-a', bad, scope.functionSlug, options));
  }
  await assert.rejects(transport.deleteProjectBranchFunction('project-a', 'br-a', scope.functionSlug, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchFunction('project-a', 'br-a', scope.functionSlug, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
