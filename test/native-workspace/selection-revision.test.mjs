import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, lstat, realpath, rm, readdir, access } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connect } from 'node:net';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const home = process.env.HOME;
const root = process.env.FIXTURE_ROOT;
const reportPath = join(root, 'assertions.json');
const report = { scope: 'actual native service; not HTTP, admission, inheritance or session coverage',
  stage: 'preflight', executed: 0, passed: 0, failed: 0, skipped: 0, assertions: [], cleanup: false };
const pins = {
  'dist/services/execution-workspaces.js': '95c4db45ddfbb67dc8593425e308daff6508e05469d694ac902c4b6b61faaed9',
  'dist/services/heartbeat/workspace-preparation.test.js': 'ae99636b0598117366fe045a3ca4cebb070ec267564394407f34c673bacdf08e',
  'dist/__tests__/helpers/embedded-postgres.js': '90968878cfb08b938956dcb48bb564aab9c28a24ae13137e4c0ebb181fe5fb0d',
};
const check = (name, value) => {
  report.assertions.push({ name, passed: Boolean(value) });
  assert.ok(value, name);
};
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
});
async function ownedHome() {
  check('allocated fixture root', resolve(home) === join(resolve(root), 'home') &&
    dirname(resolve(root)) === '/tmp' && root.startsWith('/tmp/native-workspace-'));
  for (const dir of [root, home]) {
    const stat = await lstat(dir);
    check('private owned nonsymlink directory', stat.isDirectory() && !stat.isSymbolicLink() &&
      stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && await realpath(dir) === dir);
  }
}
async function closed(port) {
  return new Promise(resolveClosed => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolveClosed(false); });
    socket.once('timeout', () => { socket.destroy(); resolveClosed(false); });
    socket.once('error', error => resolveClosed(error.code === 'ECONNREFUSED'));
  });
}
async function networkFence(port) {
  assert.equal(typeof process.send, 'function', 'isolated supervisor IPC required');
  await new Promise((resolveFence, reject) => {
    const timer = setTimeout(() => reject(new Error('network fence timeout')), 5000);
    process.once('message', message => {
      clearTimeout(timer);
      if (message?.kind === 'fenced' && message.port === port) resolveFence();
      else reject(new Error('network fence rejected'));
    });
    process.send({ kind: 'database', port });
  });
  report.network = 'private network namespace; only fixture database TCP port allowed';
}
async function gitSnapshot(worktree, source) {
  const index = git(worktree, 'rev-parse', '--git-path', 'index').trim();
  return {
    tracked: sha256(await readFile(join(worktree, 'tracked.txt'))),
    untracked: sha256(await readFile(join(worktree, 'sentinel.txt'))),
    index: sha256(await readFile(resolve(worktree, index))),
    head: git(worktree, 'rev-parse', 'HEAD').trim(),
    branch: git(worktree, 'branch', '--show-current').trim(),
    root: await realpath(worktree), top: git(worktree, 'rev-parse', '--show-toplevel').trim(),
    source: await realpath(source), origin: git(worktree, 'config', '--get-all', 'remote.origin.url').trim(),
    status: git(worktree, 'status', '--porcelain=v1', '--untracked-files=all'),
  };
}

