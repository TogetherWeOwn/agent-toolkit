import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOAuthProviderOperations, OAUTH_PROVIDER_OPERATIONS } from '../dist/plugins/neon-broker/src/oauth-providers.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { oauthProviderCases as cases, oauthProviderFixture as fixture, oauthProviderScope as scope, oauthProvider as provider,
  canary, response } from './helpers.mjs';

const ids = ['google', 'github', 'microsoft', 'vercel', 'apple'];
const poison = { client_id: canary, client_secret: canary, microsoft_tenant_id: canary, apple_team_id: canary,
  apple_key_id: canary, password: canary, message: canary, redirect_uri: `https://example.invalid/?token=${canary}` };
for (const [name, args, raw, expected] of cases) {
  const branch = 'branch_id' in args;
  const parent = branch ? '/branches/br-a' : '';
  test(`${name}: selected ID/type-only projection uses its fixed legacy or branch GET`, async () => {
    const f = fixture({ ...raw, ...poison, providers: [{ ...provider, ...poison }, { id: 'google', type: 'shared', ...poison }] });
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a${parent}/auth/oauth_providers`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a${parent}/auth/oauth_providers`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
    assert(!JSON.stringify(expected).includes(canary));
  });

  test(`${name}: closed arguments reject identity, credential, update, selection and path injection before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'other' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'provider_ids', 'client_secret', 'type', 'runtimeContext'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
      ...[...Object.keys(args)].flatMap(key => ['../escape', 'x/y', 'x%2fy', 'x?token=x', 'x\n', 'x\u0000', 'x'.repeat(61), 'br-а', 1, null].map(value => ({ ...args, [key]: value }))),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    assert.throws(() => f.operation(name).prepare({ ...args, branch_id: branch ? 'br-b' : 'br-a' }));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution rechecks copied target, resource and revision before transport`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/other/auth/oauth_providers' },
      { ...prepared.resource, revision: 'scope-v2' },
      { ...prepared.resource, id: `neon/projects/project-a${branch ? '' : '/branches/br-a'}/auth/oauth_providers` }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, project_id: 'other' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: bounded lists validate all rows before filtering and distinguish every known provider and key type`, async () => {
    assert.deepEqual(await fixture({ providers: [] }).run(name, args), { providers: [] });
    assert.deepEqual(await fixture({ providers: [{ id: 'google', type: 'shared' }] }).run(name, args), { providers: [] });
    for (const id of ids) for (const type of ['standard', 'shared']) {
      const providers = [{ id, type }];
      assert.deepEqual(await fixture({ providers }, { ...scope, providerIds: ids }).run(name, args), { providers });
    }
    const providers = ids.map(id => ({ id, type: 'standard' }));
    assert.deepEqual(await fixture({ providers }, { ...scope, providerIds: ids }).run(name, args), { providers });
    for (const invalidProviders of [[provider, provider], [...providers, provider], [provider, { id: 'google', type: 'future' }],
      [provider, { id: 'future', type: 'shared' }], [provider, { id: 'google', type: 'shared', project_id: 'other' }]]) {
      await assert.rejects(fixture({ providers: invalidProviders }).run(name, args));
    }
  });

  test(`${name}: malformed shape, contradictory ancestry and pagination refuse without partial success`, async () => {
    const ancestry = { project_id: 'project-a', ...(branch ? { branch_id: 'br-a' } : {}) };
    assert.deepEqual(await fixture({ ...raw, ...ancestry, providers: [{ ...provider, ...ancestry }] }).run(name, args), expected);
    for (const invalid of [null, [], {}, { providers: null }, { providers: {} }, { providers: [null] }, { providers: [{}] },
      ...[1, null, '', 'github\n', 'gіthub', 'GITHUB'].map(id => ({ providers: [{ ...provider, id }] })),
      ...[1, null, '', 'future', 'shared\n'].map(type => ({ providers: [{ ...provider, type }] })),
      { ...raw, pagination: {} }, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' },
      { providers: [{ ...provider, project_id: 'other' }] }, { providers: [{ ...provider, branch_id: 'br-b' }] },
      ...(!branch ? [{ ...raw, branch_id: 'br-a' }, { providers: [{ ...provider, branch_id: 'br-a' }] }] : []),
    ]) await assert.rejects(fixture(invalid).run(name, args));
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project({ providers: new Array(1) }));
    assert.throws(() => op.project(Object.assign(Object.create({ inherited: true }), raw)));
    for (const field of ['id', 'type', 'project_id', 'branch_id']) assert.throws(() => op.project({ providers: [Object.defineProperty({ ...provider }, field,
      { get() { throw Error('getter'); }, enumerable: true })] }));
    for (const field of ['providers', 'project_id', 'branch_id', 'pagination']) assert.throws(() => op.project(Object.defineProperty({ ...raw }, field,
      { get() { throw Error('getter'); }, enumerable: true })));
  });

  test(`${name}: masked secret, client and tenant/key fields are never evaluated even as detached getters`, () => {
    const op = fixture(raw).operation(name);
    const ignored = Object.fromEntries(Object.keys(poison).map(key => [key, { get() { throw Error('unused getter'); }, enumerable: true }]));
    assert.deepEqual(op.project(Object.defineProperties({ providers: [Object.defineProperties({ ...provider }, ignored)] }, ignored)), expected);
  });

  test(`${name}: sunset, denial, transport failure and oversized bodies never become empty success or fallback`, async () => {
    for (const status of [403, 404, 410, 500, 302]) {
      const f = fixture(() => response(poison, { status }));
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    for (const value of [() => { throw Error(canary); },
      () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
      () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    const f = fixture(raw);
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(f.operation(name).execute(
      f.operation(name).prepare(args), credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
  });
}

test('OAuth provider scope is copied, nonempty, enum-bounded and unique, without aggregate or credential actions', () => {
  const config = structuredClone(scope);
  const ops = createNeonOAuthProviderOperations(config, {});
  config.projectId = 'other';
  config.branchId = 'br-b';
  config.revision = 'scope-v2';
  config.providerIds.push('google');
  assert.equal(ops[0].prepare(cases[0][1]).resource.revision, 'scope-v1');
  assert.throws(() => ops[1].prepare({ project_id: 'project-a', branch_id: 'br-b' }));
  assert.deepEqual(ops[0].project({ providers: [{ id: 'google', type: 'shared' }] }), { providers: [] });
  for (const changed of [{ providerIds: [] }, { providerIds: ['github', 'github'] }, { providerIds: new Array(1) },
    { providerIds: [...ids, 'github'] }, { providerIds: ['future'] }, { approved: true }, { branchId: 'br-a\n' }, { projectId: 'x'.repeat(61) }]) {
    assert.throws(() => createNeonOAuthProviderOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(ops.map(op => op.name), OAUTH_PROVIDER_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(new Set(cases.map(([name, args]) => fixture({}).operation(name).prepare(args).resource.id)).size, 2);
  for (const name of ['addNeonAuthOauthProvider', 'getNeonAuthEmailProvider', 'getNeonAuthPluginConfigs', 'revealCredential', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('OAuth provider transport refuses project/branch injection before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?token=x', 'x\n', 'br-а', 'x'.repeat(61)]) {
    assert.throws(() => transport.listNeonAuthOauthProviders(bad, options));
    assert.throws(() => transport.listBranchNeonAuthOauthProviders(bad, 'br-a', options));
    assert.throws(() => transport.listBranchNeonAuthOauthProviders('project-a', bad, options));
  }
  assert.equal(calls, 0);
});
