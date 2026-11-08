import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonLogValueOperations, LOG_VALUE_OPERATIONS } from '../dist/plugins/neon-broker/src/log-values.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { logValueCases as cases, logValueFixture as fixture, logValueScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const resource = 'neon/projects/project-a/branches/br-a/logs/fields/level/values';
const poison = { logs: [{ message: canary }], password: canary, url: canary, message: canary };

test('log values: exact field, source and absolute bounded window produce only selected observations', async () => {
  const f = fixture({ ...raw, values: ['INFO', 'WARN', 'unselected'], ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/logs/fields/level/values`);
  assert.deepEqual(Object.fromEntries(parsed.searchParams), { start_time: scope.startTime, end_time: scope.endTime, source: 'function', limit: '30' });
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: resource, revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ values: [], is_truncated: false }).run(name, args), { values: [] });
  assert.deepEqual(await fixture(raw, { ...scope, values: [] }).run(name, args), { values: [] });
  for (const source of ['function', 'storage', 'pg_endpoint']) {
    assert.deepEqual(await fixture(raw, { ...scope, source }).run(name, { ...args, source }), expected);
  }
});

test('log values: strict arguments reject caller authority, defaults, sibling fields, sources and changed windows', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' }, { ...args, field_name: 'service.name' },
    { ...args, start_time: '2026-11-08T10:00:01Z' }, { ...args, end_time: '2026-11-08T10:59:59Z' }, { ...args, source: 'storage' },
    ...Object.keys(args).map(key => Object.fromEntries(Object.entries(args).filter(([k]) => k !== key))),
    ...['since', 'limit', 'cursor', 'query', 'approved', 'credential', 'agent', 'values', 'url'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'source', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('log values: scope copies all bindings and refuses malformed or oversized selections and windows', () => {
  const config = structuredClone(scope);
  const operations = createNeonLogValueOperations(config, {});
  Object.assign(config, { projectId: 'other', branchId: 'br-b', revision: 'scope-v2', fieldName: 'other', source: 'storage',
    startTime: '2026-11-08T00:00:00Z', endTime: '2026-11-08T00:30:00Z' });
  config.values[0] = 'unselected';
  config.values.push('another');
  assert.deepEqual(operations[0].prepare(args).resource, { id: resource, revision: 'scope-v1' });
  assert.deepEqual(operations[0].project({ values: ['INFO', 'unselected', 'another'], is_truncated: false }), { values: ['INFO'] });
  const invalid = ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', null, true, 'x'.repeat(81)];
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: 'Upper' }, { projectId: 'x'.repeat(61) }, { revision: '' },
    ...invalid.map(fieldName => ({ fieldName })), { fieldName: '.' }, { fieldName: '..' },
    { source: '' }, { source: 'all' }, { values: ['INFO', 'INFO'] }, { values: new Array(1) },
    ...['', 'x\n', 'аbc', null, true, 'x'.repeat(81)].map(value => ({ values: [value] })),
    { values: Array.from({ length: 31 }, (_, i) => `value-${i}`) },
    { startTime: '2026-11-08T10:00:00+00:00' }, { startTime: '2026-11-08T10:00:00.000Z' },
    { startTime: '2026-02-30T10:00:00Z', endTime: '2026-02-30T11:00:00Z' },
    { startTime: '2026-11-08T10:60:00Z' }, { startTime: scope.endTime }, { startTime: '2026-11-08T12:00:00Z' },
    { endTime: '2026-11-08T11:00:01Z' },
  ]) assert.throws(() => createNeonLogValueOperations({ ...scope, ...change }, {}));
  const single = { ...scope, startTime: '2026-11-08T10:59:59Z' };
  assert.doesNotThrow(() => createNeonLogValueOperations(single, {}));
  assert.deepEqual(operations.map(op => op.name), LOG_VALUE_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(fixture(raw).operation('queryProjectBranchLogs'), undefined);
});

test('log values: detached execution revalidates resource, revision, arguments and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  prepared.resource.id = 'mutated';
  assert.equal(prepare(args).resource.id, resource);
  const valid = prepare(args);
  for (const changed of [{ ...valid, resource: { ...valid.resource, id: resource.replace('/level/', '/other/') } },
    { ...valid, resource: { ...valid.resource, revision: 'scope-v2' } },
    { ...valid, arguments: { ...args, branch_id: 'br-b' } }, { ...valid, arguments: { ...args, source: 'storage' } }]) {
    await assert.rejects(execute(changed, canary, new AbortController().signal));
  }
  await assert.rejects(execute(valid, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(valid, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(valid, canary, new AbortController().signal)), expected);
});

test('log values: truncation, duplicates, malformed rows, pagination and contradictory identities refuse before filtering', async () => {
  for (const value of [null, [], {}, { values: [] }, { ...raw, is_truncated: true }, { ...raw, is_truncated: 'false' },
    { ...raw, is_truncated: null }, { ...raw, values: null }, { ...raw, pagination: {} },
    ...Object.keys(args).map(key => ({ ...raw, [key]: 'other' })),
    ...[null, true, 0, {}, [], '', 'x\n', 'аbc', 'x'.repeat(81)].map(value => ({ values: ['INFO', value], is_truncated: false })),
    { values: ['unselected', 'unselected'], is_truncated: false }, { values: ['INFO', 'INFO'], is_truncated: false },
    { values: Array.from({ length: 31 }, (_, i) => `value-${i}`), is_truncated: false },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['values', 'is_truncated', 'pagination', ...Object.keys(args)]) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.throws(() => op.project({ values: new Array(1), is_truncated: false }));
  assert.throws(() => op.project({ values: Object.defineProperty(['INFO'], '0', { get() { throw Error('getter'); }, enumerable: true }), is_truncated: false }));
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'logs', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  assert.deepEqual(await fixture({ ...raw, ...args }).run(name, args), expected);
  const values = Array.from({ length: 30 }, (_, i) => `value-${i}`.padEnd(80, 'x'));
  assert.deepEqual(await fixture({ values, is_truncated: false }, { ...scope, values }).run(name, args), { values });
});

test('log values: unavailable, unknown-field, non-JSON and oversized transport refuse without partial success or fallback', async () => {
  for (const status of [400, 403, 404, 410, 500, 302]) {
    const f = fixture(() => response({ reason: 'unknown_field', ...poison }, { status }));
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

test('log values: direct transport validates field, service and absolute one-hour window before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  const call = (project, branch, field, start, end, source) => transport.listProjectBranchLogFieldValues(project, branch, field, start, end, source, options);
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => call(value, args.branch_id, 'level', scope.startTime, scope.endTime, 'function'));
    assert.throws(() => call(args.project_id, value, 'level', scope.startTime, scope.endTime, 'function'));
  }
  for (const value of [undefined, null, '', '.', '..', '../escape', 'x/y', 'x?y=z', 'x\n', 'аbc', 'x'.repeat(81)]) {
    assert.throws(() => call(args.project_id, args.branch_id, value, scope.startTime, scope.endTime, 'function'));
  }
  for (const [start, end, source] of [[scope.startTime, scope.endTime, 'all'], [scope.startTime, scope.endTime, undefined],
    ['', scope.endTime, 'function'], [scope.startTime, scope.startTime, 'function'], [scope.endTime, scope.startTime, 'function'],
    [scope.startTime, '2026-11-08T11:00:01Z', 'function'], ['2026-02-30T10:00:00Z', '2026-02-30T11:00:00Z', 'function']]) {
    assert.throws(() => call(args.project_id, args.branch_id, 'level', start, end, source));
  }
  assert.equal(calls, 0);
});
