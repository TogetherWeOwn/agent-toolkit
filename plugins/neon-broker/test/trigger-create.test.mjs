import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonTriggerCreateOperations } from '../dist/plugins/neon-broker/src/trigger-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { triggerCreateFixture as fixture, triggerCreateArgs as args, triggerCreateScope as scope,
  triggerCreateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'createProjectBranchTrigger';
const expected = { trigger_id: 'tr-new', version: 1, acknowledged: true };
const trigger = receipt.trigger;
const functionResponse = { function: { id: 'fn-a', slug: 'hello' } };
const base = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`;
const defaultGet = url => response(url.endsWith('/triggers') ? { triggers: [] } : functionResponse);

test('Trigger create: function and visible-name preflights then one explicitly disabled daily POST', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${base}/functions/hello`, 'GET'], [`${base}/triggers`, 'GET'], [`${base}/triggers`, 'POST']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'POST' ? '{"type":"schedule","function_slug":"hello","name":"daily-a","function_path":"/","schedule":{"cron":"5 9 * * *"},"enabled":false}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'POST' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  const p = op.prepare(args);
  assert.equal(op.tier, 'write');
  assert.equal(op.lifecycle, 'none');
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/functions/hello/triggers/daily-a/create');
  assert.deepEqual(p.plan.diff, { before: 'selected_trigger_name_absent', after: {
    type: 'schedule', function_slug: 'hello', name: 'daily-a', function_path: '/', schedule: { cron: '5 9 * * *' }, enabled: false } });
  for (const key of ['atomicCompareAndSwap', 'inactivityVerified', 'persistenceVerified', 'committedInvocationsCancelled']) assert.equal(p.plan[key], false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Trigger create: copied strict scope and exact prepared plan reject schedule/enabling/identity overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonTriggerCreateOperations(config, {});
  config.functionId = 'other';
  assert.equal(op.prepare(args).plan.function_id, 'fn-a');
  for (const raw of [null, [], {}, ...Object.keys(args).map(k => ({ ...args, [k]: 'other' })),
    ...['type', 'schedule', 'cron', 'function_path', 'enabled', 'approved', 'credential', 'runtimeContext', 'revision', 'retry'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/create', '') } },
    ...['function_id', 'effect', 'diff', 'preflight', 'inactivityVerified'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Trigger create: exact stable function binding refuses missing/foreign/replaced functions before list or POST', async () => {
  for (const raw of [null, {}, { function: null }, ...[{ id: 'other' }, { slug: 'other' }, { branch_id: 'br-b' }, { project_id: 'other' }, { pagination: {} }]
    .map(change => ({ function: { ...functionResponse.function, ...change } })),
    ...[{ branch_id: 'br-b' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ ...functionResponse, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(() => response(functionResponse, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Trigger create: inherited or local existing names refuse; validate entire bounded visible list before absence', async () => {
  const other = { trigger_id: 'tr-other', name: 'other' };
  for (const raw of [null, {}, { triggers: null }, { triggers: [trigger] }, { triggers: [{ ...trigger, inherited: true }] },
    { triggers: [other, other] }, { triggers: [other, { ...other, name: 'different' }] }, { triggers: [other, { ...other, trigger_id: 'tr-another' }] },
    { triggers: Array.from({ length: 31 }, (_, n) => ({ trigger_id: `tr-${n}`, name: `other${n}` })) },
    ...[{ trigger_id: '' }, { name: '' }, { name: 'x'.repeat(257) }, { name: 'x\n' }, { project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(change => ({ triggers: [{ ...other, ...change }] })),
    ...[{ branch_id: 'br-b' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ triggers: [], ...change }))]) {
    const f = fixture(url => url.endsWith('/triggers') ? response(raw) : defaultGet(url));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
  const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) :
    url.endsWith('/triggers') ? response({ triggers: [other] }) : defaultGet(url));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Trigger create: exact201 disabled/local/name/path/cron/next-run echo and safe version required', async () => {
  const bad = [null, {}, { trigger: null }, ...[{ trigger_id: '' }, { type: 'storage_object_created' }, { function_slug: 'other' }, { name: 'other' },
    { function_path: '/other' }, { enabled: true }, { enabled: 0 }, { inherited: true }, { next_run_at: '2026-11-10T09:05:00Z' },
    { next_run_at: undefined }, { version: 0 }, { version: 1.5 }, { version: Number.MAX_SAFE_INTEGER + 1 }, { schedule: { cron: '0 0 * * *' } },
    { schedule: { cron: '5 9 * * *', extra: true } }, { project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(change => ({ trigger: { ...trigger, ...change } })),
    { ...receipt, project_id: 'other' }, { ...receipt, pagination: {} }];
  for (const raw of bad) {
    const f = fixture((url, init) => init.method === 'POST' ? response(raw, { status: 201 }) : defaultGet(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
  }
});

test('Trigger create: documented dotted and 128-character server IDs acknowledge; malformed IDs stay uncertain', async () => {
  const [op] = createNeonTriggerCreateOperations(scope, {});
  for (const trigger_id of ['t', 'tr.new', 't'.repeat(81), 't'.repeat(128)]) {
    const raw = { trigger: { ...trigger, trigger_id } };
    const f = fixture(raw);
    assert.deepEqual(await f.run(name, args), { ...expected, trigger_id });
    assert.equal(f.requests.length, 3);
    assert.deepEqual(op.project(raw), { ...expected, trigger_id });
  }
  for (const trigger_id of ['', 't'.repeat(129), '.tr', 'tr/new', 'tr\n', 123]) {
    const raw = { trigger: { ...trigger, trigger_id } };
    assert.throws(() => op.project(raw));
    const f = fixture(raw);
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
});

test('Trigger create: ambiguous POST observes once and never promotes presence/absence/replacement to success', async () => {
  for (const after of [{ triggers: [] }, { triggers: [trigger] }, { triggers: [{ ...trigger, enabled: true }] }, null, {}, { triggers: [], branch_id: 'br-b' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return n === 4 ? response(after) : defaultGet(url);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
    assert.equal(f.requests[3].url, `${base}/triggers`);
  }
});

test('Trigger create: non201/status/MIME/redirect/body/size failures remain uncertain without mutation retry', async () => {
  for (const make of [...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    () => new Response(canary, { status: 201, headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { status: 201, headers: { 'content-type': 'application/json' } }),
    ...['bad', '65537'].map(length => () => response(receipt, { status: 201, headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { status: 201, headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : defaultGet(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
});

test('Trigger create: unused metadata never evaluates and detached projection validates independently', async () => {
  const ignored = raw => {
    for (const k of ['deployment', 'created_at', 'error', 'invocation_url', 'storage_object_created', 'password']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonTriggerCreateOperations(scope, {
    async getProjectBranchFunction() { return { function: ignored({ id: 'fn-a', slug: 'hello' }) }; },
    async listProjectBranchTriggers() { return { triggers: [ignored({ trigger_id: 'tr-other', name: 'other' })] }; },
    async createProjectBranchTrigger() { return ignored({ trigger: ignored({ ...trigger }) }); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { trigger: { ...trigger, enabled: true } },
    { trigger: Object.defineProperty({}, 'trigger_id', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...receipt, ignored: canary }), expected);
});

test('Trigger create: cancellation and fetch/body deadlines bound all preflights and the single POST', async () => {
  for (const stopAt of [1, 2, 3]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? response(receipt, { status: 201 }) : defaultGet(url);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 3 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : defaultGet(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
});

test('Trigger create: shared canonical parsers, boundary daily times and direct transport refusals', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: '../x' }, { functionSlug: 'a-b' }, { functionSlug: 'a'.repeat(21) },
    { name: '' }, { name: 'x'.repeat(41) }, { name: 'a/b' }, { name: 'a\n' }, { hour: -0 }, { hour: 24 }, { minute: 60 }, { minute: 1.5 }, { enabled: true }, { revision: '' }]) assert.throws(() => createNeonTriggerCreateOperations({ ...scope, ...change }, {}));
  for (const [hour, minute] of [[0, 0], [23, 59]]) {
    const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), functionId: 'f'.repeat(80), functionSlug: 'f'.repeat(20), name: 'n'.repeat(40), revision: 'r'.repeat(80), hour, minute };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, function_slug: config.functionSlug, name: config.name, hour, minute }), expected);
    assert.equal(JSON.parse(f.requests[2].init.body).schedule.cron, `${minute} ${hour} * * *`);
    assert.equal(JSON.parse(f.requests[2].init.body).enabled, false);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const params of [['../p', 'br-a', 'hello', 'daily-a', 9, 5], ['project-a', '../b', 'hello', 'daily-a', 9, 5],
    ['project-a', 'br-a', 'a-b', 'daily-a', 9, 5], ['project-a', 'br-a', 'hello', '../x', 9, 5],
    ['project-a', 'br-a', 'hello', 'daily-a', 24, 5], ['project-a', 'br-a', 'hello', 'daily-a', 9, 60]]) assert.throws(() => t.createProjectBranchTrigger(...params, options));
  await assert.rejects(t.createProjectBranchTrigger('project-a', 'br-a', 'hello', 'daily-a', 9, 5, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
