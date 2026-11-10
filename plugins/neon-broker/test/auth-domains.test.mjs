import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthDomainOperations, AUTH_DOMAIN_OPERATIONS } from '../dist/plugins/neon-broker/src/auth-domains.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { MAX_ITEMS } from '../dist/plugins/neon-broker/src/metadata.js';
import { authDomainCases as cases, authDomainFixture as fixture, authDomainScope as scope, authDomain as domain, canary, response } from './helpers.mjs';

const poison = { password: canary, client_secret: canary, connection_uri: `postgres://user:${canary}@example.invalid/db`,
  redirect_uri: `https://example.invalid/?token=${canary}`, credentials: { token: canary }, message: canary };
for (const [name, args, raw, expected] of cases) {
  const parent = 'branch_id' in args ? '/branches/br-a' : '';
  test(`${name}: closed domain/provider projection uses the exact project or branch GET path`, async () => {
    const f = fixture({ ...raw, ...poison, domains: raw.domains.map(value => ({ ...value, ...poison })) });
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a${parent}/auth/domains`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a${parent}/auth/domains`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
    assert(!JSON.stringify(expected).includes(canary));
  });

  test(`${name}: strict request schema rejects identity, updates, pagination and unconfigured targets before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'other' },
      ...['agent', 'approved', 'approval', 'url', 'cursor', 'limit', 'credential', 'runtimeContext', 'domains', 'auth_provider'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    if ('branch_id' in args) assert.throws(() => f.operation(name).prepare({ ...args, branch_id: 'unlisted' }));
    else assert.throws(() => f.operation(name).prepare({ ...args, branch_id: 'br-a' }));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'bad%2fname', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', 1, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execute revalidates arguments, exact resource and revision before transport`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/other/auth/domains' },
      { ...prepared.resource, revision: 'scope-v2' }, { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/auth/domains' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: bounded complete lists preserve empty results, all supported providers and canonical hostnames`, async () => {
    assert.deepEqual(await fixture({ domains: [] }).run(name, args), { domains: [] });
    for (const auth_provider of ['mock', 'stack', 'better_auth']) for (const value of ['localhost', 'Example.invalid', '*.example.invalid', 'xn--bcher-kva.invalid', 'a'.repeat(63)]) {
      const domains = [{ domain: value, auth_provider }];
      assert.deepEqual(await fixture({ domains }).run(name, args), { domains });
    }
    const domains = Array.from({ length: MAX_ITEMS }, (_, n) => ({ ...domain, domain: `domain-${n}.invalid` }));
    assert.deepEqual(await fixture({ domains }).run(name, args), { domains });
    for (const domains of [[...raw.domains, ...raw.domains], [domain, { ...domain, domain: 'EXAMPLE.INVALID' }],
      Array.from({ length: MAX_ITEMS + 1 }, (_, n) => ({ ...domain, domain: `domain-${n}.invalid` }))]) {
      await assert.rejects(fixture({ domains }).run(name, args));
    }
    const differentProviders = ['mock', 'stack', 'better_auth'].map(auth_provider => ({ ...domain, auth_provider }));
    assert.deepEqual(await fixture({ domains: differentProviders }).run(name, args), { domains: differentProviders });
  });

  test(`${name}: malformed rows, credential-like domains, pagination and contradictory ancestry refuse`, async () => {
    for (const value of [null, [], {}, { domains: null }, { domains: {} }, { domains: [null] }, { domains: [{}] },
      ...['https://example.invalid', 'user:secret@example.invalid', 'example.invalid/path', 'example.invalid?token=x', 'example.invalid:443',
        'example.invalid\n', ' example.invalid', 'bücher.invalid', 'x..invalid', '-x.invalid', 'x-.invalid', 'x'.repeat(64), 'x'.repeat(254), ''].map(value => ({ domains: [{ ...domain, domain: value }] })),
      ...[null, 1, 'future'].map(value => ({ domains: [{ ...domain, auth_provider: value }] })),
      { ...raw, pagination: {} }, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'unlisted' }, { ...raw, branch_id: 'br-b' }]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args));
      assert.equal(f.requests.length, 1);
    }
    assert.deepEqual(await fixture({ ...raw, project_id: 'project-a', ...('branch_id' in args ? { branch_id: 'br-a' } : {}) }).run(name, args), expected);
    if (!('branch_id' in args)) await assert.rejects(fixture({ ...raw, branch_id: 'br-a' }).run(name, args));
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project(Object.assign(Object.create({ inherited: true }), raw)));
    assert.throws(() => op.project({ domains: new Array(1) }));
    for (const field of ['domain', 'auth_provider']) assert.throws(() => op.project({ domains: [Object.defineProperty({ ...domain }, field,
      { get() { throw Error('getter'); }, enumerable: true })] }));
    for (const field of ['domains', 'project_id', 'pagination']) assert.throws(() => op.project(Object.defineProperty({ ...raw }, field,
      { get() { throw Error('getter'); }, enumerable: true })));
    assert.deepEqual(op.project({ domains: [Object.defineProperty({ ...domain }, 'password',
      { get() { throw Error('unused getter'); }, enumerable: true })] }), expected);
  });

  test(`${name}: sunset or unavailable endpoints never fabricate an empty list or use a branch/provider fallback`, async () => {
    for (const status of [404, 410, 403, 500, 302]) {
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

test('auth domain scope is copied, unique, bounded and exposes only two fixed read operations', () => {
  const config = structuredClone(scope);
  const ops = createNeonAuthDomainOperations(config, {});
  config.projectId = 'other';
  config.branchIds.push('unlisted');
  assert.equal(ops[0].prepare(cases[0][1]).resource.revision, 'scope-v1');
  assert.throws(() => ops[1].prepare({ project_id: 'project-a', branch_id: 'unlisted' }));
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { branchIds: new Array(1) },
    { branchIds: Array.from({ length: MAX_ITEMS + 1 }, (_, n) => `br-${n}`) }, { approved: true }, { branchIds: ['br-a\n'] }]) {
    assert.throws(() => createNeonAuthDomainOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(ops.map(op => op.name), AUTH_DOMAIN_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(new Set(cases.map(([name, args]) => fixture({}).operation(name).prepare(args).resource.id)).size, 2);
  for (const name of ['addBranchNeonAuthTrustedDomain', 'listBranchNeonAuthOauthProviders', 'getNeonAuthPluginConfigs', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('domain transport rejects project/branch path injection before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а']) {
    assert.throws(() => transport.listNeonAuthRedirectURIWhitelistDomains(bad, options));
    assert.throws(() => transport.listBranchNeonAuthTrustedDomains(bad, 'br-a', options));
    assert.throws(() => transport.listBranchNeonAuthTrustedDomains('project-a', bad, options));
  }
  assert.equal(calls, 0);
});
