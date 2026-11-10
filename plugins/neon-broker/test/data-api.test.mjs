import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonDataAPIOperations, DATA_API_OPERATIONS } from '../dist/plugins/neon-broker/src/data-api.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { dataAPICases as cases, dataAPIFixture as fixture, dataAPIScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { url: canary, jwks_url: canary, settings: { password: canary }, available_schemas: [canary],
  observed_at: canary, auth_provider: canary, provider_name: canary, jwt_audience: canary, message: canary };

test('Data API: fixed database-bound authenticated GET and status-only output', async () => {
  const f = fixture({ ...raw, ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/data-api/main`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/data-api/main', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
});

test('Data API: canonical closed arguments and explicit database/branch binding refuse before transport', () => {
  const f = fixture(raw);
  const invalid = ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', true, null];
  for (const value of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-c' },
    { ...args, database_name: 'absent' }, { ...args, branch_id: 'br-b', database_name: 'other' },
    ...['agent', 'approved', 'approval', 'credential', 'url', 'limit', 'cursor', 'runtimeContext'].map(key => ({ ...args, [key]: canary })),
    ...['project_id', 'branch_id', 'database_name'].flatMap(key => invalid.map(value => ({ ...args, [key]: value }))),
    { ...args, project_id: 'Upper' }, { ...args, project_id: 'x'.repeat(61) }, { ...args, branch_id: 'x'.repeat(61) },
    { ...args, database_name: 'x'.repeat(64) }, Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'database_name', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('Data API: copied scope rejects duplicates, malformed bindings and out-of-budget selection', () => {
  const config = structuredClone(scope);
  const operations = createNeonDataAPIOperations(config, {});
  config.projectId = 'other';
  config.revision = 'scope-v2';
  config.databases[0].name = 'changed';
  config.databases.push({ branchId: 'br-c', name: 'new' });
  assert.equal(operations[0].prepare(args).resource.revision, 'scope-v1');
  assert.throws(() => operations[0].prepare({ ...args, database_name: 'changed' }));
  assert.throws(() => operations[0].prepare({ ...args, branch_id: 'br-c', database_name: 'new' }));
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { revision: '' }, { databases: [scope.databases[0], scope.databases[0]] },
    { databases: [{ branchId: 'br-a', name: 'x/y' }] }, { databases: [{ branchId: 'br-a', name: 'main', approved: true }] },
    { databases: Array.from({ length: 31 }, (_, i) => ({ branchId: `br-${i}`, name: 'main' })) }, { databases: new Array(1) }]) {
    assert.throws(() => createNeonDataAPIOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), DATA_API_OPERATIONS.map(name => `neon.${name}`));
  const empty = fixture(raw, { ...scope, databases: [] });
  assert.throws(() => empty.operation(name).prepare(args));
  for (const tool of ['createProjectBranchDataAPI', 'updateProjectBranchDataAPI', 'deleteProjectBranchDataAPI', 'getProjectBranchSchema', 'sql']) {
    assert.equal(fixture(raw).operation(tool), undefined);
  }
});

test('Data API: detached execution revalidates resource, revision, bindings and abort', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: prepared.resource.id.replace('/main', '/other') }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, database_name: 'absent' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('Data API: malformed status, contradictory ancestry and pagination refuse without inventing defaults', async () => {
  for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' },
    { ...raw, database_name: 'other' }, { ...raw, pagination: {} },
    ...[null, true, 1, {}, [], '', 'x'.repeat(65), 'ready\n', 'ready state', 'https://example.invalid'].map(status => ({ ...raw, status }))]) {
    await assert.rejects(fixture(value).run(name, args));
  }
  const op = fixture(raw).operation(name);
  for (const key of ['status', 'project_id', 'branch_id', 'database_name', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.deepEqual(op.project(Object.defineProperty({ status: 'running' }, 'url', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  for (const status of ['running', 'pending', 'unknown', 'future_status-v2']) {
    assert.deepEqual(await fixture({ status }).run(name, args), { status });
  }
  assert.deepEqual(await fixture({ ...raw, ...args }).run(name, args), expected);
});

test('Data API: non-200, failed, non-JSON and oversized transport never become disabled or fallback success', async () => {
  for (const status of [403, 404, 410, 500, 302]) {
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

test('Data API: direct transport rejects unsafe project/branch/database identifiers before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x'.repeat(64), 'аbc']) {
    assert.throws(() => transport.getProjectBranchDataAPI(value, 'br-a', 'main', options));
    assert.throws(() => transport.getProjectBranchDataAPI('project-a', value, 'main', options));
    assert.throws(() => transport.getProjectBranchDataAPI('project-a', 'br-a', value, options));
  }
  assert.equal(calls, 0);
});
