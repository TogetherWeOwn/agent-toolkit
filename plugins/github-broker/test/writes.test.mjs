import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, token, refused } from './helpers.mjs';
import { Broker, tools } from '../dist/plugins/github-broker/src/broker.js';
import { mintScope, withInstallationToken } from '../dist/packages/github/src/index.js';
import { parseConfig } from '../dist/plugins/github-broker/src/policy.js';

const parent = 'a'.repeat(40), baseSha = 'b'.repeat(40), tree = 'c'.repeat(40), blob = 'd'.repeat(40), commit = 'e'.repeat(40);
const branch = 'agent/builder-one/change', encoded = encodeURIComponent(branch);
const commentArgs = { ...base, number: 1, body: 'A scoped comment' };
const createArgs = { ...base, head: branch, base: 'main', title: 'feat: synthetic change', body: 'Synthetic PR description' };
const commitArgs = { ...base, branch, expectedParent: parent, message: 'feat: synthetic change', files: [{ path: 'src/example.ts', contentBase64: Buffer.from('hello\n').toString('base64') }] };
const cases = [
  ['github.pr_create', createArgs, { contents: 'read', pull_requests: 'write' }],
  ['github.pr_comment', commentArgs, { pull_requests: 'write' }],
  ['github.issue_comment', commentArgs, { issues: 'write' }],
  ['github.commit_files', commitArgs, { contents: 'write' }],
];
function writer() {
  const f = fixture(); f.config.appId = 5646907; f.config.policy.agents[0].branchSlug = 'builder-one';
  f.repository = () => f.read('', { id: 101, default_branch: 'main', private: false });
  f.branch = (sha = parent, overrides = {}, name = branch) => f.read(`/branches/${encodeURIComponent(name)}`, { name, protected: false, commit: { sha }, ...overrides });
  f.write = (method, path, body, inspect, overrides = {}) => f.steps.push({ method, path: '/repos/synthetic-org/sandbox' + path, status: method === 'POST' ? 201 : 200, body, inspect(req) { assert.equal(req.headers.Authorization, `Bearer ${token}`); inspect?.(JSON.parse(req.body)); }, ...overrides });
  return f;
}
function commentSteps(f, name) {
  f.read(name === 'github.pr_comment' ? '/pulls/1' : '/issues/1', { id: 1, number: 1 });
  f.write('POST', '/issues/1/comments', { id: 7, html_url: 'https://github.com/synthetic-org/sandbox/issues/1#issuecomment-7' }, body => assert.deepEqual(body, { body: commentArgs.body }));
}
function diffSteps(f, files = [{ filename: 'src/example.ts', status: 'modified' }]) {
  f.branch(); f.branch(baseSha, {}, 'main');
  f.read(`/compare/${baseSha}...${parent}?per_page=100&page=1`, { status: 'ahead', behind_by: 0, total_commits: 1, files });
}
function prSteps(f) {
  diffSteps(f); f.branch(); f.branch(baseSha, {}, 'main');
  f.write('POST', '/pulls', { id: 7, number: 1, draft: true, state: 'open' }, body => assert.deepEqual(body, { head: branch, base: 'main', title: createArgs.title, body: createArgs.body, draft: true }));
}
function commitSteps(f, recheck = parent) {
  f.branch(); f.read(`/git/commits/${parent}`, { sha: parent, tree: { sha: tree } });
  f.write('POST', '/git/blobs', { sha: blob }, body => assert.deepEqual(body, { content: commitArgs.files[0].contentBase64, encoding: 'base64' }));
  f.write('POST', '/git/trees', { sha: tree }, body => assert.deepEqual(body, { base_tree: tree, tree: [{ path: 'src/example.ts', mode: '100644', type: 'blob', sha: blob }] }));
  f.write('POST', '/git/commits', { sha: commit }, body => {
    assert.deepEqual(body, { message: commitArgs.message, tree, parents: [parent] });
    for (const key of ['author', 'committer', 'signature']) assert.equal(Object.hasOwn(body, key), false);
  });
  f.branch(recheck);
  if (recheck === parent) f.write('PATCH', `/git/refs/heads/${encoded}`, { ref: `refs/heads/${branch}`, object: { sha: commit } }, body => assert.deepEqual(body, { sha: commit, force: false }));
}
for (const [name, args, permissions] of cases) test(`${name}: actual registered App-only write, minimum scope, cleanup and audit`, async () => {
  const f = writer(); f.mint(permissions); f.repository();
  if (name === 'github.pr_create') prSteps(f);
  else if (name === 'github.commit_files') commitSteps(f);
  else commentSteps(f, name);
  f.revoke(); const result = await f.call(name, args);
  assert.equal(result.error, undefined); assert.equal(result.data.ok, true); assert.equal(result.data.pages.length, 1);
  assert.equal(f.secretCalls, 1); assert.equal(f.events.length, 2); assert.equal(f.events[0].outcome, 'pending');
  assert.equal(f.events[1].outcome, 'success'); assert.equal(f.events[1].writeAttempted, true); assert.equal(f.events[1].revocation.outcome, 'revoked');
  if (name === 'github.commit_files') assert.deepEqual(result.data.pages[0], { sha: commit, branch, parent });
  f.hygiene(result); f.done();
});

