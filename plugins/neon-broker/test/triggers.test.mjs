import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonTriggerOperations, TRIGGER_OPERATIONS, MAX_TRIGGER_BINDINGS } from '../dist/plugins/neon-broker/src/triggers.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { triggerCases as cases, triggerFixture as fixture, triggerScope as scope, neonTrigger as trigger, canary, response } from './helpers.mjs';

const poison = { name: canary, function_path: canary, schedule: { cron: canary },
  storage_object_created: { bucket_name: canary, prefix: canary }, next_run_at: canary, password: canary };
const wrap = (name, value) => name === 'getProjectBranchTrigger' ? { trigger: value } : { triggers: [value] };
for (const [name, args, raw, expected] of cases) {
  test(`${name}: exact authenticated GET and closed trigger status projection`, async () => {
    const f = fixture(wrap(name, { ...trigger, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const suffix = `branches/br-a/triggers${args.trigger_id ? '/tr-a' : ''}`;
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/${suffix}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(f.operation(name).prepare(args).resource.id, `neon/projects/project-a/${suffix}`);
    assert.equal(f.operation(name).tier, 'read');
    assert.equal(f.operation(name).lifecycle, 'none');
    assert.equal(f.operation(name).timeoutMs, 3500);
  });

  test(`${name}: strict arguments refuse caller authority, paths and unbound targets`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'enabled', 'schedule'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', true, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates target, revision and abort before fetch`, async () => {
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

  test(`${name}: wrong identity, ancestry, state or configuration version refuse`, async () => {
    for (const value of [null, [], {}, { ...trigger, function_slug: 'other' }, { ...trigger, project_id: 'other' },
      { ...trigger, branch_id: 'br-b' }, { ...trigger, pagination: {} }, { ...trigger, type: 'unknown' },
      ...['enabled', 'inherited'].flatMap(key => [null, 0, 'false'].map(value => ({ ...trigger, [key]: value }))),
      ...[null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map(version => ({ ...trigger, version })),
    ]) await assert.rejects(fixture(wrap(name, value)).run(name, args));
    for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' }, { ...raw, pagination: {} }]) {
      await assert.rejects(fixture(value).run(name, args));
    }
    if (name === 'getProjectBranchTrigger') {
      for (const value of [{ ...trigger, trigger_id: 'unlisted' }, { ...trigger, trigger_id: 'tr-b', function_slug: 'other' }]) {
        await assert.rejects(fixture(wrap(name, value)).run(name, args));
      }
    }
    assert.deepEqual(await fixture(wrap(name, { ...trigger, project_id: 'project-a', branch_id: 'br-a' })).run(name, args), expected);
  });

  test(`${name}: both trigger types, enabled/inherited states and safe integer versions remain distinct`, async () => {
    for (const type of ['schedule', 'storage_object_created']) for (const enabled of [false, true]) for (const inherited of [false, true]) {
      const value = { ...trigger, type, enabled, inherited, version: Number.MAX_SAFE_INTEGER };
      assert.deepEqual(await fixture(wrap(name, value)).run(name, args), wrap(name, value));
    }
    const inherited = { ...trigger, enabled: false, inherited: true };
    assert.deepEqual(await fixture(wrap(name, inherited)).run(name, { ...args, branch_id: 'br-b' }), wrap(name, inherited));
    const op = fixture(raw).operation(name);
    for (const key of ['trigger_id', 'function_slug', 'type', 'enabled', 'inherited', 'version', 'project_id', 'branch_id', 'pagination']) {
      assert.throws(() => op.project({ branch_id: 'br-a', ...wrap(name,
        Object.defineProperty({ ...trigger }, key, { get() { throw Error('getter'); }, enumerable: true })) }));
    }
    assert.deepEqual(op.project({ branch_id: 'br-a', ...wrap(name,
      Object.defineProperty({ ...trigger }, 'schedule', { get() { throw Error('unused getter'); }, enumerable: true })) }), expected);
    assert.throws(() => op.project({ branch_id: 'br-a', ...wrap(name, { ...trigger, version: -0 }) }));
  });

  test(`${name}: unavailable beta endpoints, invalid content and credential failures never fall back`, async () => {
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
    const f = fixture(raw);
    await assert.rejects(f.operation(name).execute(f.operation(name).prepare(args), `${canary}\n`, new AbortController().signal));
    assert.equal(f.requests.length, 0);
  });
}

test('trigger lists are nonpaginated, bounded, unique and filter only unselected effective branch bindings', async () => {
  const [name, args] = cases[0];
  assert.deepEqual(await fixture({ triggers: [] }).run(name, args), { triggers: [] });
  assert.deepEqual(await fixture({ triggers: [{ trigger_id: 'provider.unselected', ...poison }, trigger] }).run(name, args), { triggers: [trigger] });
  // Project-wide IDs inherited on a branch are not selected without that branch's binding.
  assert.deepEqual(await fixture({ triggers: [{ ...trigger, trigger_id: 'tr-b', function_slug: 'other' }] }).run(name,
    { ...args, branch_id: 'br-b' }), { triggers: [] });
  const values = Array.from({ length: 29 }, (_, n) => ({ trigger_id: `unselected.${n}` }));
  assert.deepEqual(await fixture({ triggers: [...values, trigger] }).run(name, args), { triggers: [trigger] });
  for (const triggers of [[trigger, trigger], Array(31).fill(trigger), [{ ...trigger, trigger_id: '../escape' }],
    [trigger, { trigger_id: 'unselected', branch_id: 'br-b' }]]) await assert.rejects(fixture({ triggers }).run(name, args));
  for (const pagination of [{}, { next: 'more' }, { cursor: 'more' }, null]) await assert.rejects(fixture({ triggers: [], pagination }).run(name, args));
  const op = fixture({}).operation(name);
  for (const triggers of [new Array(1), Object.assign([trigger], { extra: canary }),
    Object.defineProperty([trigger], '0', { get() { throw Error('getter'); }, enumerable: true })]) {
    assert.throws(() => op.project({ branch_id: 'br-a', triggers }));
  }
});

test('trigger scope copies unique effective bindings and contains no scheduling or mutation tools', () => {
  const config = structuredClone(scope);
  const ops = createNeonTriggerOperations(config, {});
  config.triggers[0].functionSlug = 'changed';
  config.branchIds.push('unlisted');
  assert.equal(ops[1].prepare(cases[1][1]).resource.revision, 'scope-v1');
  for (const changed of [{ triggers: [scope.triggers[0], scope.triggers[0]] },
    { triggers: [{ ...scope.triggers[0], branchId: 'unlisted' }] }, { branchIds: ['br-a', 'br-a'] },
    { triggers: [{ ...scope.triggers[0], id: 'has.dot' }] }, { triggers: [{ ...scope.triggers[0], id: 'x'.repeat(81) }] },
    { triggers: [{ ...scope.triggers[0], functionSlug: 'has-hyphen' }] }, { triggers: new Array(1) },
    { branchIds: Array.from({ length: MAX_TRIGGER_BINDINGS + 1 }, (_, n) => `br-${n}`) },
    { triggers: Array.from({ length: MAX_TRIGGER_BINDINGS + 1 }, (_, n) => ({ id: `tr-${n}`, branchId: 'br-a', functionSlug: 'hello' })) }, { approved: true },
  ]) assert.throws(() => createNeonTriggerOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(ops.map(op => op.name), TRIGGER_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['createProjectBranchTrigger', 'updateProjectBranchTrigger', 'deleteProjectBranchTrigger', 'invoke', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('trigger transport rejects path injection and unsupported selected IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а', 'has.dot', 'x'.repeat(81)]) {
    assert.throws(() => transport.listProjectBranchTriggers(bad, 'br-a', options));
    assert.throws(() => transport.listProjectBranchTriggers('project-a', bad, options));
    assert.throws(() => transport.getProjectBranchTrigger(bad, 'br-a', 'tr-a', options));
    assert.throws(() => transport.getProjectBranchTrigger('project-a', bad, 'tr-a', options));
    assert.throws(() => transport.getProjectBranchTrigger('project-a', 'br-a', bad, options));
  }
  assert.equal(calls, 0);
});
