import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../dist/plugins/cloudflare-broker/src/plugin.js';
import { scrub } from '../dist/plugins/cloudflare-broker/src/output.js';
import { JsonRpcCallError, PLUGIN_RPC_ERROR_CODES } from '@paperclipai/plugin-sdk';
import manifest from '../dist/plugins/cloudflare-broker/src/manifest.js';
globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };
const token = 'synthetic-cloudflare-credential-canary';
const run = { agentId: 'agent-one', runId: 'run-one', companyId: 'company-one', projectId: 'project-one' };
const prefix = 'https://api.cloudflare.com/client/v4/accounts/' + 'a'.repeat(32);
const versionId = '11111111-1111-4111-8111-111111111111';
function fixture(options = {}) {
  const f = { secrets: 0, calls: [], handlers: new Map(), events: [], config: { accountId: 'a'.repeat(32), apiTokenSecretRef: { type: 'secret_ref', secretId: 'secret-one' }, policy: {
    version: 1, revision: 1, companyId: run.companyId, agents: [{ agentId: run.agentId, profile: 'read', workerScripts: ['worker-one'], containerApplicationIds: ['app-one'] }],
  } } };
  assert.equal(typeof register, 'function', 'broker registration must exist');
  register({ config: { get: async company => { assert.equal(company, run.companyId); return options.configGet ? options.configGet(f) : f.config; } },
    secrets: { resolve: async (ref, scope) => { f.secrets++; assert.equal(ref.secretId, 'secret-one'); assert.deepEqual(scope, { companyId: run.companyId, configPath: 'apiTokenSecretRef' }); return options.secret ? options.secret() : token; } },
    activity: { log: async e => { f.events.push(e); } }, tools: { register: (name, metadata, handler) => f.handlers.set(name, handler) },
    http: { fetch: async (url, init) => { f.calls.push({ url, ...init }); return options.fetch ? options.fetch(url, init) : Response.json({ success: true, result: options.result ?? { deployments: [] } }); } },
  }, options.timeoutMs ?? 1000);
  f.call = (name, args, context = run) => f.handlers.get('cloudflare.' + name)(args, context);
  return f;
}
test('registers exactly five tools and rejects undocumented rollouts without credentials', async () => {
  const f = fixture(); assert.equal(f.handlers.size, 5); assert.deepEqual(manifest.tools.map(t => t.name).sort(), [...f.handlers.keys()].sort());
  assert.deepEqual(manifest.capabilities, ['agent.tools.register', 'http.outbound', 'secrets.read-ref', 'activity.log.write']);
  assert.equal((await f.call('containers.listRollouts', { applicationId: 'app-one' })).error, 'cloudflare.rollouts_unsupported');
  assert.equal(f.secrets, 0); assert.equal(f.calls.length, 0);
});
test('denies unknown agent, company, none profile, unlisted resources and forged arguments before secret access', async () => {
  for (const [context, args, mutate] of [[{ ...run, agentId: 'unknown' }, { script: 'worker-one' }], [{ ...run, companyId: 'other' }, { script: 'worker-one' }],
    [run, { script: 'other' }], [run, { applicationId: 'other' }], [run, { script: 'worker-one', agentId: run.agentId }],
    [run, { script: '../worker-one' }], [run, { script: 'worker-one' }, f => { f.config.policy.agents[0].profile = 'none'; }],
    [run, { script: 'worker-one' }, f => { f.config.extra = true; }], [run, { script: 'worker-one' }, f => { f.config.policy.agents.push(f.config.policy.agents[0]); }]]) {
    const f = fixture(); mutate?.(f); const r = await f.call(args.applicationId ? 'containers.getApplication' : 'workers.listDeployments', args, context);
    assert.ok(r.error); assert.equal(f.secrets, 0); assert.equal(f.calls.length, 0);
  }
});
test('allowlisted agents without a project can read deployments', async () => {
  const f = fixture(); const r = await f.call('workers.listDeployments', { script: 'worker-one' }, { ...run, projectId: '' });
  assert.equal(r.error, undefined); assert.deepEqual(r.data.result, []); assert.equal(f.calls.length, 1);
});
test('GET deployment URL, hidden bearer, no redirects, explicit projection', async () => {
  const f = fixture({ result: { deployments: [{ id: 'deployment', created_on: 'now', source: 'api', strategy: 'percentage', author_email: token, extra: token, versions: [{ version_id: versionId, percentage: 100, token }] }] } });
  const r = await f.call('workers.listDeployments', { script: 'worker-one' }); assert.equal(r.error, undefined);
  assert.deepEqual(r.data.result, [{ id: 'deployment', created_on: 'now', source: 'api', strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }]);
  assert.equal(f.calls[0].url, prefix + '/workers/scripts/worker-one/deployments'); assert.equal(f.calls[0].method, 'GET');
  assert.deepEqual(f.calls[0].headers, { Authorization: 'Bearer ' + token, Accept: 'application/json' }); assert.equal(f.calls[0].redirect, 'error');
  assert.ok(!JSON.stringify({ r, events: f.events }).includes(token));
});
test('version metadata and annotations are projected and scrubbed, application config is excluded', async () => {
  const f = fixture({ result: { id: versionId, number: 2, metadata: { created_on: 'now', source: 'api', author_email: 'person@example.com' }, annotations: { 'workers/message': 'Bearer abcdefghijklmnop ' + token, 'workers/tag': 'release', password: token }, resources: { bindings: [token] } } });
  const r = await f.call('workers.getVersion', { script: 'worker-one', versionId }); assert.equal(r.error, undefined);
  assert.equal(f.calls[0].url, prefix + '/workers/scripts/worker-one/versions/' + versionId);
  assert.deepEqual(r.data.result, { id: versionId, number: 2, created_on: 'now', metadata: { source: 'api', author_email: '[REDACTED]' }, annotations: { 'workers/message': '[REDACTED] [REDACTED]', 'workers/tag': 'release' } });
  const g = fixture({ result: { id: 'app-one', name: 'app', version: 3, instances: 1, configuration: { environment_variables: [{ value: token }] } } });
  const app = await g.call('containers.getApplication', { applicationId: 'app-one' }); assert.equal(g.calls[0].url, prefix + '/containers/applications/app-one');
  assert.deepEqual(app.data.result, { id: 'app-one', name: 'app', version: 3, instances: 1 });
});
const now = Date.now(), logs = { script: 'worker-one', from: now - 1000, to: now, limit: 10 };
test('log query fixes scope, dry read-only body and output fields', async () => {
  const f = fixture({ result: { events: { events: [{ timestamp: now, source: { password: token }, $metadata: { id: 'event', message: 'safe', level: 'info' }, $workers: { scriptName: 'worker-one', event: { headers: { Authorization: token } } } }] } } });
  const r = await f.call('workers.queryLogs', { ...logs, filter: 'safe' }); assert.equal(r.error, undefined);
  assert.equal(f.calls[0].url, prefix + '/workers/observability/telemetry/query'); assert.equal(f.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[0].body), { queryId: 'cloudflare-broker', dry: true, view: 'events', timeframe: { from: logs.from, to: logs.to }, limit: 10,
    parameters: { filterCombination: 'and', filters: [{ key: '$workers.scriptName', operation: 'eq', type: 'string', value: 'worker-one' }], needle: { value: 'safe', isRegex: false, matchCase: true } } });
  assert.deepEqual(r.data.result, [{ timestamp: now, id: 'event', message: 'safe', level: 'info' }]);
});
test('maximum-size log response is truncated before scrubbing without blocking the worker', async () => {
  const event = { $workers: { scriptName: 'worker-one' }, $metadata: { message: '', error: 'a.b@example.com' } };
  const envelope = { success: true, result: { events: { events: [event] } } };
  event.$metadata.message = 'a.'.repeat(131072).slice(0, 262144 - Buffer.byteLength(JSON.stringify(envelope)));
  const body = JSON.stringify(envelope); assert.equal(Buffer.byteLength(body), 262144);
  const f = fixture({ fetch: async () => new Response(body), timeoutMs: 30000 }); const start = performance.now();
  const r = await f.call('workers.queryLogs', logs); const elapsed = performance.now() - start;
  assert.ok(elapsed < 200, `queryLogs took ${elapsed.toFixed(1)} ms`); assert.equal(r.error, undefined);
  assert.deepEqual(r.data.result, [{ message: 'a.'.repeat(4096), error: '[REDACTED]' }]);
});
test('email redaction has bounded work on long at-free strings and still removes email addresses', () => {
  for (const message of ['a'.repeat(131072), 'a.'.repeat(65536)]) {
    const start = performance.now(); const result = scrub({ message, error: 'a.b@example.com' }, token); const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `scrub took ${elapsed.toFixed(1)} ms`); assert.equal(result.error, '[REDACTED]');
  }
});
test('log windows, limits and raw body are rejected before credentials', async () => {
  for (const change of [{ from: now - 86400001 }, { from: now - 8 * 86400000 }, { from: now + 1 }, { to: now + 60000 }, { limit: 101 }, { limit: 0 }, { from: 'yesterday' }, { body: {} }]) {
    const f = fixture(); assert.ok((await f.call('workers.queryLogs', { ...logs, ...change })).error); assert.equal(f.secrets, 0); assert.equal(f.calls.length, 0);
  }
});
test('HTTP errors, redirects, oversized and malformed responses never surface upstream content', async () => {
  for (const fetch of [async () => new Response(token, { status: 500 }), async () => new Response(token, { status: 302, headers: { Location: 'https://example.com' } }),
    async () => new Response('x'.repeat(262145)), async () => new Response(token), async () => { throw Error(token); }]) {
    const f = fixture({ fetch }); const r = await f.call('workers.listDeployments', { script: 'worker-one' }); assert.ok(r.error); assert.ok(!JSON.stringify(r).includes(token));
  }
});
test('caller timeout caps four still-pending operations; late configuration never resolves credentials', async () => {
  const f = fixture({ timeoutMs: 10, fetch: () => new Promise(() => {}) });
  for (let i = 0; i < 4; i++) assert.equal((await f.call('workers.listDeployments', { script: 'worker-one' })).error, 'cloudflare.timeout');
  assert.equal((await f.call('workers.listDeployments', { script: 'worker-one' })).error, 'cloudflare.capacity'); assert.equal(f.calls.length, 4);
  let release; const gate = new Promise(resolve => { release = resolve; }); const g = fixture({ timeoutMs: 10, configGet: () => gate });
  assert.equal((await g.call('workers.listDeployments', { script: 'worker-one' })).error, 'cloudflare.timeout');
  release(g.config); await new Promise(setImmediate); assert.equal(g.secrets, 0); assert.equal(g.calls.length, 0);
});
test('SDK-local RPC expiry cannot recycle an uncertain native reservation', async () => {
  const f = fixture({ fetch: async () => { throw new JsonRpcCallError({ code: PLUGIN_RPC_ERROR_CODES.TIMEOUT, message: token }); } });
  for (let i = 0; i < 4; i++) assert.ok((await f.call('workers.listDeployments', { script: 'worker-one' })).error);
  assert.equal((await f.call('workers.listDeployments', { script: 'worker-one' })).error, 'cloudflare.capacity'); assert.equal(f.calls.length, 4);
});
test('policy changes before credential read and invalid credentials fail closed', async () => {
  let reads = 0; const f = fixture({ configGet: f => { if (++reads === 2) f.config.policy.agents[0].profile = 'none'; return f.config; } });
  assert.ok((await f.call('workers.listDeployments', { script: 'worker-one' })).error); assert.equal(f.secrets, 0);
  for (const secret of [() => '', () => 'bad\r\nheader', () => { throw Error(token); }]) {
    const g = fixture({ secret }); const r = await g.call('workers.listDeployments', { script: 'worker-one' }); assert.ok(r.error); assert.equal(g.calls.length, 0); assert.ok(!JSON.stringify(r).includes(token));
  }
});
test('logs cannot return another script and redact quoted secrets without exposing source', async () => {
  const event = script => ({ timestamp: now, source: token, $workers: { scriptName: script }, $metadata: { id: 'event', message: '{"password":"short-secret","access_token":"other-secret"}' } });
  const f = fixture({ result: { events: { events: [event('other'), event('worker-one')] } } });
  const r = await f.call('workers.queryLogs', logs); assert.equal(r.data.result.length, 1);
  assert.ok(!JSON.stringify(r).includes('short-secret')); assert.ok(!JSON.stringify(r).includes('other-secret')); assert.ok(!JSON.stringify(r).includes(token));
});
