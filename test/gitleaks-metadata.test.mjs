import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findingMetadata } from '../scripts/gitleaks-metadata.mjs';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sentinel = 'sensitive-value-must-not-appear';
const fixture = {
  RuleID: 'generic-api-key', File: 'test/fixture.mjs', StartLine: 2, EndLine: 3, Commit: commit,
  Secret: sentinel, Match: sentinel, Author: sentinel, Email: sentinel, Message: sentinel,
  Fingerprint: sentinel, Description: sentinel, futureField: sentinel,
};

function runReport(t, content, context = commit) {
  const directory = mkdtempSync(join(tmpdir(), 'gitleaks-metadata-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'report.json');
  writeFileSync(path, content);
  const result = spawnSync(process.execPath, ['scripts/gitleaks-metadata.mjs', path], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GITLEAKS_BASE_SHA: context, GITLEAKS_HEAD_SHA: context },
  });
  assert.ifError(result.error);
  return { status: result.status, stdout: result.stdout, output: result.stdout + result.stderr };
}

test('finding metadata strictly selects location, rule, commit and independent ancestry', () => {
  const calls = [];
  assert.deepEqual(findingMetadata([fixture], (sha, ref) => {
    calls.push([sha, ref]);
    return ref === 'head';
  }), [{
    rule: 'generic-api-key', file: 'test/fixture.mjs', startLine: 2, endLine: 3, commit,
    reachableFromBase: false, reachableFromHead: true,
  }]);
  assert.deepEqual(calls, [[commit, 'base'], [commit, 'head']]);
  assert.deepEqual(findingMetadata([], () => assert.fail('no findings')), []);
  assert.deepEqual(findingMetadata(null, () => assert.fail('no findings')), []);
});

test('invalid reports and metadata fail closed without including report contents', () => {
  for (const report of [{}, [null], [{ ...fixture, Commit: sentinel }],
    [{ ...fixture, RuleID: sentinel + '\n::error::' }], [{ ...fixture, File: '' }],
    [{ ...fixture, StartLine: 0 }], [{ ...fixture, EndLine: 1 }]]) {
    assert.throws(() => findingMetadata(report, () => false), /^Error: Invalid/);
  }
});

test('CLI prints safe JSON metadata and population counts, never matched values', t => {
  const result = runReport(t, JSON.stringify([fixture]));
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, new RegExp(sentinel));
  const [summary, finding] = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(summary.findingCount, 1);
  assert.ok(summary.population.allRefs >= summary.population.head);
  assert.equal(summary.population.head, summary.population.base);
  assert.equal(finding.commit, commit);
  assert.equal(finding.reachableFromBase, true);
  assert.equal(finding.reachableFromHead, true);
});

test('CLI never echoes malformed JSON or invalid scan context in errors', t => {
  for (const [content, context] of [[sentinel, commit], [JSON.stringify([fixture]), sentinel]]) {
    const result = runReport(t, content, context);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.output, new RegExp(sentinel));
    assert.match(result.output, /Unable to produce safe gitleaks metadata/);
  }
});

test('file names with line breaks stay on one JSON line, not workflow annotations', t => {
  const file = 'test/fixture\n::error::not-an-annotation.mjs';
  const result = runReport(t, JSON.stringify([{ ...fixture, File: file }]));
  assert.equal(result.status, 0, result.output);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).file, file);
  assert.doesNotMatch(result.output, /^::error::/m);
});
