import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const commitPattern = /^[a-f0-9]{40}$/;

// Never pass through Match, Secret, author data, messages or arbitrary report fields.
export function findingMetadata(report, reachable) {
  // Go's JSON encoder represents a nil findings slice as null on a clean scan.
  if (report === null) return [];
  if (!Array.isArray(report)) throw new Error('Invalid report');
  return report.map(finding => {
    if (!finding || !commitPattern.test(finding.Commit)
      || typeof finding.RuleID !== 'string' || !/^[a-z0-9-]+$/.test(finding.RuleID)
      || typeof finding.File !== 'string' || !finding.File || finding.File.length > 4096
      || !Number.isSafeInteger(finding.StartLine) || finding.StartLine < 1
      || !Number.isSafeInteger(finding.EndLine) || finding.EndLine < finding.StartLine) {
      throw new Error('Invalid finding metadata');
    }
    return {
      rule: finding.RuleID,
      file: finding.File,
      startLine: finding.StartLine,
      endLine: finding.EndLine,
      commit: finding.Commit,
      reachableFromBase: reachable(finding.Commit, 'base'),
      reachableFromHead: reachable(finding.Commit, 'head'),
    };
  });
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function printMetadata(reportPath, env = process.env, write = console.log) {
  const refs = { base: env.GITLEAKS_BASE_SHA, head: env.GITLEAKS_HEAD_SHA };
  for (const ref of Object.values(refs)) {
    if (!commitPattern.test(ref ?? '')) throw new Error('Invalid scan context');
    git('cat-file', '-e', `${ref}^{commit}`);
  }
  const reachable = (commit, target) => {
    const result = spawnSync('git', ['merge-base', '--is-ancestor', commit, refs[target]], {
      stdio: 'ignore', timeout: 10000,
    });
    if (result.error || ![0, 1].includes(result.status)) throw new Error('Ancestry check failed');
    return result.status === 0;
  };
  const findings = findingMetadata(JSON.parse(readFileSync(reportPath, 'utf8')), reachable);
  const population = {
    allRefs: Number(git('rev-list', '--all', '--count')),
    base: Number(git('rev-list', refs.base, '--count')),
    head: Number(git('rev-list', refs.head, '--count')),
    checkout: git('rev-parse', 'HEAD'),
  };
  // JSON quoting prevents file names containing line breaks from becoming annotations.
  write(JSON.stringify({ population, findingCount: findings.length }));
  for (const finding of findings) write(JSON.stringify(finding));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Expected report path');
    printMetadata(process.argv[2]);
  } catch {
    // JSON parser and subprocess errors can contain input; do not log them.
    console.error('Unable to produce safe gitleaks metadata; scan remains failed.');
    process.exitCode = 2;
  }
}
