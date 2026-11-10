import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceURL } from '../scripts/source-resolver.mjs';

const root = new URL('../', import.meta.url);
function run(files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['scripts/test-covering.mjs', ...files], {
    cwd: root, env, encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

test('package checks retain inherited strict options and select the complete affected project only', () => {
  for (const workspace of ['packages/core', 'packages/github', 'plugins/github-broker', 'plugins/neon-broker']) {
    const directory = fileURLToPath(new URL(`${workspace}/`, root));
    const config = ts.readConfigFile(join(directory, 'tsconfig.json'), ts.sys.readFile);
    assert.equal(config.error, undefined);
    const project = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
    assert.deepEqual(project.errors, []);
    assert.equal(project.options.strict, true);
    assert.equal(project.options.noUncheckedIndexedAccess, true);
    assert.ok(project.fileNames.length > 0);
    assert.ok(project.fileNames.every(file => file.startsWith(join(directory, 'src') + '/')));
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    assert.equal(manifest.scripts.typecheck, 'tsc -p tsconfig.json --noEmit');
  }
});

test('covering selection fails closed before starting any tests', () => {
  for (const files of [[], ['test'], ['test/*.test.mjs'], ['test/missing.test.mjs'], ['package.json'], ['--watch'],
    ['test/fixtures/source-checks/identity.test.mjs', 'missing.test.mjs']]) {
    const result = run(files);
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /Usage:/);
    assert.doesNotMatch(result.output, /source authorization accepts/);
  }
});

test('covering selection refuses an external symlink', t => {
  const dir = mkdtempSync(join(tmpdir(), 'source-selection-'));
  const link = fileURLToPath(new URL('test/source-selection-link.test.mjs', root));
  t.after(() => { rmSync(link, { force: true }); rmSync(dir, { recursive: true, force: true }); });
  const external = join(dir, 'external.test.mjs');
  writeFileSync(external, 'throw Error("external test must not run");');
  symlinkSync(external, link);
  assert.equal(run([link]).status, 2);
});

test('test-only resolver maps both output layouts and source .js imports including query parents', () => {
  const url = path => new URL(path, root).href;
  for (const path of ['dist/packages/core/src/provider/index.js', 'plugins/neon-broker/dist/plugins/neon-broker/src/metadata.js']) {
    assert.equal(sourceURL(url(path + '?probe=1')), url(path.replace(/^(?:plugins\/[^/]+\/)?dist\//, '').replace(/\.js$/, '.ts') + '?probe=1'));
  }
  assert.equal(sourceURL(url('packages/core/src/schema.js'), url('packages/core/src/index.ts?probe=1')), url('packages/core/src/schema.ts'));
  for (const path of ['node_modules/example/dist/index.js', 'test/example.js', '.provider-core-candidate/dist/packages/core/src/index.js']) {
    assert.equal(sourceURL(url(path)), url(path));
  }
  assert.equal(sourceURL('file:///separate/dist/packages/core/src/index.js'), 'file:///separate/dist/packages/core/src/index.js');
});

test('explicit covering file executes real source authorization without building', () => {
  const result = run(['test/fixtures/source-checks/identity.test.mjs']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /source authorization accepts trusted context/);
  assert.doesNotMatch(result.output, /intentional wrong assertion/);
});

test('covering runner propagates an assertion failure rather than just resolving imports', () => {
  const result = run(['test/fixtures/source-checks/assertion.test.mjs']);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /ERR_ASSERTION/);
  assert.match(result.output, /intentional assertion probe/);
  assert.doesNotMatch(result.output, /ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
});
