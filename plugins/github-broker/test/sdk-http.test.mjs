import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { definePlugin, startWorkerRpcHost, JSONRPC_ERROR_CODES, PLUGIN_RPC_ERROR_CODES } from '@paperclipai/plugin-sdk';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { fixture, base, run, pull, token, key } from './helpers.mjs';

const explicitRpcError = Symbol('explicit RPC error response');
let moduleId = 0;
function isolatedPlugin() { return import(`../dist/plugins/github-broker/src/plugin.js?sdk-http=${++moduleId}`); }

// Exercise the published SDK's RPC deserializer, not a hand-built Response fake.
// This records a release-blocking SDK defect; it is not a revocation workaround.
test('pinned SDK null-body response reconstruction: empty strings throw, null works', async t => {
  const input = new PassThrough(), output = new PassThrough();
  const lines = createInterface({ input: output });
  let nextId = 0, response;
  const waiting = new Map(), requests = [];
  const worker = startWorkerRpcHost({ stdin: input, stdout: output, plugin: definePlugin({
    async setup(ctx) {
      ctx.tools.register('probe', { displayName: 'probe', description: 'Synthetic HTTP probe', parametersSchema: { type: 'object' } }, async () => {
        const res = await ctx.http.fetch('https://api.github.com/installation/token', { method: 'DELETE', headers: { Authorization: 'Bearer SYNTHETIC' } });
        return { data: { status: res.status, body: await res.text(), requestId: res.headers.get('x-github-request-id') } };
      });
    },
  }) });
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (message.method === 'http.fetch') {
      requests.push(message.params);
      input.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: response }) + '\n');
    } else if (!message.method && waiting.has(message.id)) {
      waiting.get(message.id)(message); waiting.delete(message.id);
    } else assert.fail(`Unexpected worker message: ${message.method}`);
  });
  t.after(() => { worker.stop(); lines.close(); input.destroy(); output.destroy(); });
  function call(method, params) {
    const id = ++nextId;
    return new Promise(resolve => {
      waiting.set(id, resolve);
      input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  const initialized = await call('initialize', { manifest: { id: 'synthetic-probe' }, config: {} });
  assert.equal(initialized.error, undefined);
  for (const status of [204, 205, 304]) {
    response = { status, body: '', headers: { 'x-github-request-id': 'SYNTHETIC:204' } };
    const broken = await call('executeTool', { toolName: 'probe', parameters: {}, runContext: {} });
    assert.match(broken.error.message, new RegExp(`Invalid response status code ${status}`));
    assert.equal(broken.result, undefined, 'Never manufacture a successful revocation from this exception');
    response = { ...response, body: null };
    const corrected = await call('executeTool', { toolName: 'probe', parameters: {}, runContext: {} });
    assert.equal(corrected.error, undefined);
    assert.deepEqual(corrected.result.data, { status, body: '', requestId: 'SYNTHETIC:204' });
  }
  response = { status: 200, body: 'ordinary body', headers: {} };
  const ordinary = await call('executeTool', { toolName: 'probe', parameters: {}, runContext: {} });
  assert.deepEqual(ordinary.result.data, { status: 200, body: 'ordinary body', requestId: null });
  assert.equal(requests.length, 7);
  for (const req of requests) assert.deepEqual(req, { url: 'https://api.github.com/installation/token', init: { method: 'DELETE', headers: { Authorization: 'Bearer SYNTHETIC' } } });
});

async function rpcPlugin(t, plugin, host, options = {}) {
  const input = new PassThrough(), output = new PassThrough();
  const lines = createInterface({ input: output });
  const waiting = new Map(), failures = [];
  let nextId = 0;
  const worker = startWorkerRpcHost({ stdin: input, stdout: output, plugin, ...options });
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (message.method) {
      host(message.method, message.params).then(result => {
        const response = result?.[explicitRpcError] ? { error: result[explicitRpcError] } : { result };
        input.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...response }) + '\n');
      }, error => {
        failures.push(error);
        input.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'synthetic host failure' } }) + '\n');
      });
    } else if (waiting.has(message.id)) {
      waiting.get(message.id)(message); waiting.delete(message.id);
    } else assert.fail('Unexpected worker reply');
  });
  t.after(() => { worker.stop(); lines.close(); input.destroy(); output.destroy(); assert.deepEqual(failures, []); });
  function call(method, params) {
    const id = ++nextId;
    return new Promise(resolve => { waiting.set(id, resolve); input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  }
  assert.equal((await call('initialize', { manifest: { id: 'synthetic-broker' }, config: {} })).error, undefined);
  return async (toolName, parameters = {}) => {
    const reply = await call('executeTool', { toolName, parameters, runContext: run });
    assert.equal(reply.error, undefined); return reply.result;
  };
}

// Run the actual registered broker through SDK RPC in both directions. Only the
// host is synthetic; the SDK reconstructs every fetch response itself.
async function rpcBroker(t, f, nullDeleteBody = false) {
  const { register } = await isolatedPlugin();
  const call = await rpcPlugin(t, definePlugin({ async setup(ctx) { register(ctx); } }), async (method, p) => {
    switch (method) {
      case 'config.get': return f.ctx.config.get(p.companyId);
      case 'issues.get': return f.ctx.issues.get(p.issueId, p.companyId);
      case 'projects.listWorkspaces': return f.ctx.projects.listWorkspaces(p.projectId, p.companyId);
      case 'secrets.resolve':
        assert.deepEqual(p, { secretRef: f.config.privateKeySecretRef, companyId: run.companyId, configPath: 'privateKeySecretRef' });
        f.secretCalls++; return key;
      case 'activity.log': await f.ctx.activity.log(p); return null;
      case 'http.fetch': {
        const res = await f.ctx.http.fetch(p.url, p.init);
        return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: nullDeleteBody && p.init.method === 'DELETE' ? null : await res.text() };
      }
      default: assert.fail(`Unexpected host method ${method}`);
    }
  });
  return () => call('github.pr_get', { ...base, number: 1 });
}