for (const [name, args] of cases) test(`${name}: every non-Builder profile and owner identity is refused pre-secret`, async () => {
  for (const profile of ['lead', 'reviewer-read', 'release', 'coordinator-read', 'none']) {
    const f = writer(); f.config.policy.agents[0].profile = profile;
    refused(f, await f.call(name, args), 'policy.profile');
  }
  const f = writer(); f.config.policy.agents[0].identityLane = 'owner';
  refused(f, await f.call(name, args), 'identity.owner_disabled');
  for (const identity of ['identityLane', 'ownerToken', 'token', 'author', 'committer', 'signature', 'approved', 'force', 'url', 'headers', 'event']) {
    const g = writer(); refused(g, await g.call(name, { ...args, [identity]: identity === 'event' ? 'APPROVE' : 'owner' }), 'validation.schema');
  }
});

for (const [name, args] of cases) test(`${name}: narrow App, repository, workspace and live principal required before mint`, async () => {
  for (const appId of [42, 4685085]) {
    const f = writer(); f.config.appId = appId; refused(f, await f.call(name, args), 'identity.write_app');
  }
  const crossRepo = writer(); refused(crossRepo, await crossRepo.call(name, { ...args, repoId: 102 }), 'policy.repository');
  const crossWorkspace = writer(); refused(crossWorkspace, await crossWorkspace.call(name, { ...args, workspaceId: 'other' }), 'policy.workspace');
  const otherAgent = writer(); otherAgent.issue.assigneeAgentId = 'other'; refused(otherAgent, await otherAgent.call(name, args), 'identity.issue_assignee');
  const otherRun = writer(); otherRun.issue.checkoutRunId = 'other'; otherRun.issue.executionRunId = 'other'; refused(otherRun, await otherRun.call(name, args), 'identity.issue_run');
});

for (const [name, args, field] of [['github.pr_create', createArgs, 'head'], ['github.commit_files', commitArgs, 'branch']]) test(`${name}: only the configured agent branch namespace`, async () => {
  for (const value of ['main', 'agent/builder-two/change', 'agent/builder-one-evil/change', 'agent/builder-one', 'refs/heads/agent/builder-one/change']) {
    const f = writer(); refused(f, await f.call(name, { ...args, [field]: value }), 'policy.branch');
  }
  const f = writer(); delete f.config.policy.agents[0].branchSlug; refused(f, await f.call(name, args), 'policy.branch');
  for (const value of ['agent/builder-one/../main', 'agent/builder-one/a.lock', 'agent/builder-one/a//b', 'agent/builder-one/a/', 'agent/builder-one/.']) {
    const g = writer(), result = await g.call(name, { ...args, [field]: value });
    assert.ok(result.error); assert.equal(g.secretCalls, 0); assert.equal(g.calls.length, 0);
  }
});

