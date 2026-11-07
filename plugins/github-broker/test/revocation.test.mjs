import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, pull, token, key } from './helpers.mjs';
import { Broker } from '../dist/plugins/github-broker/src/broker.js';
import { githubHttp } from '../dist/plugins/github-broker/src/plugin.js';
import { SdkNullBodyRevokeFailure } from '../dist/packages/github/src/index.js';

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
    },
  });
}

test('one same-token rejection probe records distinct evidence before cache publication', async () => {
  const f = fixture(); read(f); fallback(f); probe(f);
  const result = await f.call('github.pr_get', args);
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].title, pull.title);
  assert.deepEqual(f.events.at(-1).revocation, { outcome: 'revoked_verified_by_probe', deleteRequestId: null, unavailableReason: 'sdk_null_body', probeRequestId: requestId, probeStatus: 401, probeResult: 'bad_credentials' });
  assert.equal(f.events.at(-1).requestIds.length, 4); // mint, identity, read, probe; no fabricated DELETE ID.
  assert.equal((await f.call('github.pr_get', args)).error, undefined);
  assert.equal(f.calls.length, 5); f.hygiene(result); f.done();
});

test('probe diagnostics distinguish exposed status, body and unavailable evidence without weakening cleanup', async () => {
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
    const f = fixture(); read(f); fallback(f); probe(f, overrides);
    const result = await f.call('github.pr_get', args);
    assert.equal(result.error, 'mint.revoke_failed');
    assert.deepEqual(f.events.at(-1).revocation, {
      outcome: 'unverified', deleteRequestId: null, unavailableReason: 'sdk_null_body',
      probeRequestId: safeId, probeStatus: status, probeResult: classification,
    });
    const next = await f.call('github.pr_get', args);
    assert.equal(next.error, 'rate.retry_after');
    assert.ok(next.data.retryAfterSeconds >= (status === 429 ? 11999 : 3659));
    assert.equal(f.calls.length, 5); assert.equal(f.secretCalls, 1);
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
  ['still usable', { status: 200, raw: 'do not parse or publish this repository body' }],
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

test('N+4 worst-case requests are reserved before secret resolution or minting', async () => {
  for (const [name, input, n] of [['github.pr_get', args, 1], ['github.checks_get', { ...base, sha: 'a'.repeat(40), page: 1, perPage: 10 }, 3]]) {
    const f = fixture(), broker = new Broker(), now = Date.now();
    broker.reserve(broker.installations, '42:99', 4000 - (n + 3), 4000, 3600000, now);
    const result = await broker.execute({ config: async () => f.config, issue: async () => f.issue, workspace: async () => f.workspace,
      secret: async () => { f.secretCalls++; return key; }, http: req => githubHttp(f.ctx, req),
      audit: async record => f.events.push(record), clock: () => now }, name, input, run);
    assert.equal(JSON.parse(result.content[0].text).rule, 'rate.bucket');
    assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result); f.done();
  }
});
