import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { OfflineAudit } from '../packages/core/src/testing/offline-audit.ts';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'offline-audit-'));
  const path = join(dir, 'audit.sqlite');
  const owners = [];
  const open = () => { const owner = new OfflineAudit(path); owners.push(owner); return owner; };
  t.after(() => { for (const owner of owners) { try { owner.close(); } catch {} } rmSync(dir, { recursive: true, force: true }); });
  return { path, open };
}
const good = () => ({ read: async () => 7, close: async () => {} });
const outcomes = audit => audit.records().map(row => row.outcome);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('only guarded run admits work and success is recorded first', async t => {
  const f = fixture(t), audit = f.open();
  assert.equal(audit.begin, undefined);
  assert.equal(audit.admit, undefined);
  assert.equal(audit.finish, undefined);
  assert.deepEqual(await audit.run(good(), 100), { ok: true, value: 7 });
  assert.deepEqual(outcomes(audit), ['success']);
  assert.deepEqual(await audit.run(good(), 100), { ok: true, value: 7 });
});

test('concurrent and reopened owners fence the stale owner', async t => {
  const f = fixture(t), first = f.open(), second = f.open(), read = deferred(), started = deferred();
  const running = first.run({ read: async () => { started.resolve(); return read.promise; }, close: async () => {} }, 1000);
  await started.promise;
  let invoked = false;
  assert.deepEqual(await second.run({ read: async () => { invoked = true; }, close: async () => {} }, 100), { ok: false });
  assert.equal(invoked, false);
  const reopened = f.open();
  read.resolve(9);
  assert.deepEqual(await running, { ok: false });
  assert.deepEqual(await reopened.run(good(), 100), { ok: false });
  assert.deepEqual(outcomes(reopened), ['unknown', 'refused', 'refused']);
});

test('delayed read, delayed close and cancellation leave irreversible holds', async t => {
  for (const phase of ['read', 'close', 'cancel']) {
    const f = fixture(t), audit = f.open(), later = deferred(), started = deferred();
    const controller = new AbortController();
    const running = audit.run({
      read: async () => { if (phase !== 'close') { started.resolve(); return later.promise; } return 1; },
      close: async () => { if (phase === 'close') { started.resolve(); await later.promise; } },
    }, 15, controller.signal);
    await started.promise;
    if (phase === 'cancel') controller.abort();
    assert.deepEqual(await running, { ok: false });
    later.resolve(2);
    const reopened = f.open();
    assert.deepEqual(await reopened.run(good(), 100), { ok: false });
    assert.deepEqual(outcomes(reopened), ['unknown', 'refused']);
  }
});

test('failed durable admission and completion refuse success', async t => {
  const f = fixture(t), audit = f.open(), db = new DatabaseSync(f.path);
  t.after(() => db.close());
  let calls = 0;
  db.exec("CREATE TRIGGER no_insert BEFORE INSERT ON offline_calls BEGIN SELECT RAISE(ABORT, 'no'); END");
  assert.deepEqual(await audit.run({ read: async () => { calls++; }, close: async () => {} }, 100), { ok: false });
  assert.equal(calls, 0);
  db.exec('DROP TRIGGER no_insert');
  db.exec("CREATE TRIGGER no_success BEFORE UPDATE ON offline_calls WHEN NEW.outcome='success' BEGIN SELECT RAISE(ABORT, 'no'); END");
  assert.deepEqual(await audit.run(good(), 100), { ok: false });
  db.exec('DROP TRIGGER no_success');
  const reopened = f.open();
  assert.deepEqual(await reopened.run(good(), 100), { ok: false });
  assert.deepEqual(outcomes(reopened), ['unknown', 'refused']);
});

test('process exit during synthetic read or close retains unknown across restart', async t => {
  for (const phase of ['read', 'close']) {
    const f = fixture(t);
    const module = new URL('../packages/core/src/testing/offline-audit.ts', import.meta.url).href;
    const script = `import { OfflineAudit } from ${JSON.stringify(module)}; const a = new OfflineAudit(process.argv[1]); await a.run({ read: async () => { if (process.argv[2] === 'read') process.exit(73); return 1; }, close: async () => process.exit(74) }, 1000);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.path, phase], { timeout: 5000 });
    assert.equal(child.status, phase === 'read' ? 73 : 74);
    const reopened = f.open();
    assert.deepEqual(await reopened.run(good(), 100), { ok: false });
    assert.deepEqual(outcomes(reopened), ['unknown', 'refused']);
  }
});
