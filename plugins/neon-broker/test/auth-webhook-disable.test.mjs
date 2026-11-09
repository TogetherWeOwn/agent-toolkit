import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthWebhookDisableOperations } from '../dist/plugins/neon-broker/src/auth-webhook-disable.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { authWebhookDisableFixture as fixture, authWebhookDisableArgs as args,
  authWebhookDisableScope as scope, canary, response } from './helpers.mjs';

const name = 'updateNeonAuthWebhookConfig';
const expected = { accepted: true };
const configuration = ['webhook_url', 'enabled_events', 'timeout_seconds'];

test('Webhook disable: enabled preflight then one fixed false PUT, no destination or delivery call, acknowledgement only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/webhooks`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PUT']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PUT' ? '{"enabled":false}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'PUT' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/auth/webhooks/disable');
  assert.deepEqual(op.prepare(args).plan.diff, { before: { enabled: true }, after: { enabled: false } });
  assert.equal(op.prepare(args).plan.enabled, false);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.omittedConfiguration, 'provider_defined_put_semantics');
  for (const k of ['configurationPreservationVerified', 'deliveryStoppageVerified', 'queuedDeliveriesCancelled', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Webhook disable: strict copied scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonAuthWebhookDisableOperations(config, {});
  config.branchId = 'other';
  assert.equal(op.prepare(args).plan.branch_id, 'br-a');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' },
    ...['enabled', ...configuration, 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    { ...args, enabled: false }, { ...args, enabled_events: [] }, Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/disable', '') } },
    ...['branch_id', 'preflight', 'enabled', 'effect', 'configurationPreservationVerified', 'omittedConfiguration', 'deliveryStoppageVerified'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Webhook disable: missing, false, malformed or foreign preflight never mutates', async () => {
  for (const raw of [null, {}, [], { enabled: false }, { enabled: null }, { enabled: 1 }, { enabled: 'true' },
    ...[{ branch_id: 'other' }, { branch_id: null }, { project_id: 'other' }, { pagination: {} }].map(change => ({ enabled: true, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response({ project_id: 'project-a', branch_id: 'br-a', enabled: init.method !== 'PUT' }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Webhook disable: ambiguity observes once without promoting false or absence to completion', async () => {
  for (const after of [{ enabled: true }, { enabled: false }, { enabled: false, branch_id: 'other' }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PUT') throw Error(canary);
      return response(n === 1 ? { enabled: true } : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PUT', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => response(init.method === 'PUT' ? {} : { enabled: true }, { status: n > 1 ? 404 : 200 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Webhook disable: only valid200 false echo accepts; body, status, redirect and bounds refuse', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, { enabled: true }, { enabled: null }, { enabled: 0 },
      { enabled: false, project_id: 'other' }, { enabled: false, branch_id: 'other' }, { enabled: false, pagination: {} }].map(raw => () => response(raw)),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response({ enabled: false }, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response({ enabled: false }, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response({ enabled: true }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PUT').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Webhook disable: destination, events and timeout getters never evaluate and acknowledgement is closed without preservation proof', async () => {
  const row = value => {
    const raw = { enabled: value };
    for (const k of [...configuration, 'password', 'url', 'client_secret', 'error', 'created_at', 'auth_data']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonAuthWebhookDisableOperations(scope, {
    async getNeonAuthWebhookConfig() { return row(true); }, async updateNeonAuthWebhookConfig() { return row(false); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { enabled: true }, { enabled: false, project_id: 'other' },
    Object.defineProperty({}, 'enabled', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ enabled: false, webhook_url: canary, enabled_events: canary, timeout_seconds: canary }), expected);
});

test('Webhook disable: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response({ enabled: init.method !== 'PUT' });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response({ enabled: true }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Webhook disable: canonical target bounds match fixed PUT transport without caller body or enabling override', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { branchId: '-b' }, { revision: '' }, { enabled: false }, { enabled: true }, ...configuration.map(k => ({ [k]: [] }))]) assert.throws(() => createNeonAuthWebhookDisableOperations({ ...scope, ...change }, {}));
  for (const size of [1, 60]) {
    const config = { ...scope, projectId: 'p'.repeat(size), branchId: 'b'.repeat(size) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) {
    assert.throws(() => t.updateNeonAuthWebhookConfig(bad, 'br-a', options));
    assert.throws(() => t.updateNeonAuthWebhookConfig('project-a', bad, options));
  }
  await assert.rejects(t.updateNeonAuthWebhookConfig('project-a', 'br-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
