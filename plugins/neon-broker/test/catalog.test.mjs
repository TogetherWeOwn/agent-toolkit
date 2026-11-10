import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonCatalogOperations, CATALOG_OPERATIONS, MAX_CATALOG_BINDINGS } from '../dist/plugins/neon-broker/src/catalog.js';
import { MAX_ITEMS, MAX_PAGES } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { catalogCases as cases, catalogFixture as fixture, catalogScope as scope, catalogScopeAt, operation, database, role, endpoint, canary, response } from './helpers.mjs';

const paths = [
  `/projects/project-a/operations/${operation.id}`, '/projects/project-a/operations', '/projects/project-a/branches/count',
  '/projects/project-a/endpoints', '/projects/project-a/branches/br-a/databases', '/projects/project-a/branches/br-a/databases/main',
  '/projects/project-a/branches/br-a/roles', '/projects/project-a/branches/br-a/roles/reader',
];
for (const [index, [name, args, raw, expected]] of cases.entries()) {
  test(`${name}: typed catalog projection and exact bounded GET path`, async () => {
    const poisoned = structuredClone(raw);
    for (const value of Object.values(poisoned).flat()) Object.assign(value, {
      password: canary, connection_uri: `postgres://user:${canary}@example.invalid/db`, dsn: canary,
      error: canary, owner_name: canary, authentication_method: canary, host: canary,
      credentials: { token: canary }, settings: { password: canary }, created_at: canary,
    });
    const f = fixture(poisoned);
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(new URL(url).origin, NEON_ORIGIN);
    assert.equal(new URL(url).pathname, `/api/v2${paths[index]}`);
    assert.equal(new URL(url).search, name === 'listProjectOperations' ? '?limit=10' : '');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!JSON.stringify(expected).includes(canary));
  });

  test(`${name}: strict canonical arguments, extra authority and cross-resource refusals before transport`, () => {
    const f = fixture(raw);
    const op = f.operation(name);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'project-other' },
      ...['agent', 'approved', 'approval', 'url', 'cursor', 'limit', 'search', 'credential', 'runtimeContext'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter executed'); }, enumerable: true }),
    ]) assert.throws(() => op.prepare(bad));
    for (const key of Object.keys(args)) {
      for (const value of ['../escape', 'bad%2fname', 'bad/name', 'x\n', 'x\u0000', 'x'.repeat(81), 'prоject-a', 1, null]) {
        assert.throws(() => op.prepare({ ...args, [key]: value }));
      }
    }
    for (const key of ['branch_id', 'database_name', 'role_name', 'operation_id']) {
      if (key in args) assert.throws(() => op.prepare({ ...args, [key]: key === 'operation_id' ? 'b07f8772-1877-4da9-a939-3a3ae62d1d8d' : 'unlisted' }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached descriptor rejects changed resource/revision and pre-aborted work`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-other' }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: transport failure is redacted, single-attempt and has no lifecycle/secret fallback`, async () => {
    for (const value of [() => response({ message: canary, password: canary }, { status: 403 }),
      () => { throw Error(canary); }, () => response({}, { status: 302 })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
  });
}

test('catalog descriptors have eight distinct exact resources, no account enumerator or mutation', () => {
  const f = fixture({});
  assert.deepEqual(f.operations.map(op => op.name), CATALOG_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(new Set(cases.map(([name, args]) => f.operation(name).prepare(args).resource.id)).size, 8);
  for (const op of f.operations) {
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  }
  assert.equal(f.operation('countProjectBranches').prepare({ project_id: 'project-a' }).resource.id, 'neon/projects/project-a/branches/count');
  for (const name of ['listProjects', 'listApiKeys', 'getProjectBranchRolePassword', 'getConnectionURI',
    'createProjectBranchRole', 'resetProjectBranchRolePassword', 'startProjectEndpoint', 'sql']) assert.equal(f.operation(name), undefined);
});

test('trusted catalog configuration is copied, validated, and cannot widen after construction', () => {
  const config = structuredClone(scope);
  const ops = createNeonCatalogOperations(config, {});
  config.operations[0].branchId = 'br-b';
  config.roles.push({ name: 'evil', branchId: 'br-a' });
  config.databases[0].id = 999;
  assert.throws(() => ops[7].prepare({ project_id: 'project-a', branch_id: 'br-a', role_name: 'evil' }));
  assert.deepEqual(ops[5].project({ database }), { database });
  assert.deepEqual(ops[0].project({ operation }), { operation });
  for (const bad of [
    { ...scope, operations: [{ ...scope.operations[0], branchId: 'br-b' }] },
    { ...scope, operations: [{ ...scope.operations[0], branchId: null }] },
    { ...scope, operations: [scope.operations[0], scope.operations[0]] },
    { ...scope, endpoints: [{ id: 'ep-a', branchId: 'unlisted' }] },
    { ...scope, branchIds: ['br-a', 'br-a'] },
    { ...scope, roles: [scope.roles[0], scope.roles[0]] },
    { ...scope, roles: [{ name: 'reader', branchId: 'unlisted' }] },
    { ...scope, databases: [{ ...scope.databases[0], id: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...scope, databases: [scope.databases[0], { ...scope.databases[0], name: 'duplicate_id' }] },
    { ...scope, approved: true },
  ]) assert.throws(() => createNeonCatalogOperations(bad, {}));
});

test('operation responses enforce requested ID and trusted project/branch/endpoint ancestry', async () => {
  const [name, args] = cases[0];
  for (const changed of [{ id: 'b07f8772-1877-4da9-a939-3a3ae62d1d8d' }, { project_id: 'project-b' },
    { branch_id: 'br-b' }, { endpoint_id: 'ep-b' }, { endpoint_id: null }, { status: 'new-state' },
    { action: canary }, { failures_count: -1 }, { total_duration_ms: 1.5 }]) {
    await assert.rejects(fixture({ operation: { ...operation, ...changed } }).run(name, args));
    if (!('id' in changed)) await assert.rejects(fixture({ operations: [{ ...operation, ...changed }] }).run('listProjectOperations', cases[1][1]));
  }
  const projectOperation = { ...operation };
  delete projectOperation.branch_id;
  delete projectOperation.endpoint_id;
  const projectScope = { ...scope, operations: [{ id: operation.id, branchId: null, endpointId: null }] };
  assert.deepEqual(await fixture({ operation: projectOperation }, projectScope).run(name, args), { operation: projectOperation });
});

test('database/role/endpoint responses enforce selected child and collection parent even for other allowed parents', async () => {
  for (const [name, args, raw] of cases.slice(3)) {
    const kind = Object.keys(raw)[0];
    const item = Array.isArray(raw[kind]) ? raw[kind][0] : raw[kind];
    const altered = { ...item, branch_id: 'br-b' };
    const value = { [kind]: Array.isArray(raw[kind]) ? [altered] : altered };
    // A project endpoint list can legitimately contain other branches, but ep-a cannot move.
    await assert.rejects(fixture(value).run(name, args));
  }
  await assert.rejects(fixture({ database: { ...database, id: database.id + 1 } }).run('getProjectBranchDatabase', cases[5][1]));
  await assert.rejects(fixture({ role: { ...role, name: 'unlisted' } }).run('getProjectBranchRole', cases[7][1]));
  const config = { ...scope, roles: [...scope.roles, { name: 'other', branchId: 'br-a' }] };
  await assert.rejects(fixture({ role: { ...role, name: 'other' } }, config).run('getProjectBranchRole', cases[7][1]));
  assert.deepEqual(await fixture({ role: { branch_id: 'br-a', name: 'reader' } }).run('getProjectBranchRole', cases[7][1]),
    { role: { branch_id: 'br-a', name: 'reader' } });
});

test('collection filtering is additional projection, not a substitute for collection authority', async () => {
  for (const [name, args, raw, expected] of cases.filter(([name]) => name.startsWith('list'))) {
    const kind = Object.keys(raw)[0];
    const item = raw[kind][0];
    const unlisted = kind === 'operations' ? { ...item, id: 'b07f8772-1877-4da9-a939-3a3ae62d1d8d' } :
      kind === 'endpoints' ? { ...item, id: 'ep-unlisted' } : { ...item, name: 'unlisted' };
    assert.deepEqual(await fixture({ [kind]: [item, unlisted] }).run(name, args), expected);
    await assert.rejects(fixture({ [kind]: [item, item] }).run(name, args));
  }
});

test('unselected project endpoints and provider-valid quoted/Unicode catalog names are filtered', async () => {
  const config = { ...scope, branchIds: ['br-a'], endpoints: [scope.endpoints[0]] };
  assert.deepEqual(await fixture({ endpoints: [endpoint, { ...endpoint, id: 'ep-other', branch_id: 'br-unconfigured' }] }, config)
    .run('listProjectEndpoints', cases[3][1]), { endpoints: [endpoint] });
  for (const [name, args, raw, expected] of [cases[4], cases[6]]) {
    const kind = Object.keys(raw)[0];
    for (const other of ['app.user', '应用', 'app$user']) {
      assert.deepEqual(await fixture({ [kind]: [...raw[kind], { ...raw[kind][0], name: other }] }).run(name, args), expected);
    }
  }
});

test('canonical selected names exclude resource characters unsupported by the common broker', () => {
  for (const name of ['app$user', 'app.user', '应用']) {
    assert.throws(() => createNeonCatalogOperations({ ...scope, roles: [{ branchId: 'br-a', name }] }, {}));
    assert.throws(() => createNeonCatalogOperations({ ...scope, databases: [{ id: database.id, branchId: 'br-a', name }] }, {}));
  }
});

test('explicit catalog binding ceiling fits the full configuration budget and rejects oversize registries', () => {
  assert.equal(MAX_CATALOG_BINDINGS, 16);
  assert.equal(createNeonCatalogOperations(catalogScopeAt(MAX_CATALOG_BINDINGS), {}).length, 8);
  assert.throws(() => createNeonCatalogOperations(catalogScopeAt(MAX_CATALOG_BINDINGS + 1), {}));
});

test('operation cursor pagination is opaque, encoded, bounded, and distinct from branch next cursors', async () => {
  const cursor = '2022-12-07T00:45:05.262011Z?&limit=1000';
  const f = fixture((url, init, n) => response(n === 1 ? { operations: [operation], pagination: { cursor } } : { operations: [] }));
  assert.deepEqual(await f.run('listProjectOperations', cases[1][1]), { operations: [operation] });
  assert.equal(f.requests.length, 2);
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), cursor);
  for (const { url } of f.requests) {
    const query = new URL(url).searchParams;
    assert.equal(query.get('limit'), '10');
    assert.equal(query.get('sort_by'), null);
    assert(query.size <= 2);
  }
  for (const raw of [
    { operations: [], pagination: { cursor: 'same' } },
    (url, init, n) => response({ operations: [], pagination: { cursor: `cursor-${n}` } }),
    { operations: [], pagination: {} }, { operations: [], pagination: { next: 'wrong-shape' } },
    { operations: [], pagination: { cursor: '' } }, { operations: [], pagination: { cursor: '\n' } },
    { operations: [], pagination: { cursor: 'x', url: canary } },
    { operations: Array.from({ length: 11 }, () => operation) },
  ]) {
    const bounded = fixture(raw);
    await assert.rejects(bounded.run('listProjectOperations', cases[1][1]));
    assert(bounded.requests.length <= MAX_PAGES);
  }
  const repeated = fixture((url, init, n) => response(n === 1 ? { operations: [operation], pagination: { cursor: 'next' } } : { operations: [operation] }));
  await assert.rejects(repeated.run('listProjectOperations', cases[1][1]));
});

test('non-paginated catalog lists refuse pagination, oversized/sparse rows and malformed selected fields', async () => {
  for (const [name, args, raw] of cases.filter(([name]) => name.startsWith('list') && name !== 'listProjectOperations')) {
    const kind = Object.keys(raw)[0];
    await assert.rejects(fixture({ ...raw, pagination: {} }).run(name, args));
    await assert.rejects(fixture({ [kind]: Array.from({ length: MAX_ITEMS + 1 }, () => raw[kind][0]) }).run(name, args));
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project({ [kind]: new Array(1) }));
    assert.throws(() => op.project({ [kind]: [Object.defineProperty({ ...raw[kind][0] }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  for (const count of [-1, -0, 1.1, '2', null, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => fixture({}).operation('countProjectBranches').project({ count }));
  }
  assert.throws(() => fixture({}).operation('getProjectBranchRole').project({ role: { ...role, protected: 'false' } }));
});

test('transport seam rejects SQL/path/query injection and trailing newlines before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../role', 'role/password', 'role%2fpassword', 'role?reveal=true', 'app$user', 'reader\n', 'rеader', 'x'.repeat(64)]) {
    assert.throws(() => transport.getProjectBranchRole('project-a', 'br-a', bad, options));
    assert.throws(() => transport.getProjectBranchDatabase('project-a', 'br-a', bad, options));
  }
  for (const bad of ['project-a\n', '../project']) assert.throws(() => transport.listProjectEndpoints(bad, options));
  assert.throws(() => transport.listProjectOperations('project-a', 'cursor\n', options));
  assert.equal(calls, 0);
});
