import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonUserKeyOperations, USER_KEY_OPERATIONS } from '../dist/plugins/neon-broker/src/user-keys.js';
import { NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { userKeyCases as cases, userKeyFixture as fixture, userKeyScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { key: canary, token: canary, name: canary, created_by: canary, last_used_from_addr: canary,
  created_at: canary, last_used_at: canary, password: canary };

test('user keys: prove exact user before fixed key collection GET with one credential; selected numeric IDs only', async () => {
  const f = fixture({ user: { ...raw.user, email: canary }, keys: [{ ...raw.keys[0], ...poison }, { id: 123 }] });
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(r => r.url), [`${NEON_ORIGIN}/api/v2/users/me`, `${NEON_ORIGIN}/api/v2/api_keys`]);
  for (const { url, init } of f.requests) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!url.includes('user-a'));
  }
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/users/user-a/api_keys', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  for (const keys of [[], [{ id: 123 }]]) assert.deepEqual(await fixture({ ...raw, keys }).run(name, args), { api_keys: [] });
  assert.deepEqual(await fixture(raw, { ...scope, keyIds: [] }).run(name, args), { api_keys: [] });
});

test('user keys: canonical arguments reject account fallback, selectors and authority overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { user_id: 'other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', true, null, 'x'.repeat(81)].map(user_id => ({ user_id })),
    ...['agent', 'approved', 'credential', 'url', 'org_id', 'account_id', 'cursor', 'key_id', 'keyIds', 'reveal'].map(k => ({ ...args, [k]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'user_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('user keys: trusted numeric selection, exact user and revision are copied, bounded and unique', () => {
  const config = structuredClone(scope);
  const operations = createNeonUserKeyOperations(config, {});
  config.userId = 'other'; config.revision = 'scope-v2'; config.keyIds[0] = 123; config.keyIds.push(456);
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/users/user-a/api_keys', revision: 'scope-v1' });
  assert.deepEqual(operations[0].project({ ...raw, keys: [...raw.keys, { id: 123 }, { id: 456 }] }), expected);
  for (const change of [{ extra: true }, { userId: '' }, { userId: 'x'.repeat(81) }, { revision: '' },
    { keyIds: [1, 1] }, ...[null, true, -1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', NaN, Infinity].map(id => ({ keyIds: [id] })),
    { keyIds: null }, { keyIds: new Array(2) }, { keyIds: Array.from({ length: 31 }, (_, i) => i) },
  ]) assert.throws(() => createNeonUserKeyOperations({ ...scope, ...change }, {}));
  assert.deepEqual(operations.map(op => op.name), USER_KEY_OPERATIONS.map(n => `neon.${n}`));
  for (const other of ['listOrgApiKeys', 'getCurrentUserInfo', 'createApiKey', 'revokeApiKey', 'revealCredential']) assert.equal(fixture(raw).operation(other), undefined);
});

test('user keys: userless, wrong-user or contradictory identity refuses before key collection', async () => {
  for (const user of [null, [], {}, { id: 'other' }, { id: null }, { ...raw.user, pagination: {} },
    { ...raw.user, user_id: 'other' }, { ...raw.user, org_id: 'org-a' }, { ...raw.user, project_id: 'project-a' }]) {
    const f = fixture({ ...raw, user });
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
    assert(f.requests[0].url.endsWith('/users/me'));
  }
  for (const status of [401, 403, 404, 410, 500, 302]) {
    const f = fixture(() => response(poison, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('user keys: detached execution revalidates arguments/resource/revision and cancellation before either GET', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/users/user-a/profile' },
    { ...prepared.resource, id: 'neon/users/other/api_keys' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { user_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  const controller = new AbortController();
  let keyCalls = 0;
  const [op] = createNeonUserKeyOperations(scope, {
    async getCurrentUserInfo() { controller.abort(); return raw.user; },
    async listApiKeys() { keyCalls++; return raw.keys; },
  });
  await assert.rejects(op.execute(op.prepare(args), canary, controller.signal));
  assert.equal(keyCalls, 0);
});

test('user keys: bare-array shape, safe IDs, ancestry, duplicates and unexpected pagination refuse before filtering', async () => {
  for (const keys of [null, {}, { api_keys: raw.keys }, [null],
    ...[null, true, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', {}, []].map(id => [...raw.keys, { id }]),
    [...raw.keys, ...raw.keys], [{ id: 123 }, { id: 123 }],
    ...[{ user_id: 'other' }, { org_id: 'org-a' }, { project_id: 'project-a' }, { branch_id: 'br-a' }, { pagination: {} }].map(extra => [...raw.keys, { id: 123, ...extra }]),
    Array.from({ length: 31 }, (_, id) => ({ id })),
  ]) await assert.rejects(fixture({ ...raw, keys }).run(name, args));
  const op = fixture(raw).operation(name);
  // Keep negative zero out of JSON.stringify, which would normalize it to zero.
  assert.throws(() => op.project({ ...raw, keys: [{ id: -0 }] }));
  await assert.rejects(fixture((url, init, n) => n === 1 ? response(raw.user) :
    new Response('[{"id":-0}]', { headers: { 'content-type': 'application/json' } })).run(name, args));
  assert.throws(() => op.project({ ...raw, pagination: {} }));
  assert.throws(() => op.project({ ...raw, user: { id: 'other' } }));
  for (const keys of [new Array(1), Object.assign([...raw.keys], { pagination: {} }),
    Object.defineProperty([...raw.keys], '0', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project({ ...raw, keys }));
  for (const k of ['id', 'user_id', 'org_id', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project({ ...raw, keys: [Object.defineProperty({ ...raw.keys[0] }, k,
      { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  for (const k of Object.keys(poison)) {
    assert.deepEqual(op.project({ ...raw, keys: [Object.defineProperty({ ...raw.keys[0] }, k,
      { get() { throw Error('unused getter'); }, enumerable: true })] }), expected);
  }
  const apiKeys = Array.from({ length: 30 }, (_, n) => ({ id: Number.MAX_SAFE_INTEGER - n }));
  assert.deepEqual(await fixture({ ...raw, keys: apiKeys }, { ...scope, keyIds: apiKeys.map(k => k.id) }).run(name, args), { api_keys: apiKeys });
  assert.deepEqual(await fixture({ ...raw, keys: [{ id: 0 }] }, { ...scope, keyIds: [0] }).run(name, args), { api_keys: [{ id: 0 }] });
});

test('user keys: collection transport errors never fabricate empty success or switch targets', async () => {
  for (const fail of [() => { throw Error(canary); }, ...[403, 404, 410, 500, 302].map(status => () => response(poison, { status })),
    () => new Response(JSON.stringify(raw.keys), { headers: { 'content-type': 'text/plain' } }),
    () => response([{ id: 1, ignored: 'x'.repeat(RESPONSE_BYTES) }])]) {
    const f = fixture((url, init, n) => n === 1 ? response(raw.user) : fail());
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 2);
  }
});
