import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, pull, token, key, refused } from './helpers.mjs';
import { Broker, tools } from '../dist/plugins/github-broker/src/broker.js';
import { mintScope, withInstallationToken, request } from '../dist/packages/github/src/index.js';
import manifest from '../dist/plugins/github-broker/src/manifest.js';

globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };
let hostModuleId = 0;
function isolatedHost() { return import(`../dist/plugins/github-broker/src/plugin.js?host-capacity=${++hostModuleId}`); }
const paged = { page: 1, perPage: 10 };
const cases = [
  ['github.repo_read', { mode: 'file', ref: 'main', path: 'README.md' }, { contents: 'read' }, [['/contents/README.md?ref=main', { type: 'file', encoding: 'base64', name: 'README.md', path: 'README.md', sha: 'a'.repeat(40), size: 5, content: Buffer.from('hello').toString('base64') }]]],
  ['github.repo_read', { mode: 'tree', ref: 'main' }, { contents: 'read' }, [['/git/trees/main', { sha: 'a'.repeat(40), truncated: false, tree: [{ path: 'README.md', type: 'blob', sha: 'b'.repeat(40) }] }]]],
  ['github.repo_read', { mode: 'ref', ref: 'heads/main' }, { contents: 'read' }, [['/git/ref/heads/main', { ref: 'refs/heads/main', object: { type: 'commit', sha: 'a'.repeat(40) } }]]],
  ['github.repo_read', { mode: 'compare', base: 'main', head: 'topic' }, { contents: 'read' }, [['/compare/main...topic?per_page=100&page=1', { status: 'ahead', ahead_by: 1, behind_by: 0, total_commits: 1, commits: [{ sha: 'a'.repeat(40) }], files: [] }]]],
  ['github.pr_list', { state: 'open', ...paged }, { pull_requests: 'read' }, [['/pulls?state=open&per_page=10&page=1', [pull]]]],
  ['github.pr_get', { number: 1 }, { pull_requests: 'read' }, [['/pulls/1', pull]]],
  ['github.pr_files', { number: 1, ...paged }, { pull_requests: 'read' }, [['/pulls/1/files?per_page=10&page=1', [{ sha: 'a'.repeat(40), filename: 'file.ts', status: 'modified', patch: '+safe' }]]]],
  ['github.checks_get', { sha: 'a'.repeat(40), ...paged }, { checks: 'read', statuses: 'read', actions: 'read' }, [
    [`/commits/${'a'.repeat(40)}/check-runs?per_page=10&page=1`, { total_count: 1, check_runs: [{ id: 1, name: 'CI', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success' }] }],
    [`/commits/${'a'.repeat(40)}/statuses?per_page=10&page=1`, []],
    [`/actions/runs?head_sha=${'a'.repeat(40)}&per_page=10&page=1`, { total_count: 0, workflow_runs: [] }],
  ]],
  ['github.rulesets_get', paged, { metadata: 'read' }, [['/rulesets?includes_parents=true&per_page=10&page=1', [{ id: 1, name: 'protected', enforcement: 'active' }]]]],
  ['github.actions_runs_list', paged, { actions: 'read' }, [['/actions/runs?per_page=10&page=1', { total_count: 0, workflow_runs: [] }]]],
  ['github.issue_read', { number: 1 }, { issues: 'read' }, [['/issues/1', { id: 1, number: 1, title: 'Synthetic', body: 'Data only', state: 'open' }]]],
];
for (const [name, args, permissions, reads] of cases) test(`registered ${name} ${args.mode ?? ''}: scoped mint, bounded read, revoke and audit`, async () => {
  const f = fixture(); f.mint(permissions); f.identity(); for (const [path, body] of reads) f.read(path, body); f.revoke();
  const result = await f.call(name, { ...base, ...args });
  assert.equal(result.error, undefined); assert.equal(result.data.ok, true); assert.equal(result.data.pages.length, reads.length);
  const expected = {
    'github.repo_read:file': { name: 'README.md', path: 'README.md', sha: 'a'.repeat(40), size: 5, content: 'hello', encoding: 'utf-8' },
    'github.repo_read:tree': { sha: 'a'.repeat(40), truncated: false, tree: [{ path: 'README.md', type: 'blob', sha: 'b'.repeat(40) }] },
    'github.repo_read:ref': { ref: 'refs/heads/main', object: { type: 'commit', sha: 'a'.repeat(40) } },
    'github.repo_read:compare': { status: 'ahead', ahead_by: 1, behind_by: 0, total_commits: 1, commits: [{ sha: 'a'.repeat(40) }], files: [], filesTruncated: false },
    'github.pr_list:': [pull], 'github.pr_get:': pull,
    'github.pr_files:': [{ sha: 'a'.repeat(40), filename: 'file.ts', status: 'modified', patch: '+safe' }],
    'github.checks_get:': { total_count: 1, checksComplete: true, checkRuns: [{ id: 1, name: 'CI', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success', app: null, current: true, producerTrusted: false, passing: false }] },
    'github.rulesets_get:': [{ id: 1, name: 'protected', enforcement: 'active' }],
    'github.actions_runs_list:': { total_count: 0, workflowRuns: [] },
    'github.issue_read:': { id: 1, number: 1, title: 'Synthetic', body: 'Data only', state: 'open' },
  };
  assert.deepEqual(result.data.pages[0], expected[`${name}:${args.mode ?? ''}`]);
  if (name === 'github.checks_get') {
    assert.deepEqual(result.data.pages[1], { sha: 'a'.repeat(40), statuses: [] });
    assert.deepEqual(result.data.pages[2], { total_count: 0, workflowRuns: [] });
  }
  assert.equal(f.secretCalls, 1); assert.equal(f.events.length, 2); assert.equal(f.events[0].phase, 'intent'); assert.equal(f.events[1].phase, 'outcome'); assert.equal(f.events[1].outcome, 'success');
  assert.equal(f.events[0].event, f.events[1].event); assert.equal(f.events[1].agentId, run.agentId); assert.equal(f.events[1].runId, run.runId); assert.equal(f.events[1].policyHash.length, 64); assert.ok(f.events[1].requestIds.length > 0);
  f.hygiene(result); f.done();
});

test('exact tool inventory and unchanged host capability surface', () => {
  assert.equal(tools.length, 12); assert.equal(tools.filter(t => !t.write).length, 8); assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  assert.deepEqual([...manifest.capabilities].sort(), ['agent.tools.register', 'issues.read', 'projects.read', 'project.workspaces.read', 'http.outbound', 'secrets.read-ref', 'activity.log.write'].sort());
});

test('every tool declares the app lane and every enabled profile refuses the owner lane', async () => {
  for (const tool of tools) assert.equal(tool.identityLane, 'app');
  for (const profile of ['builder', 'lead', 'reviewer-read', 'release', 'coordinator-read']) {
    const f = fixture(); Object.assign(f.config.policy.agents[0], { profile, identityLane: 'owner' });
    refused(f, await f.call('github.pr_get', { ...base, number: 1 }), 'identity.owner_disabled');
  }
  for (const identityLane of [undefined, 'arbitrary', null]) {
    const f = fixture(); f.config.policy.agents[0].identityLane = identityLane;
    refused(f, await f.call('github.pr_get', { ...base, number: 1 }), 'validation.schema');
  }
});

test('mint hard guard rejects missing, broad and malformed scopes before signing or HTTP', async () => {
  for (const scope of [undefined, null, {}, { permissions: { contents: 'read' } }, { repository_ids: [101] }, { repository_ids: [], permissions: {} },
    { repository_ids: [101, 102], permissions: { contents: 'read' } }, { repository_ids: [101], permissions: {} },
    { repository_ids: [101], permissions: { contents: 'write' } }, { repository_ids: [101], permissions: { workflows: 'read' } },
    { repository_ids: [101], permissions: { administration: 'read' } }, { repository_ids: [101], permissions: { statuses: 'write' } },
    { repository_ids: [101], permissions: { checks: 'write' } }, { repository_ids: [101], permissions: { actions: 'write' } },
    { repository_ids: [101], permissions: { workflows: 'write' } }, { repository_ids: [101], permissions: { contents: 'read' }, extra: true }]) {
    assert.throws(() => mintScope(scope)); let calls = 0;
    await assert.rejects(withInstallationToken({ scope, transport: async () => { calls++; throw Error('must not call'); }, privateKey: 'invalid', appId: 42, installationId: 99, now: Date.now(), observe() {} }, async () => {}));
    assert.equal(calls, 0);
  }
});

test('unknown tool and prototype dispatch have no secret or outbound access', async () => {
  for (const name of ['constructor', '__proto__', 'toString', 'github.graphql', 'github.pr_merge', 'github.http', 'github.actions_rerun', 'github.review_approve', 'github.status_create', 'github.check_run_create', 'github.workflow_write', 'github.pr_update']) {
    const events = [];
    const result = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, name, base, run);
    assert.equal(result.isError, true); assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool'); assert.equal(events.length, 1);
  }
});

for (const [label, change, rule] of [
  ['cross-repo', f => {}, 'policy.repository'],
  ['profile none', f => { f.config.policy.agents[0].profile = 'none'; }, 'policy.profile'],
  ['unknown agent', f => { f.config.policy.agents[0].agentId = 'another-agent'; }, 'policy.profile'],
  ['wrong company', f => { f.config.policy.companyId = 'another-company'; }, 'policy.company'],
  ['wrong project', f => { f.issue.projectId = 'another-project'; }, 'identity.issue_project'],
  ['wrong assignee', f => { f.issue.assigneeAgentId = 'another-agent'; }, 'identity.issue_assignee'],
  ['another run', f => { f.issue.checkoutRunId = 'another-run'; f.issue.executionRunId = 'another-run'; }, 'identity.issue_run'],
  ['closed issue', f => { f.issue.status = 'done'; }, 'identity.issue_status'],
  ['wrong workspace', f => { f.issue.projectWorkspaceId = 'another-workspace'; }, 'identity.issue_workspace'],
  ['wrong origin', f => { f.workspace.repoUrl = 'https://github.com/another-org/sandbox'; }, 'identity.workspace_repository'],
]) test(`refuses ${label} before secret resolution`, async () => {
  const f = fixture(); change(f);
  refused(f, await f.call('github.pr_get', { ...base, repoId: label === 'cross-repo' ? 102 : 101, number: 1 }), rule);
});

test('spoofed issue ID and identity arguments fail closed', async () => {
  const f = fixture(); refused(f, await f.call('github.pr_get', { ...base, issueId: 'foreign-issue', number: 1 }), 'identity.issue_project');
  for (const key of ['agentId', 'runId', 'companyId', 'projectId', 'identityLane', 'token', 'secretRef', 'url', 'headers', 'approved', 'command', 'query']) {
    const g = fixture(); refused(g, await g.call('github.pr_get', { ...base, number: 1, [key]: 'spoof' }), 'validation.schema');
  }
});

test('closed schemas reject malformed shapes and numerical, Unicode and path boundaries', async () => {
  for (const args of [null, [], 1, 'x', {}, { ...base, number: 0 }, { ...base, number: 1.5 }, { ...base, number: '1' }, { ...base, number: Infinity },
    { ...base, number: 1, constructor: 'x' }, { ...base, number: 1, nested: { token } }, { ...base, number: 1, issueId: '‮unsafe' }, { ...base, number: 1, issueId: 'a'.repeat(81) }]) {
    const f = fixture(); refused(f, await f.call('github.pr_get', args), 'validation.schema');
  }
  for (const path of ['../secret', './file', 'a/../b', '/file', 'file%2Fsecret', 'a\\b', 'a\nfile']) {
    const f = fixture(); const r = await f.call('github.repo_read', { ...base, mode: 'file', path, ref: 'main' });
    assert.ok(r.error); assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0);
  }
  for (const page of [0, 101, -1, 1.5, NaN]) {
    const f = fixture(); refused(f, await f.call('github.pr_list', { ...base, state: 'open', page, perPage: 10 }), 'validation.schema');
  }
});

test('missing or failed secret fails closed with real native error', async () => {
  for (const secret of ['', Error(key + token)]) {
    const f = fixture(); f.secret = secret;
    const result = await f.call('github.pr_get', { ...base, number: 1 });
    assert.equal(result.error, 'secret.unavailable'); assert.equal(f.calls.length, 0); f.hygiene(result);
  }
});

test('malformed policy, duplicate bindings and unconfigured plugin fail closed', async () => {
  for (const mutate of [f => { f.config = {}; }, f => { f.config.policy.version = 2; }, f => { f.config.policy.agents.push(f.config.policy.agents[0]); },
    f => { f.config.privateKeySecretRef = 'legacy'; }, f => { f.config.policy.repositories[0].extra = true; }]) {
    const f = fixture(); mutate(f); const result = await f.call('github.pr_get', { ...base, number: 1 });
    assert.ok(result.error); assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result);
  }
});

test('mint verifies returned repository, permissions and expiry, always revoking a valid token', async () => {
  for (const change of [{ repositories: [{ id: 102 }] }, { permissions: { contents: 'write' } }, { permissions: { pull_requests: 'read', workflows: 'write' } },
    { expires_at: 'not-a-date' }, { expires_at: new Date(Date.now() + 7200000).toISOString() }, { expires_at: new Date(0).toISOString() }]) {
    const f = fixture(); f.mint({ pull_requests: 'read' }, change); f.revoke();
    const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.ok(result.error.startsWith('mint.')); assert.equal(f.calls.length, 2); f.hygiene(result); f.done();
  }
});

test('repository rename or transfer cannot turn the broker into a cross-repo deputy', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(102); f.revoke();
  const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.equal(result.error, 'policy.repository_identity'); f.done();
});

test('secret and JWT reflection is scrubbed from projected success and omitted error bodies', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity();
    f.read('/pulls/1', pull, { effect: () => {
      // Set the next response immediately before JSON serialization below by
      // mutating the same fixture object held by the queued step.
    } });
    const step = f.steps.at(-1);
    step.effect = () => { step.body = { ...pull, title: token, body: `${key}\n${f.jwt}`, unknown: { credential: key } }; };
    if (failure) { step.status = 500; step.body = { message: key + token }; }
    f.revoke(); const result = await f.call('github.pr_get', { ...base, number: 1 });
    assert.equal(!!result.error, failure); f.hygiene(result); f.done();
  }
});

test('base64 file reflection is decoded before redaction', async () => {
  const f = fixture(); f.mint({ contents: 'read' }); f.identity();
  const content = key + token;
  f.read('/contents/file.txt?ref=main', { type: 'file', encoding: 'base64', size: Buffer.byteLength(content), content: Buffer.from(content).toString('base64'), sha: 'a'.repeat(40), name: 'file.txt' }); f.revoke();
  const result = await f.call('github.repo_read', { ...base, mode: 'file', path: 'file.txt', ref: 'main' });
  assert.equal(result.error, undefined); assert.ok(result.content.includes('[REDACTED]')); f.hygiene(result); f.done();
});

test('reflected errors, malformed bodies and redirects never escape or follow', async () => {
  for (const step of [{ status: 302, headers: { location: 'https://evil.invalid/' } }, { raw: '{bad-json' }, { body: { title: {} } }, { error: Error(key + token) }, { raw: 'x'.repeat(1048577) }]) {
    const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull, step); f.revoke();
    const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.ok(result.error); f.hygiene(result); f.done();
  }
});

