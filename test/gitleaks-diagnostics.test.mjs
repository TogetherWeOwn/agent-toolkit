import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('secret-scan diagnostics retain redaction, full history and fail-closed exit', async () => {
  const workflow = await readFile(new URL('../.github/workflows/gitleaks.yml', import.meta.url), 'utf8');
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /zricethezav\/gitleaks:v8\.30\.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f/);
  assert.match(workflow, /detect --source \/repo --redact --verbose --exit-code 1/);
  assert.doesNotMatch(workflow, /continue-on-error: true|--exit-code 0|--no-git|--baseline-path/);
});
