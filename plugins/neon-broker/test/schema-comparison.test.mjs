import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSchemaComparisonOperations, SCHEMA_COMPARISON_OPERATIONS, SCHEMA_DIFF_BYTES } from '../dist/plugins/neon-broker/src/schema-comparison.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { schemaComparisonCases as cases, schemaComparisonFixture as fixture, schemaComparisonScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const resource = 'neon/projects/project-a/branches/br-a/databases/main/schema-comparison/br-b';

test('schema comparison: exact directional pair and database use fixed current-head GET and a dedicated grant', async () => {
  const f = fixture(raw);
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/compare_schema?base_branch_id=br-b&db_name=main`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: resource, revision: 'scope-v1' });
  assert.deepEqual(op.prepare(args).plan, { operation: name, ...args });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
});

test('schema comparison: canonical arguments refuse same-branch/default/historical/format overrides before transport', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, ...Object.keys(args).map(key => { const v = { ...args }; delete v[key]; return v; }),
    ...Object.keys(args).flatMap(key => ['', 'other', '../escape', 'x/y', 'x?y=z', 'x\n', 'аbc', null, true].map(value => ({ ...args, [key]: value }))),
    { ...args, base_branch_id: args.branch_id }, { ...args, branch_id: args.base_branch_id, base_branch_id: args.branch_id },
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'limit', 'format', 'lsn', 'timestamp', 'base_lsn', 'base_timestamp', 'database_name'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'base_branch_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('schema comparison: copied scope, unique pair and composed 256-character resource bound', () => {
  const config = structuredClone(scope);
  const [op] = createNeonSchemaComparisonOperations(config, {});
  config.projectId = 'other'; config.branchId = 'other'; config.baseBranchId = 'other'; config.databaseName = 'other'; config.revision = 'scope-v2';
  assert.deepEqual(op.prepare(args).resource, { id: resource, revision: 'scope-v1' });
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: '' }, { baseBranchId: scope.branchId },
    { baseBranchId: 'x'.repeat(61) }, { databaseName: 'x/y' }, { databaseName: 'x'.repeat(64) }, { revision: '' }]) {
    assert.throws(() => createNeonSchemaComparisonOperations({ ...scope, ...change }, {}));
  }
  const max = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), databaseName: 'd'.repeat(60) };
  const prefix = `neon/projects/${max.projectId}/branches/${max.branchId}/databases/${max.databaseName}/schema-comparison/`;
  max.baseBranchId = 'a'.repeat(256 - prefix.length);
  const [bounded] = createNeonSchemaComparisonOperations(max, {});
  assert.equal(bounded.prepare({ project_id: max.projectId, branch_id: max.branchId, base_branch_id: max.baseBranchId, db_name: max.databaseName }).resource.id.length, 256);
  assert.throws(() => createNeonSchemaComparisonOperations({ ...max, baseBranchId: `${max.baseBranchId}a` }, {}));
  assert.deepEqual([op.name], SCHEMA_COMPARISON_OPERATIONS.map(name => `neon.${name}`));
  for (const tool of ['getProjectBranchSchema', 'sql', 'restoreProjectBranch', 'startProjectEndpoint']) assert.equal(fixture(raw).operation(tool), undefined);
});

test('schema comparison: detached execution revalidates pair/database/revision and aborts before transport', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const value of [{ ...prepared, resource: { ...prepared.resource, id: resource.replace('/br-b', '/br-c') } },
    { ...prepared, resource: { ...prepared.resource, revision: 'scope-v2' } },
    { ...prepared, arguments: { ...args, base_branch_id: 'br-c' } },
    { ...prepared, arguments: { ...args, db_name: 'other' } }]) {
    await assert.rejects(execute(value, canary, new AbortController().signal));
  }
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('schema comparison: observe only bounded diff nonemptiness, not SQL semantics or equivalence', async () => {
  const op = fixture(raw).operation(name);
  for (const diff of [raw.diff, canary, ' ', '\n', '\t', 'CREATE TABLE "日本語" (id integer);\r\n', '😀', 'x'.repeat(SCHEMA_DIFF_BYTES), 'é'.repeat(SCHEMA_DIFF_BYTES / 2)]) {
    assert.deepEqual(await fixture({ diff, sql: canary, password: canary, error: canary }).run(name, args), expected);
  }
  assert.deepEqual(await fixture({ diff: '' }).run(name, args), { has_diff: false });
  for (const key of ['sql', 'json', 'tables', 'password', 'connection_uri', 'diagnostics', 'error']) {
    assert.deepEqual(op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  }
  assert.equal(JSON.stringify(op.project(raw)), '{"has_diff":true}');
});

test('schema comparison: malformed, oversized, control-bearing and contradictory ancestry responses refuse', async () => {
  const bad = [null, [], {}, { diff: null }, { diff: true }, { diff: [] }, { diff: {} }, { diff: 0 },
    { diff: 'x'.repeat(SCHEMA_DIFF_BYTES + 1) }, { diff: 'é'.repeat(SCHEMA_DIFF_BYTES / 2 + 1) },
    ...['\0', '\x01', '\x0b', '\x0c', '\x1f', '\x7f', '\u0080', '\ud800', '\udfff'].map(diff => ({ diff })),
    ...['project_id', 'branch_id', 'base_branch_id', 'db_name', 'database_name'].map(key => ({ ...raw, [key]: 'other' })), { ...raw, pagination: {} },
  ];
  for (const value of bad) {
    await assert.rejects(fixture(value).run(name, args));
    assert.throws(() => fixture(raw).operation(name).project(value));
  }
  for (const key of ['diff', 'project_id', 'branch_id', 'base_branch_id', 'db_name', 'database_name', 'pagination']) {
    const poisoned = Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true });
    assert.throws(() => fixture(raw).operation(name).project(poisoned));
  }
});

test('schema comparison: unavailable/non-JSON/oversized responses never become no-diff or another read', async () => {
  for (const status of [302, 403, 404, 406, 500]) {
    const f = fixture(() => response({ detail: canary }, { status }));
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

test('schema comparison: direct transport rejects unsafe identifiers/database and identical branches before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x'.repeat(64), 'аbc']) {
    assert.throws(() => transport.getProjectBranchSchemaComparison(value, 'br-a', 'br-b', 'main', options));
    assert.throws(() => transport.getProjectBranchSchemaComparison('project-a', value, 'br-b', 'main', options));
    assert.throws(() => transport.getProjectBranchSchemaComparison('project-a', 'br-a', value, 'main', options));
    assert.throws(() => transport.getProjectBranchSchemaComparison('project-a', 'br-a', 'br-b', value, options));
  }
  assert.throws(() => transport.getProjectBranchSchemaComparison('project-a', 'br-a', 'br-a', 'main', options));
  assert.equal(calls, 0);
});
