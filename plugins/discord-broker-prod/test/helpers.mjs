import assert from 'node:assert/strict';
import { register } from '../dist/plugins/discord-broker-prod/src/plugin.js';

export const token = 'MTUzOTcxNjgzODk4MTEODTE1NA.DISTINCT_PROD_SYNTHETIC_BOT_CANARY_987654321';
export const guildId = '326474832151838730';
export const botUserId = '1539711683898118154';
export const channelId = '326474832151838731';
export const messageId = '326474832151838732';
export const run = { agentId: 'agent-one', runId: 'run-one', companyId: 'company-one', projectId: 'project-one' };
export const base = { issueId: 'issue-one', workspaceId: 'workspace-one' };
export function config(kind = 'prod') {
  return { environment: kind, guildId, botUserId, botTokenSecretRef: { type: 'secret_ref', secretId: 'secret-prod' }, policy: {
    version: 1, revision: 1, companyId: run.companyId,
    readChannelIds: [channelId], writeChannelIds: [channelId],
    agents: [{ agentId: run.agentId, profile: 'builder' }, { agentId: 'researcher-one', profile: 'researcher-read', allowProjectless: true }],
  } };
}
export function fixture(options = {}) {
  const f = { config: config(options.kind ?? 'prod'), calls: [], events: [], logs: [], secretCalls: 0, steps: [], now: Date.now(), secret: token, failAudit: false, kv: new Map(), issueReads: 0, workspaceReads: 0 };
  f.issue = { companyId: run.companyId, projectId: run.projectId, assigneeAgentId: run.agentId, projectWorkspaceId: base.workspaceId, checkoutRunId: run.runId, executionRunId: run.runId, status: 'in_progress' };
  f.workspace = { id: base.workspaceId, repoUrl: 'https://github.com/synthetic-org/sandbox' };
  f.handlers = new Map();
  f.ctx = {
    config: { get: async companyId => { assert.equal(companyId, run.companyId); return f.config; } },
    issues: { get: async (issueId, companyId) => { f.issueReads++; assert.equal(companyId, run.companyId); if (issueId !== base.issueId) return null; f.issue.assigneeAgentId = options.issueAssignee ?? f.issue.assigneeAgentId; return f.issue; } },
    projects: { listWorkspaces: async (projectId, companyId) => { f.workspaceReads++; assert.equal(projectId, run.projectId); return [f.workspace]; } },
    secrets: { resolve: async (ref, scope) => { f.secretCalls++; assert.deepEqual({ ...ref }, f.config.botTokenSecretRef); assert.deepEqual(scope, { companyId: run.companyId, configPath: 'botTokenSecretRef' }); if (f.secret instanceof Error) throw f.secret; return f.secret; } },
    activity: { log: async entry => { if (f.failAudit) throw Error(token); f.events.push(entry.metadata); } },
    logger: Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => f.logs.push({ level, args })])),
    state: { get: async ({ stateKey }) => f.kv.get(stateKey) ?? null, set: async ({ stateKey }, v) => { f.kv.set(stateKey, v); }, delete: async ({ stateKey }) => { f.kv.delete(stateKey); } },
    http: { fetch: async (url, init) => {
      const req = { url, ...init }; f.calls.push(req);
      const step = f.steps.shift(); assert.ok(step, `Unexpected outbound ${init.method} ${url}`);
      assert.equal(init.method, step.method);
      assert.ok(url.startsWith('https://discord.com/api/v10/'), `Origin not fixed: ${url}`);
      assert.equal(init.headers.Authorization, `Bot ${token}`);
      step.inspect?.(req);
      if (step.error) throw step.error;
      const body = step.status === 204 ? null : JSON.stringify(step.body ?? {});
      return new Response(body, { status: step.status ?? 200, headers: step.headers ?? { 'x-request-id': 'req-id-123456' } });
    } },
    tools: { register: (name, metadata, handler) => { assert.ok(!f.handlers.has(name)); f.handlers.set(name, { metadata, handler }); } },
  };
  register(f.ctx, options.hostCall);
  f.call = async (name, args, context = run) => f.handlers.get(name).handler(args, context);
  f.read = (path, body, overrides = {}) => f.steps.push({ method: 'GET', path: '/api/v10' + path, body, ...overrides });
  f.post = (path, body, overrides = {}) => f.steps.push({ method: 'POST', path: '/api/v10' + path, ...overrides, inspect(req) { if (overrides.inspect) overrides.inspect(req); } });
  f.hygiene = result => {
    const visible = JSON.stringify({ result, events: f.events, logs: f.logs, kv: [...f.kv.entries()] }, (_, value) => value instanceof Error ? { ...value, name: value.name, message: value.message, stack: value.stack, cause: value.cause } : value);
    for (const secret of [token, 'secret-prod']) assert.ok(!visible.includes(secret) && !visible.includes('secret-prod'), 'Credential escaped through an observable sink');
    assert.ok(!visible.includes(token), 'Bot token escaped');
  };
  f.done = () => assert.equal(f.steps.length, 0, 'Expected outbound request was not made');
  return f;
}
export function refused(f, result, rule) {
  assert.equal(result.data.ok, false); assert.equal(result.error, rule); assert.equal(result.data.rule, rule);
  assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); assert.equal(f.events.length, 1); assert.equal(f.events[0].decision, 'deny'); f.hygiene(result);
}