test('branch slug is optional for existing reads, validated, unique and policy-hashed', () => {
  const f = fixture(); assert.equal(parseConfig(f.config).policy.agents[0].branchSlug, undefined);
  f.config.policy.agents[0].branchSlug = 'builder-one'; assert.equal(parseConfig(f.config).policy.agents[0].branchSlug, 'builder-one');
  f.config.policy.agents.push({ ...f.config.policy.agents[0], agentId: 'other' }); assert.throws(() => parseConfig(f.config), /duplicate_branch_slug/);
  f.config.policy.agents.pop(); f.config.policy.agents[0].branchSlug = '../other'; assert.throws(() => parseConfig(f.config));
});

test('all approval, owner edit/merge/push, Actions/Checks/Statuses and generic write names are absent, even with policy requests', async () => {
  const forbidden = ['github.pr_review', 'github.review_submit', 'github.review_approve', 'github.pr_approve', 'github.pr_update', 'github.pr_edit', 'github.pr_merge', 'github.push', 'github.actions_rerun', 'github.actions_cancel', 'github.check_run_create', 'github.check_run_update', 'github.status_create', 'github.statuses_create', 'github.workflow_write', 'github.http', 'github.graphql'];
  for (const name of forbidden) for (const context of ['ci-ok', 'gitleaks', 'pr-lint', 'e2e-ok', 'Devin Review']) {
    let secrets = 0, calls = 0; const events = [];
    const result = await new Broker().execute({ config: async () => ({ policy: { operations: [name] } }), secret: async () => { secrets++; }, http: async () => { calls++; }, audit: async e => events.push(e), clock: Date.now }, name, { ...base, event: 'APPROVE', identityLane: 'owner', context }, run);
    assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool'); assert.equal(secrets, 0); assert.equal(calls, 0); assert.equal(events.length, 1);
  }
  assert.deepEqual(tools.filter(t => t.write).map(t => t.name), cases.map(c => c[0]));
});

test('write mint scope still hard-denies workflows and Actions/Checks/Statuses writes before signing/network', async () => {
  for (const permission of ['workflows', 'actions', 'checks', 'statuses', 'administration', 'secrets', 'environments']) {
    const scope = { repository_ids: [101], permissions: { [permission]: 'write' } };
    assert.throws(() => mintScope(scope, true)); let calls = 0;
    await assert.rejects(withInstallationToken({ write: true, appId: 5646907, installationId: 99, scope, privateKey: 'invalid', transport: async () => { calls++; }, now: Date.now(), observe() {} }, async () => {}));
    assert.equal(calls, 0);
  }
  for (const permission of ['contents', 'pull_requests', 'issues']) assert.equal(mintScope({ repository_ids: [101], permissions: { [permission]: 'write' } }, true).permissions[permission], 'write');
  let calls = 0;
  await assert.rejects(withInstallationToken({ write: true, appId: 4685085, installationId: 99, scope: { repository_ids: [101], permissions: { contents: 'write' } }, privateKey: 'invalid', transport: async () => { calls++; }, now: Date.now(), observe() {} }, async () => {}), /mint.write_app/);
  assert.equal(calls, 0);
});

test('commit_files refuses workflow, review-instruction, traversal and malformed/capped content pre-secret', async () => {
  for (const path of ['.github/workflows/ci.yml', '.github/workflows/nested/ci.yml', '.GITHUB/WORKFLOWS/ci.yml', 'AGENTS.md', 'nested/CLAUDE.md', '.devin/config.json', 'nested/REVIEW.md', '../x', 'a/../x', '.git/config', 'a\\b']) {
    const f = writer(), result = await f.call('github.commit_files', { ...commitArgs, files: [{ ...commitArgs.files[0], path }] });
    assert.ok(result.error); assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0); f.hygiene(result);
  }
  for (const files of [[], Array(17).fill(commitArgs.files[0]), [commitArgs.files[0], commitArgs.files[0]], [{ path: 'x', contentBase64: 'bad===' }], [{ path: 'x', contentBase64: 'Zh==' }], [{ path: 'x', contentBase64: 'a'.repeat(4097) }], Array.from({ length: 3 }, (_, i) => ({ path: `file${i}`, contentBase64: 'a'.repeat(4096) }))]) {
    const f = writer(), result = await f.call('github.commit_files', { ...commitArgs, files });
    assert.ok(result.error); assert.equal(f.secretCalls, 0); assert.equal(f.calls.length, 0);
  }
  for (const expectedParent of [undefined, '', 'main', 'a'.repeat(39), 'A'.repeat(40)]) {
    const f = writer(); refused(f, await f.call('github.commit_files', { ...commitArgs, expectedParent }), 'validation.schema');
  }
});

