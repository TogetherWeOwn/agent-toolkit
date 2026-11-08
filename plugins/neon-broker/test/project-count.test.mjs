import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectCountOperations, PROJECT_COUNT_OPERATIONS } from '../dist/plugins/neon-broker/src/project-count.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectCountCases as cases, projectCountFixture as fixture, projectCountScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { projects: [{ name: canary, proxy_host: canary }], owner: canary, message: canary, url: canary };

test('project count: fixed organization-filtered authenticated GET and closed aggregate output', async () => {
  const f = fixture({ ...raw, ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/count?org_id=org-a`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/organizations/org-a/projects/count', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  for (const count of [0, 1, Number.MAX_SAFE_INTEGER]) assert.deepEqual(await fixture({ count }).run(name, args), { count });
});

test('project count: organization is mandatory and canonical with no filter or identity override', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { org_id: 'other' }, ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].map(org_id => ({ org_id })),
    ...['agent', 'approved', 'credential', 'url', 'project_id', 'limit', 'cursor', 'search', 'recoverable'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('project count: construction copies organization and revision and refuses malformed scope', () => {
  const config = structuredClone(scope);
  const operations = createNeonProjectCountOperations(config, {});
  config.organizationId = 'other';
  config.revision = 'scope-v2';
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/organizations/org-a/projects/count', revision: 'scope-v1' });
  for (const change of [{ extra: true }, { organizationId: 'Upper' }, { organizationId: 'x'.repeat(61) }, { revision: '' }, { revision: true }]) {
    assert.throws(() => createNeonProjectCountOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), PROJECT_COUNT_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(fixture(raw).operation('listProjects'), undefined);
});

test('project count: detached execution revalidates organization, exact resource, revision and abort', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/organizations/org-a/projects' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { org_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('project count: missing, noninteger, unsafe, contradictory or paginated responses refuse', async () => {
  for (const value of [null, [], {}, { count: null }, { ...raw, org_id: 'other' }, { ...raw, project_id: 'project-a' },
    { ...raw, branch_id: 'br-a' }, { ...raw, pagination: {} },
    ...[-1, 0.5, '2', true, Number.MAX_SAFE_INTEGER + 1].map(count => ({ count })),
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const count of [NaN, Infinity, -Infinity, -0]) assert.throws(() => op.project({ count }));
  for (const key of ['count', 'org_id', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'projects', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  assert.deepEqual(await fixture({ org_id: 'org-a', count: 0 }).run(name, args), { count: 0 });
});

test('project count: non-200 or failed transport never falls back to an unfiltered or fabricated zero count', async () => {
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

test('project count: direct transport rejects missing, malformed or query-bearing organizations before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.countProjects(value, options));
  }
  assert.equal(calls, 0);
});
