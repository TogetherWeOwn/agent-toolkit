import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAdvisorOperations, ADVISOR_OPERATIONS } from '../dist/plugins/neon-broker/src/advisor.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { advisorCases as cases, advisorFixture as fixture, advisorScope as scope, advisorIssue as issue, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const omitted = ['name', 'title', 'facing', 'description', 'detail', 'remediation', 'metadata', 'password', 'connection_uri'];

test('advisor: fixed SECURITY/INFO GET always pins project, branch and database with a distinct grant', async () => {
  const f = fixture(raw);
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/advisors?branch_id=br-a&database_name=main&category=SECURITY&min_severity=INFO`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/databases/main/advisors/security', revision: 'scope-v1' });
  assert.deepEqual(op.prepare(args).plan, { operation: name, ...args, category: 'SECURITY', min_severity: 'INFO' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
});

test('advisor: closed canonical arguments refuse defaults, overrides and other databases before transport', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: args.project_id }, { ...args, project_id: 'other' },
    { ...args, branch_id: 'other' }, { ...args, database_name: 'other' },
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'limit', 'category', 'min_severity'].map(key => ({ ...args, [key]: canary })),
    ...Object.keys(args).flatMap(key => ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'аbc', null, true].map(value => ({ ...args, [key]: value }))),
    { ...args, project_id: 'Upper' }, { ...args, branch_id: 'x'.repeat(61) }, { ...args, database_name: 'x'.repeat(64) },
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'database_name', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('advisor: copied scope, exact binding and bounded resource survive caller mutation', () => {
  const config = structuredClone(scope);
  const [op] = createNeonAdvisorOperations(config, {});
  config.projectId = 'other'; config.branchId = 'other'; config.databaseName = 'other'; config.revision = 'scope-v2';
  assert.equal(op.prepare(args).resource.revision, 'scope-v1');
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: '' }, { databaseName: 'x/y' }, { revision: '' },
    { databaseName: 'x'.repeat(64) }, { projectId: 'x'.repeat(61) }]) {
    assert.throws(() => createNeonAdvisorOperations({ ...scope, ...change }, {}));
  }
  const max = { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), databaseName: 'd'.repeat(63), revision: 'r'.repeat(80) };
  const [bounded] = createNeonAdvisorOperations(max, {});
  assert(bounded.prepare({ project_id: max.projectId, branch_id: max.branchId, database_name: max.databaseName }).resource.id.length <= 256);
  assert.deepEqual([op.name], ADVISOR_OPERATIONS.map(name => `neon.${name}`));
  for (const tool of ['getProjectBranchSchema', 'queryProjectBranchLogs', 'sql', 'startProjectEndpoint']) assert.equal(fixture(raw).operation(tool), undefined);
});

test('advisor: detached execution revalidates scope/revision and refuses abort before analysis', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: prepared.resource.id.replace('/main/', '/other/') }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, database_name: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('advisor: only bounded severity observations leave projection; issue content and cache keys do not', async () => {
  const issues = ['ERROR', 'WARN', 'INFO'].map((level, i) => ({ ...issue, level, cache_key: `issue-${i}`, ...Object.fromEntries(omitted.map(key => [key, canary])) }));
  const f = fixture({ issues, ...args });
  assert.deepEqual(await f.run(name, args), { counts: { ERROR: 1, WARN: 1, INFO: 1 } });
  assert.deepEqual(await fixture({ issues: [] }).run(name, args), { counts: { ERROR: 0, WARN: 0, INFO: 0 } });
  const op = f.operation(name);
  for (const key of omitted) {
    const poisoned = Object.defineProperty({ ...issue }, key, { get() { throw Error('unused getter'); }, enumerable: true });
    assert.deepEqual(op.project({ issues: [poisoned] }), expected);
  }
  assert.deepEqual(op.project({ issues: [{ ...issue, categories: ['SECURITY', 'PERFORMANCE'] }] }), expected);
  assert.deepEqual(op.project({ issues: Array.from({ length: 30 }, (_, i) => ({ ...issue, cache_key: `issue-${i}` })) }), { counts: { ERROR: 30, WARN: 0, INFO: 0 } });
});

test('advisor: malformed rows, duplicate instances, nonsecurity results, ancestry and pagination refuse', async () => {
  for (const value of [null, [], {}, { issues: null }, { issues: [null] }, { ...raw, pagination: {} },
    ...Object.keys(args).map(key => ({ ...raw, [key]: 'other' })),
    { issues: [issue, issue] }, { issues: Array.from({ length: 31 }, (_, i) => ({ ...issue, cache_key: `issue-${i}` })) },
    ...[null, 1, '', 'x'.repeat(257), 'key\n'].map(cache_key => ({ issues: [{ ...issue, cache_key }] })),
    ...[null, true, '', 'FUTURE', 'error', 'ERROR\n'].map(level => ({ issues: [{ ...issue, level }] })),
    ...[[], ['PERFORMANCE'], ['SECURITY', 'SECURITY'], ['SECURITY', 'FUTURE'], null].map(categories => ({ issues: [{ ...issue, categories }] })),
    ...[...Object.keys(args).map(key => ({ [key]: 'other' })), { pagination: {} }].map(change => ({ issues: [{ ...issue, ...change }] })),
  ]) {
    await assert.rejects(fixture(value).run(name, args));
    assert.throws(() => fixture(raw).operation(name).project(value));
  }
  const op = fixture(raw).operation(name);
  for (const key of ['cache_key', 'level', 'categories', 'project_id', 'branch_id', 'database_name', 'pagination']) {
    assert.throws(() => op.project({ issues: [Object.defineProperty({ ...issue }, key, { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  assert.throws(() => op.project({ issues: new Array(1) }));
});

test('advisor: unavailable, failed, non-JSON and oversized analysis never become zero success or fallback', async () => {
  for (const status of [302, 403, 404, 406, 500]) {
    const f = fixture(() => response({ detail: canary }, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw, detail: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('advisor: direct transport rejects absent/unsafe project, branch and database before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x'.repeat(64), 'аbc']) {
    assert.throws(() => transport.getProjectAdvisorSecurityIssues(value, 'br-a', 'main', options));
    assert.throws(() => transport.getProjectAdvisorSecurityIssues('project-a', value, 'main', options));
    assert.throws(() => transport.getProjectAdvisorSecurityIssues('project-a', 'br-a', value, options));
  }
  assert.equal(calls, 0);
});
