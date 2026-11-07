import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, pull, token, key } from './helpers.mjs';
import { Broker } from '../dist/plugins/github-broker/src/broker.js';
import { createHostCaller, githubHttp } from '../dist/plugins/github-broker/src/plugin.js';
import { SdkNullBodyRevokeFailure, withInstallationToken } from '../dist/packages/github/src/index.js';

const sdkMessage = 'Response constructor: Invalid response status code 204';
const requestId = 'ABCD:1234:5678:90AB';
const args = { ...base, number: 1 };
function read(f) { f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); }
function fallback(f) { f.revoke({ error: new TypeError(sdkMessage) }); }
function probe(f, overrides = {}) {
  f.steps.push({ method: 'GET', path: '/installation/repositories?per_page=1', status: 401, body: { message: 'Bad credentials' }, ...overrides,
    inspect(req) {
      assert.equal(req.headers.Authorization, `Bearer ${token}`);
      assert.equal(req.body, undefined);
      assert.ok(Object.keys(req.headers).every(k => !k.toLowerCase().startsWith('if-')));
      overrides.inspect?.(req);
    },
  });
}
const secondId = 'BCDE:2345:6789:ABCD';
const immediateHostCall = async action => action(() => {});
const attempt = (number, status, result, id = requestId) => ({ attempt: number, status, requestId: id, result });
function evidence(probes, terminalReason, secondDispatched = false) {
  const last = probes.at(-1);
  return {
    outcome: terminalReason === 'verified' ? 'revoked_verified_by_probe' : 'unverified',
    deleteRequestId: null, unavailableReason: 'sdk_null_body',
    probeRequestId: last?.requestId ?? null, probeStatus: last?.status ?? null, probeResult: last?.result ?? 'unavailable',
    probes, secondDispatched, terminalReason,
  };
}

// Worker-local clock controls only: no tool input, config option or wall-clock wait.
function monotonic(t, timerAdvance, manual = false) {
  const clock = { now: 1000, timers: [], pending: new Map() };
  let timerId = 0;
  t.mock.method(globalThis.performance, 'now', () => clock.now);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.ok(manual || (delay > 0 && delay <= 250), `Unexpected recovery timer ${delay}`);
    clock.timers.push(delay);
    const id = ++timerId;
    if (manual) clock.pending.set(id, { callback, delay });
    else queueMicrotask(() => {
      clock.now += timerAdvance ?? delay;
      callback();
    });
    return id;
  });
  if (manual) t.mock.method(globalThis, 'clearTimeout', id => { clock.pending.delete(id); });
  return clock;
}

function recovery(clock, options = {}) {
  const calls = [], snapshots = [], dispatches = [];
  let probeNumber = 0, uses = 0;
  const response = status => ({ status, headers: { 'x-github-request-id': requestId }, body: JSON.stringify({ message: 'Bad credentials' }) });
  const promise = withInstallationToken({
    appId: 42, installationId: 99, privateKey: key,
    scope: { repository_ids: [101], permissions: { pull_requests: 'read' } }, now: Date.now(),
    transport: async (req, deadline, onDispatch) => {
      calls.push({ req, deadline, at: clock.now });
      if (req.method === 'POST') return { ...response(201), body: JSON.stringify({ token, expires_at: new Date(Date.now() + 3500000).toISOString(), repositories: [{ id: 101 }], permissions: { pull_requests: 'read' } }) };
      assert.equal(req.headers.Authorization, `Bearer ${token}`);
      if (req.method === 'DELETE') {
        assert.equal(req.url, 'https://api.github.com/installation/token');
        throw new SdkNullBodyRevokeFailure();
      }
      probeNumber++;
      assert.equal(req.url, 'https://api.github.com/installation/repositories?per_page=1');
      assert.equal(req.body, undefined);
      if (probeNumber === 1) {
        assert.equal(deadline, undefined);
        const first = { ...response(200), ...options.first };
        if (options.onFirstBodyAccess) {
          const body = first.body;
          Object.defineProperty(first, 'body', { get: () => { options.onFirstBodyAccess(clock); return body; } });
        }
        return first;
      }
      assert.equal(probeNumber, 2, 'Recovery must never dispatch a third probe');
      assert.equal(deadline, 3000, 'The absolute deadline must not be renewed');
      if (options.capacity) throw Object.assign(Error('capacity'), { rule: 'host.capacity' });
      onDispatch?.(); dispatches.push(clock.now);
      if (options.transportError) throw Error(key + token);
      options.onSecondResponse?.(clock);
      return { ...response(401), ...options.second };
    },
    observe: res => {
      if (res.status === 201) return requestId;
      options.observe?.(probeNumber, clock);
      return options.ids ? options.ids[probeNumber - 1] : probeNumber === 1 ? requestId : secondId;
    },
    onRevocation: snapshot => snapshots.push(snapshot),
  }, async (credential, sensitive) => {
    uses++;
    assert.equal(credential, token); assert.ok(sensitive.includes(token));
    return pull.title;
  });
  return { promise, calls, snapshots, dispatches, get uses() { return uses; } };
}

