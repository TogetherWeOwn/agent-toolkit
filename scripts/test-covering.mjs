import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = process.argv.slice(2);
try {
  if (!files.length) throw Error('select at least one explicit test file');
  for (const file of files) {
    const path = relative(root, realpathSync(resolve(root, file))).split(sep).join('/');
    if (file.startsWith('-') || !/^(?:test\/|(?:packages|plugins)\/[^/]+\/test\/).+\.test\.mjs$/.test(path) || !statSync(resolve(root, file)).isFile()) {
      throw Error(`not a repository unit-test file: ${file}`);
    }
  }
} catch (error) {
  console.error(`test:covering: ${error.message}\nUsage: npm run test:covering -- test/example.test.mjs [other.test.mjs ...]`);
  process.exit(2);
}

function boundedInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`test:covering: ${name} must be an integer between ${min} and ${max}\nUsage: npm run test:covering -- test/example.test.mjs [other.test.mjs ...]`);
    process.exit(2);
  }
  return value;
}

const timeoutMs = boundedInt('TEST_COVERING_TIMEOUT_MS', 290000, 1, 290000);
const graceMs = boundedInt('TEST_COVERING_GRACE_MS', 5000, 0, 10000);
const absoluteFiles = files.map(file => resolve(root, file));

// The runner is the direct child in its own process group (detached), so the
// timeout below owns the whole test process tree. On timeout it sends SIGTERM
// to the group, then SIGKILL after the grace period, and always reports a
// nonzero result. Process-group signals are POSIX; on other platforms this
// falls back to signalling the direct child (documented Linux/POSIX workflow).
const child = spawn(process.execPath, [
  '--experimental-transform-types', '--import', new URL('./source-resolver.mjs', import.meta.url).href,
  fileURLToPath(new URL('./test-covering-runner.mjs', import.meta.url)), ...absoluteFiles,
], { cwd: root, stdio: 'inherit', detached: true });

let timedOut = false;
let killSent = false;
let childClosed = false;
let exitCode = 0;

function signalGroup(signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch { try { process.kill(child.pid, signal); } catch { /* already gone */ } }
}

function finish() {
  if (!childClosed || (timedOut && !killSent)) return;
  process.exit(timedOut ? (exitCode || 1) : exitCode);
}

const timeoutTimer = setTimeout(() => {
  timedOut = true;
  signalGroup('SIGTERM');
  setTimeout(() => {
    killSent = true;
    signalGroup('SIGKILL');
    finish();
  }, graceMs);
}, timeoutMs);

process.on('SIGINT', () => signalGroup('SIGINT'));
process.on('SIGTERM', () => signalGroup('SIGTERM'));

child.on('error', error => {
  console.error(error.message);
  exitCode = 1;
  childClosed = true;
  clearTimeout(timeoutTimer);
  finish();
});
child.on('close', code => {
  exitCode = code ?? 1;
  childClosed = true;
  clearTimeout(timeoutTimer);
  finish();
});
