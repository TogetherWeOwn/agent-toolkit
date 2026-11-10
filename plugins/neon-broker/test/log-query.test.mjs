import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonLogQueryOperations, LOG_QUERY_OPERATIONS } from '../dist/plugins/neon-broker/src/log-query.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { logQueryCases as cases, logQueryFixture as fixture, logQueryScope as scope, logRecord, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const resource = 'neon/projects/project-a/branches/br-a/logs/query';

test('log query: fixed structured read-only POST returns only an observed count', async () => {
  const f = fixture({ ...raw, logs: [{ ...logRecord, message: canary, attributes: { password: canary }, entity_id: canary }], diagnostic: canary });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/logs/query`);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { start_time: scope.startTime, end_time: scope.endTime, source: scope.source, limit: 30, sort_order: 'asc' });
  assert(!init.body.includes(canary));
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: resource, revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ logs: [], is_truncated: false, next_cursor: '' }).run(name, args), { observed_count: 0 });
  for (const source of ['function', 'storage', 'pg_endpoint']) {
    assert.deepEqual(await fixture({ logs: [{ ...logRecord, source }], is_truncated: false }, { ...scope, source })
      .run(name, { ...args, source }), expected);
  }
});

test('log query: strict arguments refuse raw expressions, content filters, defaults and changed scope', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' }, { ...args, source: 'storage' },
    { ...args, start_time: '2026-11-08T10:00:01Z' }, { ...args, end_time: '2026-11-08T10:59:59Z' },
    ...Object.keys(args).map(key => Object.fromEntries(Object.entries(args).filter(([k]) => k !== key))),
    ...['since', 'logql', 'body_contains', 'trace_id', 'service_name', 'scope_name', 'severity_text', 'minimum_severity', 'cursor', 'limit',
      'sort_order', 'approved', 'agent', 'credential', 'url'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'source', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('log query: trusted configuration is copied and invalid source or absolute window refuses', () => {
  const config = structuredClone(scope);
  const operations = createNeonLogQueryOperations(config, {});
  Object.assign(config, { projectId: 'other', branchId: 'br-b', revision: 'scope-v2', source: 'storage',
    startTime: '2026-11-08T00:00:00Z', endTime: '2026-11-08T00:30:00Z' });
  assert.deepEqual(operations[0].prepare(args).resource, { id: resource, revision: 'scope-v1' });
  assert.deepEqual(operations[0].project(raw), expected);
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: 'Upper' }, { projectId: 'x'.repeat(61) },
    { branchId: '../escape' }, { revision: '' }, { source: 'all' }, { source: '' },
    { startTime: '2026-11-08T10:00:00+00:00' }, { startTime: '2026-11-08T10:00:00.000Z' },
    { startTime: '2026-02-30T10:00:00Z', endTime: '2026-02-30T11:00:00Z' },
    { startTime: '2026-11-08T10:60:00Z' }, { startTime: scope.endTime }, { startTime: '2026-11-08T12:00:00Z' },
    { endTime: '2026-11-08T11:00:01Z' },
  ]) assert.throws(() => createNeonLogQueryOperations({ ...scope, ...change }, {}));
  assert.deepEqual(operations.map(op => op.name), LOG_QUERY_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(fixture(raw).operation('listProjectBranchLogFieldValues'), undefined);
});

test('log query: detached execution revalidates exact resource, revision, arguments and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const valid = prepare(args);
  const mutated = prepare(args);
  mutated.resource.id = 'changed';
  assert.equal(prepare(args).resource.id, resource);
  for (const changed of [mutated, { ...valid, resource: { ...valid.resource, revision: 'scope-v2' } },
    { ...valid, arguments: { ...args, branch_id: 'br-b' } }, { ...valid, arguments: { ...args, source: 'storage' } }]) {
    await assert.rejects(execute(changed, canary, new AbortController().signal));
  }
  await assert.rejects(execute(valid, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(valid, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(valid, canary, new AbortController().signal)), expected);
});

test('log query: malformed rows, truncation, continuation and contradictory ancestry refuse', async () => {
  for (const value of [null, [], {}, { logs: [] }, { ...raw, logs: null }, { ...raw, is_truncated: true },
    { ...raw, is_truncated: 'false' }, { ...raw, next_cursor: 'more' }, { ...raw, next_cursor: null }, { ...raw, pagination: {} },
    ...Object.keys(args).map(key => ({ ...raw, [key]: 'other' })),
    ...[null, true, 0, {}, [], { source: scope.source },
      { ...logRecord, source: 'storage' }, { ...logRecord, project_id: 'other' }, { ...logRecord, branch_id: 'br-b' }]
      .map(log => ({ ...raw, logs: [logRecord, log] })),
    { logs: Array.from({ length: 31 }, () => logRecord), is_truncated: false },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['logs', 'is_truncated', 'next_cursor', 'pagination', ...Object.keys(args)]) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.throws(() => op.project({ ...raw, logs: new Array(1) }));
  assert.throws(() => op.project({ ...raw, logs: Object.defineProperty([logRecord], '0', { get() { throw Error('getter'); }, enumerable: true }) }));
  for (const key of ['timestamp', 'source']) {
    const log = Object.defineProperty({ ...logRecord }, key, { get() { throw Error('getter'); }, enumerable: true });
    assert.throws(() => op.project({ ...raw, logs: [log] }));
  }
  let log = { timestamp: logRecord.timestamp, source: scope.source };
  for (const key of ['message', 'attributes', 'entity_id', 'trace_id', 'severity_text']) {
    log = Object.defineProperty(log, key, { get() { throw Error('unused getter'); }, enumerable: true });
  }
  assert.deepEqual(op.project({ ...raw, logs: [log] }), expected);
  assert.deepEqual(await fixture({ ...raw, ...args }).run(name, args), expected);
  assert.deepEqual(await fixture({ logs: Array.from({ length: 30 }, () => logRecord), is_truncated: false }).run(name, args), { observed_count: 30 });
});

test('log query: optional source echoes may be absent but never contradict the fixed request', async () => {
  const { source, ...log } = logRecord;
  assert.equal(source, scope.source);
  assert.deepEqual(await fixture({ ...raw, logs: [log] }).run(name, args), expected);
  const op = fixture(raw).operation(name);
  const { prepare, execute, project } = op;
  const transport = { async queryProjectBranchLogs() { return { ...raw, logs: [log] }; } };
  const detached = createNeonLogQueryOperations(scope, transport)[0];
  assert.deepEqual(detached.project(await detached.execute(detached.prepare(args), canary, new AbortController().signal)), expected);
  assert.deepEqual(project({ ...raw, logs: [log] }), expected);
  assert.deepEqual(project(await execute(prepare(args), canary, new AbortController().signal)), expected);
  for (const source of ['storage', 'all', null, 0]) {
    await assert.rejects(fixture({ ...raw, logs: [{ ...log, source }] }).run(name, args));
  }
});

test('log query: exact nanosecond ordering, inclusive start and exclusive end are enforced', async () => {
  const run = times => fixture({ logs: times.map(timestamp => ({ ...logRecord, timestamp })), is_truncated: false }).run(name, args);
  const times = ['2026-11-08T10:00:00Z', '2026-11-08T10:00:00.0Z', '2026-11-08T10:00:00.000000001Z',
    '2026-11-08T10:00:00.000000002Z', '2026-11-08T10:59:59.999999999Z'];
  assert.deepEqual(await run(times), { observed_count: 5 });
  for (const invalid of ['', null, 0, '2026-02-30T10:00:00Z', '2026-11-08T10:60:00Z',
    '2026-11-08T10:00:00+00:00', '2026-11-08T10:00:00.0000000001Z', '2026-11-08T10:00:00Z\n',
    '2026-11-08T09:59:59.999999999Z', '2026-11-08T11:00:00Z', '2026-11-08T11:00:00.000000001Z']) {
    await assert.rejects(run([invalid]));
  }
  await assert.rejects(run([times[3], times[2]]));
});

test('log query: unavailable, non-JSON, oversize and deadline refuse without GET or content fallback', async () => {
  for (const status of [400, 403, 404, 410, 500, 302]) {
    const f = fixture(() => response({ reason: canary, logs: [] }, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].init.method, 'POST');
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) }), () => new Promise(() => {})]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('log query: direct transport rejects extra query fields and invalid targets before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  const query = { start_time: scope.startTime, end_time: scope.endTime, source: scope.source };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.queryProjectBranchLogs(value, args.branch_id, query, options));
    assert.throws(() => transport.queryProjectBranchLogs(args.project_id, value, query, options));
  }
  for (const value of [undefined, null, {}, { ...query, source: 'all' }, { ...query, start_time: query.end_time },
    { ...query, end_time: '2026-11-08T11:00:01Z' }, ...['logql', 'body_contains', 'cursor', 'since', 'limit', 'sort_order'].map(key => ({ ...query, [key]: canary }))]) {
    assert.throws(() => transport.queryProjectBranchLogs(args.project_id, args.branch_id, value, options));
  }
  assert.equal(calls, 0);
});
