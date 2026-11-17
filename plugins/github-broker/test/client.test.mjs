import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { executeBrokerRead } from '../dist/plugins/github-broker/src/client.js';
import { fixture as brokerFixture, base as brokerBase } from './helpers.mjs';

const ids = Array.from({ length: 7 }, (_, i) => `${String(i + 1).repeat(8)}-1111-4111-8111-111111111111`);
const [agentId, runId, companyId, projectId, issueId, workspaceId, interactionId] = ids;
function environment(claims = {}) {
  const payload = { sub: agentId, run_id: runId, company_id: companyId, exp: Math.floor(Date.now() / 1000) + 600, ...claims };
  // Synthetic JWT shape only; the real server, not this client, verifies it.
  const key = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.SYNTHETIC_SIGNATURE`;
  return { PAPERCLIP_API_KEY: key, PAPERCLIP_API_URL: 'https://paperclip.example/api/', PAPERCLIP_AGENT_ID: agentId, PAPERCLIP_RUN_ID: runId, PAPERCLIP_COMPANY_ID: companyId, PAPERCLIP_TASK_ID: issueId, PAPERCLIP_WORKSPACE_ID: workspaceId };
}
const base = { issueId, workspaceId, repoId: 101 };
const args = { ...base, number: 1 };
function wrapper(data = { ok: true, operation: 'github.pr_get', repoId: 101, pages: [] }, error) {
  return { pluginId: 'togetherweown.github-broker', toolName: 'github.pr_get', result: { content: JSON.stringify(data), data, ...(error === undefined ? {} : { error }) } };
}
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
function fixture(body = wrapper(), status = 200, headers = {}) {
  const env = environment(), calls = [];
  const fetcher = async (url, options) => { calls.push({ url: String(url), ...options }); return reply(body, status, headers); };
  return { env, calls, fetcher, call: (name = 'github.pr_get', input = args) => executeBrokerRead(env, projectId, name, input, fetcher) };
}

test('REST client uses fixed agent route with exact run binding and no bypass controls', async () => {
  const f = fixture();
  assert.equal((await f.call()).ok, true);
  assert.equal(f.calls.length, 1);
  const request = f.calls[0];
  assert.equal(request.url, 'https://paperclip.example/api/plugins/tools/execute');
  assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'error');
  assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(request.headers, { Authorization: `Bearer ${f.env.PAPERCLIP_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json', 'X-Paperclip-Run-Id': runId });
  assert.deepEqual(JSON.parse(request.body), { tool: 'togetherweown.github-broker:github.pr_get', parameters: args, runContext: { agentId, runId, companyId, projectId } });
});

for (const [label, change] of [
  ['board key', f => { f.env.PAPERCLIP_API_KEY = 'synthetic-board-key'; }],
  ['foreign agent', f => { f.env.PAPERCLIP_API_KEY = environment({ sub: projectId }).PAPERCLIP_API_KEY; }],
  ['foreign run', f => { f.env.PAPERCLIP_API_KEY = environment({ run_id: projectId }).PAPERCLIP_API_KEY; }],
  ['foreign company', f => { f.env.PAPERCLIP_API_KEY = environment({ company_id: projectId }).PAPERCLIP_API_KEY; }],
  ['missing run claim', f => { f.env.PAPERCLIP_API_KEY = environment({ run_id: undefined }).PAPERCLIP_API_KEY; }],
  ['expired key', f => { f.env.PAPERCLIP_API_KEY = environment({ exp: 1 }).PAPERCLIP_API_KEY; }],
  ['missing workspace', f => { delete f.env.PAPERCLIP_WORKSPACE_ID; }],
  ['missing identity', f => { delete f.env.PAPERCLIP_AGENT_ID; }],
  ['URL credentials', f => { f.env.PAPERCLIP_API_URL = 'https://user:pass@paperclip.example'; }],
  ['URL path', f => { f.env.PAPERCLIP_API_URL = 'https://paperclip.example/other'; }],
  ['URL query', f => { f.env.PAPERCLIP_API_URL = 'https://paperclip.example/?token=private'; }],
  ['remote plaintext', f => { f.env.PAPERCLIP_API_URL = 'http://paperclip.example'; }],
]) test(`REST client refuses ${label} before HTTP`, async () => {
  const f = fixture(); change(f);
  assert.deepEqual(await f.call(), { ok: false, error: 'client.context_or_arguments' });
  assert.equal(f.calls.length, 0);
});

