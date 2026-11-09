import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthClientDisableOperations } from '../dist/plugins/neon-broker/src/auth-client-disable.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authClientDisableFixture as fixture, authClientDisableArgs as args, authClientDisableMetadata as metadata,
  authClientDisableScope as scope, canary, response } from './helpers.mjs';

const name = 'updateNeonAuthOAuthClient';
const expected = { accepted: true };
const disabled = { ...metadata, disabled: true };

test('OAuth client disable: identity/type/enabled preflight then one fixed true PATCH without configuration and acknowledgement only', async () => {
  for (const expectedType of ['confidential', 'public']) {
    const f = fixture(null, { ...scope, expectedType });
    assert.deepEqual(await f.run(name, args), expected);
    const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/oauth-provider/clients/clientA`;
    assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PATCH']]);
    for (const { init } of f.requests) {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${canary}`);
      assert.equal(init.headers['Idempotency-Key'], undefined);
      assert.equal(init.body, init.method === 'PATCH' ? '{"disabled":true}' : undefined);
      assert.equal(init.headers['Content-Type'], init.method === 'PATCH' ? 'application/json' : undefined);
    }
    const op = f.operation(name);
    assert.equal(op.tier, 'reserved');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/auth/oauth-provider/clients/clientA/disable');
    assert.deepEqual(op.prepare(args).plan.diff, { before: { disabled: false }, after: { disabled: true } });
    assert.equal(op.prepare(args).plan.disabled, true);
    assert.equal(op.prepare(args).plan.expectedType, expectedType);
    assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
    for (const k of ['configurationReplaced', 'enforcementVerified', 'issuedTokensRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
  }
});

test('OAuth client disable: strict copied scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthClientDisableOperations(config, {});
  config.clientId = 'other';
  config.expectedType = 'public';
  assert.equal(op.prepare(args).plan.client_id, 'clientA');
  assert.equal(op.prepare(args).plan.expectedType, 'confidential');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' }, { ...args, client_id: 'other' },
    ...['disabled', 'type', 'expectedType', 'name', 'redirect_uris', 'resources', 'skip_consent', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    { ...args, disabled: false }, { ...args, redirect_uris: [] }, { ...args, resources: [] }, Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'client_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/disable', '') } },
    ...['client_id', 'expectedType', 'preflight', 'disabled', 'effect', 'configurationReplaced', 'enforcementVerified'].map(k => ({ plan: { ...p.plan, [k]: p.plan[k] === false } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('OAuth client disable: missing, disabled, malformed or foreign preflight never mutates', async () => {
  for (const raw of [null, {}, [], ...[{ client_id: 'other' }, { client_id: null }, { type: 'public' }, { type: 'other' }, { type: null },
    { disabled: true }, { disabled: null }, { disabled: 0 }, { disabled: 'false' }, { branch_id: 'other' }, { branch_id: null },
    { project_id: 'other' }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const key of ['client_id', 'type', 'disabled']) {
    const raw = { ...metadata }; delete raw[key];
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response({ ...metadata, project_id: 'project-a', branch_id: 'br-a', disabled: init.method === 'PATCH' }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('OAuth client disable: ambiguity observes once without promoting disabled or absence to completion', async () => {
  for (const after of [metadata, disabled, { ...disabled, client_id: 'other' }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => response(init.method === 'PATCH' ? {} : metadata, { status: n > 1 ? 404 : 200 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('OAuth client disable: only valid200 exact client/type/true echo accepts; response and transport bounds refuse', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, metadata, { ...disabled, client_id: 'other' }, { ...disabled, type: 'public' }, { ...disabled, disabled: null },
      { ...disabled, disabled: 1 }, { ...disabled, branch_id: 'other' }, { ...disabled, pagination: {} }].map(raw => () => response(raw)),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(disabled, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(disabled, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('OAuth client disable: redirects/resources/consent/secret metadata never evaluate and output is closed', async () => {
  const row = value => {
    const raw = { ...metadata, disabled: value };
    for (const k of ['name', 'redirect_uris', 'resources', 'skip_consent', 'url', 'client_secret', 'error', 'created_at', 'auth_data']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonAuthClientDisableOperations(scope, {
    async getNeonAuthOAuthClient() { return row(false); }, async updateNeonAuthOAuthClient() { return row(true); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, metadata, { ...disabled, project_id: 'other' },
    Object.defineProperty({ ...disabled }, 'disabled', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...disabled, client_secret: canary, resources: canary, ignored: canary }), expected);
});

test('OAuth client disable: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response({ ...metadata, disabled: init.method === 'PATCH' });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('OAuth client disable: canonical identity bounds match transport without enabling or configuration override', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { branchId: '-b' }, { clientId: 'a-b' }, { clientId: 'c'.repeat(65) }, { clientId: '' }, { expectedType: 'other' }, { revision: '' },
    { disabled: true }, { disabled: false }, { resources: [] }]) assert.throws(() => createNeonAuthClientDisableOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size), clientId: 'C'.repeat(size === 60 ? 64 : 1) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, client_id: config.clientId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) {
    assert.throws(() => t.updateNeonAuthOAuthClient(bad, 'br-a', 'clientA', options));
    assert.throws(() => t.updateNeonAuthOAuthClient('project-a', bad, 'clientA', options));
  }
  for (const bad of ['../c', 'c\n', 'c?x=y', '', 'c'.repeat(65)]) assert.throws(() => t.updateNeonAuthOAuthClient('project-a', 'br-a', bad, options));
  await assert.rejects(t.updateNeonAuthOAuthClient('project-a', 'br-a', 'clientA', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
