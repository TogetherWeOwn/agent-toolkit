// Actions-only launcher and rootless network supervisor. Never imports native code.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, lstat, realpath, readFile, writeFile, copyFile, access, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const script = fileURLToPath(import.meta.url);
const command = ['--test', '--test-isolation=none', '--test-timeout=120000', '--test-reporter=junit',
  'selection-revision.test.mjs'];
const path = `${dirname(node)}:/usr/sbin:/usr/bin:/sbin:/bin`;
const minimalEnv = root => ({ PATH: path, HOME: join(root, 'home'), TMPDIR: join(root, 'home', 'tmp'),
  FIXTURE_ROOT: root, NODE_ENV: 'production', LANG: 'C.UTF-8', TZ: 'UTC' });
const run = (name, args, options = {}) => execFileSync(name, args, {
  env: { PATH: path, LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, ...options,
});
const wait = child => new Promise(resolveExit => {
  child.once('error', () => resolveExit(1));
  child.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1));
});

if (process.argv[2] === '--supervise') {
  const root = process.argv[3];
  let child;
  try {
    assert.equal(process.getuid(), Number(process.argv[4]));
    assert.notEqual(process.getuid(), 0, 'native fixture must not run as root');
    assert.match(root, /^\/tmp\/native-workspace-[A-Za-z0-9]+$/);
    // The fresh namespace has no host interfaces or route to the host/network.
    const links = JSON.parse(run('ip', ['-j', 'link', 'show']));
    assert.deepEqual(links.map(link => link.ifname), ['lo']);
    run('ip', ['link', 'set', 'lo', 'up']);
    assert.deepEqual(JSON.parse(run('ip', ['-j', 'route', 'show'])), []);
    // Drop all capabilities in the fixture, even those granted by the user namespace.
    child = spawn('setpriv', ['--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all',
      '--no-new-privs', node, ...command.slice(0, -1),
      `--test-reporter-destination=${join(root, 'test.xml')}`, command.at(-1)], {
      cwd: here, env: minimalEnv(root), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let fenced = false;
    child.on('message', message => {
      try {
        assert.equal(fenced, false, 'one database fence only');
        assert.equal(message?.kind, 'database');
        const port = message.port;
        assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
        // Before this point only helper bootstrap runs, in a loopback-only namespace.
        // The fixture waits for this reply before constructing its DB client/records.
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
        child.kill('SIGTERM');
      }
    });
    const code = await wait(child);
    process.exitCode = fenced ? code : 1;
  } catch {
    child?.kill('SIGTERM');
    process.exitCode = 1;
  }
} else {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'GitHub Actions only; no local fallback');
  assert.equal(process.version, 'v24.21.0');
  const reportDir = resolve(process.argv[2]);
  const root = await mkdtemp('/tmp/native-workspace-');
  await mkdir(join(root, 'home'), { mode: 0o700 });
  await mkdir(join(root, 'home', 'tmp'), { mode: 0o700 });
  await mkdir(reportDir, { mode: 0o700 }); // Refuse an existing artifact directory.
  const evidence = { stage: 'rootless namespace setup', node: process.version, exitCode: 1,
    teardownObserved: false, ephemeralDisposal: 'GitHub-hosted runner disposal is separate, not observed teardown',
    command: `node ${command.join(' ')}`, tools: {} };
  let child;
  try {
    for (const tool of ['unshare', 'setpriv', 'ip', 'nft']) {
      evidence.tools[tool] = run(tool, [tool === 'ip' ? '-Version' : '--version']).toString().trim();
    }
    child = spawn('unshare', ['--user', '--map-current-user', '--keep-caps', '--net', node,
      script, '--supervise', root, String(process.getuid())], {
      cwd: here, env: minimalEnv(root), stdio: ['ignore', 'ignore', 'ignore'], detached: true,
    });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Ephemeral disposal remains required. */ }
    }, 150_000);
    let code;
    try { code = await wait(child); } finally { clearTimeout(timer); }
    evidence.exitCode = code;
    for (const file of ['assertions.json', 'test.xml']) {
      const source = join(root, file);
      const stat = await lstat(source);
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && stat.size <= 1_000_000);
      assert.equal(await realpath(source), source);
      await copyFile(source, join(reportDir, file));
    }
    const assertions = JSON.parse(await readFile(join(reportDir, 'assertions.json'), 'utf8'));
    evidence.stage = assertions.stage;
    evidence.teardownObserved = assertions.cleanup === true;
    assert.equal(code, 0);
    assert.equal(assertions.executed, 2);
    assert.equal(assertions.passed, 2);
    assert.equal(assertions.failed, 0);
    assert.equal(assertions.skipped, 0);
    assert.ok(assertions.cleanup);
    let absent = false;
    try { await access(join(root, 'home')); } catch (error) { absent = error.code === 'ENOENT'; }
    assert.ok(absent);
    const stat = await lstat(root);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid());
    assert.equal(await realpath(root), root);
    assert.equal(dirname(root), '/tmp');
    await rm(root, { recursive: true });
    evidence.stage = 'passed; observed teardown complete';
    evidence.exitCode = 0;
  } catch {
    evidence.exitCode = 1;
    // Retain failed fixture roots for ephemeral runner disposal; never upload them.
  } finally {
    await writeFile(join(reportDir, 'runner.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify(evidence));
  process.exitCode = evidence.exitCode;
}
