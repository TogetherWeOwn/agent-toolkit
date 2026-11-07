import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalHash, PROVIDER_CONTRACT } from '../dist/packages/core/src/provider/index.js';
import { ProviderJournalFixture } from '../dist/packages/core/src/testing/provider-journal.js';
import { providerFixture, providerVector, credentialCanary, derivedCanary } from '../packages/core/testing/provider-fixture.mjs';

const call = (f, args = providerVector.arguments, key = 'request-a', context = 'verified-runtime') =>
  f.broker().call(f.operation.name, args, context, key);
function noEffects(f) {
  assert.equal(f.calls.secret, 0);
  assert.equal(f.calls.upstream, 0);
  assert.equal(f.journal.size, 0);
}
function safe(f, result) {
  const observed = JSON.stringify({ result, audit: f.audit, journal: [...f.journal] });
  for (const secret of [credentialCanary, derivedCanary]) assert.ok(!observed.includes(secret));
}

test('v1 fixture exports a separate contract without replacing existing core', async () => {
  const core = await import('../dist/packages/core/src/index.js');
  assert.equal(core.providerV1.PROVIDER_CONTRACT, PROVIDER_CONTRACT);
  assert.equal(typeof core.expiry, 'function');
  const f = providerFixture();
  const result = await call(f);
  assert.deepEqual(result.value, { status: 'ready' });
  assert.equal(f.calls.secret, 1);
  assert.equal(f.calls.close, 1);
  assert.equal(f.calls.upstream, 1);
  assert.deepEqual(f.audit.map(r => r.phase), ['intent', 'outcome']);
  assert.equal(f.audit[0].event, f.audit[1].event);
  safe(f, result);
});

test('canonical targets sort object keys but bind arrays, Unicode, plans and artifacts', () => {
  assert.equal(canonicalHash({ b: 2, a: 1 }), canonicalHash({ a: 1, b: 2 }));
  assert.notEqual(canonicalHash([1, 2]), canonicalHash([2, 1]));
  assert.notEqual(canonicalHash('é'), canonicalHash('é'));
  for (const value of [undefined, Infinity, NaN, [, 1], { x: undefined }, { x: () => 0 }]) assert.throws(() => canonicalHash(value));
  assert.throws(() => canonicalHash({ get x() { throw Error('getter must not run'); } }));
  assert.throws(() => canonicalHash({ x: 'a'.repeat(17000) }));
  assert.throws(() => canonicalHash(JSON.parse('{"__proto__":1}')));
});

for (const tool of ['constructor', '__proto__', 'toString', 'http.request', null, 12]) {
  test(`unknown dispatch is refused without secrets: ${tool}`, async () => {
    const f = providerFixture();
    assert.equal((await f.broker().call(tool, {}, 'verified-runtime', 'request-a')).code, 'UNKNOWN_TOOL');
    assert.equal(f.audit[0].tool, null);
    noEffects(f);
  });
}
for (const args of [{ name: 'resource-a', agent: 'agent-b' }, { name: 'resource-a', approved: true },
  { name: 'resource-a', secretRef: 'owner' }, { name: 'resource-a', nested: { origin: 'https://evil.invalid' } },
  { name: '../foreign' }, { name: 'Ａ' }, { name: 'a'.repeat(64) }, [], null, { name: 42 }]) {
  test(`closed typed arguments refuse ${JSON.stringify(args)}`, async () => {
    const f = providerFixture();
    assert.equal((await call(f, args)).code, 'INVALID_ARGUMENTS');
    noEffects(f);
  });
}

test('identity is verified host context, not argument or copied principal', async () => {
  const f = providerFixture();
  assert.equal((await call(f, undefined, 'request-a', { ...providerVector.principal })).code, 'IDENTITY_UNAVAILABLE');
  noEffects(f);
});
for (const dimension of ['company', 'agent', 'project', 'task', 'run']) {
  test(`changed verified ${dimension} is refused before credentials`, async () => {
    const f = providerFixture();
    let lookups = 0;
    f.dependencies.host.authenticate = async () => ({ ...f.vector.principal, [dimension]: ++lookups === 1 ? f.vector.principal[dimension] : 'foreign' });
    assert.equal((await call(f)).code, 'IDENTITY_UNAVAILABLE');
    noEffects(f);
  });
}
for (const dimension of ['agents', 'resources']) {
  test(`agent AND resource allowlist required: ${dimension}`, async () => {
    const f = providerFixture();
    f.vector.policy[dimension] = ['foreign'];
    assert.equal((await call(f)).code, 'POLICY_DENIED');
    noEffects(f);
  });
}

