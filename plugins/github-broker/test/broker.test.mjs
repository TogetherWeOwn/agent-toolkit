import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, pull, token, key, refused } from './helpers.mjs';
import { Broker, tools } from '../../../dist/plugins/github-broker/src/broker.js';
import { mintScope, withInstallationToken, request } from '../../../dist/packages/github/src/index.js';
import manifest from '../../../dist/plugins/github-broker/src/manifest.js';

globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };
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
    [`/commits/${'a'.repeat(40)}/status?per_page=10&page=1`, { sha: 'a'.repeat(40), state: 'success', total_count: 0, statuses: [] }],
    [`/actions/runs?head_sha=${'a'.repeat(40)}&per_page=10&page=1`, { total_count: 0, workflow_runs: [] }],
  ]],
  ['github.rulesets_get', paged, { administration: 'read' }, [['/rulesets?includes_parents=true&per_page=10&page=1', [{ id: 1, name: 'protected', enforcement: 'active' }]]]],
  ['github.actions_runs_list', paged, { actions: 'read' }, [['/actions/runs?per_page=10&page=1', { total_count: 0, workflow_runs: [] }]]],
  ['github.issue_read', { number: 1 }, { issues: 'read' }, [['/issues/1', { id: 1, number: 1, title: 'Synthetic', body: 'Data only', state: 'open' }]]],
];
for (const [name, args, permissions, reads] of cases) test(`registered ${name} ${args.mode ?? ''}: scoped mint, bounded read, revoke and audit`, async () => {
  const f = fixture(); f.mint(permissions); f.identity(); for (const [path, body] of reads) f.read(path, body); f.revoke();
  const result = await f.call(name, { ...base, ...args });
  assert.equal(result.error, undefined); assert.equal(result.data.ok, true); assert.equal(result.data.pages.length, reads.length);
  assert.equal(f.secretCalls, 1); assert.equal(f.events.length, 2); assert.equal(f.events[0].phase, 'intent'); assert.equal(f.events[1].phase, 'outcome'); assert.equal(f.events[1].outcome, 'success');
  assert.equal(f.events[0].event, f.events[1].event); assert.equal(f.events[1].agentId, run.agentId); assert.equal(f.events[1].runId, run.runId); assert.equal(f.events[1].policyHash.length, 64); assert.ok(f.events[1].requestIds.length > 0);
  f.hygiene(result); f.done();
});

test('exact tool inventory and read-only capability surface', () => {
  assert.equal(tools.length, 8); assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  for (const c of manifest.capabilities) assert.ok(!/update|create|checkout|database|state.write|jobs|events/.test(c));
});

test('mint hard guard rejects missing, broad and malformed scopes before signing or HTTP', async () => {
  for (const scope of [undefined, null, {}, { permissions: { contents: 'read' } }, { repository_ids: [101] }, { repository_ids: [], permissions: {} },
    { repository_ids: [101, 102], permissions: { contents: 'read' } }, { repository_ids: [101], permissions: {} },
    { repository_ids: [101], permissions: { contents: 'write' } }, { repository_ids: [101], permissions: { workflows: 'read' } },
    { repository_ids: [101], permissions: { contents: 'read' }, extra: true }]) {
    assert.throws(() => mintScope(scope)); let calls = 0;
    await assert.rejects(withInstallationToken({ scope, transport: async () => { calls++; throw Error('must not call'); }, privateKey: 'invalid', appId: 42, installationId: 99, now: Date.now(), observe() {} }, async () => {}));
    assert.equal(calls, 0);
  }
});

test('unknown tool and prototype dispatch have no secret or outbound access', async () => {
  for (const name of ['constructor', '__proto__', 'toString', 'github.graphql', 'github.pr_merge', 'github.http', 'github.actions_rerun']) {
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
  for (const key of ['agentId', 'runId', 'companyId', 'projectId', 'token', 'secretRef', 'url', 'headers', 'approved', 'command', 'query']) {
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
  for (const mutate of [f => { f.config.policy.revision++; }, f => { f.issue.assigneeAgentId = 'another-agent'; }]) {
    const f = fixture(); f.mint({ pull_requests: 'read' }); f.steps[0].effect = () => mutate(f); f.revoke();
    const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.ok(result.error); assert.equal(f.calls.length, 2); f.done();
  }
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
  const f = fixture(); f.mint({ administration: 'read' }); f.identity();
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

test('ETag revalidation uses scrubbed data and re-mints after the short TTL', async t => {
  const f = fixture(); let now = Date.now(); t.mock.method(Date, 'now', () => now);
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull, { headers: { etag: '"synthetic-etag"' } }); f.revoke();
  const args = { ...base, number: 1 }; assert.equal((await f.call('github.pr_get', args)).error, undefined); now += 11000;
  f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', null, { status: 304, inspect: req => assert.equal(req.headers['If-None-Match'], '"synthetic-etag"') }); f.revoke();
  const result = await f.call('github.pr_get', args); assert.equal(result.error, undefined); assert.equal(f.secretCalls, 2); f.hygiene(result); f.done();
});

test('post-read audit outage and revoke failure are errors, never cached success', async () => {
  const f = fixture(); f.mint({ pull_requests: 'read' }); f.identity(); f.read('/pulls/1', pull); f.revoke({ effect: () => { f.failAudit = true; } });
  const result = await f.call('github.pr_get', { ...base, number: 1 }); assert.equal(result.error, 'audit.unavailable'); f.hygiene(result); f.done();
  const g = fixture(); g.mint({ pull_requests: 'read' }); g.identity(); g.read('/pulls/1', pull); g.revoke({ status: 500, body: { message: key + token } });
  assert.equal((await g.call('github.pr_get', { ...base, number: 1 })).error, 'mint.revoke_failed');
  assert.equal((await g.call('github.pr_get', { ...base, number: 1 })).error, 'rate.retry_after'); assert.equal(g.calls.length, 4); g.done();
});

test('transport refuses other origins and malformed destinations before outbound', async () => {
  let calls = 0; const transport = async () => { calls++; throw Error('no'); };
  for (const path of ['//evil.invalid/', 'https://evil.invalid/', '/\\evil.invalid/', '/a\r\nb']) await assert.rejects(request(transport, 'GET', path, token));
  assert.equal(calls, 0);
});
