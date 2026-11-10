import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthClientCreateOperations } from '../dist/plugins/neon-broker/src/auth-client-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authClientCreateFixture as fixture, authClientCreateArgs as args, authClientCreateScope as scope,
  authClientCreateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'createNeonAuthOAuthClient';
const expected = { client_id: 'client-new', acknowledged: true };
const body = { name: scope.name, redirect_uris: [scope.redirectOrigin], type: 'public', resources: [scope.resourceOrigin], skip_consent: false };

test('Public client create: whole-list absence then one fixed public consent-required POST and closed201 acknowledgement', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/oauth-provider/clients`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'POST']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'POST' ? JSON.stringify(body) : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'POST' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  const p = op.prepare(args);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients/create/public_app');
  assert.deepEqual(p.plan.diff, { before: 'selected_client_name_absent', after: body });
  assert.equal(p.plan.completion, 'acknowledgement_only');
  for (const key of ['persistenceVerified', 'enforcementVerified', 'resourceConfigurationVerified']) assert.equal(p.plan[key], false);
});

test('Public client create: copied exact scope, closed arguments and prepared plan refuse trust and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthClientCreateOperations(config, {});
  config.redirectOrigin = 'https://other.example.invalid';
  assert.equal(op.prepare(args).plan.redirect_origin, scope.redirectOrigin);
  for (const raw of [null, [], {}, ...Object.keys(args).map(k => ({ ...args, [k]: 'other' })),
    ...['type', 'client_secret', 'skip_consent', 'redirect_uris', 'resources', 'disabled', 'approved', 'agent', 'credential', 'body', 'retry', 'runtimeContext', 'revision'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: 'other' } },
    ...['type', 'skip_consent', 'redirect_origin', 'resource_origin', 'effect', 'preflight'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Public client create: existing name refuses regardless of type or disabled state; other names do not collide', async () => {
  for (const type of ['public', 'confidential']) for (const disabled of [true, false]) {
    const f = fixture(() => response({ clients: [{ ...receipt, type, disabled }] }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) : response({ clients: [{ client_id: 'other', name: 'other' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Public client create: terminal full-list cap, duplicate identity, malformed bindings and unavailable status refuse before POST', async () => {
  for (const raw of [null, [], {}, { clients: null }, { clients: [receipt, receipt] },
    { clients: Array.from({ length: 31 }, (_, n) => ({ client_id: `other-${n}`, name: 'other' })) },
    ...[{ client_id: '' }, { client_id: 'x'.repeat(257) }, { name: '' }, { name: 'x'.repeat(101) }, { name: 'x\n' },
      { branch_id: 'other' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ clients: [{ client_id: 'other', name: 'other', ...change }] })),
    ...[{ project_id: 'other' }, { branch_id: null }, { pagination: {} }].map(change => ({ clients: [], ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(() => response({ clients: [] }, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Public client create: ambiguous POST observes once without promoting presence, absence or replacement to success', async () => {
  for (const after of [{ clients: [] }, { clients: [receipt] }, { clients: [{ ...receipt, type: 'confidential' }] }, null, {}, { clients: [], branch_id: 'other' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? { clients: [] } : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Public client create: only exact201 public configuration echo accepts; MIME, redirect, bytes and stream failures stay uncertain', async () => {
  for (const make of [...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, ...[{ client_id: '' }, { name: 'other' }, { type: 'confidential' }, { skip_consent: true }, { disabled: true },
      { redirect_uris: [] }, { redirect_uris: [scope.redirectOrigin, scope.redirectOrigin] }, { redirect_uris: ['https://other.example.invalid'] },
      { resources: [] }, { resources: ['https://other.example.invalid'] }, { branch_id: 'other' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ ...receipt, ...change }))].map(raw => () => response(raw, { status: 201 })),
    () => new Response(canary, { status: 201, headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { status: 201, headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { status: 201, headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { status: 201, headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response({ clients: [] }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Public client create: unused secret and metadata accessors never evaluated; output excludes trust configuration and raw extras', async () => {
  const ignored = raw => {
    for (const k of ['client_secret', 'created_at', 'password', 'error', 'token']) Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    return raw;
  };
  const [op] = createNeonAuthClientCreateOperations(scope, {
    async listNeonAuthOAuthClients() { return { clients: [ignored({ client_id: 'other', name: 'other' })] }; },
    async createNeonAuthOAuthClient() { return ignored({ ...receipt }); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { ...receipt, type: 'confidential' },
    Object.defineProperty({ ...receipt }, 'client_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...receipt, client_secret: canary, created_at: canary }), expected);
});

test('Public client create: abort and ignored fetch/body deadlines bound a single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? response(receipt, { status: 201 }) : response({ clients: [] });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response({ clients: [] }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Public client create: canonical bounds match direct transport; no confidential, loopback, path, wildcard or multi-target override', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: '../p' }, { projectId: 'p'.repeat(61) }, { branchId: '-b' }, { name: '' },
    { name: 'n'.repeat(61) }, { name: 'a/b' }, { revision: '' }, { type: 'confidential' }, { skip_consent: true },
    ...['http://localhost', 'https://example.invalid/', 'https://example.invalid/cb', 'https://EXAMPLE.invalid', 'https://*.invalid',
      'https://user@example.invalid', 'https://example.invalid:443', 'https://example.invalid?q=x', 'https://example.invalid#x', 'https://example.invalid\n'].flatMap(v => [{ redirectOrigin: v }, { resourceOrigin: v }])]) assert.throws(() => createNeonAuthClientCreateOperations({ ...scope, ...change }, {}));
  const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), name: 'n'.repeat(60),
    redirectOrigin: 'https://' + 'a'.repeat(60) + '.' + 'b'.repeat(59), resourceOrigin: 'https://' + 'c'.repeat(60) + '.' + 'd'.repeat(59) };
  const f = fixture(null, config);
  assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, name: config.name,
    redirect_origin: config.redirectOrigin, resource_origin: config.resourceOrigin }), expected);
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'p\n', 'p?x=y', 'p'.repeat(61)]) {
    assert.throws(() => t.createNeonAuthOAuthClient(bad, 'br-a', scope.name, scope.redirectOrigin, scope.resourceOrigin, options));
    assert.throws(() => t.createNeonAuthOAuthClient('project-a', bad, scope.name, scope.redirectOrigin, scope.resourceOrigin, options));
  }
  for (const bad of ['', '../name', 'n'.repeat(61)]) assert.throws(() => t.createNeonAuthOAuthClient('project-a', 'br-a', bad, scope.redirectOrigin, scope.resourceOrigin, options));
  assert.throws(() => t.createNeonAuthOAuthClient('project-a', 'br-a', scope.name, 'http://localhost', scope.resourceOrigin, options));
  assert.throws(() => t.createNeonAuthOAuthClient('project-a', 'br-a', scope.name, scope.redirectOrigin, 'http://localhost', options));
  await assert.rejects(t.createNeonAuthOAuthClient('project-a', 'br-a', scope.name, scope.redirectOrigin, scope.resourceOrigin, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});

test('Public client create: bounded opaque server IDs include punctuation and long IDs without leaking secret fields', async () => {
  for (const client_id of ['a', 'a.b-c_d', 'c'.repeat(128)]) assert.deepEqual(await fixture({ ...receipt, client_id }).run(name, args), { client_id, acknowledged: true });
  for (const client_id of ['c'.repeat(129), '/client', 'client\n']) await assert.rejects(fixture({ ...receipt, client_id }).run(name, args), { message: 'OUTCOME_UNCERTAIN' });
});
