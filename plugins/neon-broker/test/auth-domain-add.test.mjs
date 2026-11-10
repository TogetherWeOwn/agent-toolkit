import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthDomainAddOperations } from '../dist/plugins/neon-broker/src/auth-domain-add.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authDomainAddFixture as fixture, authDomainAddArgs as args, authDomainAddScope as scope,
  canary, response } from './helpers.mjs';

const name = 'addBranchNeonAuthTrustedDomain';
const expected = { acknowledged: true };
const listed = { domains: [] };
const metadata = { domain: scope.domain, auth_provider: scope.authProvider };

test('Auth domain add: absence preflight precedes one singular-domain POST and terminal empty201 acknowledgement', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const url = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/domains`;
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
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/auth/domains/better_auth/app.example.invalid/add');
  assert.equal(p.plan.completion, 'acknowledgement_only');
  assert.equal(p.plan.diff.after, 'redirect_trust_expansion_requested');
  for (const k of ['persistenceVerified', 'enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(p.plan[k], false);
  assert.equal(f.operation('addNeonAuthDomainToRedirectURIWhitelist'), undefined);
});

test('Auth domain add: copied scope, strict arguments and exact prepared plan refuse overrides before transport', async () => {
  const config = { ...scope }, [op] = createNeonAuthDomainAddOperations(config, {});
  config.domain = 'https://other.invalid';
  assert.equal(op.prepare(args).plan.domain, scope.domain);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'auth_provider', 'domain'].map(k => ({ ...args, [k]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'domains', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'domain', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture(), p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['domain', 'auth_provider', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Auth domain add: existing/case-variant origins and malformed/duplicate/foreign/oversize/paginated lists refuse before POST', async () => {
  for (const raw of [null, {}, [], { domains: null }, { domains: [metadata] }, { domains: [{ ...metadata, domain: scope.domain.toUpperCase() }] },
    ...[{ domain: null }, { auth_provider: 'unknown' }, { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }]
      .map(change => ({ domains: [{ ...metadata, ...change }] })),
    { domains: [metadata, metadata] }, { domains: [{ ...metadata, auth_provider: 'stack' }, { ...metadata, auth_provider: 'stack' }] },
    { domains: Array.from({ length: 31 }, (_, i) => ({ ...metadata, domain: `https://app${i}.invalid` })) },
    ...[{ project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ ...listed, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'POST' ? new Response(null, { status: 201 }) :
    response({ domains: [{ ...metadata, auth_provider: 'stack' }, { ...metadata, domain: 'https://other.invalid' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Auth domain add: ambiguity observes once and never upgrades presence, absence or provider replacement to success', async () => {
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

test('Auth domain add: wrong statuses, nonempty/encoded/redirected/failed responses stay uncertain; only empty201 acknowledges', async () => {
  for (const make of [...[200, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
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

test('Auth domain add: closed projection and unused list metadata never expose diagnostics or evaluate unused fields', async () => {
  const row = { domain: 'https://other.invalid', auth_provider: 'better_auth' };
  for (const k of ['error', 'secret', 'url', 'created_at']) Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  const [op] = createNeonAuthDomainAddOperations(scope, {
    async listBranchNeonAuthTrustedDomains() { return { domains: [row] }; }, async addBranchNeonAuthTrustedDomain() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, domain: scope.domain },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  let posts = 0;
  const [poisoned] = createNeonAuthDomainAddOperations(scope, {
    async listBranchNeonAuthTrustedDomains() { return { domains: [Object.defineProperty({ ...row }, 'domain', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async addBranchNeonAuthTrustedDomain() { posts++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(posts, 0);
});

test('Auth domain add: cancellation and ignored transport/body deadlines bound one attempt', async () => {
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

test('Auth domain add: strict shared origin/provider and composed resource bounds refuse injection before transport', async () => {
  const badOrigins = ['', 'app.invalid', 'http://app.invalid', 'https://App.invalid', 'https://app.invalid/', 'https://app.invalid:443',
    'https://*.invalid', 'https://user@app.invalid', 'https://app.invalid?q=x', 'https://app.invalid#x', 'https://app.invalid\n',
    'https://app%2einvalid', 'https://-app.invalid', 'https://' + 'a'.repeat(64) + '.invalid'];
  for (const change of [...badOrigins.map(domain => ({ domain })), { projectId: '../p' }, { projectId: '-p' }, { branchId: 'B' },
    { authProvider: 'other' }, { revision: '' }, { approved: true },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), domain: 'https://' + 'a'.repeat(60) + '.' + 'b'.repeat(59) }]) {
    assert.throws(() => createNeonAuthDomainAddOperations({ ...scope, ...change }, {}));
  }
  for (const authProvider of ['mock', 'stack', 'better_auth']) {
    const f = fixture(null, { ...scope, authProvider });
    assert.deepEqual(await f.run(name, { ...args, auth_provider: authProvider }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of badOrigins) assert.throws(() => t.addBranchNeonAuthTrustedDomain('project-a', 'br-a', 'better_auth', bad, options));
  assert.throws(() => t.addBranchNeonAuthTrustedDomain('project-a', 'br-a', 'other', scope.domain, options));
  await assert.rejects(t.addBranchNeonAuthTrustedDomain('project-a', 'br-a', 'better_auth', scope.domain, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
