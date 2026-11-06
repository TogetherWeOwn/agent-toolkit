import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { register } from '../../../dist/plugins/github-broker/src/plugin.js';

export const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
export const token = 'ghs_DISTINCT_SYNTHETIC_INSTALLATION_CANARY_0123456789';
export const run = { agentId: 'agent-one', runId: 'run-one', companyId: 'company-one', projectId: 'project-one' };
export const base = { issueId: 'issue-one', workspaceId: 'workspace-one', repoId: 101 };
export function config() {
  return { appId: 42, installationId: 99, privateKeySecretRef: { type: 'secret_ref', secretId: 'secret-one' }, policy: {
    version: 1, revision: 1, companyId: run.companyId,
    repositories: [{ id: 101, owner: 'synthetic-org', name: 'sandbox', projectId: run.projectId, workspaceId: base.workspaceId }],
    agents: [{ agentId: run.agentId, profile: 'builder', repositoryIds: [101] }],
  } };
}
export const pull = { id: 11, number: 1, title: 'Synthetic PR', state: 'open', body: 'Untrusted text', head: { sha: 'a'.repeat(40), ref: 'topic' }, base: { sha: 'b'.repeat(40), ref: 'main' } };
export function fixture() {
  const f = { config: config(), calls: [], events: [], logs: [], secretCalls: 0, steps: [], now: Date.now(), secret: key, failAudit: false, issueReads: 0, workspaceReads: 0 };
  f.issue = { companyId: run.companyId, projectId: run.projectId, assigneeAgentId: run.agentId, projectWorkspaceId: base.workspaceId, checkoutRunId: run.runId, executionRunId: run.runId, status: 'in_progress' };
  f.workspace = { id: base.workspaceId, repoUrl: 'https://github.com/synthetic-org/sandbox' };
  f.handlers = new Map();
  f.ctx = {
    config: { get: async companyId => { assert.equal(companyId, run.companyId); return f.config; } },
    issues: { get: async (issueId, companyId) => { f.issueReads++; assert.equal(companyId, run.companyId); return issueId === base.issueId ? f.issue : null; } },
    projects: { listWorkspaces: async (projectId, companyId) => { f.workspaceReads++; assert.equal(projectId, run.projectId); assert.equal(companyId, run.companyId); return [f.workspace]; } },
    secrets: { resolve: async (ref, scope) => { f.secretCalls++; assert.equal(Object.getPrototypeOf(ref), null); assert.deepEqual({ ...ref }, f.config.privateKeySecretRef); assert.deepEqual(scope, { companyId: run.companyId, configPath: 'privateKeySecretRef' }); if (f.secret instanceof Error) throw f.secret; return f.secret; } },
    activity: { log: async entry => { if (f.failAudit) throw Error(key + token); f.events.push(entry.metadata); } },
    logger: Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => f.logs.push({ level, args })])),
    http: { fetch: async (url, init) => {
      const req = { url, ...init }; f.calls.push(req);
      const step = f.steps.shift(); assert.ok(step, `Unexpected outbound ${init.method} ${url}`);
      assert.equal(init.method, step.method); assert.equal(url, `https://api.github.com${step.path}`);
      step.inspect?.(req);
      if (step.error) throw step.error;
      if (step.effect) await step.effect(req);
      return new Response(step.raw ?? (step.status === 204 || step.status === 304 ? null : JSON.stringify(step.body)), { status: step.status ?? 200, headers: step.headers ?? { 'x-github-request-id': 'ABCD:1234:5678:90AB' } });
    } },
    tools: { register: (name, metadata, handler) => { assert.ok(!f.handlers.has(name)); f.handlers.set(name, { metadata, handler }); } },
  };
  register(f.ctx);
  f.call = async (name, args, context = run) => f.handlers.get(name).handler(args, context);
  f.mint = (permissions, overrides = {}) => f.steps.push({ method: 'POST', path: '/app/installations/99/access_tokens', status: 201,
    body: { token, expires_at: new Date(Date.now() + 3500000).toISOString(), repositories: [{ id: 101 }], permissions: { metadata: 'read', ...permissions }, ...overrides },
    inspect(req) {
      assert.deepEqual(JSON.parse(req.body), { repository_ids: [101], permissions });
      const jwt = req.headers.Authorization.slice(7); f.jwt = jwt;
      const [h, p, s] = jwt.split('.'); const header = JSON.parse(Buffer.from(h, 'base64url')); const payload = JSON.parse(Buffer.from(p, 'base64url'));
      assert.deepEqual(header, { alg: 'RS256', typ: 'JWT' }); assert.equal(payload.iss, '42'); assert.equal(payload.exp - payload.iat, 600);
      assert.ok(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey(key), Buffer.from(s, 'base64url')));
    },
  });
  f.identity = (id = 101) => f.steps.push({ method: 'GET', path: '/repos/synthetic-org/sandbox', body: { id }, inspect: req => assert.equal(req.headers.Authorization, `Bearer ${token}`) });
  f.read = (path, body, overrides = {}) => f.steps.push({ method: 'GET', path: '/repos/synthetic-org/sandbox' + path, body, ...overrides });
  f.revoke = (overrides = {}) => f.steps.push({ method: 'DELETE', path: '/installation/token', status: 204, inspect: req => assert.equal(req.headers.Authorization, `Bearer ${token}`), ...overrides });
  f.hygiene = result => {
    const visible = JSON.stringify({ result, events: f.events, logs: f.logs });
    for (const secret of [key, ...key.split('\n').filter(x => x.length >= 16), token, f.jwt].filter(Boolean)) assert.ok(!visible.includes(secret), 'Credential escaped through an observable sink');
  };
  f.done = () => assert.equal(f.steps.length, 0, 'Expected outbound request was not made');
  return f;
}
export function refused(f, result, rule) {
  assert.equal(result.data.ok, false); assert.equal(result.error, rule); assert.equal(result.data.rule, rule);
  assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); assert.equal(f.events.length, 1); assert.equal(f.events[0].decision, 'deny'); f.hygiene(result);
}