test('one same-token rejection probe records distinct evidence before cache publication', async () => {
  const f = fixture(); read(f); fallback(f); probe(f);
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].title, pull.title);
  assert.deepEqual(f.events.at(-1).revocation, evidence([attempt(1, 401, 'bad_credentials')], 'verified'));
  assert.equal(f.events.at(-1).requestIds.length, 4); // mint, identity, read, probe; no fabricated DELETE ID.
  assert.equal((await f.call('github.pr_get', args)).error, undefined);
  assert.equal(f.calls.length, 5); f.hygiene(result); f.done();
});

test('probe diagnostics distinguish exposed status, body and unavailable evidence without weakening cleanup', async t => {
  monotonic(t);
  for (const [overrides, status, classification, safeId] of [
    [{ status: 200, raw: key + token }, 200, 'unexpected_status', requestId],
    [{ status: 403, raw: key + token }, 403, 'unexpected_status', requestId],
    [{ status: 429, headers: { 'x-github-request-id': requestId, 'retry-after': '12000' } }, 429, 'unexpected_status', null],
    [{ body: { message: key + token, extra: key + token } }, 401, 'unexpected_body', requestId],
    [{ raw: '{' + key + token }, 401, 'invalid_json', requestId],
    [{ raw: 'null' }, 401, 'unexpected_body', requestId],
    [{ body: [{ message: 'Bad credentials' }] }, 401, 'unexpected_body', requestId],
    [{ body: { message: 'Bad credentials', extra: key + token }, headers: {} }, 401, 'bad_credentials', null],
    [{ headers: { 'x-github-request-id': token } }, 401, 'bad_credentials', null],
    [{ error: Error(key + token) }, null, 'unavailable', null],
    [{ status: 302 }, null, 'unavailable', null],
  ]) {
    const f = fixture({ hostCall: immediateHostCall }); read(f); fallback(f); probe(f, overrides);
    if (status === 200) probe(f, overrides);
    const result = await f.call('github.pr_get', args);
    assert.equal(result.error, 'mint.revoke_failed');
    const attempts = [attempt(1, status, classification, safeId)];
    if (status === 200) attempts.push(attempt(2, status, classification, safeId));
    const terminal = status === 200 ? 'evidence' : status === 429 ? 'observer' : status === null ? 'transport' : 'ineligible';
    assert.deepEqual(f.events.at(-1).revocation, evidence(attempts, terminal, status === 200));
    const next = await f.call('github.pr_get', args);
    assert.equal(next.error, 'rate.retry_after');
    assert.ok(next.data.retryAfterSeconds >= (status === 429 ? 11999 : 3659));
    assert.equal(f.calls.length, status === 200 ? 6 : 5); assert.equal(f.secretCalls, 1);
    f.hygiene(result); f.hygiene(next); f.done();
  }
});

test('directly observed 204 records its ID and never probes', async () => {
  const f = fixture(); read(f); f.revoke();
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, undefined);
  assert.deepEqual(f.events.at(-1).revocation, { outcome: 'revoked', deleteRequestId: requestId });
  assert.equal(f.calls.length, 4); f.hygiene(result); f.done();
});

