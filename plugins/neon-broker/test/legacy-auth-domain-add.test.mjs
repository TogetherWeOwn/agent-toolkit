import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthDomainAddOperations, createNeonLegacyAuthDomainAddOperations } from '../dist/plugins/neon-broker/src/auth-domain-add.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { legacyAuthDomainAddFixture as fixture, legacyAuthDomainAddArgs as args, legacyAuthDomainAddScope as scope,
  authDomainAddFixture, authDomainAddArgs, canary, response } from './helpers.mjs';

const name = 'addNeonAuthDomainToRedirectURIWhitelist';
const expected = { acknowledged: true };
const listed = { domains: [] };
const metadata = { domain: scope.domain, auth_provider: scope.authProvider };

test('legacy Auth domain add: separate project-only factory, grant, path and singular POST preserve branch operation isolation', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const url = `${NEON_ORIGIN}/api/v2/projects/project-a/auth/domains`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[url, 'GET'], [url, 'POST']]);
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { domain: scope.domain, auth_provider: scope.authProvider });
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  assert.equal(f.requests[0].init.body, undefined);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation(name), p = op.prepare(args);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(p.resource.id, 'neon/projects/project-a/auth/legacy/domains/better_auth/app.example.invalid/add');
  assert.equal(p.plan.operation, name);
  assert.equal(p.plan.completion, 'acknowledgement_only');
  assert.equal(p.plan.diff.after, 'redirect_trust_expansion_requested');
  for (const k of ['persistenceVerified', 'enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(p.plan[k], false);
  assert.equal(f.operation('addBranchNeonAuthTrustedDomain'), undefined);
  assert.throws(() => createNeonLegacyAuthDomainAddOperations({ ...scope, branchId: 'br-a' }, {}));
  assert.throws(() => createNeonAuthDomainAddOperations(scope, {}));
  const branch = authDomainAddFixture();
  assert.deepEqual(await branch.run('addBranchNeonAuthTrustedDomain', authDomainAddArgs), expected);
  assert.equal(branch.operation(name), undefined);
  assert.equal(branch.requests[1].url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/domains`);
});

test('legacy Auth domain add: copied scope, canonical arguments and exact prepared plan refuse overrides before transport', async () => {
  const config = { ...scope }, [op] = createNeonLegacyAuthDomainAddOperations(config, {});
  config.domain = 'https://other.invalid';
  assert.equal(op.prepare(args).plan.domain, scope.domain);
  for (const raw of [null, [], {}, ...['project_id', 'auth_provider', 'domain'].map(k => ({ ...args, [k]: 'other' })),
    ...['branch_id', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'domains', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'domain', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture(), p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/auth/legacy', '/branches/br-a/auth') } },
    ...['operation', 'domain', 'auth_provider', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('legacy Auth domain add: complete absence preflight rejects existing/case-variant/malformed/duplicate/foreign/oversize/paginated lists and sunset errors', async () => {
  for (const raw of [null, {}, [], { domains: null }, { domains: [metadata] }, { domains: [{ ...metadata, domain: scope.domain.toUpperCase() }] },
    ...[{ domain: null }, { auth_provider: 'unknown' }, { project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }]
      .map(change => ({ domains: [{ ...metadata, ...change }] })),
    { domains: [metadata, metadata] }, { domains: [{ ...metadata, auth_provider: 'stack' }, { ...metadata, auth_provider: 'stack' }] },
    { domains: Array.from({ length: 31 }, (_, i) => ({ ...metadata, domain: `https://app${i}.invalid` })) },
    ...[{ project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...listed, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url.includes('/branches/'), false);
  }
  const f = fixture((url, init) => init.method === 'POST' ? new Response(null, { status: 201 }) :
    response({ domains: [{ ...metadata, auth_provider: 'stack' }, { ...metadata, domain: 'https://other.invalid' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('legacy Auth domain add: ambiguity observes once without branch fallback or promotion of presence/absence/provider replacement', async () => {
  for (const after of [listed, { domains: [metadata] }, { domains: [{ ...metadata, auth_provider: 'stack' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? listed : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('legacy Auth domain add: only terminal empty201 acknowledges, wrong status/body/encoding/redirect/length remains uncertain', async () => {
  for (const make of [...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', JSON.stringify(expected), canary].map(body => () => new Response(body, { status: 201 })),
    ...['1', 'invalid', '65537'].map(length => () => new Response(null, { status: 201, headers: { 'content-length': length } })),
    () => new Response(null, { status: 201, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201 })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(listed));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
    assert.equal(f.requests.length, 3);
  }
  for (const make of [() => new Response(null, { status: 201, headers: { 'content-length': '0' } }),
    () => new Response('', { status: 201 }),
    () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(0)); c.close(); } }), { status: 201 })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(listed));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('legacy Auth domain add: closed acknowledgement and unused metadata never emit diagnostics or evaluate extras', async () => {
  const row = { domain: 'https://other.invalid', auth_provider: 'better_auth' };
  for (const k of ['error', 'secret', 'url', 'created_at']) Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  const [op] = createNeonLegacyAuthDomainAddOperations(scope, {
    async listNeonAuthRedirectURIWhitelistDomains() { return { domains: [row] }; }, async addNeonAuthDomainToRedirectURIWhitelist() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, domain: scope.domain },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  let posts = 0;
  const [poisoned] = createNeonLegacyAuthDomainAddOperations(scope, {
    async listNeonAuthRedirectURIWhitelistDomains() { return { domains: [Object.defineProperty({ ...row }, 'domain', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async addNeonAuthDomainToRedirectURIWhitelist() { posts++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(posts, 0);
});

test('legacy Auth domain add: cancellation and ignored transport/body deadlines bound one attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? new Response(null, { status: 201 }) : response(listed);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201 })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(listed));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('legacy Auth domain add: strict shared origin/provider/path bounds refuse injection before transport', async () => {
  const badOrigins = ['', 'app.invalid', 'http://app.invalid', 'https://App.invalid', 'https://app.invalid/', 'https://app.invalid:443',
    'https://*.invalid', 'https://user@app.invalid', 'https://app.invalid?q=x', 'https://app.invalid#x', 'https://app.invalid\n',
    'https://app%2einvalid', 'https://-app.invalid', 'https://' + 'a'.repeat(64) + '.invalid'];
  for (const change of [...badOrigins.map(domain => ({ domain })), { projectId: '../p' }, { projectId: '-p' },
    { branchId: 'br-a' }, { authProvider: 'other' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonLegacyAuthDomainAddOperations({ ...scope, ...change }, {}));
  }
  for (const authProvider of ['mock', 'stack', 'better_auth']) {
    const f = fixture(null, { ...scope, authProvider });
    assert.deepEqual(await f.run(name, { ...args, auth_provider: authProvider }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of badOrigins) assert.throws(() => t.addNeonAuthDomainToRedirectURIWhitelist('project-a', 'better_auth', bad, options));
  assert.throws(() => t.addNeonAuthDomainToRedirectURIWhitelist('../p', 'better_auth', scope.domain, options));
  assert.throws(() => t.addNeonAuthDomainToRedirectURIWhitelist('project-a', 'other', scope.domain, options));
  await assert.rejects(t.addNeonAuthDomainToRedirectURIWhitelist('project-a', 'better_auth', scope.domain, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