const firstId = 'BEEF:1234:5678:90AB', secondId = 'CAFE:1234:5678:90AB';
function readAndDelete(f) { f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke(); }
function probe(f, overrides = {}) {
  f.steps.push({ method: 'GET', path: '/installation/repositories?per_page=1', status: 401,
    body: { message: 'Bad credentials', documentation_url: token }, headers: { 'x-github-request-id': firstId }, ...overrides,
    inspect(req) {
      assert.equal(req.headers.Authorization, `Bearer ${token}`);
      assert.equal(req.body, undefined);
      assert.ok(Object.keys(req.headers).every(k => !k.toLowerCase().startsWith('if-')));
      overrides.inspect?.(req);
    },
  });
}
function evidence(probes, terminalReason = 'verified') {
  const last = probes.at(-1);
  return { outcome: terminalReason === 'verified' ? 'revoked_verified_by_probe' : 'unverified', deleteRequestId: null, unavailableReason: 'sdk_null_body',
    probeRequestId: last.requestId, probeStatus: last.status, probeResult: last.result,
    probes, secondDispatched: probes.length === 2, terminalReason };
}

for (const nullDeleteBody of [false, true]) test(`real SDK RPC broker cleanup: ${nullDeleteBody ? 'observed 204 without probe' : 'SDK 204 then evidence-bearing 401'}`, async t => {
  const f = fixture(); readAndDelete(f);
  if (!nullDeleteBody) probe(f);
  const call = await rpcBroker(t, f, nullDeleteBody), result = await call();
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].title, pull.title);
  assert.deepEqual(f.events.at(-1).revocation, nullDeleteBody
    ? { outcome: 'revoked', deleteRequestId: 'ABCD:1234:5678:90AB' }
    : evidence([{ attempt: 1, status: 401, requestId: firstId, result: 'bad_credentials' }]));
  for (const req of f.calls) assert.ok(Object.keys(req.headers).every(k => !k.toLowerCase().startsWith('if-')));
  assert.equal((await call()).error, undefined); assert.equal(f.calls.length, nullDeleteBody ? 4 : 5);
  f.hygiene(result); f.done();
});

