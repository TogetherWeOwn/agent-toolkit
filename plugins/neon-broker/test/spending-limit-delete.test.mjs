import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonSpendingLimitDeleteOperations } from '../dist/plugins/neon-broker/src/spending-limit-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { spendingLimitDeleteFixture as fixture, spendingLimitDeleteArgs as args,
  spendingLimitDeleteScope as scope, spendingLimitDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteOrganizationSpendingLimit';
const expected = { acknowledged: true };

test('Spending threshold removal: exact positive preflight then one bodyless DELETE, alert-only acknowledgement', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/organizations/org-a/billing/spending_limit`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.body, undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/organizations/org-a/billing/spending_limit/delete');
  assert.deepEqual(p.plan.diff, { before: metadata, after: { spending_limit_cents: null } });
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.enforcement, 'alert_only_computes_not_suspended');
  assert.equal(p.plan.notificationStateVerified, false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Spending threshold removal: copied scope, strict args and prepared diff tampering refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonSpendingLimitDeleteOperations(config, {});
  config.expectedCents = 9999;
  config.organizationId = 'other';
  assert.equal(op.prepare(args).plan.diff.before.spending_limit_cents, 10000);
  for (const raw of [null, [], {}, ...[{ org_id: 'other' }, { spending_limit_cents: null }, { expected_cents: 10000 },
    ...['delete', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'body'].map(k => ({ [k]: true }))].map(change => ({ ...args, ...change })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({}, 'org_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const operation = f.operation(name);
  const p = operation.prepare(args);
  p.plan.diff.before.spending_limit_cents = 1;
  await assert.rejects(operation.execute(p, canary, new AbortController().signal));
  assert.equal(operation.prepare(args).plan.diff.before.spending_limit_cents, 10000);
  const fresh = operation.prepare(args);
  for (const change of [{ resource: { ...fresh.resource, revision: 'other' } }, { resource: { ...fresh.resource, id: fresh.resource.id.replace('/delete', '/decrease') } },
    ...['enforcement', 'preflight', 'effect', 'diff', 'notificationStateVerified'].map(k => ({ plan: { ...fresh.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(operation.execute({ ...fresh, ...change }, canary, new AbortController().signal));
  await assert.rejects(operation.execute(fresh, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Spending threshold removal: absent, unset, zero, unsafe, drifted or foreign preflights never mutate', async () => {
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
  const f = fixture((url, init) => response(init.method === 'DELETE' ? {} : { org_id: 'org-a', spending_limit_cents: 10000 }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Spending threshold removal: ambiguity gets one observation without promoting null or absence', async () => {
  for (const after of [metadata, { spending_limit_cents: 5000 }, { spending_limit_cents: null }, {}, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Spending threshold removal: exact200 empty JSON only, malformed receipts and bounded failures stay uncertain', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 500].map(status => () => new Response(null, { status })),
    ...[null, [], { acknowledged: true }, { spending_limit_cents: null }, { org_id: 'org-a' }, { pagination: {} }].map(raw => () => response(raw)),
    () => new Response(null, { headers: { 'content-type': 'application/json' } }),
    () => new Response(canary, { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response({}, { headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response({}, { headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Spending threshold removal: independent closed projection and ignored preflight metadata never expose data', async () => {
  const op = fixture().operation(name);
  assert.deepEqual(op.project({}), expected);
  assert.equal(Object.getPrototypeOf(op.project({})), Object.prototype);
  for (const raw of [null, [], { acknowledged: true }, { org_id: 'org-a' }, Object.assign(Object.create({ inherited: true }), {}),
    Object.defineProperty({}, 'password', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  const [direct] = createNeonSpendingLimitDeleteOperations(scope, {
    async getOrganizationSpendingLimit() {
      return Object.defineProperty({ ...metadata }, 'password', { get() { throw Error('unused'); }, enumerable: true });
    }, async deleteOrganizationSpendingLimit() { return {}; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
});

test('Spending threshold removal: abort and ignored fetch/body deadlines bound the single mutation', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return response(init.method === 'DELETE' ? {} : metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Spending threshold removal: positive safe integer and canonical target bounds, no body overrides', async () => {
  for (const change of [{ organizationId: '-o' }, { organizationId: 'o'.repeat(61) }, { organizationId: '../o' }, { revision: '' },
    ...[null, 0, -0, -1, 0.5, NaN, '10000', Number.MAX_SAFE_INTEGER + 1].map(expectedCents => ({ expectedCents })),
    { cents: null }, { remove: true }]) assert.throws(() => createNeonSpendingLimitDeleteOperations({ ...scope, ...change }, {}));
  for (const expectedCents of [1, Number.MAX_SAFE_INTEGER]) {
    const config = { ...scope, expectedCents, organizationId: 'o'.repeat(60), revision: 'r'.repeat(80) };
    assert.deepEqual(await fixture(null, config).run(name, { org_id: config.organizationId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../o', 'org\n', 'o?x=y', 'o'.repeat(61)]) assert.throws(() => t.deleteOrganizationSpendingLimit(bad, options));
  await assert.rejects(t.deleteOrganizationSpendingLimit('org-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