test('resource ownership/revision failures deny even allowlisted resource names', async () => {
  const f = providerFixture({ host: { async revalidate() { return false; } } });
  assert.equal((await call(f)).code, 'RESOURCE_CHANGED');
  noEffects(f);
});
test('policy change during credential resolution prevents upstream execution', async () => {
  const f = providerFixture();
  f.dependencies.credentials.resolve = async () => {
    f.calls.secret++;
    f.vector.policy.revision = 'policy-b';
    return { value: credentialCanary, redactions: [], async close() { f.calls.close++; } };
  };
  assert.equal((await call(f)).code, 'POLICY_CHANGED');
  assert.equal(f.calls.upstream, 0);
  assert.equal(f.calls.close, 1);
});
test('resource change during credential resolution prevents upstream execution', async () => {
  const f = providerFixture();
  f.dependencies.host.revalidate = async () => f.calls.secret === 0;
  assert.equal((await call(f)).code, 'RESOURCE_CHANGED');
  assert.equal(f.calls.upstream, 0);
});

test('reserved operation without native authority is unavailable, not a placeholder grant', async () => {
  const f = providerFixture({ operation: { tier: 'reserved' } });
  assert.equal((await call(f)).code, 'AUTHORIZATION_UNAVAILABLE');
  noEffects(f);
});
test('native evidence binds every target field and is consumed only after audit intent', async () => {
  const f = providerFixture({ operation: { tier: 'reserved' }, authority: true });
  const consume = f.dependencies.authority.consume;
  f.dependencies.authority.consume = async (...args) => {
    assert.equal(f.audit[0].phase, 'intent');
    return consume(...args);
  };
  assert.equal((await call(f)).ok, true);
  assert.equal(f.calls.consumed, 1);
  assert.equal(f.grants.size, 0);
});
for (const change of [t => ({ ...t, provider: 'foreign' }), t => ({ ...t, tool: 'other' }),
  t => ({ ...t, version: '2' }), t => ({ ...t, tier: 'read' }),
  t => ({ ...t, principal: { ...t.principal, agent: 'foreign' } }),
  t => ({ ...t, resource: { ...t.resource, revision: 'other' } }),
  t => ({ ...t, argumentsHash: 'a'.repeat(64) }), t => ({ ...t, planHash: 'a'.repeat(64) }),
  t => ({ ...t, artifactDigest: 'a'.repeat(64) }), t => ({ ...t, policyRevision: 'other' })]) {
  test(`changed native authorization target is refused: ${change.toString()}`, async () => {
    const f = providerFixture({ operation: { tier: 'reserved' }, authority: true });
    f.dependencies.authority.verify = async target => ({ reference: 'native-fixture', targetHash: canonicalHash(change(target)), issuedAt: 1000, expiresAt: 2000 });
    assert.equal((await call(f)).code, 'AUTHORIZATION_DENIED');
    noEffects(f);
  });
}
for (const times of [{ issuedAt: 1001, expiresAt: 2000 }, { issuedAt: 0, expiresAt: 1000 },
  { issuedAt: 0, expiresAt: 300001 }, { issuedAt: -1, expiresAt: 2000 }]) {
  test(`stale/future/overlong native evidence is refused: ${JSON.stringify(times)}`, async () => {
    const f = providerFixture({ operation: { tier: 'reserved' }, authority: true });
    f.dependencies.authority.verify = async target => ({ reference: 'native-fixture', targetHash: canonicalHash(target), ...times });
    assert.equal((await call(f)).code, 'AUTHORIZATION_DENIED');
    noEffects(f);
  });
}

test('native replay, concurrent consumption and revocation are refused', async () => {
  const f = providerFixture({ operation: { tier: 'reserved' }, authority: true });
  let saved;
  const verify = f.authority.verify;
  f.dependencies.authority.verify = async target => saved ??= await verify(target);
  const results = await Promise.all([call(f, undefined, 'request-a'), call(f, undefined, 'request-b')]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.find(r => !r.ok).code, 'AUTHORIZATION_DENIED');
  assert.equal(f.calls.upstream, 1);
});

test('request replay conflicts even after completion, changed args, policy or run', async () => {
  const f = providerFixture({ operation: { tier: 'write' } });
  assert.equal((await call(f)).ok, true);
  assert.equal((await call(f, { name: 'resource-b' })).code, 'REPLAY_CONFLICT');
  f.vector.policy.revision = 'policy-b';
  f.vector.principal.run = 'run-b';
  assert.equal((await call(f)).code, 'REPLAY_CONFLICT');
  assert.equal(f.calls.upstream, 1);
});

