// Actions-only launcher and rootless supervisor. Never imports native code.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, lstat, realpath, readFile, writeFile, copyFile, access, rm, symlink } from 'node:fs/promises';
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

async function sandboxFilesystem(root) {
  const fsRoot = join(root, 'filesystem');
  await mkdir(fsRoot, { mode: 0o700 });
  run('mount', ['--make-rprivate', '/']);
  async function bind(source, target, readonly = true) {
    await mkdir(join(fsRoot, target), { recursive: true });
    // Read-only sockets still confer authority. Refuse them in every exposed tree.
    assert.equal(run('find', [source, '-type', 's', '-print', '-quit']).toString(), '');
    run('mount', ['--bind', source, join(fsRoot, target)]);
    if (readonly) run('mount', ['-o', 'remount,bind,ro,nosuid,nodev', join(fsRoot, target)]);
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
    run('mount', ['--bind', '/dev/' + name, join(fsRoot, 'dev', name)]);
  }
  run('mount', ['-t', 'tmpfs', '-o', 'mode=1777,nosuid,nodev', 'tmpfs', join(fsRoot, 'dev/shm')]);
  await writeFile(join(fsRoot, 'etc/passwd'), `fixture:x:${process.getuid()}:${process.getgid()}:Fixture:${root}/home:/bin/sh\n`);
  await writeFile(join(fsRoot, 'etc/group'), `fixture:x:${process.getgid()}:\n`);
  await writeFile(join(fsRoot, 'etc/nsswitch.conf'), 'passwd: files\ngroup: files\nhosts: files\n');
  return fsRoot;
}

if (process.argv[2] === '--supervise') {
  const root = process.argv[3];
  let child;
  try {
    assert.equal(process.getuid(), Number(process.argv[4]));
    assert.notEqual(process.getuid(), 0, 'native fixture must not run as root');
    assert.match(root, /^\/tmp\/native-workspace-[A-Za-z0-9]+$/);
    assert.equal(process.pid, 1, 'PID namespace init required for descendant disposal');
    const links = JSON.parse(run('ip', ['-j', 'link', 'show']));
    assert.deepEqual(links.map(link => link.ifname), ['lo']);
    run('ip', ['link', 'set', 'lo', 'up']);
    assert.deepEqual(JSON.parse(run('ip', ['-j', 'route', 'show'])), []);
    const fsRoot = await sandboxFilesystem(root);
    // chroot requires only this rootless namespace's capability. Native code runs
    // after it, without capabilities, host filesystem authority or new privileges.
    child = spawn('chroot', [fsRoot, '/usr/bin/setpriv', '--bounding-set=-all', '--inh-caps=-all',
      '--ambient-caps=-all', '--no-new-privs', '/tools/node', '/fixture/runner.mjs', '--fixture-child'], {
      cwd: '/', env: minimalEnv(root), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
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
    const code = await wait(child);
    process.exitCode = fenced ? code : 1;
  } catch {
    child?.kill('SIGKILL');
    process.exitCode = 1;
  }
  // Exiting PID 1 makes the kernel kill every remaining namespace descendant.
} else if (process.argv[2] === '--fixture-child') {
  process.chdir('/fixture');
  // Keep the supervisor IPC in this process; importing the test uses Node's runner.
  // It emits no artifact containing raw test-runner exceptions.
  await import('./selection-revision.test.mjs');
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
    for (const tool of ['unshare', 'setpriv', 'ip', 'nft', 'mount', 'chroot', 'find']) {
      evidence.stage = `required isolation tool: ${tool}`;
      evidence.tools[tool] = run(tool, [tool === 'ip' ? '-Version' : '--version']).toString().split('\n')[0].trim();
    }
    evidence.stage = 'rootless filesystem/network/PID namespace setup';
    child = spawn('unshare', ['--user', '--map-current-user', '--keep-caps', '--net', '--mount',
      '--pid', '--fork', '--kill-child=KILL', '--mount-proc', node, script, '--supervise', root, String(process.getuid())], {
      cwd: here, env: { PATH: path, LANG: 'C.UTF-8' }, stdio: ['ignore', 'ignore', 'ignore'], detached: true,
    });
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
    evidence.descendantsStopped = groupAbsent(child.pid);
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