for (const [label, overrides] of [
  ['still usable without an ID', { status: 200, headers: {}, raw: 'do not parse or publish this repository body' }],
  ['200 malformed ID', { status: 200, headers: { 'x-github-request-id': 'not-a-request-id' } }],
  ['200 reflected ID', { status: 200, headers: { 'x-github-request-id': token } }],
  ['forbidden', { status: 403 }], ['not found', { status: 404 }], ['rate limit', { status: 429, headers: { 'retry-after': '12000' } }],
  ['server failure', { status: 500 }], ['redirect', { status: 302, headers: { location: 'https://evil.invalid/' } }],
  ['unsolicited 304', { status: 304 }], ['throw', { error: Error(key + token) }],
  ['timeout', { error: Object.assign(Error('host.timeout'), { rule: 'host.timeout' }) }],
  ['wrong message', { body: { message: 'Requires authentication' } }],
  ['reflected message', { body: { message: key + token } }], ['malformed JSON', { raw: '{' }],
  ['null', { raw: 'null' }], ['array', { body: [{ message: 'Bad credentials' }] }],
  ['missing ID', { headers: {} }], ['malformed ID', { headers: { 'x-github-request-id': 'ABCD\nunsafe' } , error: Error('invalid header') }],
  ['unrecognized ID', { headers: { 'x-github-request-id': 'not-a-request-id' } }],
  ['reflected ID', { headers: { 'x-github-request-id': token } }],
]) test(`ambiguous probe (${label}) never publishes data and retains the installation pause`, async () => {
  const f = fixture(); read(f); fallback(f); probe(f, overrides);
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, 'mint.revoke_failed');
  assert.equal(f.events.at(-1).revocation.outcome, 'unverified');
  assert.equal(f.events.at(-1).revocation.deleteRequestId, null);
  assert.equal(f.events.at(-1).revocation.unavailableReason, 'sdk_null_body');
  assert.equal(f.events.at(-1).revocation.probes.length, 1);
  assert.equal(f.events.at(-1).revocation.secondDispatched, false);
  const next = await f.call('github.pr_get', args);
  assert.equal(next.error, 'rate.retry_after'); assert.ok(next.data.retryAfterSeconds >= (label === 'rate limit' ? 11999 : 3659));
  assert.equal(f.calls.length, 5); assert.equal(f.secretCalls, 1);
  f.hygiene(result); f.hygiene(next); f.done();
});

for (const error of [new TypeError(sdkMessage + ' '), Error(sdkMessage), new TypeError(sdkMessage.replace('204', '205')), new TypeError(sdkMessage.replace('204', '304')), Error('host.timeout'), Error('http.unavailable')]) {
  test(`revoke error ${error.constructor.name}/${error.message} does not authorize a probe`, async () => {
    const f = fixture(); read(f); f.revoke({ error });
    const result = await f.call('github.pr_get', args);
    assert.equal(result.error, 'mint.revoke_failed'); assert.equal(f.calls.length, 4);
    assert.equal((await f.call('github.pr_get', args)).error, 'rate.retry_after'); f.hygiene(result); f.done();
  });
}

test('SDK signal requires the fixed DELETE method and URL at the fetch boundary', async () => {
  const error = new TypeError(sdkMessage), ctx = { http: { fetch: async () => { throw error; } } };
  for (const [method, url] of [['GET', 'https://api.github.com/installation/token'], ['DELETE', 'https://api.github.com/installation/token?x=1'], ['DELETE', 'https://evil.invalid/installation/token']]) {
    await assert.rejects(githubHttp(ctx, { method, url, headers: {} }), e => e === error && !(e instanceof SdkNullBodyRevokeFailure));
  }
  await assert.rejects(githubHttp(ctx, { method: 'DELETE', url: 'https://api.github.com/installation/token', headers: {} }), SdkNullBodyRevokeFailure);
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull, { error }); f.revoke();
  assert.equal((await f.call('github.pr_get', args)).error, 'http.unavailable'); assert.equal(f.calls.length, 4); f.done();
});