test('real pinned SDK RPC recovers only after DELETE 204, usable 200, then strict same-token 401', async t => {
  const f = fixture(); readAndDelete(f);
  let deleteAt, firstAt, secondAt;
  f.steps.at(-1).effect = () => { deleteAt = performance.now(); };
  probe(f, { status: 200, raw: key + token, inspect() { firstAt = performance.now(); } });
  probe(f, { headers: { 'x-github-request-id': secondId }, inspect() { secondAt = performance.now(); } });
  const call = await rpcBroker(t, f), result = await call();
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].title, pull.title);
  assert.ok(firstAt >= deleteAt);
  assert.ok(secondAt - deleteAt >= 250, 'second GET must not dispatch before the fixed cleanup delay');
  assert.deepEqual(f.calls.map(req => [req.method, new URL(req.url).pathname + new URL(req.url).search]), [
    ['POST', '/app/installations/99/access_tokens'], ['GET', '/repos/synthetic-org/sandbox'], ['GET', '/repos/synthetic-org/sandbox/pulls/1'],
    ['DELETE', '/installation/token'], ['GET', '/installation/repositories?per_page=1'], ['GET', '/installation/repositories?per_page=1'],
  ]);
  assert.deepEqual(f.events.at(-1).revocation, evidence([
    { attempt: 1, status: 200, requestId: firstId, result: 'unexpected_status' },
    { attempt: 2, status: 401, requestId: secondId, result: 'bad_credentials' },
  ]));
  assert.equal(f.events.at(-1).outcome, 'success');
  assert.equal((await call()).error, undefined); assert.equal(f.calls.length, 6, 'only verified cleanup may publish the cache');
  assert.equal(f.secretCalls, 1); f.hygiene(result); f.done();
});

for (const status of [200, 403, 304, 500]) test(`real SDK RPC ambiguous probe status ${status} retains pause`, async t => {
  const f = fixture(); readAndDelete(f);
  probe(f, { status, body: { message: 'Bad credentials' } });
  if (status === 200) probe(f, { status: 200, raw: key + token, headers: { 'x-github-request-id': secondId } });
  const call = await rpcBroker(t, f), result = await call();
  assert.equal(result.error, 'mint.revoke_failed');
  const probes = [{ attempt: 1, status: status === 304 ? null : status, requestId: status === 304 ? null : firstId,
    result: status === 304 ? 'unavailable' : 'unexpected_status' }];
  if (status === 200) probes.push({ attempt: 2, status: 200, requestId: secondId, result: 'unexpected_status' });
  assert.deepEqual(f.events.at(-1).revocation, evidence(probes, status === 304 ? 'transport' : status === 200 ? 'evidence' : 'ineligible'));
  assert.equal((await call()).error, 'rate.retry_after'); assert.equal(f.calls.length, status === 200 ? 6 : 5);
  assert.equal(f.secretCalls, 1); f.hygiene(result); f.done();
});

for (const [body, classification] of [
  [{ message: token, extra: key }, 'unexpected_body'],
  [[{ message: 'Bad credentials' }], 'unexpected_body'],
]) test(`real SDK RPC nonqualifying 401 diagnostics for ${Array.isArray(body) ? 'array' : 'reflected message'}`, async t => {
  const f = fixture(); readAndDelete(f); probe(f, { body });
  const call = await rpcBroker(t, f), result = await call();
  assert.equal(result.error, 'mint.revoke_failed');
  assert.deepEqual(f.events.at(-1).revocation, evidence([{ attempt: 1, status: 401, requestId: firstId, result: classification }], 'ineligible'));
  assert.equal((await call()).error, 'rate.retry_after'); assert.equal(f.calls.length, 5); f.hygiene(result); f.done();
});

for (const headers of [{}, { 'x-github-request-id': token }]) test(`real SDK RPC first 200 with ${Object.keys(headers).length ? 'reflected' : 'missing'} request ID never permits a second probe`, async t => {
  const f = fixture(); readAndDelete(f); probe(f, { status: 200, raw: key + token, headers });
  const call = await rpcBroker(t, f), result = await call();
  assert.equal(result.error, 'mint.revoke_failed');
  assert.deepEqual(f.events.at(-1).revocation, evidence([{ attempt: 1, status: 200, requestId: null, result: 'unexpected_status' }], 'ineligible'));
  assert.equal((await call()).error, 'rate.retry_after'); assert.equal(f.calls.length, 5); f.hygiene(result); f.done();
});

