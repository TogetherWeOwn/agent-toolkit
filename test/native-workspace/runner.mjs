// Actions-only launcher and rootless supervisor. Never imports native code.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, lstat, realpath, readFile, writeFile, copyFile, access, rm, symlink, readdir } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const script = fileURLToPath(import.meta.url);
const path = `${dirname(node)}:/usr/sbin:/usr/bin:/sbin:/bin`;
const minimalEnv = root => ({ PATH: '/tools:/usr/sbin:/usr/bin:/sbin:/bin', HOME: join(root, 'home'),
  TMPDIR: join(root, 'home', 'tmp'), FIXTURE_ROOT: root, NODE_ENV: 'production', LANG: 'C.UTF-8', TZ: 'UTC' });
const run = (name, args, options = {}) => execFileSync(name, args, {
  env: { PATH: path, LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, ...options,
});
const wait = child => new Promise(resolveExit => {
  child.once('error', () => resolveExit(1));
  child.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1));
});
function groupAbsent(pid) {
  try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}

// Sanitized supervisor diagnostics: step names and error codes only, never
// paths, URLs, environment values or raw tool output.
const steps = [];
let stepPersist = async () => {};
async function persistSteps(reportDir) {
  try { await writeFile(join(reportDir, 'supervise.json'), JSON.stringify(steps, null, 2) + '\n'); } catch { /* Diagnostics must not fail setup. */ }
}
// In-process socket refusal walk for small exposed trees: a serial
// `find <dir> -type s` can exceed any fixed timeout on a cold hosted-runner
// overlay (observed ETIMEDOUT at 10s and again at 30s), so walk with bounded
// parallelism instead. Unreadable directories are skipped, matching `find`
// output semantics; symlinks are never followed. The walk has a wall-time
// budget and fails closed (a tree that cannot be proven clean is refused),
// so a slow filesystem produces a named step error instead of an anonymous
// outer kill.
async function assertNoSockets(source) {
  const started = Date.now();
  const queue = [source];
  let head = 0;
  let found = false;
  async function worker() {
    while (head < queue.length && !found) {
      const dir = queue[head++];
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (Date.now() - started > 60_000) {
          const error = new Error('socket-check wall-time budget exceeded');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        if (entry.isSocket()) { found = true; return; }
        if (entry.isDirectory()) queue.push(join(dir, entry.name));
        else if (!entry.isFile() && !entry.isSymbolicLink()) {
          const stat = await lstat(join(dir, entry.name)).catch(() => null);
          if (stat?.isSocket()) { found = true; return; }
          if (stat?.isDirectory()) queue.push(join(dir, entry.name));
        }
      }
    }
  }
  await Promise.all(Array.from({ length: 32 }, worker));
  assert.equal(found, false, 'socket in exposed tree refused');
}