test('probe ID must survive credential scrubbing, not merely match its format', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }, { token: requestId });
  f.identity = () => f.steps.push({ method: 'GET', path: '/repos/synthetic-org/sandbox', body: { id: 101 } });
  f.identity(); f.steps.push({ method: 'GET', path: '/repos/synthetic-org/sandbox/pulls/1', body: pull });
  f.revoke({ error: new TypeError(sdkMessage), inspect: req => assert.equal(req.headers.Authorization, `Bearer ${requestId}`) });
  f.steps.push({ method: 'GET', path: '/installation/repositories?per_page=1', status: 401, body: { message: 'Bad credentials' } });
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, 'mint.revoke_failed');
  assert.equal(f.events.at(-1).revocation.probeRequestId, null);
  assert.ok(!JSON.stringify({ result, events: f.events }).includes(requestId)); f.hygiene(result); f.done();
});

test('verification preserves a prior use failure instead of converting it to success', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' });
  f.steps[0].effect = () => { f.config.policy.revision++; };
  fallback(f); probe(f);
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, 'policy.changed');
  assert.equal(f.events.at(-1).revocation.outcome, 'revoked_verified_by_probe');
  assert.equal(f.calls.length, 3); f.hygiene(result); f.done();
});

test('probe verification plus an outcome audit failure never caches success', async () => {
  const f = fixture(); read(f); fallback(f); probe(f, { effect: () => { f.failAudit = true; } });
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, 'audit.unavailable'); f.failAudit = false;
  read(f); f.revoke();
  assert.equal((await f.call('github.pr_get', args)).error, undefined);
  assert.equal(f.secretCalls, 2); assert.equal(f.calls.length, 9); f.hygiene(result); f.done();
});

test('N+5 reservation refuses before secrets when the former N+4 budget would fit', async () => {
  for (const [name, input, n] of [['github.pr_get', args, 1], ['github.checks_get', { ...base, sha: 'a'.repeat(40), page: 1, perPage: 10 }, 3]]) {
    const f = fixture(), broker = new Broker(), now = Date.now();
    const used = 4000 - (n + 4);
    assert.equal(used + n + 4, 4000);
    broker.reserve(broker.installations, '42:99', used, 4000, 3600000, now);
    const result = await broker.execute({ config: async () => f.config, issue: async () => f.issue, workspace: async () => f.workspace,
      secret: async () => { f.secretCalls++; return key; }, http: req => githubHttp(f.ctx, req),
      audit: async record => f.events.push(record), clock: () => now }, name, input, run);
    assert.equal(JSON.parse(result.content[0].text).rule, 'rate.bucket');
    assert.equal(broker.installations.get('42:99').count, used, 'A refused reservation must be atomic');
    assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result); f.done();
  }
});

test('single reads reserve six and checks reserve eight in one before-secret reservation', async () => {
  for (const [name, input, cost] of [['github.pr_get', args, 6], ['github.checks_get', { ...base, sha: 'a'.repeat(40), page: 1, perPage: 10 }, 8]]) {
    const f = fixture(), broker = new Broker(), now = Date.now(), reservations = [];
    const reserve = broker.reserve.bind(broker);
    broker.reserve = (map, ...values) => {
      if (map === broker.installations) reservations.push(values[1]);
      return reserve(map, ...values);
    };
    const result = await broker.execute({ config: async () => f.config, issue: async () => f.issue, workspace: async () => f.workspace,
      secret: async () => {
        f.secretCalls++;
        assert.deepEqual(reservations, [cost]);
        assert.equal(broker.installations.get('42:99').count, cost);
        throw Error('synthetic secret unavailable');
      }, http: req => githubHttp(f.ctx, req), audit: async record => f.events.push(record), clock: () => now }, name, input, run);
    assert.equal(JSON.parse(result.content[0].text).rule, 'secret.unavailable');
    assert.deepEqual(reservations, [cost]); assert.equal(f.secretCalls, 1);
    assert.equal(f.calls.length, 0); f.hygiene(result); f.done();
  }
});

