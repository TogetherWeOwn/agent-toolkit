import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchConsumptionOperations, BRANCH_CONSUMPTION_OPERATIONS } from '../dist/plugins/neon-broker/src/branch-consumption.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { branchConsumptionCases as cases, branchConsumptionFixture as fixture, branchConsumptionScope as scope,
  consumptionPeriod as period, consumptionFrame as frame, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const withPeriods = periods => ({ branches: [{ project_id: 'project-a', branch_id: 'br-a', periods }] });
const withFrames = consumption => withPeriods([{ ...period, consumption }]);
const metric = value => ({ ...frame, metrics: [{ metric_name: 'compute_unit_seconds', value }] });

test('branch consumption: fixed filtered GET, pinned hourly window and closed metric output', async () => {
  const f = fixture(withPeriods([{ ...period, period_plan: canary, password: canary,
    consumption: [{ ...frame, diagnostics: canary, url: canary }] }]));
  assert.deepEqual(await f.run(name, args), expected);
  const { url, init } = f.requests[0];
  const parsed = new URL(url);
  assert.equal(parsed.origin, NEON_ORIGIN);
  assert.equal(parsed.pathname, '/api/v2/consumption_history/v2/branches');
  assert.deepEqual(Object.fromEntries(parsed.searchParams), { limit: '10', org_id: 'org-a', project_ids: 'project-a', branch_ids: 'br-a',
    from: scope.from, to: scope.to, granularity: 'hourly', metrics: 'compute_unit_seconds' });
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  assert.equal(f.requests.length, 1);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/organizations/org-a/projects/project-a/branches/br-a/consumption/v2', revision: 'scope-v1' });
  assert.deepEqual(op.prepare(args).plan, { operation: name, ...args, granularity: 'hourly', metrics: ['compute_unit_seconds'] });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ branches: [] }).run(name, args), { branches: [] });
  assert.deepEqual(await fixture(withPeriods([])).run(name, args), { branches: [{ project_id: 'project-a', branch_id: 'br-a', consumption: [] }] });
  for (const value of [0, Number.MAX_SAFE_INTEGER]) {
    assert.equal((await fixture(withFrames([metric(value)])).run(name, args)).branches[0].consumption[0].compute_unit_seconds, value);
  }
});

