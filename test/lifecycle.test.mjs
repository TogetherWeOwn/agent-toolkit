import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hash } from '../dist/packages/policy/src/index.js';
import { approvalTarget } from '../dist/packages/test-support/src/demo.js';
import { fixture, preflight, provision, destroy, seed, demoBinding, demoLimits, configure, call, cleanupCalls, noEscape, SqliteFixture, DemoHandler } from './helpers.mjs';

for (const variant of ['missing', 'forged', 'expired', 'future', 'revoked', 'replay', 'binding', 'handle', 'arguments', 'artifact', 'version', 'policy']) {
  test(`approval refusal ${variant}`, async t => {
    const f = fixture(t); await seed(f);
    const target = approvalTarget(demoBinding, destroy());
    if (variant === 'binding') target.binding = { ...demoBinding, agent: 'other' };
    if (variant === 'handle') target.handle = 'demo-other';
    if (variant === 'arguments') target.argumentsHash = hash({ ...destroy(), approved: true });
    if (variant === 'artifact') target.argumentsHash = hash({ ...destroy(), artifact: 'b'.repeat(64) });
    if (variant === 'version') target.toolVersion = '2';
    if (variant === 'policy') target.policyVersion = '2';
    if (variant !== 'missing') f.host.reference = 'approval-one';
    if (!['missing', 'forged'].includes(variant)) {
      f.state.grant('approval-one', target, variant === 'future' ? 2000 : 0, variant === 'expired' ? 1000 : 3000);
      if (variant === 'revoked') f.state.revoke('approval-one');
      if (variant === 'replay') await f.state.consume('approval-one', target, 1000);
    }
    await preflight(f, 'destroy', destroy(), 'approval');
  });
}
test('approval evaluator outage is closed', async t => {
  const f = fixture(t); await seed(f);
  configure(f, [], demoLimits, { consume: async () => { throw new Error(f.broad); } });
  await preflight(f, 'destroy', destroy(), 'unavailable');
});
test('one approval is consumed once under concurrent processes and survives reopen', async t => {
  const f = fixture(t); const target = approvalTarget(demoBinding, destroy());
  f.state.grant('approval-one', target, 0, 10000);
  const outcomes = await Promise.all([processCall(f.path, 'approval', target), processCall(f.path, 'approval', target)]);
  assert.deepEqual(outcomes.sort(), ['false', 'true']);
  const reopened = new SqliteFixture(f.path);
  try { assert.equal(await reopened.consume('approval-one', target, 1000), false); } finally { reopened.close(); }
});
test('approved destruction verifies both children and closes only afterwards', async t => {
  const f = fixture(t); await seed(f);
  f.host.reference = 'approval-one'; f.state.grant(f.host.reference, approvalTarget(demoBinding, destroy()), 0, 3000);
  configure(f, cleanupCalls(f));
  const result = await f.handler.invoke('destroy', destroy());
  assert.deepEqual(result, { ok: true, status: 'removed' });
  assert.equal((await f.state.get('demo-one')).state, 'closed');
  f.transport.assertComplete(); noEscape(f, result);
});
for (const ttl of [1, 60]) {
  test(`provision boundary TTL ${ttl} and exact worst-case spend`, async t => {
    const f = fixture(t);
    configure(f, ['a', 'b'].map(child => call(f, 'POST', `demo-one/${child}`, 201, { present: true, nested: { token: f.derived, credential: f.broad } }, { artifact: provision().options.artifact })));
    const result = await f.handler.invoke('provision', provision('demo-one', { ttlSeconds: ttl }));
    assert.deepEqual(result, { ok: true, status: 'ready' });
    const lease = await f.state.get('demo-one');
    assert.equal(lease.expiresAt, 1000 + ttl * 1000); assert.equal(lease.reservedMinor, 50);
    f.transport.assertComplete(); noEscape(f, result);
    const before = lease.expiresAt; f.host.secretCalls = 0; configure(f, []);
    await preflight(f, 'provision', provision(), 'conflict');
    assert.equal((await f.state.get('demo-one')).expiresAt, before);
  });
}
test('atomic budget and count caps across processes', async t => {
  const f = fixture(t);
  const input = { binding: demoBinding, now: 1000, expiresAt: 61000, worstCaseMinor: 50, limits: demoLimits, fingerprint: hash(provision()) };
  const outcomes = await Promise.all(['one', 'two', 'three', 'four'].map(n => processCall(f.path, 'reserve', { ...input, handle: `demo-${n}` })));
  assert.equal(outcomes.filter(x => x === 'reserved').length, 2);
  assert.equal(outcomes.filter(x => x === 'cap').length, 2);
  const leases = await f.state.recoverable();
  assert.equal(leases.reduce((n, lease) => n + lease.reservedMinor, 0), 100);
  assert.equal(leases.length, 2);
});
test('count and spend enforce independent caps; zero cost is explicit', async t => {
  const f = fixture(t);
  const input = { binding: demoBinding, now: 1000, expiresAt: 61000, fingerprint: hash(provision()) };
  const zero = { ...demoLimits, unitWorstCaseMinor: 0, maxSpendMinor: 0, maxResources: 1 };
  await f.state.reserve({ ...input, handle: 'demo-one', worstCaseMinor: 0, limits: zero });
  await assert.rejects(f.state.reserve({ ...input, handle: 'demo-two', worstCaseMinor: 0, limits: zero }), { code: 'cap' });
  const other = fixture(t);
  const budget = { ...demoLimits, maxSpendMinor: 50, maxResources: 5 };
  await other.state.reserve({ ...input, handle: 'demo-one', worstCaseMinor: 50, limits: budget });
  await assert.rejects(other.state.reserve({ ...input, handle: 'demo-two', worstCaseMinor: 50, limits: budget }), { code: 'cap' });
});
for (const limits of [{ ...demoLimits, maxTtlSeconds: Infinity }, { ...demoLimits, maxSpendMinor: -1 }, { ...demoLimits, maxResources: 0 }, { ...demoLimits, unitWorstCaseMinor: 1.1 }, { ...demoLimits, extra: true }, {}]) {
  test(`invalid limits ${JSON.stringify(limits)}`, t => {
    const f = fixture(t); assert.throws(() => configure(f, [], limits));
  });
}
for (const mode of ['partial', 'ambiguous', 'missing-fields', 'secret-unavailable']) {
  test(`partial provisioning retains intent and budget for restart: ${mode}`, async t => {
    const f = fixture(t);
    const first = call(f, 'POST', 'demo-one/a', 201, { present: true }, { artifact: provision().options.artifact });
    const second = call(f, 'POST', 'demo-one/b', 500, { error: f.broad, token: f.derived }, { artifact: provision().options.artifact });
    if (mode === 'ambiguous') second.response = () => { throw new Error(f.broad + f.derived); };
    if (mode === 'missing-fields') second.response = { status: 201, body: { token: f.derived } };
    if (mode === 'secret-unavailable') f.host.unavailableSecret = true;
    configure(f, mode === 'secret-unavailable' ? [] : [first, second]);
    const result = await f.handler.invoke('provision', provision());
    assert.deepEqual(result, { ok: false, code: 'reconcile' });
    assert.equal((await f.state.get('demo-one')).state, 'uncertain');
    assert.equal((await f.state.get('demo-one')).reservedMinor, 50);
    noEscape(f, result); f.transport.assertComplete();
    const reopened = new SqliteFixture(f.path);
    try {
      f.host.unavailableSecret = false; configure(f, cleanupCalls(f));
      const handler = new DemoHandler(f.host, reopened, reopened, reopened, f.transport);
      assert.deepEqual(await handler.recover('orphan'), { ok: true, status: 'removed' });
      assert.equal((await reopened.get('demo-one')).state, 'closed');
      f.transport.assertComplete(); noEscape(f, result);
    } finally { reopened.close(); }
  });
}
for (const cause of ['expiry', 'completion', 'cancellation', 'orphan']) {
  test(`manually driven recovery contract ${cause} is idempotent after reopen`, async t => {
    const f = fixture(t); await seed(f, 'demo-one', demoBinding, cause === 'orphan' ? 'intent' : 'active');
    f.host.now = 61000; configure(f, cleanupCalls(f));
    const result = await f.handler.recover(cause);
    assert.deepEqual(result, { ok: true, status: 'removed' });
    assert.deepEqual(await f.handler.recover(cause), result);
    assert.equal((await f.state.get('demo-one')).state, 'closed');
    f.transport.assertComplete(); noEscape(f, result);
  });
}
test('expiry never cleans unexpired active leases; orphan never sweeps by prefix', async t => {
  const f = fixture(t); await seed(f);
  assert.deepEqual(await f.handler.recover('expiry'), { ok: true, status: 'removed' });
  assert.deepEqual(await f.handler.recover('orphan'), { ok: true, status: 'removed' });
  assert.equal((await f.state.get('demo-one')).state, 'active');
  assert.equal(f.host.secretCalls, 0); f.transport.assertComplete();
});
for (const body of [{ present: true }, { items: [], next: 'another-page' }, null]) {
  test(`cleanup incomplete/partial verification ${JSON.stringify(body)} retains ledger`, async t => {
    const f = fixture(t); await seed(f); f.host.now = 61000;
    const calls = cleanupCalls(f); calls[1].response.body = body;
    configure(f, calls);
    const result = await f.handler.recover('expiry');
    assert.deepEqual(result, { ok: false, code: 'reconcile' });
    assert.equal((await f.state.get('demo-one')).state, 'cleaning');
    assert.equal(f.transport.calls.length, 4); f.transport.assertComplete();
    noEscape(f, result);
    configure(f, cleanupCalls(f));
    assert.deepEqual(await f.handler.recover('expiry'), { ok: true, status: 'removed' });
    f.transport.assertComplete();
  });
}
test('one child deletion fails but the other is attempted; new work stops', async t => {
  const f = fixture(t); await seed(f); f.host.now = 61000;
  const calls = cleanupCalls(f); calls[0].response.status = 500; calls.splice(1, 1);
  configure(f, calls);
  assert.deepEqual(await f.handler.recover('expiry'), { ok: false, code: 'reconcile' });
  assert.equal(f.transport.calls.length, 3); f.transport.assertComplete();
  f.host.now = 1000; f.host.secretCalls = 0; configure(f, []);
  assert.deepEqual(await f.handler.invoke('provision', provision('demo-two')), { ok: false, code: 'unavailable' });
  assert.equal(f.host.secretCalls, 0); f.transport.assertComplete();
});
test('cleanup with unavailable secret or foreign ledger cannot claim removal', async t => {
  const f = fixture(t); await seed(f); f.host.now = 61000; f.host.unavailableSecret = true;
  assert.deepEqual(await f.handler.recover('expiry'), { ok: false, code: 'unavailable' });
  assert.equal((await f.state.get('demo-one')).state, 'cleaning');
  const foreign = fixture(t); await seed(foreign, 'demo-one', { ...demoBinding, tenant: 'other' }); foreign.host.now = 61000;
  assert.deepEqual(await foreign.handler.recover('expiry'), { ok: false, code: 'scope' });
  assert.equal(foreign.host.secretCalls, 0);
  noEscape(f, {}); f.transport.assertComplete(); foreign.transport.assertComplete();
});

function processCall(path, operation, input) {
  const url = new URL('../dist/packages/test-support/src/sqlite.js', import.meta.url).href;
  const source = `import {SqliteFixture} from ${JSON.stringify(url)};
    const s = new SqliteFixture(process.argv[1]);
    try { const input = JSON.parse(process.argv[3]);
      const result = process.argv[2] === 'approval' ? await s.consume('approval-one',input,1000) : await s.reserve(input).then(()=>'reserved');
      process.stdout.write(String(result));
    } catch(e) { process.stdout.write(e.code || 'failed'); } finally { s.close(); }`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, path, operation, JSON.stringify(input)], { timeout: 10000, env: { PATH: process.env.PATH } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`fixture child failed ${code}: ${stderr}`)));
  });
}