test('policy revocation or assignment drift between mint and read prevents the read', async () => {
  for (const mutate of [f => { f.config.policy.revision++; }, f => { f.issue.assigneeAgentId = 'another-agent'; }, f => { f.config.policy.agents[0].identityLane = 'owner'; }]) {
    const f = fixture(); f.mint({ pull_requests: 'read' }); f.steps[0].effect = () => mutate(f); f.revoke();
    const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.ok(result.error); assert.equal(f.calls.length, 2); f.done();
  }
});

test('a recovered audit sink records refused when the allow intent was not acknowledged', async () => {
  const f = fixture(); let attempts = 0;
  f.ctx.activity.log = async entry => { if (++attempts === 1) throw Error(token); f.events.push(entry.metadata); };
  const result = await f.call('github.pr_get', { ...base, number: 1 });
  assert.equal(result.error, 'audit.unavailable'); assert.equal(attempts, 2);
  assert.equal(f.events.length, 1); assert.equal(f.events[0].phase, 'refused'); assert.equal(f.events[0].decision, 'deny');
  assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result);
});

test('credential hygiene detects Error message and stack log arguments', () => {
  const f = fixture(); f.logs.push({ args: [Error(token)] });
  assert.throws(() => f.hygiene({}), /Credential escaped/);
  f.logs = [{ args: [Object.assign(Error('safe'), { stack: token })] }];
  assert.throws(() => f.hygiene({}), /Credential escaped/);
  f.logs = [{ args: [Error('safe')] }]; f.hygiene({});
});

