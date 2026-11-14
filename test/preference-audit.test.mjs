import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreferenceAuditFixture, auditedPreferenceRead } from '../packages/core/src/testing/preference-audit.ts';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'preference-audit-'));
  const path = join(dir, 'audit.sqlite');
  let audit = new PreferenceAuditFixture(path);
  t.after(() => { audit.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, get audit() { return audit; }, reopen() { audit.close(); audit = new PreferenceAuditFixture(path); } };
}
const ok = () => ({ read: async () => ({ outcome: 'success', value: 'synthetic-secret' }), close: async () => true });

test('persists only redacted success and refusal records across reopen', async t => {
  const f = fixture(t);
  assert.deepEqual(await auditedPreferenceRead(f.audit, ok(), 100), { ok: true, value: 'synthetic-secret' });
  assert.deepEqual(await auditedPreferenceRead(f.audit, { read: async () => ({ outcome: 'refused' }), close: async () => true }, 100), { ok: false, code: 'refused' });
  f.reopen();
  assert.deepEqual(f.audit.records().map(({ outcome, closure }) => [outcome, closure]), [['success', 'confirmed'], ['refused', 'confirmed']]);
  for (const file of readdirSync(f.dir)) assert.equal(readFileSync(join(f.dir, file)).includes(Buffer.from('synthetic-secret')), false);
});

test('audit failure prevents work and outcome failure prevents success', async t => {
  const f = fixture(t);
  let calls = 0;
  const adapter = { read: async () => { calls++; return { outcome: 'success', value: 1 }; }, close: async () => true };
  const broken = { admit() { throw Error('secret'); } };
  assert.deepEqual(await auditedPreferenceRead(broken, adapter, 100), { ok: false, code: 'unavailable' });
  assert.equal(calls, 0);
  const badFinish = { admit: () => f.audit.admit(), finish() { throw Error('secret'); } };
  assert.deepEqual(await auditedPreferenceRead(badFinish, adapter, 100), { ok: false, code: 'unavailable' });
  f.reopen();
  assert.equal(f.audit.records()[0].outcome, 'pending');
  assert.equal(f.audit.records()[0].closure, 'unknown');
});

test('cancellation, close failure and late read never claim closure', async t => {
  const f = fixture(t);
  let resolveRead;
  const controller = new AbortController();
  const running = auditedPreferenceRead(f.audit, {
    read: () => new Promise(resolve => { resolveRead = resolve; }),
    close: async () => { resolveRead({ outcome: 'success', value: 42 }); return true; },
  }, 100, controller.signal);
  await Promise.resolve(); await Promise.resolve();
  controller.abort();
  assert.deepEqual(await running, { ok: false, code: 'unavailable' });
  const other = fixture(t);
  assert.deepEqual(await auditedPreferenceRead(other.audit, { ...ok(), close: async () => false }, 100), { ok: false, code: 'unavailable' });
  assert.equal(f.audit.records()[0].closure, 'unknown');
  assert.equal(other.audit.records()[0].closure, 'unknown');
});

test('read and close timeouts return unavailable without a closure claim', async t => {
  const f = fixture(t);
  const never = () => new Promise(() => {});
  assert.deepEqual(await auditedPreferenceRead(f.audit, { read: never, close: async () => true }, 5), { ok: false, code: 'unavailable' });
  const other = fixture(t);
  assert.deepEqual(await auditedPreferenceRead(other.audit, { ...ok(), close: never }, 5), { ok: false, code: 'unavailable' });
  f.reopen(); other.reopen();
  assert.equal(f.audit.records()[0].closure, 'unknown');
  assert.equal(other.audit.records()[0].closure, 'unknown');
});

test('uncompleted intent survives reopen and invalid bounds never call adapter', async t => {
  const f = fixture(t);
  f.audit.begin();
  f.reopen();
  assert.equal(f.audit.records()[0].closure, 'unknown');
  let calls = 0;
  const adapter = { read: async () => { calls++; throw Error('secret'); }, close: async () => { calls++; return true; } };
  assert.deepEqual(await auditedPreferenceRead(f.audit, adapter, 5001), { ok: false, code: 'unavailable' });
  assert.equal(calls, 0);
  assert.equal(f.audit.records()[1].outcome, 'refused');
});

test('admission is durable and rejects overlap across database connections', async t => {
  const f = fixture(t);
  const second = new PreferenceAuditFixture(join(f.dir, 'audit.sqlite'));
  t.after(() => second.close());
  let release;
  let invoked = 0;
  const running = auditedPreferenceRead(f.audit, {
    read: () => { invoked++; return new Promise(resolve => { release = resolve; }); },
    close: async () => true,
  }, 1000);
  await Promise.resolve(); await Promise.resolve();
  const rejected = await auditedPreferenceRead(second, { read: async () => { invoked++; return { outcome: 'refused' }; }, close: async () => true }, 100);
  assert.deepEqual(rejected, { ok: false, code: 'unavailable' });
  assert.equal(invoked, 1);
  release({ outcome: 'success', value: 1 });
  assert.deepEqual(await running, { ok: true, value: 1 });
  assert.deepEqual(await auditedPreferenceRead(second, ok(), 100), { ok: true, value: 'synthetic-secret' });
  const rows = second.records();
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  assert.deepEqual(rows.map(row => row.outcome), ['success', 'refused', 'success']);
});

test('interrupted pending intent blocks subsequent work after reopen', async t => {
  const f = fixture(t);
  const id = f.audit.admit();
  f.reopen();
  let called = false;
  const result = await auditedPreferenceRead(f.audit, { read: async () => { called = true; return { outcome: 'refused' }; }, close: async () => true }, 100);
  assert.deepEqual(result, { ok: false, code: 'unavailable' });
  assert.equal(called, false);
  assert.deepEqual(f.audit.records().map(row => [row.id === id, row.outcome, row.closure]), [[true, 'pending', 'unknown'], [false, 'refused', 'unknown']]);
});