test('valid first 200 permits exactly one identical-token GET at t0+250 and publishes only after strict rejection', async t => {
  const clock = monotonic(t), f = fixture({ hostCall: immediateHostCall });
  read(f); fallback(f);
  probe(f, { status: 200, raw: key + token });
  probe(f, { headers: { 'x-github-request-id': secondId }, inspect: () => assert.equal(clock.now, 1250) });
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].title, pull.title);
  assert.deepEqual(f.events.at(-1).revocation, evidence([
    attempt(1, 200, 'unexpected_status'), attempt(2, 401, 'bad_credentials', secondId),
  ], 'verified', true));
  assert.equal(f.events.at(-1).requestIds.length, 5);
  assert.deepEqual(f.calls[4], f.calls[5]);
  assert.deepEqual(clock.timers, [250]);
  assert.equal((await f.call('github.pr_get', args)).error, undefined);
  assert.equal(f.calls.length, 6); assert.equal(f.secretCalls, 1);
  f.hygiene(result); f.done();
});

for (const [label, headers] of [
  ['missing', {}], ['malformed', { 'x-github-request-id': 'not-a-request-id' }], ['reflected', { 'x-github-request-id': token }],
]) {
  test(`second 401 with ${label} request ID is not proof of revocation`, async t => {
    monotonic(t);
    const f = fixture({ hostCall: immediateHostCall }); read(f); fallback(f);
    probe(f, { status: 200 }); probe(f, { headers });
    const result = await f.call('github.pr_get', args);
    assert.equal(result.error, 'mint.revoke_failed');
    assert.deepEqual(f.events.at(-1).revocation, evidence([
      attempt(1, 200, 'unexpected_status'), attempt(2, 401, 'bad_credentials', null),
    ], 'evidence', true));
    const next = await f.call('github.pr_get', args);
    assert.equal(next.error, 'rate.retry_after');
    assert.equal(f.calls.length, 6); assert.equal(f.secretCalls, 1);
    f.hygiene(result); f.hygiene(next); f.done();
  });
}

test('persistent 200 exhausts two probes without cache publication, minting again or losing the pause', async t => {
  monotonic(t);
  const f = fixture({ hostCall: immediateHostCall }); read(f); fallback(f);
  probe(f, { status: 200, raw: key + token });
  probe(f, { status: 200, raw: key + token, headers: { 'x-github-request-id': secondId } });
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, 'mint.revoke_failed');
  assert.equal(result.data.pages, undefined);
  assert.deepEqual(f.events.at(-1).revocation, evidence([
    attempt(1, 200, 'unexpected_status'), attempt(2, 200, 'unexpected_status', secondId),
  ], 'evidence', true));
  const next = await f.call('github.pr_get', args);
  assert.equal(next.error, 'rate.retry_after'); assert.ok(next.data.retryAfterSeconds >= 3659);
  assert.equal(f.calls.length, 6); assert.equal(f.secretCalls, 1);
  assert.deepEqual(f.calls[4], f.calls[5]); f.hygiene(result); f.hygiene(next); f.done();
});

test('recovery evidence snapshots and nested attempts stay immutable as the second probe completes', async t => {
  const clock = monotonic(t), r = recovery(clock);
  assert.equal(await r.promise, pull.title);
  assert.equal(r.uses, 1);
  assert.equal(r.calls.filter(c => c.req.method === 'POST').length, 1);
  assert.deepEqual(r.calls[2].req, r.calls[3].req);
  assert.deepEqual(r.dispatches, [1250]); assert.deepEqual(clock.timers, [250]);
  assert.deepEqual(r.snapshots[0].probes, []);
  const pending = r.snapshots.find(s => s.probes.length === 2 && s.probes[1].status === null);
  assert.ok(pending); assert.equal(pending.secondDispatched, false);
  assert.deepEqual(pending.probes, [attempt(1, 200, 'unexpected_status'), attempt(2, null, 'unavailable', null)]);
  const final = r.snapshots.at(-1);
  assert.deepEqual(final, evidence([attempt(1, 200, 'unexpected_status'), attempt(2, 401, 'bad_credentials', secondId)], 'verified', true));
  assert.notEqual(final.probes, pending.probes); assert.notEqual(final.probes[0], pending.probes[0]);
  for (const snapshot of r.snapshots) {
    assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.probes));
    for (const item of snapshot.probes) assert.ok(Object.isFrozen(item));
  }
  assert.throws(() => { pending.secondDispatched = true; }, TypeError);
  assert.throws(() => { pending.probes[0].requestId = secondId; }, TypeError);
  assert.throws(() => { pending.probes.push(attempt(2, 401, 'bad_credentials')); }, TypeError);
  assert.equal(pending.secondDispatched, false); assert.equal(pending.probes[1].status, null);
});