test('REST client permits only fixed reads and current task/workspace selectors', async () => {
  const f = fixture();
  for (const [name, input] of [
    ['github.pr_merge', args], ['constructor', args], ['https://other.example', args],
    ['github.pr_create', { ...base, head: 'agent/example/topic', base: 'main', title: 'feat: example', body: 'Example' }],
    ['github.pr_comment', { ...args, body: 'Example' }], ['github.issue_comment', { ...args, body: 'Example' }],
    ['github.commit_files', { ...base, branch: 'agent/example/topic', expectedParent: 'a'.repeat(40), message: 'feat: example', files: [{ path: 'example', contentBase64: 'aGk=' }] }],
    ['github.pr_get', { ...args, issueId: projectId }], ['github.pr_get', { ...args, workspaceId: projectId }],
    ['github.pr_get', { ...args, url: 'https://other.example' }], ['github.pr_get', { ...args, agentId }],
    ['github.pr_get', { ...args, confirmation: true }], ['github.pr_get', { ...args, repoId: '101' }],
    ['github.repo_read', { ...base, mode: 'file', ref: 'main', path: '../private' }],
    ['github.repo_read', { ...base, mode: 'tree', ref: 'main', path: 'injected' }],
    ['github.rulesets_get', { ...base, page: 1, perPage: 10, rulesetId: 3 }],
  ]) assert.equal((await f.call(name, input)).error, 'client.context_or_arguments');
  assert.equal(f.calls.length, 0);
  assert.equal((await executeBrokerRead(f.env, 'not-a-uuid', 'github.pr_get', args, f.fetcher)).ok, false);
  assert.equal(f.calls.length, 0);
});

test('REST client supports all eight closed tool schemas including both missing-discovery reads', async () => {
  const inputs = {
    'github.repo_read': { ...base, mode: 'tree', ref: 'main' },
    'github.pr_list': { ...base, state: 'open', page: 1, perPage: 10 },
    'github.pr_get': args, 'github.pr_files': { ...args, page: 1, perPage: 10 },
    'github.checks_get': { ...base, sha: 'a'.repeat(40), page: 1, perPage: 10 },
    'github.rulesets_get': { ...base, rulesetId: 3 },
    'github.actions_runs_list': { ...base, page: 1, perPage: 10 }, 'github.issue_read': args,
  };
  for (const [name, input] of Object.entries(inputs)) {
    let calls = 0;
    const result = await executeBrokerRead(environment(), projectId, name, input, async (_, request) => {
      calls++; assert.equal(JSON.parse(request.body).tool, `togetherweown.github-broker:${name}`);
      return reply({ ...wrapper({ ok: true, operation: name, repoId: 101, pages: [] }), toolName: name });
    });
    assert.equal(result.ok, true, name); assert.equal(calls, 1);
  }
});

for (const [status, reasonCode] of [[401, 'unauthorized'], [403, 'actor_run_mismatch'], [409, 'approval_path_missing'], [409, 'approved_execution_unsupported'], [422, 'content_blocked'], [429, 'rate_limit_exceeded'], [500, 'internal_error'], [502, 'worker_unavailable']]) {
  test(`REST client preserves HTTP ${status} failure without retry`, async () => {
    const f = fixture({ error: 'untrusted raw host error', reasonCode }, status, { 'retry-after': '60' });
    const result = await f.call();
    assert.deepEqual(result, { ok: false, error: 'client.http', status, reasonCode, retryAfterSeconds: 60 });
    assert.equal(f.calls.length, 1);
  });
}