test('every repository read checks its scoped bearer even with a custom inspector', () => {
  const f = fixture(); let inspected = 0;
  f.read('/pulls/1', pull, { inspect: () => { inspected++; } });
  const step = f.steps.shift();
  assert.throws(() => step.inspect({ headers: {} })); assert.equal(inspected, 0);
  step.inspect({ headers: { Authorization: `Bearer ${token}` } }); assert.equal(inspected, 1); f.done();
});

test('ref mode rejects unqualified or malformed refs before resolving credentials', async () => {
  for (const ref of ['main', 'heads/', 'heads//main', 'heads/../main', 'heads/x.lock', 'heads/.']) {
    const f = fixture(); const result = await f.call('github.repo_read', { ...base, mode: 'ref', ref });
    assert.ok(result.error); assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result);
  }
  const f = fixture(); f.mint({ contents: 'read' }); f.identity();
  f.read('/git/ref/tags/v1.0', { ref: 'refs/tags/v1.0', object: { type: 'commit', sha: 'a'.repeat(40) } }); f.revoke();
  assert.equal((await f.call('github.repo_read', { ...base, mode: 'ref', ref: 'tags/v1.0' })).error, undefined); f.done();
});

test('healthy parallel native calls queue without stealing active IPC capacity', async () => {
  const { hostCall } = await import('../dist/plugins/github-broker/src/plugin.js');
  const release = []; let started, active = 0, peak = 0;
  const entered = new Promise(resolve => { started = resolve; });
  const calls = Array.from({ length: 4 }, () => hostCall(async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => { release.push(resolve); if (release.length === 4) started(); });
    active--; return 'ok';
  }, 1000));
  await entered;
  calls.push(hostCall(async () => { peak = Math.max(peak, ++active); active--; return 'ok'; }, 1000));
  const results = Promise.allSettled(calls);
  try { assert.equal(release.length, 4); } finally { for (const resolve of release) resolve(); }
  assert.deepEqual(await results, Array.from({ length: 5 }, () => ({ status: 'fulfilled', value: 'ok' })));
  assert.equal(peak, 4);
});