test('branch consumption: strict exact arguments and immutable copied scope prevent widened history', () => {
  const config = { ...scope };
  const [op] = createNeonBranchConsumptionOperations(config, {});
  config.organizationId = 'other'; config.branchId = 'other'; config.projectId = 'other'; config.from = scope.to; config.revision = 'changed';
  assert.equal(Object.getPrototypeOf(op.prepare(args).arguments), null);
  assert.deepEqual({ ...op.prepare(args).arguments }, args);
  for (const value of [null, [], {}, { ...args, org_id: 'other' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' },
    { ...args, from: '2026-11-06T00:00:00Z' }, { ...args, to: '2026-11-07T01:00:00Z' },
    ...['agent', 'approved', 'credential', 'url', 'project_ids', 'cursor', 'limit', 'granularity', 'metrics'].map(key => ({ ...args, [key]: canary })),
    ...['', '../escape', 'x/y', 'x\n', 'Upper', 'аbc', 'x'.repeat(61)].map(project_id => ({ ...args, project_id })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'from', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => op.prepare(value));
  for (const change of [{ extra: true }, { organizationId: '' }, { projectId: 'Upper' }, { branchId: 'Upper' }, { revision: '' },
    { from: '2026-02-30T00:00:00Z' }, { from: '2023-01-01T00:00:00Z' }, { from: scope.to },
    { to: '2026-11-08T01:00:00Z' }, { from: '2026-11-07T00:30:00Z' }, { from: '2026-11-07T00:00:00+00:00' },
  ]) assert.throws(() => createNeonBranchConsumptionOperations({ ...scope, ...change }, {}));
  assert.deepEqual([op.name], BRANCH_CONSUMPTION_OPERATIONS.map(value => `neon.${value}`));
});

test('branch consumption: detached resource, revision, window and cancellation revalidate before transport', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a' },
    { ...prepared.resource, revision: 'changed' }, { ...prepared.resource, id: prepared.resource.id.replace('org-a', 'org-b') }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, from: scope.to } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('branch consumption: malformed metrics, foreign identity, duplicate periods and invalid timeframes refuse', async () => {
  for (const value of [null, [], {}, { branches: null }, { ...raw, org_id: 'other' }, { ...raw, branch_id: 'br-b' }, { branches: [{ ...raw.branches[0], branch_id: 'br-b' }] },
    { branches: [{ ...raw.branches[0], project_id: 'other' }] }, { branches: [raw.branches[0], raw.branches[0]] },
    withPeriods([period, period]), withPeriods([{ ...period, period_id: 'bad' }]),
    withPeriods([{ ...period, org_id: 'other' }]), withPeriods([{ ...period, period_start: scope.to }]),
    withPeriods([{ ...period, period_end: scope.from }]), withPeriods([{ ...period, pagination: {} }]),
    withFrames([frame, frame]), withFrames([{ ...frame, timeframe_start: '2026-11-06T23:00:00Z' }]),
    withFrames([{ ...frame, timeframe_end: '2026-11-07T02:00:00Z' }]),
    withFrames([{ ...frame, timeframe_start: scope.to, timeframe_end: '2026-11-08T01:00:00Z' }]),
    withFrames([{ ...frame, metrics: [] }]), withFrames([{ ...frame, metrics: [...frame.metrics, ...frame.metrics] }]),
    withFrames([{ ...frame, metrics: [{ metric_name: 'unrequested', value: 1 }] }]),
    withFrames([{ ...frame, metrics: [{ metric_name: 'compute_unit_seconds' }] }]),
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, true].map(value => withFrames([metric(value)])),
    { branches: Array.from({ length: 11 }, () => raw.branches[0]) },
    withPeriods(Array.from({ length: 31 }, () => period)),
    withFrames(Array.from({ length: 25 }, () => frame)),
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  assert.throws(() => op.project({ ...raw, pagination: { cursor: 'next' } }));
  assert.throws(() => op.project({ branches: new Array(1) }));
  assert.throws(() => op.project(Object.defineProperty({ ...raw }, 'branches', { get() { throw Error('getter'); }, enumerable: true })));
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'diagnostic', { get() { throw Error('unused'); }, enumerable: true })), expected);
});

test('branch consumption: 24 hourly buckets, billing boundary and missing-data gaps remain distinct from zero', async () => {
  const frames = Array.from({ length: 24 }, (_, n) => ({ ...frame,
    timeframe_start: `2026-11-07T${String(n).padStart(2, '0')}:00:00Z`,
    timeframe_end: n === 23 ? scope.to : `2026-11-07T${String(n + 1).padStart(2, '0')}:00:00Z` }));
  const periods = [{ ...period, period_end: '2026-11-07T12:00:00Z', consumption: frames.slice(0, 12) },
    { ...period, period_id: '00000000-0000-0000-0000-000000000002', period_start: '2026-11-07T12:00:00Z', consumption: frames.slice(12) }];
  assert.equal((await fixture(withPeriods(periods)).run(name, args)).branches[0].consumption.length, 24);
  assert.equal((await fixture(withFrames([frames[0], frames[23]])).run(name, args)).branches[0].consumption.length, 2);
  await assert.rejects(fixture(withPeriods(periods.toReversed())).run(name, args));
});

test('branch consumption: billing boundaries accept non-hour timestamps, offsets and milliseconds without rounding', async () => {
  const op = fixture(raw).operation(name);
  for (const [period_start, period_end] of [
    ['2026-11-01T00:15:00Z', '2026-11-07T01:15:00Z'],
    ['2026-11-01T00:15:00.123Z', '2026-11-07T01:00:00.001Z'],
    ['2026-11-07T01:00:00+01:00', '2026-11-07T02:00:00+01:00'],
    ['2026-11-06T23:00:00-01:00', '2026-11-07T00:00:00-01:00'],
  ]) {
    const value = withPeriods([{ ...period, period_start, period_end }]);
    assert.deepEqual(await fixture(value).run(name, args), expected);
    assert.deepEqual(op.project(value), expected);
  }
  for (const change of [
    { period_start: '2026-11-07T00:00:00.001Z' },
    { period_end: '2026-11-07T00:59:59.999Z' },
    { period_start: '2026-11-07T00:00:00-01:00' },
    { period_end: '2026-11-07T01:00:00+01:00' },
    { period_start: '2026-02-30T00:15:00Z' },
    { period_start: '2026-11-01T24:00:00Z' },
    { period_start: '2026-11-01T00:15:00+24:00' },
    { period_start: '2026-11-01T00:15:00' },
    { period_start: '2026-11-01T00:15:00.0001Z' },
    { period_end: period.period_start },
    { period_start: null },
  ]) {
    const value = withPeriods([{ ...period, ...change }]);
    await assert.rejects(fixture(value).run(name, args));
    assert.throws(() => op.project(value));
  }
  for (const change of [
    { timeframe_start: '2026-11-07T00:00:00+00:00' },
    { timeframe_end: '2026-11-07T01:00:00.001Z' },
    { timeframe_start: '2026-11-07T00:15:00Z' },
  ]) await assert.rejects(fixture(withFrames([{ ...frame, ...change }])).run(name, args));
});

test('branch consumption: cursor pagination is bounded and never returns partial success', async () => {
  const f = fixture((_url, _init, call) => response(call === 1 ? { ...raw, pagination: { cursor: 'a&b' } } : { branches: [] }));
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), 'a&b');
  for (const value of [{}, { next: 'next' }, { cursor: '' }, { cursor: 'x\n' }, { cursor: 'x'.repeat(257) }]) {
    await assert.rejects(fixture({ ...raw, pagination: value }).run(name, args));
  }
  const cycle = fixture(() => response({ branches: [], pagination: { cursor: 'same' } }));
  await assert.rejects(cycle.run(name, args)); assert.equal(cycle.requests.length, 2);
  const ceiling = fixture((_url, _init, call) => response({ branches: [], pagination: { cursor: `page-${call}` } }));
  await assert.rejects(ceiling.run(name, args)); assert.equal(ceiling.requests.length, 3);
  const duplicate = fixture((_url, _init, call) => response(call === 1 ? { ...raw, pagination: { cursor: 'next' } } : raw));
  await assert.rejects(duplicate.run(name, args));
  const failed = fixture((_url, _init, call) => call === 1 ? response({ ...raw, pagination: { cursor: 'next' } }) : response({}, { status: 403 }));
  await assert.rejects(failed.run(name, args)); assert.equal(failed.requests.length, 2);
});

