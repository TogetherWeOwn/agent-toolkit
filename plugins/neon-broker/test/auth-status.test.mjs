import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthStatusOperations, AUTH_STATUS_OPERATIONS } from '../dist/plugins/neon-broker/src/auth-status.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { MAX_ITEMS } from '../dist/plugins/neon-broker/src/metadata.js';
import { authStatusCases as cases, authStatusFixture as fixture, authStatusScope as scope, canary, response } from './helpers.mjs';

const suffixes = ['allow_localhost', 'plugins/phone-number', 'plugins/oauth-provider'];
const poison = { secret: canary, password: canary, client_secret: canary, login_page: canary, consent_page: canary,
  mcp: { resource: canary, dynamic_registration: true, client_id_metadata_documents: true }, resources: [{ identifier: canary }],
  email_provider: { host: canary, username: canary, password: canary }, message: canary, settings: { token: canary } };
for (const [index, [name, args, raw, expected]] of cases.entries()) {
  test(`${name}: closed auth status and distinct exact-resource GET path`, async () => {
    const f = fixture({ ...raw, ...poison });
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/${suffixes[index]}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!JSON.stringify(expected).includes(canary));
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/branches/br-a/auth/${suffixes[index]}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: strict arguments refuse authority, updates and cross-resource requests before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approved', 'approval', 'url', 'cursor', 'limit', 'credential', 'runtimeContext', 'enabled', 'allow_localhost', 'otp_expires_in'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'bad%2fname', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', 1, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execute revalidates request, resource and revision before transport`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/other' }, { ...prepared.resource, revision: 'scope-v2' },
      { ...prepared.resource, id: prepared.resource.id.replace('br-a', 'br-b') }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: malformed status, pagination and contradictory ancestry refuse`, async () => {
    const key = name === 'getNeonAuthAllowLocalhost' ? 'allow_localhost' : 'enabled';
    for (const value of [null, [], {}, ...[1, 'true', null].map(value => ({ ...raw, [key]: value })),
      { ...raw, pagination: {} }, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'unlisted' }, { ...raw, branch_id: 'br-b' }]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args));
      assert.equal(f.requests.length, 1);
    }
    assert.deepEqual(await fixture({ ...raw, project_id: 'project-a', branch_id: 'br-a' }).run(name, args), expected);
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project(Object.assign(Object.create({ inherited: true }), raw)));
    for (const field of [key, 'branch_id', 'project_id', 'pagination']) assert.throws(() => op.project(Object.defineProperty({ ...raw }, field,
      { get() { throw Error('getter'); }, enumerable: true })));
    assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'email_provider',
      { get() { throw Error('unused getter'); }, enumerable: true })), expected);
    assert.deepEqual(await fixture({ [key]: false }).run(name, args), { [key]: false });
    assert.deepEqual(await fixture({ [key]: true }).run(name, args), { [key]: true });
  });

  test(`${name}: unavailable, oversized or wrong-content response never fabricates disabled status or falls back`, async () => {
    for (const status of [404, 403, 500, 302]) {
      const f = fixture(() => response(poison, { status }));
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    for (const value of [() => { throw Error(canary); },
      () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
      () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) }),
    ]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    const clean = fixture(raw);
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(clean.operation(name).execute(
      clean.operation(name).prepare(args), credential, new AbortController().signal));
    assert.equal(clean.requests.length, 0);
  });
}

test('phone OTP lifetime is optional, bounded, integer-only and never filled from upstream defaults', async () => {
  const [name, args] = cases[1];
  for (const otp_expires_in of [60, 600]) assert.deepEqual(await fixture({ enabled: false, otp_expires_in }).run(name, args), { enabled: false, otp_expires_in });
  for (const otp_expires_in of [null, '300', 59, 601, 300.5, -1]) await assert.rejects(fixture({ enabled: true, otp_expires_in }).run(name, args));
  const op = fixture({}).operation(name);
  for (const otp_expires_in of [NaN, Infinity, -0]) assert.throws(() => op.project({ enabled: true, otp_expires_in }));
  assert.throws(() => op.project(Object.defineProperty({ enabled: true }, 'otp_expires_in', { get() { throw Error('getter'); }, enumerable: true })));
});

test('auth status scope is copied, bounded, unique and cannot introduce authority or secret-bearing tools', () => {
  const config = structuredClone(scope);
  const ops = createNeonAuthStatusOperations(config, {});
  config.projectId = 'other';
  config.branchIds.push('unlisted');
  assert.equal(ops[0].prepare(cases[0][1]).resource.revision, 'scope-v1');
  assert.throws(() => ops[0].prepare({ project_id: 'project-a', branch_id: 'unlisted' }));
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { branchIds: new Array(1) },
    { branchIds: Array.from({ length: MAX_ITEMS + 1 }, (_, n) => `br-${n}`) }, { approved: true }, { branchIds: ['br-a\n'] }]) {
    assert.throws(() => createNeonAuthStatusOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(ops.map(op => op.name), AUTH_STATUS_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(new Set(cases.map(([name, args]) => fixture({}).operation(name).prepare(args).resource.id)).size, 3);
  for (const name of ['getNeonAuthPluginConfigs', 'getNeonAuthEmailProvider', 'getNeonAuthEmailServer',
    'updateNeonAuthAllowLocalhost', 'updateNeonAuthPhoneNumberPlugin', 'updateNeonAuthOAuthProviderPlugin', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('all auth status transport methods reject project/branch path injection before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const name of AUTH_STATUS_OPERATIONS) for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а']) {
    assert.throws(() => transport[name](bad, 'br-a', options));
    assert.throws(() => transport[name]('project-a', bad, options));
  }
  assert.equal(calls, 0);
});