test('audit outage prevents mint and never reports unqualified success', async () => {
  const f = fixture(); f.failAudit = true; const result = await f.call('github.pr_get', { ...base, number: 1 });
  assert.equal(result.error, 'audit.unavailable'); assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result);
});

test('short cache avoids mint but still rechecks authoritative assignment', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke();
  const args = { ...base, number: 1 }; assert.equal((await f.call('github.pr_get', args)).error, undefined);
  assert.equal((await f.call('github.pr_get', args)).error, undefined); assert.equal(f.calls.length, 4);
  f.issue.assigneeAgentId = 'another-agent'; assert.equal((await f.call('github.pr_get', args)).error, 'identity.issue_assignee'); assert.equal(f.calls.length, 4); f.done();
});

test('Retry-After blocks installation calls without sleeping or retrying', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', { message: token }, { status: 429, headers: { 'retry-after': '120' } }); f.revoke();
  const first = await f.call('github.pr_get', { ...base, number: 1 }); assert.equal(first.error, 'rate.github'); assert.equal(first.data.retryAfterSeconds, 120);
  const calls = f.calls.length; const second = await f.call('github.pr_get', { ...base, number: 2 }); assert.equal(second.error, 'rate.retry_after'); assert.equal(f.calls.length, calls); f.done();
});

test('ruleset details expose supported enforcement rules without bypass actors', async () => {
  const f = fixture(); f.mint({ metadata: 'read' }); f.identity();
  f.read('/rulesets/1', { id: 1, name: 'main', enforcement: 'active', bypass_actors: [{ secret: token }], rules: [{ type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: 'CI', integration_id: 1 }] } }] }); f.revoke();
  const result = await f.call('github.rulesets_get', { ...base, rulesetId: 1 });
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].rules[0].parametersComplete, true); assert.equal(result.data.pages[0].bypassActorsIncluded, false); f.hygiene(result); f.done();
});

test('coordinator profile refuses source content and patches before secrets', async () => {
  for (const [name, args] of [['github.repo_read', { mode: 'file', path: 'file.txt', ref: 'main' }], ['github.pr_files', { number: 1, ...paged }]]) {
    const f = fixture(); f.config.policy.agents[0].profile = 'coordinator-read'; refused(f, await f.call(name, { ...base, ...args }), 'policy.profile');
  }
});

test('per-agent attempt bucket denies the 31st call even when using fresh cache', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke();
  for (let i = 0; i < 30; i++) assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).error, undefined);
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).error, 'rate.bucket'); assert.equal(f.calls.length, 4); f.done();
});

test('expired fresh cache never sends conditionals and unsolicited 304 fails closed', async t => {
  const f = fixture(); let now = Date.now(); t.mock.method(Date, 'now', () => now);
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull, { headers: { etag: '"synthetic-etag"' } }); f.revoke();
  const args = { ...base, number: 1 }; assert.equal((await f.call('github.pr_get', args)).error, undefined); now += 11000;
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', null, { status: 304, inspect: req => assert.equal(req.headers['If-None-Match'], undefined) }); f.revoke();
  const result = await f.call('github.pr_get', args); assert.equal(result.error, 'upstream.read'); assert.equal(f.secretCalls, 2);
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', { ...pull, title: 'new' }); f.revoke();
  assert.equal((await f.call('github.pr_get', args)).data.pages[0].title, 'new');
  for (const req of f.calls) assert.ok(Object.keys(req.headers).every(k => !k.toLowerCase().startsWith('if-')));
  f.hygiene(result); f.done();
});

test('post-read audit outage and revoke failure are errors, never cached success', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke({ effect: () => { f.failAudit = true; } });
  const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.equal(result.error, 'audit.unavailable'); f.hygiene(result); f.done();
  const g = fixture(); g.mint({ pull_requests: 'read' }); g.identity(); g.read('/pulls/1', pull); g.revoke({ status: 500, body: { message: key + token } });
  assert.equal((await g.call('github.pr_get', { ...base, number: 1 })).error, 'mint.revoke_failed');
  assert.equal((await g.call('github.pr_get', { ...base, number: 1 })).error, 'rate.retry_after'); assert.equal(g.calls.length, 4); g.done();
});

test('checks merge producer-qualified checks and latest statuses without trusting aggregate success', async () => {
  const f = fixture(); f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity();
  const sha = 'a'.repeat(40);
  const check = { head_sha: sha, status: 'completed', conclusion: 'success' };
  f.read(`/commits/${sha}/check-runs?per_page=10&page=1`, { total_count: 7, check_runs: [
    { ...check, id: 1, name: 'ci-ok', app: { id: 15368, slug: 'github-actions' } },
    { ...check, id: 2, name: 'gitleaks', app: { id: 999, slug: 'github-actions' } },
    { ...check, id: 3, name: 'pr-lint' },
    { ...check, id: 4, name: 'CodeQL', app: { id: 57789, slug: 'github-advanced-security' } },
    { ...check, id: 5, name: 'Devin Review', app: { id: 811515 } },
    { ...check, id: 6, name: 'e2e-ok', head_sha: 'b'.repeat(40), app: { id: 15368 } },
    { ...check, id: 7, name: 'CodeQL', app: { id: 15368, slug: 'github-actions' } },
  ] });
  f.read(`/commits/${sha}/statuses?per_page=10&page=1`, [
    { id: 10, context: 'Devin Review', state: 'success', creator: { login: 'devin-ai-integration[bot]', type: 'Bot' } },
    { id: 9, context: 'Devin Review', state: 'failure', creator: { login: 'devin-ai-integration[bot]', type: 'Bot' } },
    { id: 8, context: 'ci-ok', state: 'success', creator: { login: 'github-actions[bot]', type: 'Bot' } },
    { id: 7, context: 'gitleaks', state: 'success', creator: { login: 'attacker', type: 'User' } },
  ]);
  f.read(`/actions/runs?head_sha=${sha}&per_page=10&page=1`, { total_count: 0, workflow_runs: [] }); f.revoke();
  const result = await f.call('github.checks_get', { ...base, sha, ...paged });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.data.signals.map(s => [s.source, s.context, s.passing]), [
    ['check', 'ci-ok', true], ['check', 'gitleaks', false], ['check', 'pr-lint', false], ['check', 'CodeQL', false],
    ['check', 'Devin Review', true], ['check', 'e2e-ok', false], ['check', 'CodeQL', false], ['status', 'Devin Review', true],
    ['status', 'Devin Review', false], ['status', 'ci-ok', false], ['status', 'gitleaks', false],
  ]);
  assert.equal(result.data.pages[1].statuses[1].current, false); f.hygiene(result); f.done();
});