test('branch consumption: unavailable plan, invalid range and failed transport never downgrade to legacy or unfiltered fallback', async () => {
  for (const status of [403, 404, 406, 429, 500, 302]) {
    const f = fixture(() => response({ message: canary }, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' }); assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES), ...raw })]) {
    await assert.rejects(fixture(value).run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
  }
});

test('branch consumption: direct transport validates filters, dates and cursor before fetch', () => {
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  const run = (org, project, branch, from = scope.from, to = scope.to, cursor = null) => t.getConsumptionHistoryPerBranchV2(org, project, branch, from, to, cursor, options);
  for (const value of [undefined, null, '', '../escape', 'x,y', 'x\n', 'Upper', 'x'.repeat(61)]) {
    assert.throws(() => run(value, 'project-a')); assert.throws(() => run('org-a', value)); assert.throws(() => run('org-a', 'project-a', value));
  }
  for (const value of ['', '2026-02-30T00:00:00Z', '2026-11-07T00:30:00Z', `${scope.from}\n`, null]) {
    assert.throws(() => run('org-a', 'project-a', 'br-a', value));
  }
  assert.throws(() => run('org-a', 'project-a', 'br-a', scope.to));
  assert.throws(() => run('org-a', 'project-a', 'br-a', scope.from, '2026-11-08T01:00:00Z'));
  assert.throws(() => run('org-a', 'project-a', 'br-a', scope.from, scope.to, 'bad\n'));
  assert.equal(calls, 0);
});
