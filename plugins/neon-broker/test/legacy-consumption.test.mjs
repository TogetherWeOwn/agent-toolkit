import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonLegacyConsumptionOperations, LEGACY_CONSUMPTION_OPERATIONS } from '../dist/plugins/neon-broker/src/legacy-consumption.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { legacyConsumptionCases as cases, legacyConsumptionFixture as fixture, consumptionScope as scope,
  legacyConsumptionPeriod as period, legacyConsumptionFrame as frame, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const withPeriods = periods => ({ projects: [{ project_id: 'project-a', periods }] });
const withFrames = consumption => withPeriods([{ ...period, consumption }]);
const metric = value => ({ ...frame, compute_time_seconds: value });

test('legacy consumption: fixed filtered GET, pinned hourly window and closed metric output', async () => {
  const f = fixture(withPeriods([{ ...period, period_plan: canary, password: canary,
    consumption: [{ ...frame, diagnostics: canary, url: canary, active_time_seconds: canary,
      written_data_bytes: canary, synthetic_storage_size_bytes: canary, data_storage_bytes_hour: canary }] }]));
  assert.deepEqual(await f.run(name, args), expected);
  const { url, init } = f.requests[0];
  const parsed = new URL(url);
  assert.equal(parsed.origin, NEON_ORIGIN);
  assert.equal(parsed.pathname, '/api/v2/consumption_history/projects');
  assert.deepEqual(Object.fromEntries(parsed.searchParams), { limit: '10', org_id: 'org-a', project_ids: 'project-a',
    from: scope.from, to: scope.to, granularity: 'hourly', metrics: 'compute_time_seconds' });
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  assert.equal(f.requests.length, 1);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/organizations/org-a/projects/project-a/consumption/legacy', revision: 'scope-v1' });
  assert.deepEqual(op.prepare(args).plan, { operation: name, ...args, granularity: 'hourly', metrics: ['compute_time_seconds'] });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ projects: [] }).run(name, args), { projects: [] });
  assert.deepEqual(await fixture(withPeriods([])).run(name, args), { projects: [{ project_id: 'project-a', consumption: [] }] });
  for (const value of [0, Number.MAX_SAFE_INTEGER]) {
    assert.equal((await fixture(withFrames([metric(value)])).run(name, args)).projects[0].consumption[0].compute_time_seconds, value);
  }
});