for (const [label, elapsed, success] of [['just before D', 1999, true], ['at D', 2000, false], ['after D', 2001, false]]) {
  test(`first response processing consumes the original deadline budget (${label})`, async t => {
    const clock = monotonic(t), r = recovery(clock, { observe: number => { if (number === 1) clock.now += elapsed; } });
    if (success) {
      assert.equal(await r.promise, pull.title);
      assert.deepEqual(r.dispatches, [2999]);
      assert.equal(r.snapshots.at(-1).terminalReason, 'verified');
    } else {
      await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
      assert.deepEqual(r.dispatches, []);
      assert.deepEqual(r.snapshots.at(-1), evidence([attempt(1, 200, 'unexpected_status', null)], 'deadline'));
    }
    assert.deepEqual(clock.timers, [], 'Observer time counts toward both the minimum delay and absolute budget');
    assert.equal(r.calls.length, success ? 4 : 3);
  });
}

for (const [label, responseTime, success] of [['D-1', 2999, true], ['D', 3000, false], ['D+1', 3001, false]]) {
  test(`second rejection received at ${label} uses a strict monotonic deadline`, async t => {
    const clock = monotonic(t), r = recovery(clock, { onSecondResponse: () => { clock.now = responseTime; } });
    if (success) {
      assert.equal(await r.promise, pull.title);
      assert.equal(r.snapshots.at(-1).terminalReason, 'verified');
    } else {
      await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
      assert.deepEqual(r.snapshots.at(-1), evidence([
        attempt(1, 200, 'unexpected_status'), attempt(2, null, 'unavailable', null),
      ], 'deadline', true));
    }
    assert.deepEqual(r.dispatches, [1250]); assert.equal(r.calls.length, 4);
  });
}

for (const [label, advance] of [['early timer', 249], ['timer wakes at D', 2000], ['timer wakes beyond D', 2001]]) {
  test(`${label} cannot dispatch a second probe outside the permitted interval`, async t => {
    const clock = monotonic(t, advance), r = recovery(clock);
    await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
    assert.deepEqual(r.dispatches, []); assert.equal(r.calls.length, 3);
    assert.deepEqual(r.snapshots.at(-1), evidence([attempt(1, 200, 'unexpected_status')], 'deadline'));
  });
}

for (const finishedAt of [3000, 3001]) {
  test(`second observer finishing at ${finishedAt} cannot turn an on-time 401 into verified evidence`, async t => {
    const clock = monotonic(t), r = recovery(clock, { observe: number => { if (number === 2) clock.now = finishedAt; } });
    await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
    assert.deepEqual(r.snapshots.at(-1), evidence([
      attempt(1, 200, 'unexpected_status'), attempt(2, 401, 'bad_credentials', null),
    ], 'deadline', true));
    assert.deepEqual(r.dispatches, [1250]); assert.equal(r.calls.length, 4);
  });
}

test('t0 precedes first-response validation, not merely the first observer', async t => {
  const clock = monotonic(t);
  let accessed = false;
  const r = recovery(clock, { onFirstBodyAccess: () => { accessed = true; clock.now = 3000; } });
  await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
  assert.equal(accessed, true);
  // The validated 200 remains available evidence even though no ID observation
  // or second dispatch is eligible after processing exhausts the window.
  assert.deepEqual(r.snapshots.at(-1), evidence([attempt(1, 200, 'unexpected_status', null)], 'deadline'));
  assert.equal(r.calls.length, 3); assert.deepEqual(r.dispatches, []); assert.deepEqual(clock.timers, []);
});

test('time spent processing the first response is never replenished for the second observer', async t => {
  const clock = monotonic(t), r = recovery(clock, { observe: number => { clock.now += number === 1 ? 1900 : 101; } });
  await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
  assert.deepEqual(clock.timers, []); assert.deepEqual(r.dispatches, [2900]);
  assert.equal(r.snapshots.at(-1).terminalReason, 'deadline');
  assert.equal(r.snapshots.at(-1).secondDispatched, true);
});