test('queued suites with no runs give no signal and historical status pages cannot pass', async () => {
  for (const page of [1, 2]) {
    const f = fixture(); f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity(); const sha = 'a'.repeat(40);
    f.read(`/commits/${sha}/check-runs?per_page=10&page=${page}`, { total_count: 0, check_runs: [], check_suites: [{ status: 'queued' }] });
    f.read(`/commits/${sha}/statuses?per_page=10&page=${page}`, page === 1 ? [] : [{ id: 1, context: 'Devin Review', state: 'success', creator: { login: 'devin-ai-integration[bot]', type: 'Bot' } }]);
    f.read(`/actions/runs?head_sha=${sha}&per_page=10&page=${page}`, { total_count: 0, workflow_runs: [] }); f.revoke();
    const result = await f.call('github.checks_get', { ...base, sha, page, perPage: 10 });
    assert.equal(result.error, undefined); assert.ok(result.data.signals.every(s => !s.passing));
    if (page === 1) assert.deepEqual(result.data.signals, []); f.done();
  }
});

test('latest untrusted or failed status cannot be rescued by an older trusted success', async () => {
  for (const latest of [{ state: 'failure', creator: { login: 'devin-ai-integration[bot]', type: 'Bot' } }, { state: 'success', creator: { login: 'attacker', type: 'User' } }, { state: 'success' }]) {
    const f = fixture(); f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity(); const sha = 'a'.repeat(40);
    f.read(`/commits/${sha}/check-runs?per_page=10&page=1`, { total_count: 0, check_runs: [] });
    f.read(`/commits/${sha}/statuses?per_page=10&page=1`, [{ id: 2, context: 'Devin Review', ...latest }, { id: 1, context: 'Devin Review', state: 'success', creator: { login: 'devin-ai-integration[bot]', type: 'Bot' } }]);
    f.read(`/actions/runs?head_sha=${sha}&per_page=10&page=1`, { total_count: 0, workflow_runs: [] }); f.revoke();
    const result = await f.call('github.checks_get', { ...base, sha, ...paged });
    assert.equal(result.error, undefined); assert.ok(result.data.signals.every(s => !s.passing)); f.hygiene(result); f.done();
  }
});

test('ambiguous or incomplete check-run collections never report an obsolete success as passing', async () => {
  const sha = 'a'.repeat(40), check = { id: 1, name: 'ci-ok', head_sha: sha, status: 'completed', conclusion: 'success', app: { id: 15368 } };
  for (const newer of [{ id: 2, conclusion: 'failure' }, { id: 2, status: 'queued', conclusion: null }, { id: 2, app: { id: 999 } }, { id: 2 }]) {
    for (const reversed of [false, true]) {
      const f = fixture(); f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity();
      const checks = [check, { ...check, ...newer }];
      f.read(`/commits/${sha}/check-runs?per_page=10&page=1`, { total_count: 2, check_runs: reversed ? checks.reverse() : checks });
      f.read(`/commits/${sha}/statuses?per_page=10&page=1`, []);
      f.read(`/actions/runs?head_sha=${sha}&per_page=10&page=1`, { total_count: 0, workflow_runs: [] }); f.revoke();
      const result = await f.call('github.checks_get', { ...base, sha, ...paged });
      assert.equal(result.error, undefined); assert.ok(result.data.signals.every(s => s.current === false && s.passing === false)); f.hygiene(result); f.done();
    }
  }
});

for (const [page, total_count] of [[1, 2], [2, 1], [1, undefined], [1, null], [1, '1']]) test(`incomplete checks page=${page} total_count=${total_count} remain non-passing and revoke successfully`, async () => {
  const sha = 'a'.repeat(40), check = { id: 1, name: 'ci-ok', head_sha: sha, status: 'completed', conclusion: 'success', app: { id: 15368 } };
  const f = fixture(); f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity();
  f.read(`/commits/${sha}/check-runs?per_page=10&page=${page}`, { total_count, check_runs: [check] });
  f.read(`/commits/${sha}/statuses?per_page=10&page=${page}`, []);
  f.read(`/actions/runs?head_sha=${sha}&per_page=10&page=${page}`, { total_count: 0, workflow_runs: [] }); f.revoke();
  const result = await f.call('github.checks_get', { ...base, sha, page, perPage: 10 });
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].checksComplete, false);
  assert.equal(result.data.signals[0].passing, false); assert.equal(result.data.signals[0].current, false);
  assert.equal(f.calls.length, 6); assert.equal(f.calls.at(-1).method, 'DELETE');
  assert.equal(f.calls.at(-1).url, 'https://api.github.com/installation/token'); f.hygiene(result); f.done();
});

test('unique complete first-page checks retain producer-qualified success', async () => {
  const f = fixture(), sha = 'a'.repeat(40); f.mint({ checks: 'read', statuses: 'read', actions: 'read' }); f.identity();
  f.read(`/commits/${sha}/check-runs?per_page=10&page=1`, { total_count: 3, check_runs: [
    { id: 1, name: 'ci-ok', app: { id: 15368 } }, { id: 2, name: 'CodeQL', app: { id: 57789 } }, { id: 3, name: 'Devin Review', app: { id: 811515 } },
  ].map(c => ({ ...c, head_sha: sha, status: 'completed', conclusion: 'success' })) });
  f.read(`/commits/${sha}/statuses?per_page=10&page=1`, []);
  f.read(`/actions/runs?head_sha=${sha}&per_page=10&page=1`, { total_count: 0, workflow_runs: [] }); f.revoke();
  const result = await f.call('github.checks_get', { ...base, sha, ...paged });
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].checksComplete, true);
  assert.ok(result.data.signals.every(s => s.current && s.producerTrusted && s.passing)); f.hygiene(result); f.done();
});