test('pr_create denies workflow and review-instruction changes, including previous names and ambiguous truncated diffs', async () => {
  const diffs = ['.github/workflows/ci.yml', 'AGENTS.md', 'nested/CLAUDE.md', 'REVIEW.md', '.devin/review.md', 'nested/.devin/config.json'].flatMap(filename => [[{ filename, status: 'modified' }], [{ filename: 'safe.txt', previous_filename: filename, status: 'renamed' }]]);
  diffs.push(Array.from({ length: 300 }, (_, i) => ({ filename: `file${i}`, status: 'modified' })), [], [{ filename: 'safe', status: 'renamed' }]);
  for (const files of diffs) {
    const f = writer(); f.mint(cases[0][2]); f.repository(); diffSteps(f, files); f.revoke();
    const result = await f.call('github.pr_create', createArgs); assert.ok(result.error); assert.ok(!f.calls.some(c => c.url.endsWith('/pulls') && c.method === 'POST')); f.hygiene(result); f.done();
  }
});

test('branch default/protected/missing protection evidence and stale expected parent never reach Git Data writes', async () => {
  for (const overrides of [{ protected: true }, { protected: undefined }, { name: 'other' }, { commit: { sha: commit } }]) {
    const f = writer(); f.mint({ contents: 'write' }); f.repository(); f.branch(parent, overrides); f.revoke();
    const result = await f.call('github.commit_files', commitArgs); assert.ok(result.error); assert.ok(!f.calls.some(c => c.url.includes('/git/'))); f.done();
  }
  const f = writer(); f.mint({ contents: 'write' }); f.read('', { id: 101, default_branch: branch }); f.revoke();
  assert.equal((await f.call('github.commit_files', commitArgs)).error, 'write.default_branch'); f.done();
});

test('parent recheck and non-force update stop lost writes; rejected update is never retried', async () => {
  const f = writer(); f.mint({ contents: 'write' }); f.repository(); commitSteps(f, commit); f.revoke();
  const stale = await f.call('github.commit_files', commitArgs); assert.equal(stale.error, 'write.parent_changed'); assert.equal(stale.data.writeAttempted, true); assert.equal(stale.data.retrySafe, false); assert.ok(!f.calls.some(c => c.method === 'PATCH')); f.done();
  const g = writer(); g.mint({ contents: 'write' }); g.repository(); commitSteps(g);
  Object.assign(g.steps.at(-1), { status: 422, body: { message: token } }); g.revoke();
  const rejected = await g.call('github.commit_files', commitArgs); assert.equal(rejected.error, 'upstream.write'); assert.equal(g.calls.filter(c => c.method === 'PATCH').length, 1); g.hygiene(rejected); g.done();
});

test('pr_create refuses branch/base drift after immutable diff inspection', async () => {
  for (const changedHead of [true, false]) {
    const f = writer(); f.mint(cases[0][2]); f.repository(); diffSteps(f); f.branch(changedHead ? commit : parent);
    if (!changedHead) f.branch(commit, {}, 'main'); f.revoke();
    assert.equal((await f.call('github.pr_create', createArgs)).error, changedHead ? 'write.head_changed' : 'write.base_changed'); f.done();
  }
});

test('comments refuse bot commands and issue_comment cannot become a PR lane', async () => {
  for (const name of ['github.pr_comment', 'github.issue_comment', 'github.pr_create']) for (const body of ['/devin review', 'please /Devin  review now', '@dependabot rebase', '@coderabbitai review', '@devin-ai-integration review']) {
    const f = writer(); refused(f, await f.call(name, { ...(name === 'github.pr_create' ? createArgs : commentArgs), body }), 'write.bot_command');
  }
  const f = writer(); f.mint({ issues: 'write' }); f.repository(); f.read('/issues/1', { number: 1, pull_request: { url: 'untrusted' } }); f.revoke();
  assert.equal((await f.call('github.issue_comment', commentArgs)).error, 'write.comment_target'); f.done();
});

