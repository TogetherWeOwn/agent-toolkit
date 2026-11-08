import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSharedProjectOperations, SHARED_PROJECT_OPERATIONS } from '../dist/plugins/neon-broker/src/shared-projects.js';
import { NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { sharedProjectCases as cases, sharedProjectFixture as fixture, sharedProjectScope as scope,
  project, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { name: canary, owner: { email: canary }, owner_id: canary, org_id: canary, proxy_host: canary,
  settings: { password: canary }, connection_uri: canary, message: canary, created_at: canary, effective_project_permission: canary };

function paged(projects, config = scope) {
  return fixture((url, init, n) => {
    if (n === 1) return response(raw.user);
    const start = (n - 2) * 10;
    return response({ projects: projects.slice(start, start + 10),
      ...(start + 10 < projects.length ? { pagination: { cursor: `page-${n}` } } : {}) });
  }, config);
}

test('shared projects: exact-user proof precedes fixed same-credential catalog; selected closed metadata only', async () => {
  const f = fixture({ user: { ...raw.user, email: canary }, catalog: { projects: [
    { ...project, ...poison }, { ...project, ...poison, id: 'unselected' }], ...poison } });
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(r => r.url), [`${NEON_ORIGIN}/api/v2/users/me`, `${NEON_ORIGIN}/api/v2/projects/shared?limit=10`]);
  for (const { url, init } of f.requests) {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!url.includes('user-a'));
  }
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/users/user-a/shared_projects', revision: 'scope-v1' });
  assert.equal(op.tier, 'read'); assert.equal(op.lifecycle, 'none'); assert.equal(op.timeoutMs, 4500);
  for (const projects of [[], [{ ...project, id: 'unselected' }]]) {
    assert.deepEqual(await fixture({ ...raw, catalog: { projects } }).run(name, args), { projects: [] });
  }
});

test('shared projects: strict exact-user argument excludes query, transport, account and authority overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { user_id: 'other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', true, null, 'x'.repeat(81)].map(user_id => ({ user_id })),
    ...['agent', 'approved', 'credential', 'url', 'org_id', 'project_id', 'project_ids', 'search', 'cursor', 'limit'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'user_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('shared projects: trusted configuration is copied, bounded, canonical and unique', async () => {
  const config = structuredClone(scope);
  const [op] = createNeonSharedProjectOperations(config, {
    async getCurrentUserInfo() { return raw.user; }, async listSharedProjects() { return raw.catalog; },
  });
  config.userId = 'other'; config.revision = 'scope-v2'; config.projectIds[0] = 'other'; config.projectIds.push('unselected');
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/users/user-a/shared_projects', revision: 'scope-v1' });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
  for (const change of [{ extra: true }, { userId: '' }, { userId: 'x'.repeat(81) }, { revision: '' },
    { projectIds: null }, { projectIds: ['project-a', 'project-a'] }, { projectIds: ['UPPER'] },
    { projectIds: ['x'.repeat(61)] }, { projectIds: ['x\n'] }, { projectIds: ['аbc'] },
    { projectIds: Array.from({ length: 31 }, (_, n) => `project-${n}`) }, { projectIds: new Array(2) },
  ]) assert.throws(() => createNeonSharedProjectOperations({ ...scope, ...change }, {}));
  assert.deepEqual(SHARED_PROJECT_OPERATIONS, [name]);
  for (const other of ['getCurrentUserInfo', 'listProjects', 'getProject', 'getAuthDetails', 'listApiKeys']) assert.equal(fixture(raw).operation(other), undefined);
});