test('native IPC waiters are bounded and expired waiters never start an operation', async () => {
  const { hostCall } = await import('../dist/plugins/github-broker/src/plugin.js');
  const release = []; let entered, starts = 0;
  const ready = new Promise(resolve => { entered = resolve; });
  const active = Array.from({ length: 4 }, () => hostCall(async () => {
    starts++; return new Promise(resolve => { release.push(resolve); if (release.length === 4) entered(); });
  }, 1000));
  await ready;
  try {
    await assert.rejects(hostCall(async () => { starts++; }, 5), /host.timeout/);
    assert.equal(starts, 4);
    const waiting = Array.from({ length: 4 }, () => hostCall(async () => { starts++; return 'queued'; }, 1000));
    await assert.rejects(hostCall(async () => { starts++; }, 1000), /host.capacity/);
    for (const resolve of release) resolve('active');
    assert.deepEqual(await Promise.all(waiting), Array(4).fill('queued'));
    assert.deepEqual(await Promise.all(active), Array(4).fill('active'));
    assert.equal(starts, 8);
  } finally { for (const resolve of release) resolve('active'); await Promise.allSettled(active); }
  assert.equal(await hostCall(async () => 'recovered', 100), 'recovered');
});

test('healthy parallel registered calls preserve successful reads and audits', async () => {
  const { createHostCaller } = await isolatedHost();
  const hostCall = createHostCaller();
  const release = []; let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const fixtures = Array.from({ length: 5 }, () => fixture({ hostCall }));
  for (const [i, f] of fixtures.entries()) {
    f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke();
    const get = f.ctx.config.get; let first = true;
    f.ctx.config.get = async (...args) => {
      if (first && i < 4) { first = false; await new Promise(resolve => { release.push(resolve); if (release.length === 4) entered(); }); }
      return get(...args);
    };
  }
  const calls = fixtures.slice(0, 4).map(f => f.call('github.pr_get', { ...base, number: 1 })); await ready;
  calls.push(fixtures[4].call('github.pr_get', { ...base, number: 1 }));
  for (const resolve of release) resolve();
  const results = await Promise.all(calls);
  for (const [i, result] of results.entries()) {
    assert.equal(result.error, undefined); assert.equal(fixtures[i].events.at(-1).outcome, 'success');
    fixtures[i].hygiene(result); fixtures[i].done();
  }
});

test('mint, read, revoke and response bodies share the worker-wide native IPC budget', async () => {
  const { createHostCaller } = await isolatedHost();
  const hostCall = createHostCaller();
  for (const phase of ['mint', 'read', 'revoke', 'probe', 'body']) {
    let entered, release, blocked = 0, probeStarts = 0;
    const ready = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
    const fixtures = Array.from({ length: 4 }, () => fixture({ hostCall }));
    for (const f of fixtures) {
      f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull);
      f.revoke(phase === 'probe' ? { error: new TypeError('Response constructor: Invalid response status code 204') } : {});
      if (phase === 'probe') f.steps.push({ method: 'GET', path: '/installation/repositories?per_page=1', status: 401, body: { message: 'Bad credentials' }, inspect: req => assert.equal(req.headers.Authorization, `Bearer ${token}`) });
      const fetch = f.ctx.http.fetch;
      f.ctx.http.fetch = async (url, init) => {
        const response = await fetch(url, init);
        const block = async () => { if (++blocked === 4) entered(); await pending; };
        if (phase === 'body' && url.endsWith('/pulls/1')) {
          const text = response.text.bind(response);
          response.text = async () => { await block(); return text(); };
        } else if ((phase === 'mint' && init.method === 'POST') || (phase === 'read' && url.endsWith('/pulls/1')) || (phase === 'revoke' && init.method === 'DELETE') || (phase === 'probe' && url.endsWith('/installation/repositories?per_page=1'))) await block();
        return response;
      };
    }
    const calls = fixtures.map(f => f.call('github.pr_get', { ...base, number: 1 }));
    try {
      await ready;
      await assert.rejects(hostCall(async () => { probeStarts++; }, 5), /host.timeout/);
      assert.equal(probeStarts, 0, phase);
    } finally { release(); await Promise.allSettled(calls); }
    for (const [i, result] of (await Promise.all(calls)).entries()) {
      assert.equal(result.error, undefined, phase); assert.equal(fixtures[i].events.at(-1).outcome, 'success');
      fixtures[i].hygiene(result); fixtures[i].done();
    }
    assert.equal(await hostCall(async () => 'recovered', 100), 'recovered');
  }
});

test('IPC-refused revocation pauses minting even when saturation also prevents outcome audit', async () => {
  const { createHostCaller } = await isolatedHost();
  const hostCall = createHostCaller();
  const f = fixture({ hostCall }), retained = []; let release, queuedStarts = 0;
  const pending = new Promise(resolve => { release = resolve; });
  f.mint({ pull_requests: 'read' }); f.identity();
  f.read('/pulls/1', pull, { effect: async () => {
    const active = Array.from({ length: 3 }, () => hostCall(() => pending, 5));
    retained.push(...active, hostCall(() => { queuedStarts++; return pending; }, 1000));
    await Promise.allSettled(active);
  } });
  let result;
  try {
    result = await f.call('github.pr_get', { ...base, number: 1 });
    assert.equal(result.error, 'audit.unavailable'); assert.equal(queuedStarts, 1);
    assert.equal(f.calls.length, 3); assert.ok(f.calls.every(c => c.method !== 'DELETE'));
  } finally { release(); await Promise.allSettled(retained); }
  const next = await f.call('github.pr_get', { ...base, number: 2 });
  assert.equal(next.error, 'rate.retry_after'); assert.ok(next.data.retryAfterSeconds >= 3659);
  assert.equal(f.secretCalls, 1); assert.equal(f.calls.length, 3); f.hygiene(result); f.hygiene(next); f.done();
});

test('timed-out native IPC retains all four slots until known successful fulfillment', async () => {
  const { hostCall } = await isolatedHost();
  const settle = [], native = []; let starts = 0;
  try {
    const calls = Array.from({ length: 4 }, () => {
      const pending = new Promise(resolve => { settle.push(resolve); });
      native.push(pending); return hostCall(() => { starts++; return pending; }, 10);
    });
    const results = await Promise.allSettled(calls);
    assert.ok(results.every(r => r.status === 'rejected' && r.reason.rule === 'host.timeout'));
    for (let i = 0; i < 8; i++) await assert.rejects(hostCall(async () => { starts++; }, 1), /host.capacity/);
    assert.equal(starts, 4);
  } finally {
    for (const release of settle) release('late secret');
    await Promise.allSettled(native);
  }
  assert.equal(await hostCall(async () => 'recovered', 100), 'recovered');
});