// Kernel-authoritative bound-socket refusal: a read-only bind still lets the
// fixture connect to any socket that has a live listener in an exposed tree,
// so refuse when a bound unix socket path is at or under any exposed root.
// /proc/net/unix enumerates bound sockets; sweeping /proc/<pid>/net/unix
// covers every host network namespace (unix connect follows the path, not the
// listener's namespace). Abstract sockets carry no filesystem path and confer
// no bind-mounted authority. Used for /usr: walking that tree has repeatedly
// exceeded the outer kill window on the cold runner overlay (serial find
// >30s, parallel in-process walk >150s), while this check is O(sockets).
async function assertNoBoundSockets(root) {
  const bound = new Set();
  const readTable = async path => {
    const text = await readFile(path, 'utf8');
    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const socketPath = parts[7];
      if (socketPath && !socketPath.startsWith('@')) bound.add(socketPath);
    }
  };
  await readTable('/proc/net/unix');
  let pids = [];
  try { pids = await readdir('/proc'); } catch { /* Sweep is best-effort. */ }
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    try { await readTable(`/proc/${pid}/net/unix`); } catch { /* Unreadable tables stay uncovered. */ }
  }
  for (const socketPath of bound) {
    assert(socketPath !== root && !socketPath.startsWith(`${root}/`),
      'bound socket in exposed tree refused');
  }
}
async function step(name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    steps.push({ name, ok: true, durationMs: Date.now() - started });
    await stepPersist();
    return value;
  } catch (error) {
    steps.push({ name, ok: false, code: error?.code ?? 'unknown', durationMs: Date.now() - started });
    await stepPersist();
    throw error;
  }
}
async function sandboxFilesystem(root) {
  const fsRoot = join(root, 'filesystem');
  await mkdir(fsRoot, { mode: 0o700 });
  await step('make-rprivate', () => run('mount', ['--make-rprivate', '/']));
  async function bind(source, target, readonly = true) {
    await mkdir(join(fsRoot, target), { recursive: true });
    // Read-only sockets still confer authority. Refuse them in every exposed tree.
    // /usr is proven via bound-socket enumeration (see assertNoBoundSockets);
    // the smaller trees get the strict socket-file walk.
    await step(`socket-check-${target}`, () => source === '/usr'
      ? assertNoBoundSockets(source)
      : assertNoSockets(source));
    await step(`bind-${target}`, () => run('mount', ['--bind', source, join(fsRoot, target)]));
    if (readonly) await step(`bind-ro-${target}`, () => run('mount', ['-o', 'remount,bind,ro,nosuid,nodev', join(fsRoot, target)]));
  }
  await bind('/usr', 'usr');
  await bind(dirname(node), 'tools');
  await bind(here, 'fixture');
  await bind(join(root, 'shared'), `tmp/${basename(root)}`, false);
  for (const dir of ['bin', 'sbin', 'lib', 'lib64']) {
    assert.equal(await realpath('/' + dir), '/usr/' + dir);
    await symlink('usr/' + dir, join(fsRoot, dir));
  }
  // No host /run, /var, /home, /sys, /proc or Docker/agent sockets are exposed.
  // In particular /proc/<supervisor>/root must not expose the pre-chroot root.
  for (const dir of ['etc', 'run', 'var', 'home', 'proc', 'dev', 'dev/shm'])
    await mkdir(join(fsRoot, dir), { recursive: true });
  for (const name of ['null', 'zero', 'random', 'urandom']) {
    await writeFile(join(fsRoot, 'dev', name), '');
    await step(`dev-bind-${name}`, () => run('mount', ['--bind', '/dev/' + name, join(fsRoot, 'dev', name)]));
  }
  await step('shm-tmpfs', () => run('mount', ['-t', 'tmpfs', '-o', 'mode=1777,nosuid,nodev', 'tmpfs', join(fsRoot, 'dev/shm')]));
  await writeFile(join(fsRoot, 'etc/passwd'), `fixture:x:${process.getuid()}:${process.getgid()}:Fixture:${root}/home:/bin/sh\n`);
  await writeFile(join(fsRoot, 'etc/group'), `fixture:x:${process.getgid()}:\n`);
  await writeFile(join(fsRoot, 'etc/nsswitch.conf'), 'passwd: files\ngroup: files\nhosts: files\n');
  return fsRoot;
}

