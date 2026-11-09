import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSpendingLimitUpdateOperations } from '../dist/plugins/neon-broker/src/spending-limit-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { spendingLimitUpdateFixture as fixture, spendingLimitUpdateArgs as args,
  spendingLimitUpdateScope as scope, spendingLimitUpdateMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'setOrganizationSpendingLimit';
const expected = { acknowledged: true, spending_limit_cents: 5000 };

test('Spending threshold decrease: exact positive preflight then one PUT, explicitly alert-only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/organizations/org-a/billing/spending_limit`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PUT']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'PUT' ? '{"spending_limit_cents":5000}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'PUT' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/organizations/org-a/billing/spending_limit/decrease');
  assert.deepEqual(p.plan.diff, { before: metadata, after: { spending_limit_cents: 5000 } });
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.enforcement, 'alert_only_computes_not_suspended');
  assert.equal(p.plan.notificationDeliveryVerified, false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Spending threshold decrease: copied scope, strict args and nested prepared diff tampering refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonSpendingLimitUpdateOperations(config, {});
  config.expectedCents = 9999;
  assert.equal(op.prepare(args).plan.diff.before.spending_limit_cents, 10000);
  for (const raw of [null, [], {}, ...[{ org_id: 'other' }, { spending_limit_cents: 4999 }, { spending_limit_cents: 0 },
    { spending_limit_cents: null }, { spending_limit_cents: '5000' },
    ...['expected_cents', 'delete', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force'].map(k => ({ [k]: true }))].map(change => ({ ...args, ...change })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'spending_limit_cents', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const operation = f.operation(name);
  const p = operation.prepare(args);
  p.plan.diff.after.spending_limit_cents = 1;
  await assert.rejects(operation.execute(p, canary, new AbortController().signal));
  assert.equal(operation.prepare(args).plan.diff.after.spending_limit_cents, 5000);
  const fresh = operation.prepare(args);
  for (const change of [{ resource: { ...fresh.resource, revision: 'other' } }, { resource: { ...fresh.resource, id: fresh.resource.id.replace('/decrease', '') } },
    ...['enforcement', 'preflight', 'effect', 'diff', 'notificationDeliveryVerified'].map(k => ({ plan: { ...fresh.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(operation.execute({ ...fresh, ...change }, canary, new AbortController().signal));
  await assert.rejects(operation.execute(fresh, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Spending threshold decrease: absent, unset, zero, unsafe, drifted or foreign preflights never mutate', async () => {
  for (const raw of [null, {}, [], ...[null, 0, -1, 1.5, '10000', 5000, 9999, Number.MAX_SAFE_INTEGER + 1].map(cents => ({ spending_limit_cents: cents })),
    ...[{ org_id: 'other' }, { org_id: null }, { project_id: 'project-a' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => response({ org_id: 'org-a', spending_limit_cents: init.method === 'PUT' ? 5000 : 10000 }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Spending threshold decrease: ambiguity gets one observation without promoting desired value or absence', async () => {
  for (const after of [metadata, { spending_limit_cents: 5000 }, { spending_limit_cents: null }, {}, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PUT') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PUT', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Spending threshold decrease: exact200 value echo only, malformed receipts and bounded failures stay uncertain', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, [], {}, { spending_limit_cents: null }, { spending_limit_cents: 10000 }, { spending_limit_cents: '5000' },
      { spending_limit_cents: 5000, org_id: 'other' }, { spending_limit_cents: 5000, pagination: {} }].map(raw => () => response(raw)),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response({ spending_limit_cents: 5000 }, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response({ spending_limit_cents: 5000 }, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PUT').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Spending threshold decrease: independent closed projection ignores unused metadata without evaluating it', async () => {
  const f = fixture();
  const op = f.operation(name);
  assert.deepEqual(op.project({ spending_limit_cents: 5000 }), expected);
  assert.equal(Object.getPrototypeOf(op.project({ spending_limit_cents: 5000 })), Object.prototype);
  for (const raw of [null, [], {}, { spending_limit_cents: 0 }, { spending_limit_cents: -0 }, { spending_limit_cents: 5000.5 },
    { spending_limit_cents: Number.MAX_SAFE_INTEGER + 1 }, { spending_limit_cents: 5000, project_id: 'p' },
    Object.assign(Object.create({ inherited: true }), { spending_limit_cents: 5000 }),
    Object.defineProperty({}, 'spending_limit_cents', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  const [direct] = createNeonSpendingLimitUpdateOperations(scope, {
    async getOrganizationSpendingLimit() { return metadata; }, async setOrganizationSpendingLimit() {
      return Object.defineProperty({ spending_limit_cents: 5000 }, 'password', { get() { throw Error('unused'); }, enumerable: true });
    },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
});

test('Spending threshold decrease: abort and ignored fetch/body deadlines bound the single mutation', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response({ spending_limit_cents: init.method === 'PUT' ? 5000 : 10000 });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'PUT' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Spending threshold decrease: no increase, unset, zero or removal; safe integer and canonical target bounds', async () => {
  for (const change of [{ organizationId: '-o' }, { organizationId: 'o'.repeat(61) }, { organizationId: '../o' }, { revision: '' },
    ...[10000, 10001, 0, -0, -1, 0.5, '5000', null, NaN, Number.MAX_SAFE_INTEGER + 1].map(cents => ({ cents })),
    ...[null, 0, 1, 5000, 10000.5, '10000', Number.MAX_SAFE_INTEGER + 1].map(expectedCents => ({ expectedCents })),
    { remove: true }]) assert.throws(() => createNeonSpendingLimitUpdateOperations({ ...scope, ...change }, {}));
  for (const [expectedCents, cents] of [[2, 1], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]]) {
    const config = { ...scope, expectedCents, cents, organizationId: 'o'.repeat(60), revision: 'r'.repeat(80) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { org_id: config.organizationId, spending_limit_cents: cents }), { acknowledged: true, spending_limit_cents: cents });
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../o', 'org\n', 'o?x=y', 'o'.repeat(81)]) assert.throws(() => t.setOrganizationSpendingLimit(bad, 5000, options));
  for (const cents of [-0, -1, 0, 1.5, '5000', NaN, null, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => t.setOrganizationSpendingLimit('org-a', cents, options));
  await assert.rejects(t.setOrganizationSpendingLimit('org-a', 5000, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
