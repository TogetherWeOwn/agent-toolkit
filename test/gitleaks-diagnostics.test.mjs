import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('secret-scan diagnostics retain redaction, full history and fail-closed exit', async () => {
  const workflow = await readFile(new URL('../.github/workflows/gitleaks.yml', import.meta.url), 'utf8');
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /zricethezav\/gitleaks:v8\.30\.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f/);
  assert.match(workflow, /detect --source \/repo --redact --verbose --exit-code 1/);
  assert.match(workflow, /--log-opts="--full-history --diff-filter=tuxdb HEAD"/);
  assert.doesNotMatch(workflow, /continue-on-error: true|--exit-code 0|--no-git|--baseline-path|--config|--ignore-gitleaks-allow/);
});

test('scan revision traversal retains merged and deleted history without unrelated fetched refs', async () => {
  const workflow = await readFile(new URL('../.github/workflows/gitleaks.yml', import.meta.url), 'utf8');
  const options = workflow.match(/--log-opts="([^"]+)"/)[1].split(' ');
  const directory = await mkdtemp(join(tmpdir(), 'toolkit-scan-history-'));
  function git(...args) {
    const result = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: directory, encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, HOME: directory, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  async function commit(file, text) {
    await writeFile(join(directory, file), text);
    git('add', file);
    git('commit', '-m', 'test: record synthetic history');
    return git('rev-parse', 'HEAD');
  }
  try {
    git('init', '--initial-branch=main');
    const root = await commit('root.txt', 'synthetic root marker\n');
    git('switch', '-c', 'unrelated');
    const unrelated = await commit('sibling.txt', 'synthetic sibling marker\n');
    git('update-ref', 'refs/remotes/origin/unrelated', unrelated);
    git('switch', 'main');
    git('switch', '-c', 'merged-feature');
    const merged = await commit('historical.txt', 'synthetic historical marker\n');
    git('rm', 'historical.txt');
    git('commit', '-m', 'test: remove synthetic marker');
    git('switch', 'main');
    const main = await commit('main.txt', 'synthetic main marker\n');
    git('merge', '--no-ff', 'merged-feature', '-m', 'test: merge synthetic history');
    assert.equal(git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3);
    const original = git('log', '-p', '-U0', '--full-history', '--all', '--diff-filter=tuxdb');
    assert.ok(original.includes(unrelated), 'the default all-ref traversal includes unrelated history');
    const scoped = git('log', '-p', '-U0', ...options);
    // Patch traversal omits a merge with no new diff; retain both parents' content instead.
    for (const sha of [root, merged, main]) assert.ok(scoped.includes(sha), `must retain ancestor ${sha}`);
    assert.ok(scoped.includes('+synthetic historical marker'), 'removed material is still scanned at its introduction');
    assert.ok(!scoped.includes(unrelated), 'an unmerged fetched ref is not part of the tested revision');
    assert.ok(!scoped.includes('synthetic sibling marker'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