for (const [label, overrides, requestId, classification] of [
  ['missing request ID', { headers: {} }, null, 'bad_credentials'],
  ['reflected body', { body: { message: token, extra: key } }, secondId, 'unexpected_body'],
  ['SDK 304 reconstruction error', { status: 304 }, null, 'unavailable'],
]) test(`real SDK RPC second probe ${label} cannot publish success`, async t => {
  const f = fixture(); readAndDelete(f); probe(f, { status: 200, raw: key + token });
  probe(f, { headers: { 'x-github-request-id': secondId }, ...overrides });
  const call = await rpcBroker(t, f), result = await call();
  assert.equal(result.error, 'mint.revoke_failed');
  assert.deepEqual(f.events.at(-1).revocation, evidence([
    { attempt: 1, status: 200, requestId: firstId, result: 'unexpected_status' },
    { attempt: 2, status: label === 'SDK 304 reconstruction error' ? null : 401, requestId, result: classification },
  ], classification === 'unavailable' ? 'transport' : 'evidence'));
  assert.equal((await call()).error, 'rate.retry_after'); assert.equal(f.calls.length, 6); f.hygiene(result); f.done();
});

test('real SDK reconstruction errors release known-settled slots but only fixed DELETE 204 signals fallback', async t => {
  const { githubHttp } = await isolatedPlugin();
  let response, requests = 0;
  const call = await rpcPlugin(t, definePlugin({ async setup(ctx) {
    ctx.tools.register('probe', { displayName: 'probe', description: 'Synthetic HTTP boundary', parametersSchema: { type: 'object' } }, async args => {
      try {
        const res = await githubHttp(ctx, { url: args.url, method: args.method, headers: {} });
        return { data: { status: res.status } };
      } catch (error) { return { data: { error: error.message } }; }
    });
  } }), async (method, p) => {
    assert.equal(method, 'http.fetch'); assert.equal(p.init.method === 'DELETE' || p.init.method === 'GET', true);
    requests++; return response;
  });
  const cases = [
    [204, 'DELETE', 'https://api.github.com/installation/token', 'http.sdk_null_body_revoke'],
    [204, 'GET', 'https://api.github.com/installation/token', 'Response constructor: Invalid response status code 204'],
    [204, 'DELETE', 'https://api.github.com/other', 'Response constructor: Invalid response status code 204'],
    [205, 'DELETE', 'https://api.github.com/installation/token', 'Response constructor: Invalid response status code 205'],
    [304, 'GET', 'https://api.github.com/installation/repositories?per_page=1', 'Response constructor: Invalid response status code 304'],
  ];
  for (let round = 0; round < 2; round++) for (const [status, method, url, error] of cases) {
    response = { status, body: '', headers: {} };
    assert.deepEqual((await call('probe', { method, url })).data, { error });
  }
  response = { status: 200, body: '{}', headers: {} };
  assert.deepEqual((await call('probe', { method: 'GET', url: 'https://api.github.com/installation/repositories?per_page=1' })).data, { status: 200 });
  assert.equal(requests, 11, 'known settled reconstruction failures must not exhaust the four slots');
});

for (const code of [JSONRPC_ERROR_CODES.INTERNAL_ERROR, PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED]) test(`real SDK explicit host error ${code} restores shared capacity without reporting success`, async t => {
  const { githubHttp, hostCall } = await isolatedPlugin();
  let fail = true;
  const requests = [];
  const call = await rpcPlugin(t, definePlugin({ async setup(ctx) {
    ctx.tools.register('settlement', { displayName: 'settlement', description: 'Synthetic host error settlement', parametersSchema: { type: 'object' } }, async args => {
      try {
        const value = args.http
          ? (await githubHttp(ctx, { url: 'https://api.github.com/installation/repositories?per_page=1', method: 'GET', headers: {} })).status
          : await hostCall(() => ctx.config.get(run.companyId));
        return { data: { value } };
      } catch (error) { return { data: { errorCode: error.code, errorName: error.name } }; }
    });
  } }), async (method, params) => {
    assert.ok(method === 'config.get' || method === 'http.fetch');
    requests.push(method);
    if (fail) return { [explicitRpcError]: { code, message: 'synthetic completed host error' } };
    if (method === 'config.get') { assert.equal(params.companyId, run.companyId); return 'known success'; }
    return { status: 200, headers: {}, body: '{}' };
  });
  // Exercise the generic limiter as well as githubHttp: settlement belongs to
  // their shared SDK boundary, not merely the HTTP adapter's special catches.
  for (let round = 0; round < 6; round++) for (const http of [false, true]) {
    assert.deepEqual((await call('settlement', { http })).data, { errorCode: code, errorName: 'JsonRpcCallError' });
  }
  fail = false;
  assert.deepEqual((await call('settlement', { http: false })).data, { value: 'known success' });
  assert.deepEqual((await call('settlement', { http: true })).data, { value: 200 });
  assert.equal(requests.filter(method => method === 'config.get').length, 7);
  assert.equal(requests.filter(method => method === 'http.fetch').length, 7);
});

