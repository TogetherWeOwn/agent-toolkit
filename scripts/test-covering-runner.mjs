import { run } from 'node:test';
import { spec } from 'node:test/reporters';

// Literal-files execution route: invoked as the main script (never via the
// CLI `--test` glob expansion), so each argv entry is executed exactly as
// given, including names containing glob metacharacters such as `[1]`.
const files = process.argv.slice(2);
if (!files.length) {
  console.error('test:covering: select at least one explicit test file\nUsage: npm run test:covering -- test/example.test.mjs [other.test.mjs ...]');
  process.exit(2);
}

const stream = run({ files, timeout: 30000 });
let failed = false;
stream.on('test:fail', () => { failed = true; });
stream.on('error', () => { failed = true; });
stream.compose(spec).pipe(process.stdout);
await new Promise(resolve => stream.on('end', resolve));
process.exitCode = failed ? 1 : 0;