test('concurrent request claims execute once across independent broker objects', async () => {
  const f = providerFixture({ operation: { tier: 'write' } });
  const results = await Promise.all([call(f), call(f)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.find(r => !r.ok).code, 'REPLAY_CONFLICT');
  assert.equal(f.calls.upstream, 1);
});

for (const raw of [credentialCanary, derivedCanary, encodeURIComponent(credentialCanary),
  Buffer.from(credentialCanary).toString('base64'), Buffer.from(derivedCanary).toString('base64url')]) {
  test(`projected credential reflection is refused: ${raw.slice(0, 12)}`, async () => {
    const f = providerFixture({ operation: { project() { return { [raw]: raw }; } } });
    const result = await call(f);
    assert.equal(result.code, 'OUTPUT_REFUSED');
    safe(f, result);
  });
}
test('raw upstream exceptions never escape into result/audit/journal', async () => {
  const f = providerFixture({ operation: { async execute() { throw Error(credentialCanary + derivedCanary); } } });
  const result = await call(f);
  assert.equal(result.code, 'UPSTREAM_UNAVAILABLE');
  safe(f, result);
});
test('audit intent outage prevents credential resolution and journal mutation', async () => {
  const f = providerFixture({ audit: { async append() { throw Error(credentialCanary); } } });
  const result = await call(f);
  assert.equal(result.code, 'AUDIT_UNAVAILABLE');
  noEffects(f);
  safe(f, result);
});
test('audit outcome outage retains uncertain intent, never unqualified success', async () => {
  const f = providerFixture();
  f.dependencies.audit.append = async record => {
    if (record.phase === 'outcome') throw Error('unavailable');
    f.audit.push(record);
  };
  assert.equal((await call(f)).code, 'OUTCOME_UNCERTAIN');
  assert.equal([...f.journal.values()][0].outcome, 'uncertain');
  assert.equal((await call(f)).code, 'REPLAY_CONFLICT');
});
test('ambiguous mutation and timeout are uncertain, retain tombstones and do not retry', async () => {
  const f = providerFixture({ operation: { tier: 'write', timeoutMs: 1,
    async execute() { f.calls.upstream++; return new Promise(() => {}); } } });
  assert.equal((await call(f)).code, 'OUTCOME_UNCERTAIN');
  assert.equal([...f.journal.values()][0].outcome, 'uncertain');
  assert.equal((await call(f)).code, 'REPLAY_CONFLICT');
  assert.equal(f.calls.upstream, 1);
});
test('credential cleanup and journal outcome failures do not return success', async () => {
  const f = providerFixture({ operation: { tier: 'write' }, credentials: { async resolve() {
    return { value: credentialCanary, redactions: [], async close() { throw Error(derivedCanary); } };
  } } });
  const result = await call(f);
  assert.equal(result.code, 'OUTCOME_UNCERTAIN');
  safe(f, result);
  const g = providerFixture({ journal: { async finish() { throw Error('unavailable'); } } });
  assert.equal((await call(g)).code, 'OUTCOME_UNCERTAIN');
});

test('SQLite journal excludes processes, survives reopen, and never expires uncertain claims', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'provider-journal-'));
  const path = join(dir, 'journal.sqlite');
  const modulePath = resolve('dist/packages/core/src/testing/provider-journal.js');
  try {
    const seed = new ProviderJournalFixture(path);
    seed.close();
    const script = `import { ProviderJournalFixture } from ${JSON.stringify(new URL(`file://${modulePath}`).href)};
      const j = new ProviderJournalFixture(process.argv[1]);
      console.log(await j.claim('a'.repeat(64), 'b'.repeat(64), process.argv[2])); j.close();`;
    const run = promisify(execFile);
    const results = await Promise.all(['event-a', 'event-b'].map(event =>
      run(process.execPath, ['--input-type=module', '-e', script, path, event])));
    assert.deepEqual(results.map(r => r.stdout.trim()).sort(), ['false', 'true']);
    const j = new ProviderJournalFixture(path);
    assert.equal(await j.claim('a'.repeat(64), 'c'.repeat(64), 'event-c'), false);
    assert.equal(j.outcome('a'.repeat(64)), 'pending');
    await assert.rejects(j.finish('a'.repeat(64), 'not-owner', 'complete'));
    assert.equal(await j.claim('d'.repeat(64), 'b'.repeat(64), 'event-d'), true);
    await j.finish('d'.repeat(64), 'event-d', 'uncertain');
    j.close();
    const reopened = new ProviderJournalFixture(path);
    assert.equal(reopened.outcome('d'.repeat(64)), 'uncertain');
    assert.equal(await reopened.claim('d'.repeat(64), 'b'.repeat(64), 'event-e'), false);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
