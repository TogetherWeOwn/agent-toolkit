import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonFunctionOperations, FUNCTION_OPERATIONS, MAX_FUNCTION_BINDINGS } from '../dist/plugins/neon-broker/src/functions.js';
import { createNeonMetadataTransport, NEON_ORIGIN, PAGE_SIZE, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { functionCases as cases, functionFixture as fixture, functionScope as scope, neonFunction as fn, canary, response } from './helpers.mjs';

const poison = { name: canary, invocation_url: canary, created_at: canary, source: canary, password: canary };
const deploymentPoison = { environment: [canary], error: canary, runtime: canary, memory_mib: 128, created_at: canary };
const wrap = (name, value) => name === 'getProjectBranchFunction' ? { function: value } : { functions: [value] };
for (const [name, args, raw, expected] of cases) {
  test(`${name}: exact authenticated GET and closed function/deployment metadata`, async () => {
    const f = fixture(wrap(name, { ...fn, ...poison,
      current_deployment: { ...fn.current_deployment, ...deploymentPoison },
      active_deployment: { ...fn.active_deployment, ...deploymentPoison } }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const suffix = `branches/br-a/functions${args.slug ? '/hello' : ''}`;
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/${suffix}${args.slug ? '' : '?limit=10'}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: strict canonical requests reject caller authority and cross-resource input`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'source', 'environment'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', true, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execute revalidates exact resources, scope and abort before fetch`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/sibling` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: contradictory parents, wrong selected identity and malformed deployment refuse`, async () => {
    for (const value of [null, [], {}, { ...fn, id: 'fn-b', slug: 'other' }, { ...fn, slug: 'different' },
      { ...fn, id: 'unlisted', slug: 'hello' }, { ...fn, project_id: 'other' }, { ...fn, branch_id: 'br-b' }, { ...fn, pagination: {} },
      ...['current_deployment', 'active_deployment'].flatMap(key => [null, {}, { id: 1, status: 'unknown' }, { id: -1, status: 'completed' },
        { id: 2.5, status: 'completed' }, { id: 2 ** 31, status: 'completed' }].map(value => ({ ...fn, [key]: value }))),
      { ...fn, active_deployment: { id: 1, status: 'building' } },
    ]) await assert.rejects(fixture(wrap(name, value)).run(name, args));
    for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' }]) {
      await assert.rejects(fixture(value).run(name, args));
    }
    assert.deepEqual(await fixture(wrap(name, { ...fn, project_id: 'project-a', branch_id: 'br-a' })).run(name, args), expected);
    const op = fOperation(name);
    for (const key of ['id', 'slug', 'current_deployment', 'active_deployment', 'project_id', 'branch_id', 'pagination']) {
      assert.throws(() => op.project(wrap(name, Object.defineProperty({ ...fn }, key, { get() { throw Error('getter'); }, enumerable: true }))));
    }
    assert.deepEqual(op.project(wrap(name, Object.defineProperty({ ...fn }, 'invocation_url', { get() { throw Error('unused getter'); }, enumerable: true }))), expected);
    assert.throws(() => op.project(wrap(name, { ...fn, current_deployment: { id: -0, status: 'completed' } })));
  });

  test(`${name}: optional deployments stay absent and all known current states are preserved`, async () => {
    const minimal = { id: fn.id, slug: fn.slug };
    assert.deepEqual(await fixture(wrap(name, minimal)).run(name, args), wrap(name, minimal));
    for (const status of ['pending', 'building', 'completed', 'failed']) {
      const value = { ...minimal, current_deployment: { id: 0, status } };
      assert.deepEqual(await fixture(wrap(name, value)).run(name, args), wrap(name, value));
    }
  });

  test(`${name}: unavailable beta endpoints and unsafe transport never produce fabricated status or fallback`, async () => {
    for (const status of [404, 403, 500, 302]) {
      const f = fixture(() => response(poison, { status }));
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
      () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
  });
}
function fOperation(name) { return fixture({}).operation(name); }

test('function list pagination is bounded, encoded, unique and never silently truncated', async () => {
  const [name, args] = cases[0];
  const f = fixture((url, init, n) => response(n === 1 ? { functions: [], pagination: { next: 'opaque/+?&=' } } : { functions: [fn] }));
  assert.deepEqual(await f.run(name, args), { functions: [fn] });
  assert.equal(f.requests.length, 2);
  const query = new URL(f.requests[1].url).searchParams;
  assert.equal(query.get('cursor'), 'opaque/+?&=');
  assert.equal(query.get('limit'), String(PAGE_SIZE));
  assert.deepEqual(await fixture({ functions: [] }).run(name, args), { functions: [] });
  for (const pagination of [undefined, {}]) {
    const terminal = fixture({ functions: [fn], ...(pagination === undefined ? {} : { pagination }) });
    assert.deepEqual(await terminal.run(name, args), { functions: [fn] });
    assert.equal(terminal.requests.length, 1);
  }
  for (const value of [null, { next: '' }, { next: 'x\n' }, { next: 'x'.repeat(257) }, { cursor: 'x' }, { next: 'x', limit: 10 }, { sort_order: 'asc' }]) {
    await assert.rejects(fixture({ functions: [], pagination: value }).run(name, args));
  }
  const cycle = fixture({ functions: [], pagination: { next: 'same' } });
  await assert.rejects(cycle.run(name, args));
  assert.equal(cycle.requests.length, 2);
  const overflow = fixture((url, init, n) => response({ functions: [], pagination: { next: `page-${n}` } }));
  await assert.rejects(overflow.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(overflow.requests.length, 3);
  const duplicates = fixture((url, init, n) => response(n === 1 ? { functions: [fn], pagination: { next: 'next' } } : { functions: [fn] }));
  await assert.rejects(duplicates.run(name, args));
  await assert.rejects(fixture({ functions: Array(11).fill(fn) }).run(name, args));
  const aborted = new AbortController();
  const cancelled = fixture(() => { aborted.abort(); return response({ functions: [], pagination: { next: 'next' } }); });
  await assert.rejects(cancelled.run(name, args, aborted.signal));
  assert.equal(cancelled.requests.length, 1);
});

test('function list filters unrelated DNS-label functions but never hides a changed trusted slug binding', async () => {
  const [name, args] = cases[0];
  assert.deepEqual(await fixture({ functions: [{ id: 'provider:unselected', slug: 'other-function', ...poison }, fn] }).run(name, args), { functions: [fn] });
  for (const functions of [[fn, { ...fn, id: 'unlisted' }], [{ ...fn, id: 'unlisted' }], [{ ...fn, id: 'fn-b', slug: 'other' }]]) {
    await assert.rejects(fixture({ functions }).run(name, args));
  }
  const op = fOperation(name);
  for (const functions of [new Array(1), Object.assign([fn], { extra: canary }),
    Object.defineProperty([fn], '0', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project({ functions }));
  assert.throws(() => op.project({ functions: Array(31).fill(fn) }));
  assert.throws(() => op.project({ functions: [fn], pagination: { next: 'more' } }));
});

test('function scope copies bounded unique ID/slug/branch bindings and offers no deploy/invoke tools', () => {
  const config = structuredClone(scope);
  const ops = createNeonFunctionOperations(config, {});
  config.functions[0].slug = 'changed';
  config.branchIds.push('unlisted');
  assert.equal(ops[1].prepare(cases[1][1]).resource.revision, 'scope-v1');
  for (const changed of [{ functions: [scope.functions[0], scope.functions[0]] },
    { functions: [{ ...scope.functions[0], branchId: 'unlisted' }] }, { branchIds: ['br-a', 'br-a'] },
    { functions: [{ ...scope.functions[0], slug: 'has-hyphen' }] }, { functions: [{ ...scope.functions[0], slug: 'x'.repeat(21) }] },
    { functions: new Array(1) }, { branchIds: Array.from({ length: MAX_FUNCTION_BINDINGS + 1 }, (_, n) => `br-${n}`) }, { approved: true },
  ]) assert.throws(() => createNeonFunctionOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(ops.map(op => op.name), FUNCTION_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['createProjectBranchFunction', 'deployProjectBranchFunction', 'deleteProjectBranchFunction', 'invoke', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('function transport rejects path/cursor injection and noncanonical detail slugs without fetching', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а']) {
    assert.throws(() => transport.getProjectBranchFunction(bad, 'br-a', 'hello', options));
    assert.throws(() => transport.getProjectBranchFunction('project-a', bad, 'hello', options));
    assert.throws(() => transport.listProjectBranchFunctions(bad, 'br-a', null, options));
    assert.throws(() => transport.listProjectBranchFunctions('project-a', bad, null, options));
  }
  for (const bad of ['has-hyphen', 'has_underscore', 'UPPER', '', 'x'.repeat(21), 'x\n', 'x/y']) {
    assert.throws(() => transport.getProjectBranchFunction('project-a', 'br-a', bad, options));
  }
  for (const bad of ['', 'x\n', 'x'.repeat(257), 1]) assert.throws(() => transport.listProjectBranchFunctions('project-a', 'br-a', bad, options));
  assert.equal(calls, 0);
});
