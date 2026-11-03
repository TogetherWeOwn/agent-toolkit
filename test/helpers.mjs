import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../dist/packages/policy/src/index.js';
import { SqliteFixture } from '../dist/packages/test-support/src/sqlite.js';
import { StrictTransport } from '../dist/packages/test-support/src/transport.js';
import { DemoHandler, FakeHost, demoBinding, demoLimits, syntheticOrigin } from '../dist/packages/test-support/src/demo.js';

export { DemoHandler, SqliteFixture, StrictTransport, demoBinding, demoLimits };
export const artifact = 'a'.repeat(64);
export const provision = (handle = 'demo-one', overrides = {}) => ({ handle, options: { ttlSeconds: 60, spendMinor: 50, artifact, ...overrides } });
export const destroy = (handle = 'demo-one') => ({ handle, artifact });
export function fixture(t, expected = []) {
  const dir = mkdtempSync(join(tmpdir(), 'toolkit-fixture-'));
  const path = join(dir, 'state.sqlite');
  const state = new SqliteFixture(path);
  const broad = `synthetic-broad-${randomUUID()}`;
  const derived = `synthetic-derived-${randomUUID()}`;
  const host = new FakeHost(broad);
  const transport = new StrictTransport(expected);
  const handler = new DemoHandler(host, state, state, state, transport);
  t.after(() => { state.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, path, state, host, transport, handler, broad, derived };
}
export function call(f, method, suffix, status, body = null, requestBody = null) {
  return { origin: syntheticOrigin, method, path: `/environments/${suffix}`, body: requestBody, credential: f.broad, response: { status, body } };
}
export function configure(f, calls, limits = demoLimits, approval = f.state, audit = f.state, state = f.state) {
  f.transport = new StrictTransport(calls);
  f.handler = new DemoHandler(f.host, state, approval, audit, f.transport, limits);
}
export async function seed(f, handle = 'demo-one', binding = demoBinding, state = 'active') {
  await f.state.reserve({ handle, binding, fingerprint: hash(provision(handle)), now: 1000, expiresAt: 61000, worstCaseMinor: 50, limits: demoLimits });
  if (state !== 'intent') await f.state.transition(handle, ['intent'], state);
}
export function noEscape(f, result) {
  const observable = JSON.stringify({ result, audit: f.state.audits(), calls: f.transport.calls });
  for (const canary of [f.broad, f.derived]) {
    assert.ok(!observable.includes(canary), 'secret must not reach observable sinks');
    for (const filename of readdirSync(f.dir)) assert.ok(!readFileSync(join(f.dir, filename)).includes(Buffer.from(canary)), 'secret must not reach persisted database');
  }
}
export async function preflight(f, tool, args, code) {
  const before = await f.state.recoverable();
  const result = await f.handler.invoke(tool, args);
  assert.deepEqual(result, { ok: false, code });
  assert.equal(f.host.secretCalls, 0);
  assert.equal(f.transport.calls.length, 0);
  f.transport.assertComplete();
  assert.deepEqual(await f.state.recoverable(), before);
  assert.equal(f.state.audits().at(-1).phase, 'refused');
  noEscape(f, result);
}
export function cleanupCalls(f, handle = 'demo-one') {
  return ['a', 'b'].flatMap(child => [call(f, 'DELETE', `${handle}/${child}`, 204), call(f, 'GET', `${handle}/${child}`, 200, { present: false })]);
}