test('REST client preserves approval references and stops rather than confirms or retries', async () => {
  const body = { reasonCode: 'approval_required', invocationId: agentId, actionRequestId: runId, interactionId, issueId, argumentsHash: 'a'.repeat(64), instructions: 'untrusted instructions' };
  const f = fixture(body, 409), result = await f.call();
  for (const key of ['reasonCode', 'invocationId', 'actionRequestId', 'interactionId', 'issueId', 'argumentsHash']) assert.equal(result[key], body[key]);
  assert.equal(result.ok, false); assert.match(result.nextAction, /Do not retry or assume automatic execution/);
  assert.equal(result.instructions, undefined); assert.equal(f.calls.length, 1);
});

test('REST client treats nested tool errors and data denials as failures despite HTTP 200', async () => {
  for (const body of [wrapper({ ok: false, rule: 'policy.agent' }, 'policy.agent'), wrapper({ ok: false, rule: 'mint.revoke_failed', retryAfterSeconds: 3660 }), wrapper(undefined, 'policy.changed')]) {
    const f = fixture(body), result = await f.call();
    assert.equal(result.ok, false); assert.equal(result.status, 200);
    assert.equal(result.error, body.result.error ?? body.result.data.rule);
    assert.deepEqual(result.data, body.result.data); assert.equal(f.calls.length, 1);
  }
});

for (const body of [null, {}, { summary: 'replayed', sizeBytes: 10 }, { result: wrapper() }, { ...wrapper(), pluginId: 'other.plugin' }, { ...wrapper(), toolName: 'github.issue_read' }, wrapper({ ok: true, operation: 'github.pr_get', repoId: 999 }), wrapper({ ok: true, operation: 'other', repoId: 101 }), wrapper({ ok: false }), { ...wrapper(), result: { error: 'policy.agent' } }]) {
  test(`REST client refuses malformed or mismatched envelope ${JSON.stringify(body).slice(0, 80)}`, async () => {
    const f = fixture(body);
    assert.deepEqual(await f.call(), { ok: false, error: 'client.response', status: 200 });
    assert.equal(f.calls.length, 1);
  });
}

test('REST client scrubs run bearer from reflected response keys and values and hides thrown text', async () => {
  const f = fixture(), key = f.env.PAPERCLIP_API_KEY;
  const response = wrapper({ ok: true, operation: 'github.pr_get', repoId: 101, pages: [{ [key]: key }] });
  const result = await executeBrokerRead(f.env, projectId, 'github.pr_get', args, async () => reply(response));
  assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes(key));
  const failure = await executeBrokerRead(f.env, projectId, 'github.pr_get', args, async () => { throw new Error(key); });
  assert.deepEqual(failure, { ok: false, error: 'client.transport' });
});

test('REST client accepts large escaped checks output from the registered broker within a finite wire cap', async () => {
  const f = brokerFixture(), sha = 'a'.repeat(40), text = '\\"'.repeat(28000);
  f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity();
  f.read(`/commits/${sha}/check-runs?per_page=2&page=1`, { total_count: 2, check_runs: [1, 2].map(id => ({ id, name: text, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: 15368 } })) });
  f.read(`/commits/${sha}/statuses?per_page=2&page=1`, [1, 2].map(id => ({ id, context: text, state: 'success', creator: { id: 1, login: 'synthetic-bot', type: 'Bot' } })));
  f.read(`/actions/runs?head_sha=${sha}&per_page=2&page=1`, { total_count: 2, workflow_runs: [1, 2].map(id => ({ id, name: text, head_sha: sha })) });
  f.revoke();
  const toolResult = await f.call('github.checks_get', { ...brokerBase, sha, page: 1, perPage: 2 });
  assert.equal(toolResult.error, undefined);
  assert.equal(toolResult.data.signals.length, 4);
  for (const page of toolResult.data.pages) assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 262144);
  const wire = JSON.stringify({ pluginId: 'togetherweown.github-broker', toolName: 'github.checks_get', result: toolResult });
  assert.ok(Buffer.byteLength(wire) > 3 * 1048576);
  assert.ok(Buffer.byteLength(wire) < 4 * 1048576);
  const result = await executeBrokerRead(environment(), projectId, 'github.checks_get', { ...base, sha, page: 1, perPage: 2 }, async () => new Response(wire));
  assert.equal(result.ok, true); assert.deepEqual(result.data, toolResult.data);
  f.done(); f.hygiene(toolResult);
});

