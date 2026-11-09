import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthDomainDeleteOperations } from '../dist/plugins/neon-broker/src/auth-domain-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authDomainDeleteFixture as fixture, authDomainDeleteArgs as args, authDomainDeleteScope as scope,
  authDomainDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteBranchNeonAuthTrustedDomain';
const expected = { acknowledged: true };
const listed = { domains: [metadata] };

test('Auth domain delete: exact provider/origin presence precedes one singleton DELETE body and empty200 acknowledgement', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/domains`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/domains`, 'DELETE']]);
  assert.deepEqual(JSON.parse(f.requests[1].init.body), { auth_provider: 'better_auth', domains: [{ domain: scope.domain }] });
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  assert.equal(f.requests[0].init.body, undefined);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/auth/domains/better_auth/app.example.invalid/delete');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
  assert.equal(f.operation('deleteNeonAuthDomainFromRedirectURIWhitelist'), undefined);
});

test('Auth domain delete: copied scope and strict target/plan/authority boundaries refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthDomainDeleteOperations(config, {});
  config.domain = 'https://other.invalid';
  assert.equal(op.prepare(args).plan.domain, scope.domain);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'auth_provider', 'domain'].map(k => ({ ...args, [k]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'domains', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'domain', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['domain', 'auth_provider', 'effect', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Auth domain delete: malformed/absent/provider drift/duplicate/foreign/oversize/pagination lists refuse before DELETE', async () => {
  for (const raw of [null, {}, [], { domains: null }, { domains: [] },
    ...[{ domain: 'https://other.invalid' }, { domain: null }, { auth_provider: 'stack' }, { auth_provider: 'unknown' },
      { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ domains: [{ ...metadata, ...change }] })),
    { domains: [metadata, metadata] }, { domains: [metadata, { ...metadata, domain: scope.domain.toUpperCase() }] },
    { domains: [metadata, { domain: 'other', auth_provider: null }] },
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
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 200 }) :
    response({ domains: [metadata, { ...metadata, auth_provider: 'stack' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Auth domain delete: ambiguity observes once and never upgrades absence, presence or provider replacement to success', async () => {
  for (const after of [{ domains: [] }, listed, { domains: [{ ...metadata, auth_provider: 'stack' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Auth domain delete: only terminal empty200 acknowledges; JSON, wrong statuses, redirect, length, encoding and body errors stay uncertain', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', JSON.stringify(expected), canary].map(body => () => new Response(body, { status: 200 })),
    ...['1', 'invalid', '65537'].map(length => () => new Response(null, { status: 200, headers: { 'content-length': length } })),
    () => new Response(null, { status: 200, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  for (const make of [() => new Response(null, { status: 200, headers: { 'content-length': '0' } }),
    () => new Response('', { status: 200 }),
    () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(0)); c.close(); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Auth domain delete: ignored metadata and closed projection never expose provider diagnostics', async () => {
  const row = { ...metadata };
  for (const k of ['error', 'secret', 'url', 'created_at']) Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  const [op] = createNeonAuthDomainDeleteOperations(scope, {
    async listBranchNeonAuthTrustedDomains() { return { domains: [row] }; }, async deleteBranchNeonAuthTrustedDomain() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, domain: scope.domain },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonAuthDomainDeleteOperations(scope, {
    async listBranchNeonAuthTrustedDomains() { return { domains: [Object.defineProperty({ ...metadata }, 'domain', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async deleteBranchNeonAuthTrustedDomain() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
});

test('Auth domain delete: abort and ignored empty-response stream deadlines bound one attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 200 }) : response(listed);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Auth domain delete: canonical origin and composed-resource boundaries refuse injection and oversized scopes', async () => {
  const badOrigins = ['', 'app.invalid', 'http://app.invalid', 'https://App.invalid', 'https://app.invalid/', 'https://app.invalid:443',
    'https://*.invalid', 'https://user@app.invalid', 'https://app.invalid?q=x', 'https://app.invalid#x', 'https://app.invalid\n',
    'https://app%2einvalid', 'https://-app.invalid', 'https://' + 'a'.repeat(64) + '.invalid'];
  for (const change of [...badOrigins.map(domain => ({ domain })), { projectId: '../p' }, { projectId: '-p' }, { branchId: 'B' },
    { authProvider: 'other' }, { revision: '' }, { approved: true },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), domain: 'https://' + 'a'.repeat(60) + '.' + 'b'.repeat(59) }]) {
    assert.throws(() => createNeonAuthDomainDeleteOperations({ ...scope, ...change }, {}));
  }
  for (const authProvider of ['mock', 'stack', 'better_auth']) {
    const config = { ...scope, authProvider };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { ...args, auth_provider: authProvider }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of badOrigins) assert.throws(() => t.deleteBranchNeonAuthTrustedDomain('project-a', 'br-a', 'better_auth', bad, options));
  assert.throws(() => t.deleteBranchNeonAuthTrustedDomain('project-a', 'br-a', 'other', scope.domain, options));
  await assert.rejects(t.deleteBranchNeonAuthTrustedDomain('project-a', 'br-a', 'better_auth', scope.domain, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
