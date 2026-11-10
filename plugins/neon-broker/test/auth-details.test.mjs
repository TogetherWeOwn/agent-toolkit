import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthDetailsOperations, AUTH_DETAILS_OPERATIONS } from '../dist/plugins/neon-broker/src/auth-details.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { authDetailsCases as cases, authDetailsFixture as fixture, authDetailsScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { auth_data: canary, password: canary, identity: canary, credential: canary, message: canary };
const methods = ['keycloak', 'session_cookie', 'api_key_user', 'api_key_org', 'oauth'];

test('auth details: fixed credential-bound GET emits only exact account and known authentication method', async () => {
  for (const auth_method of methods) {
    const f = fixture({ ...raw, ...poison, auth_method });
    assert.deepEqual(await f.run(name, args), { ...expected, auth_method });
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(url, `${NEON_ORIGIN}/api/v2/auth`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.deepEqual(op.prepare(args).resource, { id: 'neon/accounts/account-a/auth', revision: 'scope-v1' });
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  }
});

test('auth details: closed canonical arguments refuse alternate accounts and caller authority', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { ...args, account_id: 'account-b' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', true, null, 'x'.repeat(81)].map(account_id => ({ account_id })),
    ...['agent', 'approved', 'credential', 'url', 'user_id', 'org_id', 'auth_method', 'auth_data', 'cursor'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'account_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('auth details: construction copies trusted account and revision without normalizing identity namespaces', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthDetailsOperations(config, {});
  config.accountId = 'account-b';
  config.revision = 'scope-v2';
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/accounts/account-a/auth', revision: 'scope-v1' });
  assert.deepEqual(op.project(raw), expected);
  for (const change of [{ extra: true }, { accountId: '' }, { accountId: 'a'.repeat(81) }, { accountId: 'x\n' },
    { accountId: '../escape' }, { accountId: 'аbc' }, { revision: '' }, { revision: 'r'.repeat(81) },
  ]) assert.throws(() => createNeonAuthDetailsOperations({ ...scope, ...change }, {}));
  assert.deepEqual(fixture(raw).operations.map(op => op.name), AUTH_DETAILS_OPERATIONS.map(name => `neon.${name}`));
  const accountId = 'A_' + 'a'.repeat(78);
  assert.deepEqual(await fixture({ account_id: accountId, auth_method: 'oauth' }, { accountId, revision: 'r'.repeat(80) })
    .run(name, { account_id: accountId }), { account_id: accountId, auth_method: 'oauth' });
});

test('auth details: detached execution revalidates exact account resource, arguments, revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/accounts/account-a' },
    { ...prepared.resource, id: 'neon/accounts/account-b/auth' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { account_id: 'account-b' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('auth details: wrong account, unknown method and malformed response refuse, never fall back to user or organization', async () => {
  for (const value of [null, [], {}, { ...raw, account_id: 'account-b' }, { ...raw, pagination: {} }, { ...raw, pagination: null },
    { user_id: args.account_id, auth_method: 'api_key_user' }, { org_id: args.account_id, auth_method: 'api_key_org' },
    ...[undefined, null, true, 1, {}, [], '', 'x\n', 'аbc', 'x'.repeat(81)].map(account_id => ({ ...raw, account_id })),
    ...[undefined, null, true, 1, {}, [], '', 'api_key_project', 'API_KEY_USER', 'oauth\n'].map(auth_method => ({ ...raw, auth_method })),
  ]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const op = fixture(raw).operation(name);
  for (const key of ['account_id', 'auth_method', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.throws(() => op.project(Object.assign(Object.create({ inherited: true }), raw)));
  const unread = { ...expected };
  for (const key of Object.keys(poison)) Object.defineProperty(unread, key, { get() { throw Error('unused getter'); }, enumerable: true });
  assert.deepEqual(op.project(unread), expected);
  assert.deepEqual(op.project(Object.assign(Object.create(null), expected)), expected);
});

test('auth details: transport failures and unavailable authentication never fabricate a method or expose diagnostics', async () => {
  for (const status of [401, 403, 404, 410, 500, 302]) {
    const f = fixture(() => response(poison, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw, auth_data: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  for (const credential of [`${canary}\r`, `${canary}\n`]) {
    await assert.rejects(transport.getAuthDetails({ credential, signal: new AbortController().signal }), { message: 'UPSTREAM_UNAVAILABLE' });
  }
  await assert.rejects(transport.getAuthDetails({ credential: canary, signal: AbortSignal.abort() }), { message: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(calls, 0);
});