test('shared projects: userless and wrong-user credentials refuse before catalog with no fallback', async () => {
  for (const user of [null, [], {}, { id: 'other' }, { id: null }, { ...raw.user, pagination: {} }]) {
    const f = fixture({ ...raw, user });
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [401, 403, 404, 410, 500, 302]) {
    const f = fixture(() => response(poison, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('shared projects: detached execution revalidates arguments/resource/revision and aborts between requests', async () => {
  const f = fixture(raw);
  const { prepare, execute, project: projectOutput } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/users/user-a/organizations' },
    { ...prepared.resource, id: 'neon/users/other/shared_projects' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { user_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(projectOutput(await execute(prepared, canary, new AbortController().signal)), expected);
  for (const phase of ['identity', 'catalog']) {
    const controller = new AbortController(); let calls = 0;
    const [op] = createNeonSharedProjectOperations(scope, {
      async getCurrentUserInfo() { if (phase === 'identity') controller.abort(); return raw.user; },
      async listSharedProjects() { calls++; controller.abort(); return { ...raw.catalog, pagination: { cursor: 'next' } }; },
    });
    await assert.rejects(op.execute(op.prepare(args), canary, controller.signal));
    assert.equal(calls, phase === 'identity' ? 0 : 1);
  }
});

test('shared projects: malformed, duplicate and contradictory rows refuse before filtering', async () => {
  const invalid = [null, [], {}, { projects: null }, { projects: Array(11).fill({ ...project, id: 'unselected' }) },
    { projects: [project, project] }, { projects: [{ ...project, id: 'unselected' }, { ...project, id: 'unselected' }] },
    ...[null, {}, { ...project, id: 'UPPER' }, { ...project, id: 'x\n' }, { ...project, region_id: 'x\n' },
      { ...project, pg_version: 13 }, { ...project, pg_version: 20 }, { ...project, pg_version: '17' },
      { ...project, project_id: 'other' }, { ...project, user_id: 'other' }, { ...project, branch_id: 'br-a' },
      { ...project, pagination: {} }].map(row => ({ projects: [row] })),
    ...[{ user_id: 'other' }, { project_id: 'project-a' }, { branch_id: 'br-a' }].map(extra => ({ ...raw.catalog, ...extra })),
  ];
  for (const catalog of invalid) await assert.rejects(fixture({ ...raw, catalog }).run(name, args));
  const { project: output } = fixture(raw).operation(name);
  for (const value of [{ ...raw, user: { id: 'other' } }, { ...raw, pagination: {} },
    { ...raw, catalog: { ...raw.catalog, pagination: {} } }, { ...raw, catalog: { projects: new Array(2) } }]) assert.throws(() => output(value));
  for (const key of ['id', 'project_id', 'user_id', 'pagination', 'region_id', 'pg_version']) {
    assert.throws(() => output({ ...raw, catalog: { projects: [Object.defineProperty({ ...project }, key,
      { get() { throw Error('getter'); }, enumerable: true })] } }));
  }
  for (const key of Object.keys(poison)) {
    const row = Object.defineProperty({ ...project }, key, { get() { throw Error('unused getter'); }, enumerable: true });
    assert.deepEqual(output({ ...raw, catalog: { projects: [row] } }), expected);
  }
});

test('shared projects: unavailable selected IDs refuse on every page and detached projection', async () => {
  for (const unavailable_project_ids of [['project-a'], ['project-b'], ['other', 'other'], [null], ['UPPER'], Array(31).fill('other')]) {
    const catalog = { projects: [], unavailable_project_ids };
    await assert.rejects(fixture({ ...raw, catalog }).run(name, args));
    assert.throws(() => fixture(raw).operation(name).project({ ...raw, catalog }));
  }
  const f = fixture((url, init, n) => response(n === 1 ? raw.user : n === 2 ?
    { ...raw.catalog, pagination: { cursor: 'next' } } : { projects: [], unavailable_project_ids: ['project-b'] }));
  await assert.rejects(f.run(name, args)); assert.equal(f.requests.length, 3);
  assert.deepEqual(await fixture({ ...raw, catalog: { ...raw.catalog, unavailable_project_ids: ['other'] } }).run(name, args), expected);
});

test('shared projects: cursor pagination encodes opaque cursor and rejects cycles, duplicates, wrong fields and exhaustion', async () => {
  const cursor = 'opaque+/&?=x';
  const f = fixture((url, init, n) => response(n === 1 ? raw.user : n === 2 ?
    { ...raw.catalog, pagination: { cursor } } : { projects: [] }));
  assert.deepEqual(await f.run(name, args), expected);
  const query = new URL(f.requests[2].url).searchParams;
  assert.equal(query.get('cursor'), cursor); assert.equal(query.get('limit'), '10');
  assert.deepEqual([...query.keys()].sort(), ['cursor', 'limit']);
  for (const pagination of [{}, null, { next: 'wrong' }, { cursor: '' }, { cursor: 'x\n' }, { cursor: 'x'.repeat(257) }, { cursor: 'x', extra: true }]) {
    const bad = fixture({ ...raw, catalog: { ...raw.catalog, pagination } });
    await assert.rejects(bad.run(name, args)); assert.equal(bad.requests.length, 2);
  }
  const duplicate = fixture((url, init, n) => response(n === 1 ? raw.user : n === 2 ?
    { ...raw.catalog, pagination: { cursor: 'next' } } : raw.catalog));
  await assert.rejects(duplicate.run(name, args)); assert.equal(duplicate.requests.length, 3);
  const cycle = fixture({ ...raw, catalog: { projects: [], pagination: { cursor: 'same' } } });
  await assert.rejects(cycle.run(name, args)); assert.equal(cycle.requests.length, 3);
  const exhausted = fixture((url, init, n) => response(n === 1 ? raw.user : { projects: [], pagination: { cursor: `page-${n}` } }));
  await assert.rejects(exhausted.run(name, args)); assert.equal(exhausted.requests.length, 4);
  const projects = Array.from({ length: 30 }, (_, n) => ({ ...project, id: `project-${n}` }));
  const maximum = paged(projects, { ...scope, projectIds: projects.map(row => row.id) });
  assert.deepEqual(await maximum.run(name, args), { projects }); assert.equal(maximum.requests.length, 4);
});

test('shared projects: catalog transport failures never fabricate empty success or cross-target fallback', async () => {
  for (const fail of [() => { throw Error(canary); }, ...[403, 404, 410, 500, 302].map(status => () => response(poison, { status })),
    () => new Response(JSON.stringify(raw.catalog), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw.catalog, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture((url, init, n) => n === 1 ? response(raw.user) : fail());
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' }); assert.equal(f.requests.length, 2);
  }
});
