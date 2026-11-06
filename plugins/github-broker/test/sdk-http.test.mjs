import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { definePlugin, startWorkerRpcHost } from '@paperclipai/plugin-sdk';
import { register } from '../dist/plugins/github-broker/src/plugin.js';
import { fixture, base, run, pull, token, key } from './helpers.mjs';

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

// Run the actual registered broker through SDK RPC in both directions. Only the
// host is synthetic; the SDK reconstructs every fetch response itself.
async function rpcBroker(t, f, nullDeleteBody = false) {
  const input = new PassThrough(), output = new PassThrough();
  const lines = createInterface({ input: output });
  const waiting = new Map(), failures = [];
  let nextId = 0;
  const worker = startWorkerRpcHost({ stdin: input, stdout: output, plugin: definePlugin({ async setup(ctx) { register(ctx); } }) });
  async function host(method, p) {
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
  }
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (message.method) {
      host(message.method, message.params).then(result => {
        input.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n');
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
  return async () => {
    const reply = await call('executeTool', { toolName: 'github.pr_get', parameters: { ...base, number: 1 }, runContext: run });
    assert.equal(reply.error, undefined); return reply.result;
  };
}

for (const nullDeleteBody of [false, true]) test(`real SDK RPC broker cleanup: ${nullDeleteBody ? 'observed 204 without probe' : 'SDK 204 then evidence-bearing 401'}`, async t => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke();
  if (!nullDeleteBody) f.steps.push({ method: 'GET', path: '/installation/repositories?per_page=1', status: 401, body: { message: 'Bad credentials', documentation_url: token },
    headers: { 'x-github-request-id': 'BEEF:1234:5678:90AB' }, inspect(req) { assert.equal(req.headers.Authorization, `Bearer ${token}`); assert.equal(req.body, undefined); } });
  const call = await rpcBroker(t, f, nullDeleteBody), result = await call();
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].title, pull.title);
  assert.deepEqual(f.events.at(-1).revocation, nullDeleteBody
    ? { outcome: 'revoked', deleteRequestId: 'ABCD:1234:5678:90AB' }
    : { outcome: 'revoked_verified_by_probe', deleteRequestId: null, unavailableReason: 'sdk_null_body', probeRequestId: 'BEEF:1234:5678:90AB' });
  for (const req of f.calls) assert.ok(Object.keys(req.headers).every(k => !k.toLowerCase().startsWith('if-')));
  assert.equal((await call()).error, undefined); assert.equal(f.calls.length, nullDeleteBody ? 4 : 5);
  f.hygiene(result); f.done();
});

for (const status of [200, 403, 304, 500]) test(`real SDK RPC ambiguous probe status ${status} retains pause`, async t => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke();
  f.steps.push({ method: 'GET', path: '/installation/repositories?per_page=1', status, body: { message: 'Bad credentials' } });
  const call = await rpcBroker(t, f), result = await call();
  assert.equal(result.error, 'mint.revoke_failed');
  assert.equal(f.events.at(-1).revocation.outcome, 'unverified');
  assert.equal((await call()).error, 'rate.retry_after'); assert.equal(f.calls.length, 5); f.hygiene(result); f.done();
});