test('githubHttp first-200 body consumption cannot reset the cleanup response clock', async t => {
  const originalNow = performance.now.bind(performance);
  let elapsedBodyTime = 0, firstResponseAt, bodyFinishedAt;
  t.mock.method(globalThis.performance, 'now', () => originalNow() + elapsedBodyTime);
  const f = fixture(); readAndDelete(f);
  f.steps.at(-1).error = new TypeError('Response constructor: Invalid response status code 204');
  probe(f, { status: 200, raw: key + token });
  // This would prove rejection if incorrectly dispatched after renewing t0 at
  // body completion. The correct path leaves this queued response untouched.
  probe(f, { headers: { 'x-github-request-id': secondId } });
  const fetch = f.ctx.http.fetch;
  f.ctx.http.fetch = async (url, init) => {
    const response = await fetch(url, init);
    if (url.endsWith('/installation/repositories?per_page=1') && response.status === 200) {
      firstResponseAt = performance.now();
      const text = response.text.bind(response);
      response.text = async () => {
        await nextTurn();
        elapsedBodyTime += 2001;
        bodyFinishedAt = performance.now();
        return text();
      };
    }
    return response;
  };
  const result = await f.call('github.pr_get', { ...base, number: 1 });
  assert.ok(bodyFinishedAt - firstResponseAt > 2000);
  assert.equal(f.events.at(-1).revocation.probeStatus, 200, 'retain the exposed first 200 even when body handling exhausts D');
  assert.equal(result.error, 'mint.revoke_failed', 'a slow first response body must consume, not renew, D=t0+2000ms');
  assert.equal(f.events.at(-1).revocation.outcome, 'unverified');
  assert.equal(f.events.at(-1).revocation.terminalReason, 'deadline');
  assert.equal(f.events.at(-1).revocation.secondDispatched, false);
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls.filter(req => req.url.endsWith('/installation/repositories?per_page=1')).length, 1);
  assert.equal(f.steps.length, 1, 'the second-probe success response must remain undispatched');
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).error, 'rate.retry_after');
  assert.equal(f.calls.length, 5); f.hygiene(result);
});

test('short pinned SDK RPC timeout never replaces host slots, even after late host replies', async t => {
  const { githubHttp, hostCall } = await isolatedPlugin();
  const held = []; let hostStarts = 0;
  const call = await rpcPlugin(t, definePlugin({ async setup(ctx) {
    ctx.tools.register('held', { displayName: 'held', description: 'Synthetic held host requests', parametersSchema: { type: 'object' } }, async () => {
      const results = await Promise.allSettled(Array.from({ length: 4 }, () => githubHttp(ctx, {
        url: 'https://api.github.com/installation/repositories?per_page=1', method: 'GET', headers: {},
      })));
      return { data: results.map(result => result.status === 'fulfilled'
        ? { status: result.value.status }
        : { error: result.reason.rule ?? result.reason.message }) };
    });
  } }), async (method, p) => {
    assert.equal(method, 'http.fetch'); assert.equal(p.init.method, 'GET');
    hostStarts++;
    return new Promise(resolve => held.push(resolve));
  }, { rpcTimeoutMs: 25 });
  try {
    const result = await call('held');
    assert.equal(result.data.length, 4);
    assert.ok(result.data.every(value => /timed out after 25ms/.test(value.error)));
    assert.equal(hostStarts, 4); assert.equal(held.length, 4, 'the host requests remain outstanding past the SDK timeout');
    for (let i = 0; i < 8; i++) await assert.rejects(hostCall(async () => { hostStarts++; }, 5), /host.capacity/);
    assert.deepEqual((await call('held')).data, Array.from({ length: 4 }, () => ({ error: 'host.capacity' })));
    assert.equal(hostStarts, 4, 'no replacement RPC may be emitted after an SDK-side timeout');
  } finally {
    for (const resolve of held) resolve({ status: 200, headers: {}, body: '{"late":true}' });
    await nextTurn();
  }
  // The SDK discarded the timed-out promise: a late wire reply cannot prove its
  // original rejected action fulfilled, so that worker reservation stays closed.
  assert.deepEqual((await call('held')).data, Array.from({ length: 4 }, () => ({ error: 'host.capacity' })));
  assert.equal(hostStarts, 4);
});
