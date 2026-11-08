import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonUserProfileOperations, USER_PROFILE_OPERATIONS } from '../dist/plugins/neon-broker/src/user-profile.js';
import { NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { userProfileCases as cases, userProfileFixture as fixture, userProfileScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { email: canary, login: canary, name: canary, last_name: canary, image: canary,
  auth_accounts: [{ token: canary }], billing_account: { secret: canary }, plan: canary, active_seconds_limit: canary,
  compute_seconds_limit: canary, max_autoscaling_limit: canary, password: canary, message: canary };

test('user profile: fixed credential-bound GET and closed exact-ID/limit output', async () => {
  const f = fixture({ ...raw, ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/users/me`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  assert(!url.includes(args.user_id));
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/users/user-a/profile', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  for (const limit of [0, Number.MAX_SAFE_INTEGER]) {
    const value = { id: raw.id, projects_limit: limit, branches_limit: limit };
    assert.deepEqual(await fixture(value).run(name, args), value);
  }
});

test('user profile: strict canonical user argument and no authority, target or profile overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { user_id: 'other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', true, null, 'x'.repeat(81)].map(user_id => ({ user_id })),
    ...['agent', 'approved', 'credential', 'url', 'project_id', 'org_id', 'email', 'cursor'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'user_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('user profile: construction copies trusted identity/revision and rejects malformed scope', () => {
  const config = structuredClone(scope);
  const operations = createNeonUserProfileOperations(config, {});
  config.userId = 'other';
  config.revision = 'scope-v2';
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/users/user-a/profile', revision: 'scope-v1' });
  assert.throws(() => operations[0].prepare({ user_id: 'other' }));
  for (const change of [{ extra: true }, { userId: '' }, { userId: 'x'.repeat(81) }, { userId: 'x\n' },
    { userId: 'аbc' }, { revision: '' }, { revision: 'x'.repeat(81) }]) {
    assert.throws(() => createNeonUserProfileOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), USER_PROFILE_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['getCurrentUserOrganizations', 'getAuthDetails', 'listProjects', 'listApiKeys']) assert.equal(fixture(raw).operation(other), undefined);
});

test('user profile: detached execution revalidates exact arguments/resource/revision and aborts before transport', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/users/user-a' },
    { ...prepared.resource, id: 'neon/users/other/profile' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { user_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('user profile: wrong identity, missing/unsafe limits and unexpected pagination refuse', async () => {
  for (const value of [null, [], {}, { ...raw, id: 'other' }, { ...raw, id: null }, { ...raw, pagination: {} },
    ...[undefined, null, -1, 1.5, '5', true, Number.MAX_SAFE_INTEGER + 1].flatMap(limit =>
      [{ ...raw, projects_limit: limit }, { ...raw, branches_limit: limit }]),
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const limit of [NaN, Infinity, -Infinity, -0]) {
    assert.throws(() => op.project({ ...raw, projects_limit: limit }));
    assert.throws(() => op.project({ ...raw, branches_limit: limit }));
  }
  for (const key of ['id', 'projects_limit', 'branches_limit', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.throws(() => op.project(Object.assign(Object.create({ inherited: true }), raw)));
  for (const key of Object.keys(poison)) {
    assert.deepEqual(op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  }
});

test('user profile: failed transport never enumerates users, follows avatar URLs or fabricates limits', async () => {
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
