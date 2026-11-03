import test from 'node:test';
import assert from 'node:assert/strict';
import { hash, jsonData } from '../dist/packages/core/src/index.js';
import { approvalTarget } from '../dist/packages/core/src/testing/demo.js';
import { fixture, seed, configure, cleanupCalls, noEscape, provision, destroy, demoBinding, DemoHandler, SqliteFixture } from './helpers.mjs';

test('canonical hashes ignore insertion order even for locale-equivalent JSON keys', () => {
  const equivalent = 'a' + String.fromCodePoint(0xad);
  const left = { a: 1, [equivalent]: 2 };
  const right = { [equivalent]: 2, a: 1 };
  jsonData(left); jsonData(right);
  assert.equal(hash(left), hash(right));
  assert.equal(hash({ nested: left }), hash({ nested: right }));
  assert.notEqual(hash(left), hash({ a: 2, [equivalent]: 1 }));
});

test('rollback failure preserves the original transaction error', t => {
  const f = fixture(t); const original = new Error('original transaction failure');
  assert.throws(() => f.state.transaction(() => {
    // Model SQLite ending the transaction before the catch attempts rollback.
    f.state.db.exec('ROLLBACK');
    throw original;
  }), error => error === original);
});

for (const property of ['extra', '01', '-1', '4294967295']) {
  test(`JSON rejects sparse arrays whose named property masks the hole: ${property}`, () => {
    const value = [1, , 3]; value[property] = 'lost';
    assert.throws(() => jsonData(value), { code: 'schema' });
    assert.doesNotThrow(() => jsonData([1, null, 3]));
  });
}

test('failed destruction intent preserves the approval for an audited retry', async t => {
  const f = fixture(t); await seed(f);
  f.host.reference = 'approval-one';
  f.state.grant(f.host.reference, approvalTarget(demoBinding, destroy()), 0, 3000);
  f.state.failAuditAt = 1;
  assert.deepEqual(await f.handler.invoke('destroy', destroy()), { ok: false, code: 'audit' });
  assert.equal((await f.state.get('demo-one')).state, 'active');
  assert.equal(f.host.secretCalls, 0); f.transport.assertComplete();
  configure(f, cleanupCalls(f));
  const result = await f.handler.invoke('destroy', destroy());
  assert.deepEqual(result, { ok: true, status: 'removed' });
  assert.equal((await f.state.get('demo-one')).state, 'closed');
  f.transport.assertComplete(); noEscape(f, result);
});

for (const cause of ['expiry', 'completion', 'cancellation', 'orphan']) {
  test(`recovery cannot close a lease with an in-flight creation: ${cause}`, async t => {
    const f = fixture(t);
    const started = Promise.withResolvers(); const resume = Promise.withResolvers();
    const resources = new Set(); const calls = [];
    const transport = { async send(request) {
      assert.equal(request.origin, 'https://fixture.invalid');
      assert.match(request.path, /^\/environments\/demo-one\/[ab]$/);
      assert.equal(request.credential, f.broad);
      calls.push(request.method);
      if (request.method === 'POST') {
        assert.deepEqual(request.body, { artifact: provision().options.artifact });
        if (request.path.endsWith('/a')) { started.resolve(); await resume.promise; }
        resources.add(request.path);
        return { status: 201, body: { present: true } };
      }
      assert.equal(request.body, null);
      if (request.method === 'DELETE') { resources.delete(request.path); return { status: 204, body: null }; }
      assert.equal(request.method, 'GET');
      return { status: 200, body: { present: resources.has(request.path) } };
    } };
    const handler = new DemoHandler(f.host, f.state, f.state, f.state, transport);
    const pending = handler.invoke('provision', provision());
    await started.promise;
    // A separate connection/handler must see the same exclusion, not a local mutex.
    const reopened = new SqliteFixture(f.path);
    let result; let recovery; let during; let duringCalls;
    try {
      if (cause === 'expiry') f.host.now = 61000;
      recovery = await new DemoHandler(f.host, reopened, reopened, reopened, transport).recover(cause);
      during = await reopened.get('demo-one'); duringCalls = [...calls];
    } finally {
      f.host.now = 1000; resume.resolve(); result = await pending; reopened.close();
    }
    assert.deepEqual(recovery, { ok: false, code: 'conflict' });
    assert.equal(during.state, 'intent'); assert.equal(during.reservedMinor, 50);
    assert.deepEqual(duringCalls, ['POST']);
    assert.deepEqual(result, { ok: true, status: 'ready' });
    assert.equal(resources.size, 2);
    assert.deepEqual(await handler.recover('completion'), { ok: true, status: 'removed' });
    assert.equal(resources.size, 0); assert.equal((await f.state.get('demo-one')).state, 'closed');
    noEscape(f, result);
  });
}
