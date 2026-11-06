import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { definePlugin, startWorkerRpcHost } from '@paperclipai/plugin-sdk';

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