test('REST client bounds response bytes, decoding and JSON without exposing raw failures', async () => {
  for (const [body, status] of [['x'.repeat(4 * 1048576 + 1), 200], ['not-json', 200], ['not-json', 503], [new Uint8Array([255]), 200]]) {
    const result = await executeBrokerRead(environment(), projectId, 'github.pr_get', args, async () => new Response(body, { status }));
    assert.deepEqual(result, { ok: false, error: status === 200 ? 'client.response' : 'client.http', status });
  }
});

test('REST client cancels an oversized response before waiting for an unbounded tail', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1048576 + 1)); }, cancel() { cancelled = true; } });
  const result = await executeBrokerRead(environment(), projectId, 'github.pr_get', args, async () => new Response(body));
  assert.deepEqual(result, { ok: false, error: 'client.response', status: 200 });
  assert.equal(cancelled, true);
});

test('REST client timeout aborts the one request without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const pending = executeBrokerRead(environment(), projectId, 'github.pr_get', args, async (_, request) => {
    calls++;
    return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new Error('synthetic timeout')), { once: true }));
  });
  t.mock.timers.tick(45000);
  assert.deepEqual(await pending, { ok: false, error: 'client.timeout' });
  assert.equal(calls, 1);
});

test('REST client classifies a stalled response body as timeout and aborts without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const pending = executeBrokerRead(environment(), projectId, 'github.pr_get', args, async (_, request) => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      request.signal.addEventListener('abort', () => controller.error(new Error('synthetic body timeout')), { once: true });
    } }));
  });
  await Promise.resolve();
  t.mock.timers.tick(45000);
  assert.deepEqual(await pending, { ok: false, error: 'client.timeout', status: 200 });
  assert.equal(calls, 1);
});

