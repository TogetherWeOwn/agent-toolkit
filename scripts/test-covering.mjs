import { spawnSync } from 'node:child_process';
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

const result = spawnSync(process.execPath, [
  '--experimental-transform-types', '--import', new URL('./source-resolver.mjs', import.meta.url).href,
  '--test', '--test-timeout=30000', ...files.map(file => resolve(root, file)),
], { cwd: root, stdio: 'inherit', timeout: 290000 });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