for (const late of [false, true]) test(`${late ? 'late' : 'immediate'} unknown native rejection quarantines the same four slots permanently`, async () => {
  const { hostCall } = await isolatedHost();
  const rejectNative = []; let starts = 0, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const calls = Array.from({ length: 4 }, () => hostCall(() => {
    starts++;
    return new Promise((resolve, reject) => { rejectNative.push(reject); if (rejectNative.length === 4) entered(); });
  }, late ? 10 : 1000));
  const results = Promise.allSettled(calls);
  await ready;
  if (late) assert.ok((await results).every(r => r.status === 'rejected' && r.reason.rule === 'host.timeout'));
  for (const reject of rejectNative) reject(Error('native completion is unknown'));
  if (!late) assert.ok((await results).every(r => r.status === 'rejected' && /native completion is unknown/.test(r.reason.message)));
  // Let the late rejection handlers run; rejection is not proof of host completion.
  await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 8; i++) await assert.rejects(hostCall(async () => { starts++; }, 5), /host.capacity/);
  assert.equal(starts, 4);
});

test('explicitly known-settled native rejection releases capacity without manufacturing success', async () => {
  const { hostCall } = await isolatedHost();
  for (let round = 0; round < 3; round++) {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => hostCall(async markSettled => {
      markSettled(); throw new TypeError('known completed host response');
    }, 100)));
    assert.ok(results.every(r => r.status === 'rejected' && r.reason.message === 'known completed host response'));
  }
  assert.equal(await hostCall(async () => 'recovered', 100), 'recovered');
});

test('absolute monotonic deadlines stop dispatch and wall-clock jumps do not expire native calls', async t => {
  const { hostCall } = await isolatedHost();
  let starts = 0;
  await assert.rejects(hostCall(async () => { starts++; }, 1000, performance.now() - 1), /host.timeout/);
  assert.equal(starts, 0);
  let wall = Date.now(); t.mock.method(Date, 'now', () => wall);
  const deadline = performance.now() + 1000;
  assert.equal(await hostCall(async () => { wall += 86400000; return 'forward'; }, 1000, deadline), 'forward');
  assert.equal(await hostCall(async () => { wall -= 172800000; return 'backward'; }, 1000, deadline), 'backward');
});

test('absolute deadline includes time spent waiting for native capacity and never starts expired work', async () => {
  const { hostCall } = await isolatedHost();
  const release = []; let entered, starts = 0;
  const ready = new Promise(resolve => { entered = resolve; });
  const active = Array.from({ length: 4 }, () => hostCall(() => new Promise(resolve => {
    release.push(resolve); if (release.length === 4) entered();
  }), 1000));
  const activeResults = Promise.allSettled(active);
  await ready;
  try {
    await assert.rejects(hostCall(async () => { starts++; }, 1000, performance.now() + 10), /host.timeout/);
  } finally { for (const resolve of release) resolve('ok'); await activeResults; }
  assert.equal(starts, 0);
  assert.equal(await hostCall(async () => 'recovered', 100), 'recovered');
});

test('board policy supports all advertised repositories and agents without widening tool JSON bounds', async () => {
  const { parseConfig } = await import('../dist/plugins/github-broker/src/policy.js');
  const f = fixture();
  f.config.policy.repositories = Array.from({ length: 32 }, (_, i) => ({ id: 101 + i, owner: 'synthetic-org', name: `repo-${i}`, projectId: run.projectId, workspaceId: `workspace-${i}` }));
  f.config.policy.agents = Array.from({ length: 32 }, (_, i) => ({ agentId: `agent-${i}`, profile: 'builder', identityLane: 'app', repositoryIds: f.config.policy.repositories.map(r => r.id) }));
  const parsed = parseConfig(f.config); assert.equal(parsed.policy.agents.length, 32); assert.equal(parsed.policy.repositories.length, 32);
  for (const target of [f.config, f.config.policy, f.config.policy.repositories, f.config.policy.agents]) {
    Object.defineProperty(target, 'hidden', { value: true, configurable: true });
    assert.throws(() => parseConfig(f.config)); delete target.hidden;
  }
  const agent = f.config.policy.agents[0];
  Object.defineProperty(f.config.policy.agents, '0', { enumerable: true, configurable: true, get() { assert.fail('array getter invoked'); } });
  assert.throws(() => parseConfig(f.config), /policy.array/);
  Object.defineProperty(f.config.policy.agents, '0', { value: agent, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(f.config, 'policy', { enumerable: true, configurable: true, get() { assert.fail('config getter invoked'); } });
  assert.throws(() => parseConfig(f.config), /policy.object/);
});

test('large trees and compare files return explicitly truncated bounded evidence', async () => {
  for (const mode of ['tree', 'compare']) {
    const f = fixture(); f.mint({ contents: 'read' }); f.identity();
    const entries = Array.from({ length: 150 }, (_, i) => ({ path: `file-${i}`, filename: `file-${i}`, sha: 'a'.repeat(40), type: 'blob', status: 'modified' }));
    f.read(mode === 'tree' ? '/git/trees/main' : '/compare/main...topic?per_page=100&page=1', mode === 'tree'
      ? { sha: 'a'.repeat(40), truncated: false, tree: entries }
      : { status: 'ahead', total_commits: 1, commits: [{ sha: 'a'.repeat(40) }], files: entries }); f.revoke();
    const result = await f.call('github.repo_read', { ...base, mode, ...(mode === 'tree' ? { ref: 'main' } : { base: 'main', head: 'topic' }) });
    assert.equal(result.error, undefined); const page = result.data.pages[0];
    assert.equal((page.tree ?? page.files).length, 100); assert.equal(mode === 'tree' ? page.truncated : page.filesTruncated, true); f.done();
  }
});

test('recoverable rejected token shapes are revoked before reporting failure', async () => {
  const f = fixture(), malformed = 'x'.repeat(1025); f.mint({ pull_requests: 'read' }, { token: malformed });
  f.revoke({ inspect: req => assert.equal(req.headers.Authorization, `Bearer ${malformed}`) });
  const result = await f.call('github.pr_get', { ...base, number: 1 });
  assert.equal(result.error, 'mint.response'); assert.ok(!result.content.includes(malformed)); f.hygiene(result); f.done();
});

test('policy drift during awaited host authorization prevents repository access', async () => {
  const f = fixture(), get = f.ctx.issues.get;
  f.ctx.issues.get = async (...args) => { const issue = await get(...args); if (f.issueReads === 3) f.config.policy.revision++; return issue; };
  f.mint({ pull_requests: 'read' }); f.revoke();
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).error, 'policy.changed'); f.done();
});

