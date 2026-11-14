import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes('/packages/core/src/') && specifier.endsWith('.js')) {
    return nextResolve(specifier.slice(0, -3) + '.ts', context);
  }
  return nextResolve(specifier, context);
} });
const { PreferenceAuditFixture, auditedPreferenceRead: readWithIdentity } = await import('../packages/core/src/testing/preference-audit.ts');

const host = { identity: async () => ({ tenant: 'tenant-1', agent: 'agent-1', project: 'project-1', task: 'task-1' }) };
const auditedPreferenceRead = (audit, adapter, milliseconds, signal) => readWithIdentity(audit, adapter, milliseconds, host, signal);

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

test('trusted identity is recorded before adapter access and failures are audited', async t => {
  const f = fixture(t);
  let calls = 0;
  const adapter = { read: async () => { calls++; assert.match(f.audit.records().at(-1).binding_hash, /^[0-9a-f]{64}$/); return { outcome: 'refused' }; }, close: async () => true };
  assert.deepEqual(await readWithIdentity(f.audit, adapter, 100, host), { ok: false, code: 'refused' });
  for (const identity of [async () => null, async () => { throw Error('secret'); }, async () => ({ ...await host.identity(), extra: 'secret' }), () => new Promise(() => {})]) {
    assert.deepEqual(await readWithIdentity(f.audit, adapter, 5, { identity }), { ok: false, code: 'unavailable' });
  }
  assert.equal(calls, 1);
  f.reopen();
  assert.deepEqual(f.audit.records().slice(1).map(row => [row.outcome, row.closure, row.binding_hash]), Array(4).fill(['refused', 'confirmed', null]));
  for (const file of readdirSync(f.dir)) assert.equal(readFileSync(join(f.dir, file)).includes(Buffer.from('tenant-1')), false);
});

test('audit failure prevents work and outcome failure prevents success', async t => {
  const f = fixture(t);
  let calls = 0;
  const adapter = { read: async () => { calls++; return { outcome: 'success', value: 1 }; }, close: async () => true };
  const broken = { admit() { throw Error('secret'); } };
  assert.deepEqual(await auditedPreferenceRead(broken, adapter, 100), { ok: false, code: 'unavailable' });
  assert.equal(calls, 0);
  const badFinish = { admit: () => f.audit.admit(), bind: (...args) => f.audit.bind(...args), finish() { throw Error('secret'); } };
  assert.deepEqual(await auditedPreferenceRead(badFinish, adapter, 100), { ok: false, code: 'unavailable' });
  f.reopen();
  assert.equal(f.audit.records()[0].outcome, 'pending');
  assert.equal(f.audit.records()[0].closure, 'unknown');
});

test('cancellation, close failure and late read never claim closure', async t => {
  const f = fixture(t);
  let resolveRead;
  let started;
  const readStarted = new Promise(resolve => { started = resolve; });
  const controller = new AbortController();
  const running = auditedPreferenceRead(f.audit, {
    read: () => new Promise(resolve => { resolveRead = resolve; started(); }),
    close: async () => { resolveRead({ outcome: 'success', value: 42 }); return true; },
  }, 100, controller.signal);
  await readStarted;
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
  let started;
  const readStarted = new Promise(resolve => { started = resolve; });
  let invoked = 0;
  const running = auditedPreferenceRead(f.audit, {
    read: () => { invoked++; return new Promise(resolve => { release = resolve; started(); }); },
    close: async () => true,
  }, 1000);
  await readStarted;
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

test('process exit during read or close leaves durable unknown admission', async t => {
  for (const phase of ['read', 'close']) {
    const f = fixture(t);
    const script = `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (context.parentURL?.includes('/packages/core/src/') && specifier.endsWith('.js')) return nextResolve(specifier.slice(0, -3) + '.ts', context);
        return nextResolve(specifier, context);
      } });
      const { PreferenceAuditFixture, auditedPreferenceRead } = await import(${JSON.stringify(new URL('../packages/core/src/testing/preference-audit.ts', import.meta.url).href)});
      const audit = new PreferenceAuditFixture(process.argv[1]);
      const phase = process.argv[2];
      await auditedPreferenceRead(audit, {
        read: async () => { if (phase === 'read') process.exit(73); return { outcome: 'success', value: 1 }; },
        close: async () => { process.exit(74); },
      }, 1000, { identity: async () => ({ tenant: 'tenant-1', agent: 'agent-1', project: 'project-1', task: 'task-1' }) });
      process.exit(75);
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, join(f.dir, 'audit.sqlite'), phase], { encoding: 'utf8', timeout: 5000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, phase === 'read' ? 73 : 74, child.stderr);
    f.reopen();
    let called = false;
    assert.deepEqual(await auditedPreferenceRead(f.audit, { read: async () => { called = true; return { outcome: 'refused' }; }, close: async () => true }, 100), { ok: false, code: 'unavailable' });
    assert.equal(called, false);
    assert.deepEqual(f.audit.records().map(({ outcome, closure }) => [outcome, closure]), [['pending', 'unknown'], ['refused', 'unknown']]);
  }
});

test('interrupted pending intent blocks subsequent work after reopen', async t => {
  const f = fixture(t);
  const id = f.audit.admit();
  const other = new PreferenceAuditFixture(join(f.dir, 'audit.sqlite'));
  assert.throws(() => other.finish(id, 'failed', true), /audit unavailable/);
  other.close();
  f.reopen();
  assert.throws(() => f.audit.bind(id, 'fabricated'), /audit unavailable/);
  assert.throws(() => f.audit.finish(id, 'failed', true), /audit unavailable/);
  let called = false;
  const result = await auditedPreferenceRead(f.audit, { read: async () => { called = true; return { outcome: 'refused' }; }, close: async () => true }, 100);
  assert.deepEqual(result, { ok: false, code: 'unavailable' });
  assert.equal(called, false);
  assert.deepEqual(f.audit.records().map(row => [row.id === id, row.outcome, row.closure]), [[true, 'pending', 'unknown'], [false, 'refused', 'unknown']]);
});
