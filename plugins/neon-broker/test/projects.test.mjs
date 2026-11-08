import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectOperations, PROJECT_OPERATIONS } from '../dist/plugins/neon-broker/src/projects.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectCases as cases, projectFixture as fixture, projectScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const project = raw.projects[0];
const poison = { name: canary, owner_id: canary, proxy_host: canary, settings: { password: canary }, message: canary };

function page(projects, cursor) {
  return { projects, ...(cursor === undefined ? {} : { pagination: { cursor } }) };
}

test('projects: fixed organization filter and exact collection grant with closed metadata', async () => {
  const f = fixture({ projects: [{ ...project, ...poison }, { ...project, id: 'unselected' }], applications: poison, integrations: poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  const target = new URL(url);
  assert.equal(target.origin, NEON_ORIGIN);
  assert.equal(target.pathname, '/api/v2/projects');
  assert.deepEqual(Object.fromEntries(target.searchParams), { limit: '10', org_id: 'org-a', recoverable: 'false' });
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/organizations/org-a/projects', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ projects: [] }).run(name, args), { projects: [] });
  assert.deepEqual(await fixture(raw, { ...scope, projectIds: [] }).run(name, args), { projects: [] });
});

test('projects: canonical organization-only arguments reject authority, discovery and recovery overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { org_id: 'other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].map(org_id => ({ org_id })),
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'limit', 'search', 'recoverable', 'project_id', 'projectIds'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('projects: construction copies exact selection and rejects malformed/duplicate scope', () => {
  const config = structuredClone(scope);
  const operations = createNeonProjectOperations(config, {});
  config.organizationId = 'other';
  config.revision = 'scope-v2';
  config.projectIds[0] = 'other';
  config.projectIds.push('unselected');
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/organizations/org-a/projects', revision: 'scope-v1' });
  assert.deepEqual(operations[0].project({ projects: [project, { ...project, id: 'unselected' }] }), expected);
  for (const change of [{ extra: true }, { organizationId: 'Upper' }, { organizationId: 'x'.repeat(61) }, { revision: '' },
    { projectIds: ['project-a', 'project-a'] }, { projectIds: ['Upper'] }, { projectIds: Array.from({ length: 31 }, (_, i) => `p-${i}`) }]) {
    assert.throws(() => createNeonProjectOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), PROJECT_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['listSharedProjects', 'createProject', 'recoverProject', 'deleteProject']) assert.equal(fixture(raw).operation(other), undefined);
});

test('projects: detached execution revalidates arguments/resource/revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project: projectOutput } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/organizations/org-a' },
    { ...prepared.resource, id: 'neon/organizations/other/projects' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { org_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(projectOutput(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('projects: Pagination.cursor is forwarded opaquely with fixed filters until absent pagination', async () => {
  const next = 'opaque +/=?cursor';
  const f = fixture((url, init, count) => response(count === 1 ? page([project], next) : page([{ ...project, id: 'project-b' }])));
  assert.deepEqual(await f.run(name, args), { projects: [expected.projects[0], { ...expected.projects[0], id: 'project-b' }] });
  assert.equal(f.requests.length, 2);
  const target = new URL(f.requests[1].url);
  assert.deepEqual(Object.fromEntries(target.searchParams), { limit: '10', cursor: next, org_id: 'org-a', recoverable: 'false' });
  const empty = fixture((url, init, count) => response(count === 1 ? page([project], 'next') : page([])));
  assert.deepEqual(await empty.run(name, args), expected);
  assert.equal(empty.requests.length, 2);
});

test('projects: duplicate IDs, wrong ancestry and malformed rows refuse even when unselected', async () => {
  for (const value of [null, [], {}, { projects: null }, { ...raw, org_id: 'other' }, { ...raw, project_id: 'project-a' },
    { projects: [project, project] }, { projects: [{ ...project, org_id: 'other' }] },
    ...[{ id: 'Upper' }, { region_id: '' }, { pg_version: 20 }, { pg_version: '17' }, { branch_id: 'br-a' }, { project_id: 'project-a' }, { pagination: {} }]
      .map(change => ({ projects: [{ ...project, id: 'unselected', ...change }] })),
  ]) await assert.rejects(fixture(value).run(name, args));
  for (const key of ['id', 'region_id', 'pg_version']) {
    const missing = { ...project };
    delete missing[key];
    await assert.rejects(fixture({ projects: [missing] }).run(name, args));
  }
  const duplicatePages = fixture((url, init, count) => response(page([project], count === 1 ? 'next' : undefined)));
  await assert.rejects(duplicatePages.run(name, args));
  const wrongPage = fixture((url, init, count) => response(count === 1 ? page([project], 'next') : { projects: [], org_id: 'other' }));
  await assert.rejects(wrongPage.run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['id', 'org_id', 'region_id', 'pg_version', 'pagination']) {
    assert.throws(() => op.project({ projects: [Object.defineProperty({ ...project }, key, { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  assert.deepEqual(op.project({ projects: [Object.defineProperty({ ...project }, 'password', { get() { throw Error('unused'); }, enumerable: true })] }), expected);
});

test('projects: page, total and cursor bounds refuse without partial success', async () => {
  for (const pagination of [null, {}, { next: 'wrong-schema' }, { cursor: '' }, { cursor: null }, { cursor: 'x\n' },
    { cursor: 'x'.repeat(257) }, { cursor: 'next', extra: true }]) await assert.rejects(fixture({ ...raw, pagination }).run(name, args));
  const cycle = fixture(() => response(page([], 'same')));
  await assert.rejects(cycle.run(name, args));
  assert.equal(cycle.requests.length, 2);
  const overflow = fixture((url, init, count) => response(page([], `cursor-${count}`)));
  await assert.rejects(overflow.run(name, args));
  assert.equal(overflow.requests.length, 3);
  await assert.rejects(fixture({ projects: Array.from({ length: 11 }, (_, n) => ({ ...project, id: `p-${n}` })) }).run(name, args));
  const ids = Array.from({ length: 30 }, (_, n) => `p-${n}`);
  const maximum = fixture((url, init, count) => response(page(ids.slice((count - 1) * 10, count * 10).map(id => ({ ...project, id })), count < 3 ? `cursor-${count}` : undefined)), { ...scope, projectIds: ids });
  assert.equal((await maximum.run(name, args)).projects.length, 30);
  assert.equal(maximum.requests.length, 3);
  assert.throws(() => fixture(raw).operation(name).project({ projects: Array.from({ length: 31 }, (_, n) => ({ ...project, id: `p-${n}` })) }));
  const controller = new AbortController();
  const cancelled = fixture(() => { controller.abort(); return response(page([], 'next')); });
  await assert.rejects(cancelled.run(name, args, controller.signal));
  assert.equal(cancelled.requests.length, 1);
});

test('projects: failed transport never fabricates empty success or drops the organization filter', async () => {
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

test('projects: direct transport validates organization and cursor before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.listProjects(value, null, options));
  }
  for (const value of [undefined, '', 'x\n', 'x'.repeat(257), true]) assert.throws(() => transport.listProjects('org-a', value, options));
  assert.equal(calls, 0);
});
