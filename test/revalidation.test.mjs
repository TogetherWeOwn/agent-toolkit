import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalTarget } from '../dist/packages/test-support/src/demo.js';
import { fixture, seed, configure, call, cleanupCalls, preflight, noEscape, provision, destroy, demoBinding, demoLimits, DemoHandler } from './helpers.mjs';

function stateWithGet(f, get) {
  return {
    get,
    reserve: input => f.state.reserve(input),
    transition: (...args) => f.state.transition(...args),
    recoverable: () => f.state.recoverable(),
  };
}

test('approval expiration is checked after awaited ownership lookup', async t => {
  const f = fixture(t); await seed(f);
  f.host.reference = 'approval-one';
  f.state.grant(f.host.reference, approvalTarget(demoBinding, destroy()), 0, 3000);
  const state = stateWithGet(f, async handle => {
    const lease = await f.state.get(handle);
    f.host.now = 4000;
    return lease;
  });
  configure(f, [], demoLimits, f.state, f.state, state);
  await preflight(f, 'destroy', destroy(), 'approval');
});

test('even an independently approved destroy cannot drift from the reserved artifact', async t => {
  const f = fixture(t); await seed(f);
  const changed = { ...destroy(), artifact: 'b'.repeat(64) };
  f.host.reference = 'approval-one';
  f.state.grant(f.host.reference, approvalTarget(demoBinding, changed), 0, 3000);
  await preflight(f, 'destroy', changed, 'scope');
});

test('inspection revalidates identity after the final awaited ledger lookup', async t => {
  const f = fixture(t); await seed(f);
  let reads = 0;
  const state = stateWithGet(f, async handle => {
    const lease = await f.state.get(handle);
    if (++reads === 4) f.host.binding = null;
    return lease;
  });
  configure(f, [], demoLimits, f.state, f.state, state);
  const result = await f.handler.invoke('inspect', { handle: 'demo-one' });
  assert.deepEqual(result, { ok: false, code: 'identity' });
  assert.equal(f.transport.calls.length, 0);
  f.transport.assertComplete(); noEscape(f, result);
});

test('cleanup stops credential-bearing calls when assignment is revoked during DELETE', async t => {
  const f = fixture(t); await seed(f);
  f.host.reference = 'approval-one';
  f.state.grant(f.host.reference, approvalTarget(demoBinding, destroy()), 0, 3000);
  const deletion = call(f, 'DELETE', 'demo-one/a', 204);
  deletion.response = () => { f.host.binding = null; return { status: 204, body: null }; };
  configure(f, [deletion]);
  const result = await f.handler.invoke('destroy', destroy());
  assert.deepEqual(result, { ok: false, code: 'reconcile' });
  assert.equal((await f.state.get('demo-one')).state, 'cleaning');
  f.transport.assertComplete(); noEscape(f, result);
});

test('negative presence with pagination is not complete absence evidence', async t => {
  const f = fixture(t); await seed(f); f.host.now = 61000;
  const calls = cleanupCalls(f);
  calls[1].response.body = { present: false, next: 'remaining-page' };
  configure(f, calls);
  const result = await f.handler.recover('expiry');
  assert.deepEqual(result, { ok: false, code: 'reconcile' });
  assert.equal((await f.state.get('demo-one')).state, 'cleaning');
  assert.equal((await f.state.get('demo-one')).reservedMinor, 50);
  f.transport.assertComplete(); noEscape(f, result);
});

test('provisioning response arriving at expiry retains uncertainty instead of activating', async t => {
  const f = fixture(t);
  const calls = ['a', 'b'].map(child => call(f, 'POST', `demo-one/${child}`, 201, { present: true }, { artifact: provision().options.artifact }));
  calls[1].response = () => { f.host.now = 2000; return { status: 201, body: { present: true } }; };
  configure(f, calls);
  const result = await f.handler.invoke('provision', provision('demo-one', { ttlSeconds: 1 }));
  assert.deepEqual(result, { ok: false, code: 'reconcile' });
  assert.equal((await f.state.get('demo-one')).state, 'uncertain');
  f.transport.assertComplete(); noEscape(f, result);
});

test('one failed recovery target does not starve later owned leases', async t => {
  const f = fixture(t); await seed(f, 'demo-a'); await seed(f, 'demo-b'); f.host.now = 61000;
  const failed = cleanupCalls(f, 'demo-a');
  failed[0].response.status = 500; failed.splice(1, 1);
  configure(f, [...failed, ...cleanupCalls(f, 'demo-b')]);
  const result = await f.handler.recover('expiry');
  assert.deepEqual(result, { ok: false, code: 'reconcile' });
  assert.equal((await f.state.get('demo-a')).state, 'cleaning');
  assert.equal((await f.state.get('demo-b')).state, 'closed');
  f.transport.assertComplete(); noEscape(f, result);
});

test('method-based host clocks retain their receiver in invocation and recovery audit', async t => {
  const f = fixture(t); await seed(f);
  const host = {
    now: 1000,
    identity() { return Promise.resolve(demoBinding); },
    approvalReference() { return undefined; },
    clock() { return this.now; },
    secrets: f.host.secrets,
  };
  configure(f, ['a', 'b'].map(child => call(f, 'GET', `demo-one/${child}`, 200, { present: true })));
  let handler = new DemoHandler(host, f.state, f.state, f.state, f.transport);
  assert.deepEqual(await handler.invoke('inspect', { handle: 'demo-one' }), { ok: true, status: 'ready' });
  f.transport.assertComplete();
  host.now = 61000; configure(f, cleanupCalls(f));
  handler = new DemoHandler(host, f.state, f.state, f.state, f.transport);
  const result = await handler.recover('expiry');
  assert.deepEqual(result, { ok: true, status: 'removed' });
  f.transport.assertComplete(); noEscape(f, result);
});