test('policy/assignment changes before each mutation stop the sequence and still clean up', async () => {
  for (const drift of ['policy', 'assignment']) {
    const f = writer(); f.mint({ contents: 'write' }); f.repository(); f.branch();
    f.read(`/git/commits/${parent}`, { sha: parent, tree: { sha: tree } }, { effect: () => { if (drift === 'policy') f.config.policy.revision++; else f.issue.assigneeAgentId = 'other'; } }); f.revoke();
    const result = await f.call('github.commit_files', commitArgs); assert.equal(result.error, drift === 'policy' ? 'policy.changed' : 'identity.issue_assignee'); assert.ok(!f.calls.some(c => c.url.endsWith('/git/blobs'))); f.done();
  }
});

test('write paths reserve worst-case N+4 before secrets and cannot reuse cached reads', async () => {
  for (const [name, args, permissions] of cases) {
    const f = writer(), broker = new Broker(); let secrets = 0;
    const host = { config: async () => f.config, issue: async () => f.issue, workspace: async () => f.workspace, secret: async () => { secrets++; throw Error('not reached'); }, audit: async () => {}, clock: Date.now };
    const max = tools.find(t => t.name === name).write.maxRequests(args) + 4;
    broker.reserve(broker.installations, '5646907:99', 4000 - max + 1, 4000, 3600000, Date.now());
    const result = await broker.execute(host, name, args, run); assert.equal(JSON.parse(result.content[0].text).rule, 'rate.bucket'); assert.equal(secrets, 0);
  }
  const f = writer();
  for (let i = 0; i < 2; i++) { f.mint({ issues: 'write' }); f.repository(); commentSteps(f, 'github.issue_comment'); f.revoke(); }
  assert.equal((await f.call('github.issue_comment', commentArgs)).error, undefined); assert.equal((await f.call('github.issue_comment', commentArgs)).error, undefined);
  assert.equal(f.secretCalls, 2); assert.equal(f.calls.filter(c => c.url.endsWith('/comments')).length, 2); f.done();
});

test('cleanup/audit/transport failure after write is failure with no safe replay or rollback claim', async () => {
  for (const kind of ['cleanup', 'audit', 'transport', 'rate']) {
    const f = writer(); f.mint({ issues: 'write' }); f.repository(); commentSteps(f, 'github.issue_comment');
    if (kind === 'transport') f.steps.at(-1).error = Error(token);
    if (kind === 'rate') Object.assign(f.steps.at(-1), { status: 429, headers: { 'retry-after': '120' } });
    f.revoke(kind === 'cleanup' ? { status: 500, body: { message: token } } : kind === 'audit' ? { effect: () => { f.failAudit = true; } } : {});
    const result = await f.call('github.issue_comment', commentArgs); assert.ok(result.error); assert.equal(result.data.writeAttempted, true); assert.equal(result.data.retrySafe, false); f.hygiene(result); f.done();
    if (kind === 'cleanup') assert.equal((await f.call('github.issue_comment', commentArgs)).error, 'rate.retry_after');
  }
});

test('same branch concurrent mutations fail closed without minting another token', async () => {
  const f = writer(); let entered, release;
  const ready = new Promise(r => { entered = r; }), pending = new Promise(r => { release = r; });
  f.mint({ contents: 'write' }); f.steps[0].effect = async () => { entered(); await pending; }; f.repository(); commitSteps(f); f.revoke();
  const first = f.call('github.commit_files', commitArgs); await ready;
  try { assert.equal((await f.call('github.commit_files', commitArgs)).error, 'write.concurrent'); assert.equal(f.secretCalls, 1); }
  finally { release(); }
  assert.equal((await first).error, undefined); f.done();
});

test('write token returned-permission escalation is rejected and revoked before repository access', async () => {
  for (const permissions of [{ contents: 'write', workflows: 'write' }, { contents: 'write', actions: 'write' }, { contents: 'write', issues: 'write' }, { contents: 'read' }]) {
    const f = writer(); f.mint({ contents: 'write' }, { permissions }); f.revoke();
    assert.equal((await f.call('github.commit_files', commitArgs)).error, 'mint.returned_permissions'); assert.equal(f.calls.length, 2); f.done();
  }
});