test('legacy consumption: strict exact arguments and immutable copied scope prevent widened history', () => {
  const config = { ...scope };
  const [op] = createNeonLegacyConsumptionOperations(config, {});
  config.organizationId = 'other'; config.projectId = 'other'; config.from = scope.to; config.revision = 'changed';
  assert.equal(Object.getPrototypeOf(op.prepare(args).arguments), null);
  assert.deepEqual({ ...op.prepare(args).arguments }, args);
  for (const value of [null, [], {}, { ...args, org_id: 'other' }, { ...args, project_id: 'other' },
    { ...args, from: '2026-11-06T00:00:00Z' }, { ...args, to: '2026-11-07T01:00:00Z' },
    ...['agent', 'approved', 'credential', 'url', 'project_ids', 'cursor', 'limit', 'granularity', 'metrics'].map(key => ({ ...args, [key]: canary })),
    ...['', '../escape', 'x/y', 'x\n', 'Upper', 'аbc', 'x'.repeat(61)].map(project_id => ({ ...args, project_id })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'from', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => op.prepare(value));
  for (const change of [{ extra: true }, { organizationId: '' }, { projectId: 'Upper' }, { revision: '' },
    { from: '2026-02-30T00:00:00Z' }, { from: '2023-01-01T00:00:00Z' }, { from: scope.to },
    { to: '2026-11-08T01:00:00Z' }, { from: '2026-11-07T00:30:00Z' }, { from: '2026-11-07T00:00:00+00:00' },
  ]) assert.throws(() => createNeonLegacyConsumptionOperations({ ...scope, ...change }, {}));
  assert.deepEqual([op.name], LEGACY_CONSUMPTION_OPERATIONS.map(value => `neon.${value}`));
});

test('legacy consumption: detached resource, revision, window and cancellation revalidate before transport', async () => {
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

test('legacy consumption: malformed metrics, foreign identity, duplicate periods and invalid timeframes refuse', async () => {
  for (const value of [null, [], {}, { projects: null }, { ...raw, org_id: 'other' }, { ...raw, branch_id: 'br-a' },
    { projects: [{ ...raw.projects[0], project_id: 'other' }] }, { projects: [raw.projects[0], raw.projects[0]] },
    withPeriods([period, period]), withPeriods([{ ...period, period_id: 'bad' }]),
    withPeriods([{ ...period, org_id: 'other' }]), withPeriods([{ ...period, period_start: scope.to }]),
    withPeriods([{ ...period, period_end: scope.from }]), withPeriods([{ ...period, pagination: {} }]),
    withFrames([frame, frame]), withFrames([{ ...frame, timeframe_start: '2026-11-06T23:00:00Z' }]),
    withFrames([{ ...frame, timeframe_end: '2026-11-07T02:00:00Z' }]),
    withFrames([{ ...frame, timeframe_start: scope.to, timeframe_end: '2026-11-08T01:00:00Z' }]),
    withFrames([{ timeframe_start: frame.timeframe_start, timeframe_end: frame.timeframe_end }]),
    withFrames([{ timeframe_start: frame.timeframe_start, timeframe_end: frame.timeframe_end, metrics: [{ metric_name: 'compute_unit_seconds', value: 123 }] }]),
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, true].map(value => withFrames([metric(value)])),
    { projects: Array.from({ length: 11 }, () => raw.projects[0]) },
    withPeriods(Array.from({ length: 31 }, () => period)),
    withFrames(Array.from({ length: 25 }, () => frame)),
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  assert.throws(() => op.project({ ...raw, pagination: { cursor: 'next' } }));
  assert.throws(() => op.project({ projects: new Array(1) }));
  assert.throws(() => op.project(Object.defineProperty({ ...raw }, 'projects', { get() { throw Error('getter'); }, enumerable: true })));
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'diagnostic', { get() { throw Error('unused'); }, enumerable: true })), expected);
});

test('legacy consumption: 24 hourly buckets, billing boundary and missing-data gaps remain distinct from zero', async () => {
  const frames = Array.from({ length: 24 }, (_, n) => ({ ...frame,
    timeframe_start: `2026-11-07T${String(n).padStart(2, '0')}:00:00Z`,
    timeframe_end: n === 23 ? scope.to : `2026-11-07T${String(n + 1).padStart(2, '0')}:00:00Z` }));
  const periods = [{ ...period, period_end: '2026-11-07T12:00:00Z', consumption: frames.slice(0, 12) },
    { ...period, period_id: '00000000-0000-0000-0000-000000000002', period_start: '2026-11-07T12:00:00Z', consumption: frames.slice(12) }];
  assert.equal((await fixture(withPeriods(periods)).run(name, args)).projects[0].consumption.length, 24);
  assert.equal((await fixture(withFrames([frames[0], frames[23]])).run(name, args)).projects[0].consumption.length, 2);
  await assert.rejects(fixture(withPeriods(periods.toReversed())).run(name, args));
});

test('legacy consumption: cursor pagination is bounded and never returns partial success', async () => {
  const f = fixture((_url, _init, call) => response(call === 1 ? { ...raw, pagination: { cursor: 'a&b' } } : { projects: [] }));
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), 'a&b');
  for (const value of [{}, { next: 'next' }, { cursor: '' }, { cursor: 'x\n' }, { cursor: 'x'.repeat(257) }]) {
    await assert.rejects(fixture({ ...raw, pagination: value }).run(name, args));
  }
  const cycle = fixture(() => response({ projects: [], pagination: { cursor: 'same' } }));
  await assert.rejects(cycle.run(name, args)); assert.equal(cycle.requests.length, 2);
  const ceiling = fixture((_url, _init, call) => response({ projects: [], pagination: { cursor: `page-${call}` } }));
  await assert.rejects(ceiling.run(name, args)); assert.equal(ceiling.requests.length, 3);
  const duplicate = fixture((_url, _init, call) => response(call === 1 ? { ...raw, pagination: { cursor: 'next' } } : raw));
  await assert.rejects(duplicate.run(name, args));
  const failed = fixture((_url, _init, call) => call === 1 ? response({ ...raw, pagination: { cursor: 'next' } }) : response({}, { status: 403 }));
  await assert.rejects(failed.run(name, args)); assert.equal(failed.requests.length, 2);
});

test('legacy consumption: unavailable plan, invalid range and failed transport never downgrade to V2 or unfiltered fallback', async () => {
  for (const status of [403, 404, 406, 429, 500, 302]) {
    const f = fixture(() => response({ message: canary }, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' }); assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ignored: 'x'.repeat(RESPONSE_BYTES), ...raw })]) {
    await assert.rejects(fixture(value).run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
  }
});

test('legacy consumption: direct transport validates filters, dates and cursor before fetch', () => {
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  const run = (org, project, from = scope.from, to = scope.to, cursor = null) => t.getConsumptionHistoryPerProject(org, project, from, to, cursor, options);
  for (const value of [undefined, null, '', '../escape', 'x,y', 'x\n', 'Upper', 'x'.repeat(61)]) {
    assert.throws(() => run(value, 'project-a')); assert.throws(() => run('org-a', value));
  }
  for (const value of ['', '2026-02-30T00:00:00Z', '2026-11-07T00:30:00Z', `${scope.from}\n`, null]) {
    assert.throws(() => run('org-a', 'project-a', value));
  }
  assert.throws(() => run('org-a', 'project-a', scope.to));
  assert.throws(() => run('org-a', 'project-a', scope.from, '2026-11-08T01:00:00Z'));
  assert.throws(() => run('org-a', 'project-a', scope.from, scope.to, 'bad\n'));
  assert.equal(calls, 0);
});