await test('native stale revision and separate scheduling control', { timeout: 120_000 }, async t => {
  let database, db, port;
  try {
    await ownedHome();
    check('no inherited runtime authority', !Object.keys(process.env).some(key =>
      /^(PAPERCLIP_|ANTHROPIC_|OPENAI_|AWS_|DATABASE_URL$|PGHOST$|NODE_OPTIONS$|GITHUB_TOKEN$)/.test(key)));
    check('exact Node test runner', process.version === 'v24.21.0');
    report.node = process.version;
    const lockBytes = await readFile(new URL('./package-lock.json', import.meta.url));
    const lock = JSON.parse(lockBytes);
    const artifact = lock.packages['node_modules/@paperclipai/server'];
    check('published artifact integrity', artifact.version === '2026.1106.0' &&
      artifact.resolved === 'https://registry.npmjs.org/@paperclipai/server/-/server-2026.1106.0.tgz' &&
      artifact.integrity === 'sha512-OqG0qydn5Pky3iHmTgL3fvAh47m77CYgkuM3CgV6ciw6tY/AmBgkO3greyr0LinLFk7x1FdLkF1sfVVukZo/YA==');
    report.lockSha256 = sha256(lockBytes);
    const serverRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@paperclipai/server'))));
    const manifest = JSON.parse(await readFile(join(serverRoot, 'package.json'), 'utf8'));
    check('installed native version', manifest.version === artifact.version);
    report.modules = {};
    for (const [file, pin] of Object.entries(pins)) {
      const hash = sha256(await readFile(join(serverRoot, file)));
      check(`module equivalence: ${file}`, hash === pin);
      report.modules[file] = hash;
    }
    report.stage = 'native imports';
    const native = await import(new URL('./dist/services/execution-workspaces.js', `file://${serverRoot}/`));
    const tables = await import('@paperclipai/db');
    const { eq } = await import('drizzle-orm');
    const { companies, agents, projects, projectWorkspaces, issues, heartbeatRuns, executionWorkspaces,
      activityLog, createDb } = tables;
    const helper = await import(new URL('./dist/__tests__/helpers/embedded-postgres.js', `file://${serverRoot}/`));
    // Only fixture-owned settings are introduced, after the ambient-authority check.
    process.env.PAPERCLIP_HOME = home;
    process.env.PAPERCLIP_TEST_POSTGRES_TEMPLATE = '0';
    report.stage = 'embedded database bootstrap';
    const support = await helper.getEmbeddedPostgresTestSupport();
    check('embedded PostgreSQL supported; never skip', support.supported);
    database = await helper.startEmbeddedPostgresTestDatabase('selection-revision-');
    const url = new URL(database.connectionString);
    check('helper-owned loopback database', url.hostname === '127.0.0.1' && url.pathname === '/paperclip');
    port = Number(url.port);
    await networkFence(port);
    db = createDb(database.connectionString);
    const source = join(home, 'source');
    const worktree = join(home, 'worktree');
    await mkdir(source);
    git(source, 'init', '--initial-branch=main');
    git(source, 'remote', 'add', 'origin', 'https://example.invalid/native-fixture.git');
    await writeFile(join(source, 'tracked.txt'), 'fixture baseline\n');
    git(source, 'add', 'tracked.txt');
    git(source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture baseline');
    git(source, 'worktree', 'add', '-b', 'work/fixture', worktree);
    await writeFile(join(worktree, 'tracked.txt'), 'fixture dirty tracked edit\n');
    await writeFile(join(worktree, 'sentinel.txt'), 'fixture untracked sentinel\n');
    const [company] = await db.insert(companies).values({ name: 'Selection fixture', issuePrefix: 'FIX' }).returning();
    const [agent] = await db.insert(agents).values({ companyId: company.id, name: 'Fixture', status: 'running', adapterType: 'process' }).returning();
    const [project] = await db.insert(projects).values({ companyId: company.id, name: 'Fixture source' }).returning();
    const [sourceRow] = await db.insert(projectWorkspaces).values({ companyId: company.id, projectId: project.id,
      name: 'Source', cwd: source, repoUrl: 'https://example.invalid/native-fixture.git', isPrimary: true }).returning();
    async function fixture(identifier) {
      const [issue] = await db.insert(issues).values({ companyId: company.id, projectId: project.id,
        projectWorkspaceId: sourceRow.id, title: 'Synthetic selection', identifier, status: 'in_progress',
        assigneeAgentId: agent.id, workspaceBindingRevision: 1 }).returning();
      const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id,
        issueId: issue.id, scopeKind: 'issue', status: 'running', runtimeMode: 'legacy',
        contextSnapshot: { issueId: issue.id } }).returning();
      const [workspace] = await db.insert(executionWorkspaces).values({ companyId: company.id,
        projectId: project.id, projectWorkspaceId: sourceRow.id, sourceIssueId: issue.id,
        mode: 'isolated_workspace', strategyType: 'git_worktree', name: identifier,
        cwd: worktree, repoUrl: sourceRow.repoUrl, branchName: 'work/fixture', providerType: 'git_worktree' }).returning();
      await db.update(issues).set({ executionWorkspaceId: workspace.id }).where(eq(issues.id, issue.id));
      return { companyId: company.id, issueId: issue.id,
        actor: { type: 'agent', agentId: agent.id, companyId: company.id, runId: run.id, source: 'agent_jwt' },
        selection: { kind: 'configured_source', projectWorkspaceId: sourceRow.id, mode: 'managed_isolated' },
        requestKey: randomUUID() };
    }
    async function records() {
      const result = {};
      for (const [name, table] of Object.entries({ companies, agents, projects, projectWorkspaces, issues,
        heartbeatRuns, executionWorkspaces, activityLog })) {
        result[name] = (await db.select().from(table)).sort((a, b) => a.id.localeCompare(b.id));
      }
      return result;
    }
    const service = native.executionWorkspaceService(db);
    report.stage = 'stale new-key witness';
    await t.test('stale new key refuses with no record or dirty Git mutation', async () => {
      report.executed++;
      const input = await fixture('FIX-1');
      const before = await records();
      const files = await gitSnapshot(worktree, source);
      const task = before.issues.find(row => row.id === input.issueId);
      check('positive revision without applied or pending key', task.workspaceBindingRevision > 0 &&
        task.workspaceSelection === null && task.workspacePendingSelection === null);
      check('real dirty and untracked witnesses', files.status.includes(' M tracked.txt') && files.status.includes('?? sentinel.txt'));
      check('native root origin branch', files.root === files.top && files.branch === 'work/fixture' && files.origin === sourceRow.repoUrl);
      let error;
      try { await service.selectTaskWorkspace({ ...input, expectedBindingRevision: task.workspaceBindingRevision - 1 }); }
      catch (caught) { error = caught; }
      check('specific binding-changed conflict', error?.status === 409 &&
        error.message === 'Task workspace binding changed; inspect it before selecting again');
      report.expectedError = { status: error.status, message: error.message };
      const after = await records();
      check('complete relevant records unchanged', isDeepStrictEqual(before, after));
      report.staleAuditDelta = after.activityLog.length - before.activityLog.length;
      check('tracked untracked index HEAD branch root source unchanged', isDeepStrictEqual(files, await gitSnapshot(worktree, source)));
      report.passed++;
    });
    report.stage = 'separate synthetic valid control';
    await t.test('independent valid control reaches native scheduling', async () => {
      report.executed++;
      const input = await fixture('FIX-2');
      const result = await service.selectTaskWorkspace({ ...input, expectedBindingRevision: 1 });
      check('valid control schedules next admission', isDeepStrictEqual(result,
        { kind: 'scheduled', applies: 'next_normal_admission', bindingRevision: 2 }));
      const [task] = await db.select().from(issues).where(eq(issues.id, input.issueId));
      check('control pending intent persisted separately', task.workspaceBindingRevision === 2 &&
        task.workspacePendingSelection?.requestKey === input.requestKey &&
        isDeepStrictEqual(task.workspacePendingSelection.intent.selection, input.selection));
      report.control = 'separate task mutation: revision 1 to 2 and pending intent; not admission';
      report.passed++;
    });
    check('both witnesses executed without skip', report.executed === 2 && report.passed === 2);
    report.stage = 'teardown';
  } catch {
    // Native exceptions can contain connections and paths. Persist stage/assertion labels only.
    report.failed = Math.max(1, report.executed - report.passed);
    throw new Error(`Native fixture failed during ${report.stage}; see sanitized assertion report`);
  } finally {
    try {
      await db?.$client.end();
      await database?.cleanup();
      if (port) check('embedded database stopped', await closed(port));
      await ownedHome();
      // The helper is best-effort: leftover data or a postmaster is not a cleanup pass.
      check('helper removed all database roots', (await readdir(join(home, 'tmp'))).length === 0);
      check('cleanup home contained in allocated root', home.startsWith(root + sep));
      await rm(home, { recursive: true });
      let removed = false;
      try { await access(home); } catch (error) { removed = error.code === 'ENOENT'; }
      check('fixture home removed', removed);
      report.cleanup = true;
    } catch {
      report.cleanup = false;
      report.failed = Math.max(1, report.failed);
    }
    report.failed = Math.max(report.failed, report.executed - report.passed);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    assert.ok(report.cleanup, 'verified fixture teardown required');
  }
});
