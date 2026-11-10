import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonFunctionUpdateOperations } from '../dist/plugins/neon-broker/src/function-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { functionUpdateFixture as fixture, functionUpdateArgs as args, functionUpdateScope as scope,
  functionUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'updateProjectBranchFunction';
const before = { function: { id: 'fn-a', slug: 'hello', name: 'Before' } };
const expected = { id: 'fn-a', slug: 'hello', acknowledged: true };

test('Function rename: stable ID/slug/name preflight then one display-name-only PATCH and closed acknowledgement', async () => {
  const f = fixture(receipt);
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/functions/hello`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PATCH']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PATCH' ? '{"name":"After"}' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'write');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/functions/hello/rename');
  assert.deepEqual(p.plan.diff, { before: 'Before', after: 'After' });
  assert.equal(p.plan.function_id, 'fn-a');
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.inheritedUpdate, 'provider_refuses');
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Function rename: copied scope and caller authority/source/null/trim overrides or tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonFunctionUpdateOperations(config, {});
  config.name = 'Different';
  assert.equal(op.prepare(args).plan.name, 'After');
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'slug', 'name'].map(k => ({ ...args, [k]: 'other' })),
    { ...args, name: null }, { ...args, name: ' After ' },
    ...['function_id', 'source', 'deployment', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture(receipt);
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/rename', '/delete') } },
    ...['function_id', 'name', 'preflight', 'inheritedUpdate', 'diff'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Function rename: stale label, replaced ID/slug, foreign ancestry or unavailable detail never mutate', async () => {
  for (const raw of [null, {}, [], { function: {} },
    ...[{ id: 'fn-b' }, { slug: 'other' }, { name: 'After' }, { name: null }, { name: 'other' },
      { branch_id: 'br-b' }, { project_id: 'other' }, { function_id: 'fn-b' }, { pagination: {} }].map(change => ({ function: { ...before.function, ...change } })),
    ...[{ project_id: 'other' }, { branch_id: 'br-b' }, { function_id: 'fn-b' }, { pagination: {} }].map(change => ({ ...before, ...change }))]) {
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

test('Function rename: ambiguity observes once and never promotes desired label, absence or replacement to success', async () => {
  for (const after of [before, receipt, { function: { ...before.function, id: 'fn-b' } }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? before : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => response(n === 1 ? before : {}, { status: n === 1 ? 200 : 404 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Function rename: only exact200 stable identity and desired label acknowledge; inherited-only provider404 stays uncertain', async () => {
  for (const raw of [null, {}, [], { function: {} },
    ...[{ id: 'fn-b' }, { slug: 'other' }, { name: 'Before' }, { name: null }, { name: 'After ' }, { project_id: 'other' },
      { branch_id: 'br-b' }, { function_id: 'fn-b' }, { pagination: {} }].map(change => ({ function: { ...receipt.function, ...change } })),
    ...[{ project_id: 'other' }, { branch_id: 'br-b' }, { function_id: 'fn-b' }, { pagination: {} }].map(change => ({ ...receipt, ...change }))]) {
    const f = fixture((url, init) => response(init.method === 'PATCH' ? raw : before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
  }
  for (const status of [201, 202, 204, 302, 403, 404, 409, 500]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? new Response(null, { status }) : response(before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Function rename: MIME, redirect, response and header bounds fail uncertain without mutation retry', async () => {
  for (const make of [() => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(before));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Function rename: invocation/deployment/diagnostic metadata never evaluate; labels excluded from ordinary closed acknowledgement', async () => {
  const row = value => {
    const fn = { ...value.function };
    for (const k of ['invocation_url', 'current_deployment', 'active_deployment', 'environment', 'password', 'error', 'created_at']) Object.defineProperty(fn, k, { get() { throw Error('unused'); }, enumerable: true });
    return { function: fn };
  };
  const [op] = createNeonFunctionUpdateOperations(scope, {
    async getProjectBranchFunction() { return row(before); }, async updateProjectBranchFunction() { return row(receipt); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, Object.defineProperty({}, 'function', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Function rename: abort and ignored fetch/body deadlines bound a single mutation attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'PATCH' ? receipt : before);
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

test('Function rename: canonical target/name bounds align with transport; clearing, whitespace and unsafe paths refuse', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: '-b' }, { branchId: 'b'.repeat(61) },
    { functionId: '' }, { functionSlug: 'a-b' }, { functionSlug: 'a'.repeat(21) }, { expectedName: null }, { expectedName: ' Before ' },
    { name: null }, { name: 'n'.repeat(81) }, { name: 'Before' }, { name: ' After ' }, { name: 'a\n' },
    { name: 'https://example.invalid' }, { revision: '' }, { source: 'new' }]) assert.throws(() => createNeonFunctionUpdateOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), functionId: 'f'.repeat(80),
      functionSlug: 's'.repeat(size === 1 ? 1 : 20), expectedName: 'B'.repeat(80), name: 'A'.repeat(80) };
    assert.deepEqual(await fixture(null, config).run(name, { project_id: config.projectId, branch_id: config.branchId, slug: config.functionSlug, name: config.name }),
      { id: config.functionId, slug: config.functionSlug, acknowledged: true });
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of [null, '', ' A ', 'a\n', 'n'.repeat(81)]) assert.throws(() => t.updateProjectBranchFunction('project-a', 'br-a', 'hello', bad, options));
  for (const bad of ['../fn', 'a-b', 's'.repeat(21)]) assert.throws(() => t.updateProjectBranchFunction('project-a', 'br-a', bad, 'After', options));
  await assert.rejects(t.updateProjectBranchFunction('project-a', 'br-a', 'hello', 'After', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