test('ETags are ignored and expired cache always fetches the new 200 representation', async t => {
  for (const expired of [false, true]) {
    const f = fixture(); let now = Date.now(); t.mock.method(Date, 'now', () => now);
    const args = { ...base, number: 1 };
    f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull, { headers: { etag: '"old"' } }); f.revoke();
    assert.equal((await f.call('github.pr_get', args)).error, undefined); now += expired ? 61000 : 11000;
    f.mint({ pull_requests: 'read' }); f.identity();
    f.read('/pulls/1', { ...pull, title: 'new' }, { inspect: req => assert.equal(req.headers['If-None-Match'], undefined) }); f.revoke();
    assert.equal((await f.call('github.pr_get', args)).data.pages[0].title, 'new'); now += 11000;
    f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull, { inspect: req => assert.equal(req.headers['If-None-Match'], undefined) }); f.revoke();
    assert.equal((await f.call('github.pr_get', args)).error, undefined); f.done(); t.mock.restoreAll();
  }
});

test('refused calls do not flush authorized cached data', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke();
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).error, undefined);
  assert.ok((await f.call('github.pr_get', { ...base, number: 1, agentId: 'spoof' })).error);
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).error, undefined);
  assert.equal(f.calls.length, 4); f.done();
});

test('an older in-flight response cannot overwrite a later successful cached read', async () => {
  const f = fixture(); let release, entered;
  const pending = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', { ...pull, title: 'older' }, { effect: async () => { entered(); await pending; } });
  const first = f.call('github.pr_get', { ...base, number: 1 }); await started;
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', { ...pull, title: 'newer' }); f.revoke();
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).data.pages[0].title, 'newer');
  f.revoke(); release(); assert.equal((await first).data.pages[0].title, 'older');
  assert.equal((await f.call('github.pr_get', { ...base, number: 1 })).data.pages[0].title, 'newer'); f.done();
});

test('provider backoff only grows and installation budgets are shared across companies', () => {
  const broker = new Broker();
  broker.pause('42:99', 120, 1000); assert.equal(broker.pause('42:99', 1, 2000), 119);
  assert.equal(broker.installations.get('42:99').blockedUntil, 121000);
  assert.throws(() => broker.reserve(broker.installations, '42:99', 1, 4000, 3600000, 3000), /rate.retry_after/);
  broker.reserve(broker.installations, '42:100', 1, 4000, 3600000, 3000);
  assert.equal(broker.installations.size, 2);
});

test('host call deadlines reject stalled IPC and ignore late results', async () => {
  const { hostCall } = await import('../dist/plugins/github-broker/src/plugin.js'); let resolve;
  const pending = new Promise(r => { resolve = r; });
  await assert.rejects(hostCall(() => pending, 1), /host.timeout/); resolve('late');
  assert.equal(await hostCall(async () => 'ok', 100), 'ok');
});

test('ruleset completeness includes nested required-context fields', async () => {
  const f = fixture(); f.mint({ metadata: 'read' }); f.identity();
  f.read('/rulesets/1', { id: 1, name: 'main', rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-ok', integration_id: 15368, unsupported: true }] } }] }); f.revoke();
  const result = await f.call('github.rulesets_get', { ...base, rulesetId: 1 });
  assert.equal(result.error, undefined); assert.equal(result.data.pages[0].rules[0].parametersComplete, false); f.done();
});

test('published ref and path patterns match outbound rejection boundaries', async () => {
  const { refJson, qualifiedRefJson, qualifiedRef, pathJson, segment, filePath } = await import('../dist/plugins/github-broker/src/schema.js');
  for (const [schema, parse, values] of [[qualifiedRefJson, value => qualifiedRef.parse(value), ['main', 'heads/main', 'tags/v1.0', 'heads/', 'heads//x', 'heads/.', 'heads/x.lock']], [refJson, segment, ['main', 'a', 'heads/topic', 'a.b', 'a..b', 'a//b', 'a/.', 'x.lock', 'x.lock/y', 'main/', '../a']], [pathJson, filePath, ['README.md', 'dir/file.txt', '../a', 'a/../b', 'a/./b', 'a//b', 'a\\b', '/file']]]) {
    for (const value of values) { let accepted = true; try { parse(value); } catch { accepted = false; } assert.equal(new RegExp(schema.pattern).test(value), accepted, value); }
  }
});

test('gateway-published tool schemas all retain a root object type', () => {
  const f = fixture();
  for (const tool of manifest.tools) {
    assert.equal(tool.parametersSchema.type, 'object');
    assert.deepEqual(f.handlers.get(tool.name).metadata.parametersSchema, tool.parametersSchema);
  }
});

test('a revoke failure retains the provider delay in audit and cannot shorten its pause', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity();
  f.read('/pulls/1', {}, { status: 429, headers: { 'retry-after': '12000' } }); f.revoke({ status: 500 });
  const result = await f.call('github.pr_get', { ...base, number: 1 });
  assert.equal(result.error, 'mint.revoke_failed');
  assert.deepEqual(f.events.at(-1).providerFailure, { rule: 'rate.github', retryAfterSeconds: 12000 });
  const next = await f.call('github.pr_get', { ...base, number: 2 });
  assert.equal(next.error, 'rate.retry_after'); assert.ok(next.data.retryAfterSeconds >= 11999); f.hygiene(result); f.done();
});

test('transport refuses other origins and malformed destinations before outbound', async () => {
  let calls = 0; const transport = async () => { calls++; throw Error('no'); };
  for (const path of ['//evil.invalid/', 'https://evil.invalid/', '/\\evil.invalid/', '/a\r\nb']) await assert.rejects(request(transport, 'GET', path, token));
  assert.equal(calls, 0);
});
