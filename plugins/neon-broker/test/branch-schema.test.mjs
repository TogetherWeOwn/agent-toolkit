import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchSchemaOperations, BRANCH_SCHEMA_OPERATIONS } from '../dist/plugins/neon-broker/src/branch-schema.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { branchSchemaCases as cases, branchSchemaFixture as fixture, branchSchemaScope as scope, schemaTable as table, schemaColumn as column, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const omitted = ['sql', 'type', 'nullable', 'generated', 'default', 'expression', 'constraints', 'password', 'connection_uri'];

test('branch schema: fixed current-head JSON GET pins project, branch and mandatory database with a dedicated grant', async () => {
  const f = fixture(raw);
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/schema?db_name=main&format=json`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/databases/main/schema', revision: 'scope-v1' });
  assert.deepEqual(op.prepare(args).plan, { operation: name, ...args, format: 'json' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
});

test('branch schema: canonical arguments refuse historical/default/SQL overrides before transport', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: args.project_id }, { ...args, project_id: 'other' },
    { ...args, branch_id: 'other' }, { ...args, db_name: 'other' },
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'limit', 'format', 'lsn', 'timestamp', 'database_name'].map(key => ({ ...args, [key]: canary })),
    ...Object.keys(args).flatMap(key => ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'аbc', null, true].map(value => ({ ...args, [key]: value }))),
    { ...args, project_id: 'Upper' }, { ...args, branch_id: 'x'.repeat(61) }, { ...args, db_name: 'x'.repeat(64) },
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'db_name', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('branch schema: copied explicit selection and bounded resource survive caller mutation', () => {
  const config = structuredClone(scope);
  const [op] = createNeonBranchSchemaOperations(config, {});
  config.projectId = 'other'; config.branchId = 'other'; config.databaseName = 'other'; config.revision = 'scope-v2';
  config.columns[0].column_name = 'other'; config.columns.push({ ...column, column_name: 'extra' });
  assert.equal(op.prepare(args).resource.revision, 'scope-v1');
  assert.deepEqual(op.project(raw), expected);
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: '' }, { databaseName: 'x/y' }, { revision: '' },
    { columns: [column, column] }, { columns: Array.from({ length: 31 }, (_, i) => ({ ...column, column_name: `c${i}` })) },
    { columns: [{ ...column, extra: true }] }, { columns: [{ ...column, column_name: 'x'.repeat(64) }] }, { columns: new Array(1) }]) {
    assert.throws(() => createNeonBranchSchemaOperations({ ...scope, ...change }, {}));
  }
  const max = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), databaseName: 'd'.repeat(63), revision: 'r'.repeat(80) };
  const [bounded] = createNeonBranchSchemaOperations(max, {});
  assert(bounded.prepare({ project_id: max.projectId, branch_id: max.branchId, db_name: max.databaseName }).resource.id.length <= 256);
  assert.deepEqual([op.name], BRANCH_SCHEMA_OPERATIONS.map(name => `neon.${name}`));
  for (const tool of ['getProjectBranchSchemaComparison', 'queryProjectBranchLogs', 'sql', 'startProjectEndpoint']) assert.equal(fixture(raw).operation(tool), undefined);
});

test('branch schema: detached execution revalidates scope/revision and refuses abort before schema read', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: prepared.resource.id.replace('/main/', '/other/') }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, db_name: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('branch schema: only selected exact column identities leave projection; DDL and attributes are not evaluated', async () => {
  const extra = Object.fromEntries(omitted.map(key => [key, canary]));
  const selected = { ...table, ...extra, columns: [{ ...table.columns[0], ...extra }, { name: 'other', ...extra }] };
  const f = fixture({ ...raw, ...extra, json: { tables: [selected, { schema: 'private', name: 'items', columns: [{ name: 'id', ...extra }] }], ...extra } });
  assert.deepEqual(await f.run(name, args), expected);
  const op = f.operation(name);
  for (const key of omitted) {
    const poison = object => Object.defineProperty({ ...object }, key, { get() { throw Error('unused getter'); }, enumerable: true });
    assert.deepEqual(op.project(poison(raw)), expected);
    assert.deepEqual(op.project({ json: poison(raw.json) }), expected);
    assert.deepEqual(op.project({ json: { tables: [poison(table)] } }), expected);
    assert.deepEqual(op.project({ json: { tables: [{ ...table, columns: [poison(table.columns[0])] }] } }), expected);
  }
  assert.deepEqual(await fixture({ json: { tables: [] } }).run(name, args), { columns: [] });
  assert.deepEqual(await fixture(raw, { ...scope, columns: [] }).run(name, args), { columns: [] });
  assert.deepEqual(op.project({ json: { tables: Array.from({ length: 30 }, (_, i) => ({ schema: 'public', name: i ? `t${i}` : 'items',
    columns: Array.from({ length: 30 }, (_, j) => ({ name: j ? `c${j}` : 'id' })) })) } }), expected);
});

test('branch schema: malformed/unselected/duplicate rows, ancestry and pagination refuse before filtering', async () => {
  const wrap = tables => ({ json: { tables } });
  const bad = [null, [], {}, { sql: 'CREATE TABLE ignored' }, { json: null }, { json: {} }, wrap(null), wrap([null]),
    wrap([table, table]), wrap([{ ...table, columns: [table.columns[0], table.columns[0]] }]),
    wrap(Array.from({ length: 31 }, (_, i) => ({ ...table, name: `t${i}` }))),
    wrap([{ ...table, columns: Array.from({ length: 31 }, (_, i) => ({ name: `c${i}` })) }]),
    ...[null, true, '', 'a\n', 'x/y', 'x'.repeat(64)].flatMap(value => [wrap([{ ...table, name: value }]),
      wrap([{ ...table, schema: value }]), wrap([{ ...table, columns: [{ name: value }] }])]),
    wrap([{ ...table, name: 'unselected', columns: [null] }]), wrap([{ ...table, columns: new Array(1) }]),
  ];
  for (const change of [...['project_id', 'branch_id', 'db_name', 'database_name'].map(key => ({ [key]: 'other' })), { pagination: {} }]) {
    bad.push({ ...raw, ...change }, { json: { ...raw.json, ...change } }, wrap([{ ...table, ...change }]),
      wrap([{ ...table, columns: [{ ...table.columns[0], ...change }] }]));
  }
  for (const value of bad) {
    await assert.rejects(fixture(value).run(name, args));
    assert.throws(() => fixture(raw).operation(name).project(value));
  }
  const op = fixture(raw).operation(name);
  for (const key of ['name', 'db_name', 'database_name', 'project_id', 'branch_id', 'pagination']) {
    const poisoned = Object.defineProperty({ ...table.columns[0] }, key, { get() { throw Error('getter'); }, enumerable: true });
    assert.throws(() => op.project(wrap([{ ...table, columns: [poisoned] }])));
  }
});

test('branch schema: unavailable/non-JSON/oversized responses never become empty success or SQL fallback', async () => {
  for (const status of [302, 403, 404, 406, 500]) {
    const f = fixture(() => response({ detail: canary }, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw, sql: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('branch schema: direct transport rejects absent/unsafe project, branch and database before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x'.repeat(64), 'аbc']) {
    assert.throws(() => transport.getProjectBranchSchema(value, 'br-a', 'main', options));
    assert.throws(() => transport.getProjectBranchSchema('project-a', value, 'main', options));
    assert.throws(() => transport.getProjectBranchSchema('project-a', 'br-a', value, options));
  }
  assert.equal(calls, 0);
});
