import test from 'node:test';
import assert from 'node:assert/strict';
import { closed, text, oneOf, integer, jsonData, name, prefixedName, expiry, hash } from '../dist/packages/policy/src/index.js';
import { fixture, preflight, provision, seed, demoBinding, demoLimits, configure, call, noEscape } from './helpers.mjs';

for (const tool of ['__proto__', 'constructor', 'toString', 'fetch', 'shell', 'stripe.refund', 'cloudflare.provision', 'github.merge', '', null, 1, {}, 'inspect\n']) {
  test(`unknown dispatch ${JSON.stringify(tool)}`, async t => preflight(fixture(t), tool, {}, 'unknown_tool'));
}
const malformed = [null, [], '', 3, true, {}, { handle: 'demo-one', url: 'https://example.com' },
  { handle: 'demo-one', headers: { authorization: 'forged' } }, { handle: 'demo-one', tenant: 'forged' },
  { handle: 'demo-one', approved: true }, { handle: 'demo-one', secretRef: 'other' },
  JSON.parse('{"handle":"demo-one","__proto__":{}}'), Object.create({ handle: 'demo-one' }),
  Object.assign(Object.create(null), { handle: 'demo-one', constructor: {} }),
];
for (const [i, args] of malformed.entries()) {
  test(`closed top-level schema ${i}`, async t => preflight(fixture(t), 'inspect', args, 'schema'));
}
for (const key of ['constructor', '__proto__', 'prototype', 'unknown', 'origin', 'credential']) {
  test(`nested unknown key ${key}`, async t => {
    const args = JSON.parse(JSON.stringify(provision()));
    Object.defineProperty(args.options, key, { value: 'forged', enumerable: true });
    await preflight(fixture(t), 'provision', args, 'schema');
  });
}
for (const handle of ['', 'DEMO-one', 'demo-оne', 'demo-💣', 'demo-\n', 'demo-one\n', 'demo-..', 'demo-/a', 'demo-%2fa', 'demo-a\\b', 'demo-a\0', 'demo-é', 'demo-ａ', 'a'.repeat(64)]) {
  test(`ASCII name ${JSON.stringify(handle)}`, async t => preflight(fixture(t), 'inspect', { handle }, 'schema'));
}
for (const handle of ['foreign-one', 'demo', 'demox-one']) {
  test(`prefix guard ${handle}`, async t => preflight(fixture(t), 'inspect', { handle }, 'scope'));
}
for (const ttl of [0, -1, -0, 1.5, NaN, Infinity, -Infinity, '60', null, 10801, Number.MAX_SAFE_INTEGER + 1]) {
  test(`numeric TTL schema ${String(ttl)}`, async t => preflight(fixture(t), 'provision', provision('demo-one', { ttlSeconds: ttl }), 'schema'));
}
for (const spend of [-1, -0, 1.1, Infinity, NaN, '50', Number.MAX_SAFE_INTEGER + 1]) {
  test(`currency schema ${String(spend)}`, async t => preflight(fixture(t), 'provision', provision('demo-one', { spendMinor: spend }), 'schema'));
}
for (const overrides of [{ ttlSeconds: 61 }, { spendMinor: 49 }, { spendMinor: 101 }]) {
  test(`finite caps ${JSON.stringify(overrides)}`, async t => preflight(fixture(t), 'provision', provision('demo-one', overrides), 'cap'));
}
for (const key of ['tenant', 'agent', 'project', 'task']) {
  test(`trusted identity mismatch ${key}`, async t => {
    const f = fixture(t); f.host.binding = { ...demoBinding, [key]: 'foreign' };
    await preflight(f, 'inspect', { handle: 'demo-one' }, 'identity');
  });
  test(`ledger binding mismatch despite valid prefix ${key}`, async t => {
    const f = fixture(t); await seed(f, 'demo-one', { ...demoBinding, [key]: 'foreign' });
    await preflight(f, 'inspect', { handle: 'demo-one' }, 'scope');
  });
}
for (const state of ['intent', 'uncertain', 'cleaning', 'closed']) {
  test(`non-active ledger ${state}`, async t => {
    const f = fixture(t); await seed(f, 'demo-one', demoBinding, state === 'closed' || state === 'cleaning' ? 'active' : state);
    if (state === 'cleaning' || state === 'closed') await f.state.transition('demo-one', ['active'], 'cleaning');
    if (state === 'closed') await f.state.transition('demo-one', ['cleaning'], 'closed');
    await preflight(f, 'inspect', { handle: 'demo-one' }, 'scope');
  });
}
test('missing, stale assignment and expired lease fail before credentials', async t => {
  for (const mode of ['missing', 'null', 'invalid', 'outage', 'expired']) {
    await t.test(mode, async s => {
      const f = fixture(s);
      if (mode === 'expired') { await seed(f); f.host.now = 61000; }
      if (mode === 'null') f.host.binding = null;
      if (mode === 'invalid') f.host.binding = { ...demoBinding, task: 'a\n' };
      if (mode === 'outage') f.host.identity = async () => { throw new Error(f.broad); };
      await preflight(f, 'inspect', { handle: 'demo-one' }, mode === 'missing' ? 'scope' : mode === 'expired' ? 'expired' : 'identity');
    });
  }
});
test('JSON descriptor, symbol, cyclic, sparse, depth, size and generated malformed boundaries', () => {
  let getterCalled = false;
  const accessor = Object.defineProperty({}, 'x', { enumerable: true, get() { getterCalled = true; return 1; } });
  const cycle = {}; cycle.x = cycle;
  const deep = {}; let p = deep; for (let i = 0; i < 10; i++) { p.child = {}; p = p.child; }
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
  const bad = [accessor, cycle, deep, hidden, { [Symbol('x')]: 1 }, new Date(), [,,], undefined, 1n, () => {}, 'x'.repeat(4097), Array(65).fill(1), { x: '\ud800' }];
  for (let i = 0; i < 32; i++) bad.push({ x: String.fromCharCode(i) });
  for (const value of bad) assert.throws(() => jsonData(value));
  assert.equal(getterCalled, false);
  assert.throws(() => jsonData(Array(5).fill('x'.repeat(4096))));
  assert.doesNotThrow(() => jsonData({ nested: [true, false, null, 1] }));
  assert.doesNotThrow(() => name.parse('a'.repeat(63)));
  assert.doesNotThrow(() => prefixedName('demo-a', 'demo-'));
  assert.throws(() => prefixedName('demo-a', 'd'));
  assert.equal(expiry(1, 1, demoLimits), 1001);
  assert.throws(() => expiry(Number.MAX_SAFE_INTEGER, 60, demoLimits));
  assert.throws(() => expiry(1, 0, demoLimits));
  assert.equal(hash({ b: 1, a: 2 }), hash({ a: 2, b: 1 }));
  assert.throws(() => integer(1, Infinity));
  assert.throws(() => text(1, /a/g));
  assert.equal(oneOf(['small', 'medium']).parse('small'), 'small');
  assert.throws(() => oneOf(['small']).parse('large'));
  assert.throws(() => closed({ x: closed({ y: integer(0, 1) }) }).parse({ x: { y: 1, z: 0 } }));
});
test('immutable parsed snapshot and last-moment scope revalidation', async t => {
  const f = fixture(t); await seed(f);
  const args = { handle: 'demo-one' };
  const audit = { append: async r => { await f.state.append(r); args.handle = 'demo-other'; if (r.phase === 'intent') f.host.binding = null; } };
  configure(f, [], demoLimits, f.state, audit);
  const result = await f.handler.invoke('inspect', args);
  assert.deepEqual(result, { ok: false, code: 'identity' });
  assert.equal(f.host.secretCalls, 0);
  f.transport.assertComplete(); noEscape(f, result);
});
test('expiry during multi-read inspection stops next call', async t => {
  const f = fixture(t); await seed(f);
  const expected = call(f, 'GET', 'demo-one/a', 200, { present: true });
  expected.response = () => { f.host.now = 61000; return { status: 200, body: { present: true } }; };
  configure(f, [expected]);
  assert.deepEqual(await f.handler.invoke('inspect', { handle: 'demo-one' }), { ok: false, code: 'expired' });
  f.transport.assertComplete();
});