if (process.argv[2] === '--supervise') {
  const root = process.argv[3];
  const chrootBin = process.argv[5];
  const setprivBin = process.argv[6];
  let child;
  try {
    steps.push({ name: 'supervise-start', ok: true });
    await persistSteps(join(root, 'shared'));
    stepPersist = () => persistSteps(join(root, 'shared'));
    await step('uid-check', () => {
      assert.equal(process.getuid(), Number(process.argv[4]));
      assert.notEqual(process.getuid(), 0, 'native fixture must not run as root');
    });
    assert.match(root, /^\/tmp\/native-workspace-[A-Za-z0-9]+$/);
    steps.push({ name: 'root-check', ok: true });
    assert.equal(process.pid, 1, 'PID namespace init required for descendant disposal');
    steps.push({ name: 'pid-check', ok: true });
    const links = await step('link-list', () => JSON.parse(run('ip', ['-j', 'link', 'show'])));
    await step('link-check', () => assert.deepEqual(links.map(link => link.ifname), ['lo']));
    await step('lo-up', () => run('ip', ['link', 'set', 'lo', 'up']));
    const routes = await step('route-list', () => JSON.parse(run('ip', ['-j', 'route', 'show'])));
    await step('route-check', () => assert.deepEqual(routes, []));
    const fsRoot = await sandboxFilesystem(root);
    // Absolute chroot/setpriv paths are resolved on the host and verified inside
    // the chroot before spawn, so an image layout drift fails at a named step.
    await step('setpriv-in-chroot', async () => {
      assert.ok(chrootBin && setprivBin, 'absolute chroot/setpriv paths required');
      assert.equal((await lstat(join(fsRoot, setprivBin))).isFile(), true);
    });
    child = spawn(chrootBin, [fsRoot, setprivBin, '--bounding-set=-all', '--inh-caps=-all',
      '--ambient-caps=-all', '--no-new-privs', '/tools/node', '/fixture/runner.mjs', '--fixture-child'], {
      cwd: '/', env: minimalEnv(root), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    steps.push({ name: 'child-spawn', ok: true });
    let fenced = false;
    child.on('message', async message => {
      try {
        const status = await readFile(`/proc/${child.pid}/status`, 'utf8');
        assert.match(status, /^CapEff:\s+0+$/m);
        assert.match(status, /^CapBnd:\s+0+$/m);
        assert.match(status, /^NoNewPrivs:\s+1$/m);
        assert.equal(fenced, false, 'one database fence only');
        assert.equal(message?.kind, 'database');
        const port = message.port;
        assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
        run('nft', ['-f', '-'], { input: `table inet fixture {
 chain output { type filter hook output priority 0; policy drop;
  oifname "lo" ip daddr 127.0.0.1 tcp dport ${port} accept
  oifname "lo" ip saddr 127.0.0.1 tcp sport ${port} ct state established accept
 }
 chain input { type filter hook input priority 0; policy drop;
  iifname "lo" ip daddr 127.0.0.1 tcp dport ${port} accept
  iifname "lo" ip saddr 127.0.0.1 tcp sport ${port} ct state established accept
 }
}` });
        fenced = true;
        child.send({ kind: 'fenced', port });
      } catch {
        child.kill('SIGKILL');
      }
    });
    const code = await step('child-exit', async () => wait(child));
    steps.push({ name: 'fence-check', ok: fenced, childCode: code });
    process.exitCode = fenced ? code : 1;
  } catch {
    child?.kill('SIGKILL');
    process.exitCode = 1;
  } finally {
    await persistSteps(join(root, 'shared'));
  }
  // Exiting PID 1 makes the kernel kill every remaining namespace descendant.
} else if (process.argv[2] === '--fixture-child') {
  process.chdir('/fixture');
  // Keep the supervisor IPC in this process; importing the test uses Node's runner.
  // It emits no artifact containing raw test-runner exceptions.
  const childReport = join(process.env.FIXTURE_ROOT, 'child.json');
  try {
    await import('./selection-revision.test.mjs');
    await writeFile(childReport, JSON.stringify({ phase: 'fixture-import', ok: true }) + '\n', { flag: 'w' });
  } catch (error) {
    await writeFile(childReport, JSON.stringify({ phase: 'fixture-import', ok: false, code: error?.code ?? 'unknown' }) + '\n', { flag: 'w' });
    process.exitCode = 1;
  }
  if (process.connected) process.disconnect();
} else {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'GitHub Actions only; no local fallback');
  assert.equal(process.version, 'v24.21.0');
  const reportDir = resolve(process.argv[2]);
  const root = await mkdtemp('/tmp/native-workspace-');
  const shared = join(root, 'shared');
  await mkdir(shared, { mode: 0o700 });
  await mkdir(join(shared, 'home'), { mode: 0o700 });
  await mkdir(join(shared, 'home', 'tmp'), { mode: 0o700 });
  const reportStat = await lstat(reportDir);
  assert.ok(reportStat.isDirectory() && !reportStat.isSymbolicLink() && reportStat.uid === process.getuid() &&
    (reportStat.mode & 0o077) === 0 && await realpath(reportDir) === reportDir);
  const evidence = { stage: 'rootless filesystem/network/PID namespace setup', node: process.version, exitCode: 1,
    teardownObserved: false, descendantsStopped: false,
    ephemeralDisposal: 'GitHub-hosted runner disposal is separate, not observed teardown',
    command: 'capability-dropped Node built-in runner; selection-revision.test.mjs; timeout 120000ms', tools: {} };
  let child;
  try {
    for (const tool of ['unshare', 'setpriv', 'ip', 'nft', 'mount', 'chroot']) {
      evidence.stage = `required isolation tool: ${tool}`;
      evidence.tools[tool] = run(tool, [tool === 'ip' ? '-Version' : '--version']).toString().split('\n')[0].trim();
    }
    evidence.stage = 'rootless filesystem/network/PID namespace setup';
    const resolveTool = name => [join('/usr/sbin', name), join('/sbin', name),
      join('/usr/bin', name), join('/bin', name)].find(candidate => existsSync(candidate));
    evidence.chrootPath = resolveTool('chroot') ?? null;
    evidence.setprivPath = resolveTool('setpriv') ?? null;
    child = spawn('unshare', ['--user', '--map-current-user', '--keep-caps', '--net', '--mount',
      '--pid', '--fork', '--kill-child=KILL', '--mount-proc', node, script, '--supervise', root,
      String(process.getuid()), evidence.chrootPath ?? '', evidence.setprivPath ?? ''], {
      cwd: here, env: { PATH: path, LANG: 'C.UTF-8' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true,
    });
    // Sanitized outer diagnostics: unshare start-up failures never reach the
    // supervisor, so map its stderr to an error code only (never raw output).
    let outerStderr = '';
    child.stderr?.on('data', chunk => { outerStderr = (outerStderr + chunk).slice(-2048); });
    const term = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Checked below. */ }
    }, 150_000);
    const kill = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Checked below. */ }
    }, 155_000);
    let code;
    try { code = await wait(child); } finally {
      clearTimeout(term);
      clearTimeout(kill);
      // Do not cancel the final kill merely because the supervisor exited first.
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Checked below. */ }
    }
    evidence.exitCode = code;
    evidence.unshareExitCode = code;
    evidence.unshareErrorCode = /Operation not permitted/i.test(outerStderr) ? 'EPERM'
      : /Permission denied/i.test(outerStderr) ? 'EACCES'
      : /Invalid argument/i.test(outerStderr) ? 'EINVAL'
      : outerStderr ? 'unknown' : null;
    evidence.descendantsStopped = groupAbsent(child.pid);
    // Copy sanitized supervisor/child diagnostics even when assertions are absent.
    for (const name of ['supervise.json', 'child.json']) {
      try {
        const sourceStat = await lstat(join(shared, name));
        if (sourceStat.isFile()) await copyFile(join(shared, name), join(reportDir, name));
      } catch { /* Optional diagnostics; missing files stay missing. */ }
    }
    assert.ok(evidence.descendantsStopped, 'namespace/process group shutdown required');
    const source = join(shared, 'assertions.json');
    const stat = await lstat(source);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && stat.size <= 1_000_000);
    assert.equal(await realpath(source), source);
    await copyFile(source, join(reportDir, 'assertions.json'));
    const assertions = JSON.parse(await readFile(source, 'utf8'));
    evidence.stage = assertions.stage;
    evidence.teardownObserved = assertions.cleanup === true;
    // Generate XML from numeric outcomes only. Never copy raw node:test errors.
    const passed = assertions.executed === 2 && assertions.passed === 2 && assertions.failed === 0 &&
      assertions.skipped === 0 && assertions.cleanup && code === 0;
    await writeFile(join(reportDir, 'test.xml'), `<testsuite name="native-workspace-aggregate" tests="1" failures="${passed ? 0 : 1}" skipped="0"><testcase name="stale-revision-and-control">${passed ? '' : '<failure message="Fixture failed; sanitized assertion report only"/>'}</testcase></testsuite>\n`, { flag: 'wx' });
    assert.ok(passed);
    let absent = false;
    try { await access(join(shared, 'home')); } catch (error) { absent = error.code === 'ENOENT'; }
    assert.ok(absent);
    const rootStat = await lstat(root);
    assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink() && rootStat.uid === process.getuid());
    assert.equal(await realpath(root), root);
    assert.equal(dirname(root), '/tmp');
    await rm(root, { recursive: true });
    evidence.stage = 'passed; observed teardown complete';
    evidence.exitCode = 0;
  } catch {
    evidence.exitCode = 1;
    // Retain failed fixture roots for ephemeral disposal; never upload them.
  } finally {
    await writeFile(join(reportDir, 'runner.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify(evidence));
  process.exitCode = evidence.exitCode;
}