for (const [label, options, terminalReason, dispatched] of [
  ['capacity before dispatch', { capacity: true }, 'capacity', false],
  ['transport after dispatch', { transportError: true }, 'transport', true],
  ['second observer throws', { observe: number => { if (number === 2) throw Error(key + token); } }, 'observer', true],
  ['second ID missing', { ids: [requestId, undefined] }, 'evidence', true],
  ['second wrong message', { second: { body: JSON.stringify({ message: 'Requires authentication' }) } }, 'evidence', true],
  ['second invalid JSON', { second: { body: '{' } }, 'evidence', true],
  ['second 403', { second: { status: 403 } }, 'evidence', true],
]) {
  test(`bounded recovery fails closed for ${label}`, async t => {
    const clock = monotonic(t), r = recovery(clock, options);
    await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
    const last = r.snapshots.at(-1);
    assert.equal(last.outcome, 'unverified'); assert.equal(last.terminalReason, terminalReason);
    assert.equal(last.secondDispatched, dispatched); assert.equal(last.probes.length, 2);
    assert.deepEqual(last.probes[0], attempt(1, 200, 'unexpected_status'));
    assert.equal(last.probeStatus, last.probes[1].status);
    assert.equal(last.probeRequestId, last.probes[1].requestId);
    assert.equal(last.probeResult, last.probes[1].result);
    assert.equal(r.calls.length, 4); assert.equal(r.uses, 1);
  });
}

test('a throwing first observer cannot authorize the second probe even with a valid 200 ID', async t => {
  const clock = monotonic(t), r = recovery(clock, { observe: () => { throw Error(key + token); } });
  await assert.rejects(r.promise, { rule: 'mint.revoke_failed' });
  assert.deepEqual(r.snapshots.at(-1), evidence([attempt(1, 200, 'unexpected_status', null)], 'observer'));
  assert.deepEqual(clock.timers, []); assert.deepEqual(r.dispatches, []); assert.equal(r.calls.length, 3);
});

for (const verified of [true, false]) {
  test(`recovery audit failure pauses before denial audit (${verified ? 'second rejection verified' : 'persistent 200'})`, async t => {
    monotonic(t);
    const f = fixture({ hostCall: immediateHostCall }); read(f); fallback(f);
    probe(f, { status: 200 }); probe(f, verified ? {} : { status: 200 });
    const log = f.ctx.activity.log;
    let inspected = false, nested = false, failedSuccess = false;
    f.ctx.activity.log = async entry => {
      const record = entry.metadata;
      if (verified && record.phase === 'outcome' && record.decision === 'allow') {
        failedSuccess = true; throw Error(key + token);
      }
      if (!nested && record.decision === 'deny' && ['audit.unavailable', 'mint.revoke_failed'].includes(record.rule)) {
        nested = true;
        const next = await f.call('github.pr_get', args);
        assert.equal(next.error, 'rate.retry_after'); assert.ok(next.data.retryAfterSeconds >= 3659);
        assert.equal(f.calls.length, 6); assert.equal(f.secretCalls, 1);
        inspected = true;
        throw Error(key + token);
      }
      return log(entry);
    };
    const result = await f.call('github.pr_get', args);
    assert.equal(result.error, 'audit.unavailable'); assert.equal(result.data.pages, undefined);
    assert.equal(inspected, true); assert.equal(failedSuccess, verified);
    f.ctx.activity.log = log;
    const next = await f.call('github.pr_get', args);
    assert.equal(next.error, 'rate.retry_after');
    assert.equal(f.calls.length, 6); assert.equal(f.secretCalls, 1);
    f.hygiene(result); f.hygiene(next); f.done();
  });
}