test('REST client refuses an actual HTTP redirect without following it', async t => {
  const paths = [];
  const server = createServer((req, res) => {
    paths.push(req.url); req.resume();
    res.writeHead(302, { Location: '/redirected' }); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const env = { ...environment(), PAPERCLIP_API_URL: `http://127.0.0.1:${server.address().port}` };
  assert.deepEqual(await executeBrokerRead(env, projectId, 'github.pr_get', args), { ok: false, error: 'client.transport' });
  assert.deepEqual(paths, ['/api/plugins/tools/execute']);
});

test('REST client CLI returns truthful exit status across the actual HTTP and stdout path', async t => {
  let body = wrapper(), requests = 0;
  const env = environment();
  const server = createServer(async (req, res) => {
    requests++;
    assert.equal(req.url, '/api/plugins/tools/execute'); assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, `Bearer ${env.PAPERCLIP_API_KEY}`);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.equal(JSON.parse(Buffer.concat(chunks)).runContext.runId, runId);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  env.PAPERCLIP_API_URL = `http://127.0.0.1:${server.address().port}`;
  const script = fileURLToPath(new URL('../dist/plugins/github-broker/src/client.js', import.meta.url));
  for (const expected of [true, false]) {
    body = expected ? wrapper() : wrapper({ ok: false, rule: 'policy.agent' }, 'policy.agent');
    const child = spawn(process.execPath, [script, projectId, 'github.pr_get'], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.end(JSON.stringify(args));
    const [status] = await once(child, 'close');
    assert.equal(status, expected ? 0 : 1, stderr); assert.equal(stderr, '');
    const result = JSON.parse(stdout); assert.equal(result.ok, expected); assert.equal(result.status, 200);
    assert.ok(!stdout.includes(env.PAPERCLIP_API_KEY));
  }
  assert.equal(requests, 2);
});

test('REST client CLI resolves symlink entry points without running on import', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'broker-client-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../dist/plugins/github-broker/src/client.js', import.meta.url));
  const link = join(dir, 'client.mjs'); symlinkSync(script, link);
  const linkedDir = join(dir, 'compiled');
  symlinkSync(fileURLToPath(new URL('../dist/plugins/github-broker/src/', import.meta.url)), linkedDir, 'dir');
  let requests = 0;
  const env = environment();
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.url, '/api/plugins/tools/execute');
    assert.equal(req.headers.authorization, `Bearer ${env.PAPERCLIP_API_KEY}`);
    req.resume(); res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(wrapper({ ok: false, rule: 'policy.agent' }, 'policy.agent')));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  env.PAPERCLIP_API_URL = `http://127.0.0.1:${server.address().port}`;
  for (const [flags, entry] of [[[], link], [['--preserve-symlinks-main'], join(linkedDir, 'client.js')]]) {
    const child = spawn(process.execPath, [...flags, entry, projectId, 'github.pr_get'], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.end(JSON.stringify(args));
    const [status] = await once(child, 'close');
    assert.equal(status, 1, stderr); assert.equal(stderr, '');
    assert.equal(JSON.parse(stdout).error, 'policy.agent');
    assert.ok(!stdout.includes(env.PAPERCLIP_API_KEY));
    const imported = spawnSync(process.execPath, [...flags, '--input-type=module', '-e', 'await import(process.argv[1]); process.stdout.write("imported\\n");', pathToFileURL(entry).href], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000 });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, 'imported\n'); assert.equal(imported.stderr, '');
  }
  // Keep relative dependencies valid when Node preserves imported symlinks.
  const entry = `${script}.${basename(dir)}.mjs`;
  symlinkSync(script, entry); t.after(() => rmSync(entry));
  for (const flags of [[], ['--preserve-symlinks'], ['--preserve-symlinks-main'], ['--preserve-symlinks', '--preserve-symlinks-main']]) {
    const imported = spawnSync(process.execPath, [...flags, '--input-type=module', '-e', 'const { pathToFileURL } = await import("node:url"); await import(pathToFileURL(process.argv[1])); process.stdout.write("imported\\n");', entry], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000 });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, 'imported\n'); assert.equal(imported.stderr, '');
    const preloaded = spawnSync(process.execPath, [...flags, '--import', pathToFileURL(entry).href, '--input-type=module', '-e', 'process.stdout.write("preloaded\\n");', entry], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10000 });
    assert.equal(preloaded.status, 0, preloaded.stderr);
    assert.equal(preloaded.stdout, 'preloaded\n'); assert.equal(preloaded.stderr, '');
  }
  assert.equal(requests, 2);
});

test('REST client CLI bounds stalled stdin with a nonzero input failure', async t => {
  const script = fileURLToPath(new URL('../dist/plugins/github-broker/src/client.js', import.meta.url));
  const child = spawn(process.execPath, [script, projectId, 'github.pr_get'], { env: { PATH: process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
  t.after(() => { child.stdin.destroy(); child.kill(); });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const [status] = await once(child, 'close');
  assert.equal(status, 1, stderr); assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), { ok: false, error: 'client.input' });
});

test('REST client CLI emits nonzero sanitized failures for invalid or oversized stdin', () => {
  const script = fileURLToPath(new URL('../dist/plugins/github-broker/src/client.js', import.meta.url));
  for (const input of ['not-json', 'x'.repeat(16385), new Uint8Array([255]), JSON.stringify(args)]) {
    const result = spawnSync(process.execPath, [script, projectId, 'github.pr_get'], { input: Buffer.from(input), encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH } });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal(result.stderr, '');
  }
});