for (const priorFailure of ['upstream.read', 'policy.changed']) {
  test(`verified second probe preserves ${priorFailure} and pauses before its failing denial audit`, async t => {
    monotonic(t);
    const f = fixture({ hostCall: immediateHostCall });
    if (priorFailure === 'upstream.read') {
      read(f); f.steps.at(-1).status = 500;
    } else {
      f.mint({ pull_requests: 'read' });
      f.steps[0].effect = () => { f.config.policy.revision++; };
    }
    fallback(f); probe(f, { status: 200 }); probe(f);
    const expectedCalls = priorFailure === 'upstream.read' ? 6 : 4;
    const log = f.ctx.activity.log;
    let denial, nestedResult, inspected = false;
    f.ctx.activity.log = async entry => {
      const record = entry.metadata;
      if (record.decision === 'deny' && record.rule === priorFailure) {
        denial = record;
        nestedResult = await f.call('github.pr_get', args);
        assert.equal(nestedResult.error, 'rate.retry_after');
        assert.ok(nestedResult.data.retryAfterSeconds >= 3659);
        assert.equal(f.calls.length, expectedCalls); assert.equal(f.secretCalls, 1);
        inspected = true;
        throw Error(key + token);
      }
      return log(entry);
    };
    const result = await f.call('github.pr_get', args);
    assert.equal(result.error, 'audit.unavailable'); assert.equal(result.data.pages, undefined);
    assert.equal(inspected, true, 'The recovery pause must exist before the prior failure denial is audited');
    assert.equal(denial.rule, priorFailure, 'Verified cleanup must not overwrite the original use failure');
    assert.deepEqual(denial.revocation, evidence([
      attempt(1, 200, 'unexpected_status'), attempt(2, 401, 'bad_credentials'),
    ], 'verified', true));
    f.ctx.activity.log = log;
    const next = await f.call('github.pr_get', args);
    assert.equal(next.error, 'rate.retry_after'); assert.ok(next.data.retryAfterSeconds >= 3659);
    assert.equal(f.calls.length, expectedCalls); assert.equal(f.secretCalls, 1);
    f.hygiene(result); f.hygiene(nestedResult); f.hygiene(next); f.done();
  });
}

test('fractional first-processing time rounds the remaining minimum wait up, never dispatching early', async t => {
  const clock = monotonic(t), r = recovery(clock, { observe: number => { if (number === 1) clock.now += 249.5; } });
  assert.equal(await r.promise, pull.title);
  assert.deepEqual(clock.timers, [1]); assert.deepEqual(r.dispatches, [1250.5]);
  assert.equal(r.snapshots.at(-1).terminalReason, 'verified');
});

test('expiry between host admission and its dispatch microtask cannot emit a second GET or consume a slot', async t => {
  const clock = monotonic(t, undefined, true), call = createHostCaller();
  let fetches = 0, dispatched = false;
  const pending = githubHttp({ http: { fetch: async () => { fetches++; return new Response('{}'); } } }, {
    method: 'GET', url: 'https://api.github.com/installation/repositories?per_page=1', headers: { Authorization: `Bearer ${token}` },
  }, 3000, call, () => { dispatched = true; });
  clock.now = 3000;
  await assert.rejects(pending, { rule: 'host.timeout' });
  assert.equal(fetches, 0); assert.equal(dispatched, false); assert.equal(clock.pending.size, 0);
  assert.equal(await call(async settled => { settled(); return 'slot released'; }), 'slot released');
  assert.equal(clock.pending.size, 0);
});

test('FIFO wake at D releases its reservation without emitting the expired second GET', async t => {
  const clock = monotonic(t, undefined, true), call = createHostCaller(), releases = [];
  const holders = Array.from({ length: 4 }, () => call(settled => new Promise(resolve => {
    releases.push(() => { settled(); resolve('held request settled'); });
  })));
  await Promise.resolve();
  assert.equal(releases.length, 4);
  let fetches = 0, dispatched = false;
  const pending = githubHttp({ http: { fetch: async () => { fetches++; return new Response('{}'); } } }, {
    method: 'GET', url: 'https://api.github.com/installation/repositories?per_page=1', headers: { Authorization: `Bearer ${token}` },
  }, 3000, call, () => { dispatched = true; });
  const refused = assert.rejects(pending, { rule: 'host.timeout' });
  clock.now = 3000;
  releases[0]();
  await refused;
  assert.equal(fetches, 0); assert.equal(dispatched, false);
  for (const release of releases.slice(1)) release();
  await Promise.all(holders);
  assert.equal(clock.pending.size, 0);
  assert.equal(await call(async settled => { settled(); return 'FIFO slot released'; }), 'FIFO slot released');
  assert.equal(clock.pending.size, 0);
});
