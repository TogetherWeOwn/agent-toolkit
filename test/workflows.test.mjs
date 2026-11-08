import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";

function script(file) {
  const source = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
  const match = source.match(/          python3 -I - <<'PY'\n([\s\S]*?)          PY(?:\n|$)/);
  assert.ok(match, "workflow contains the expected isolated Python script");
  return match[1].split("\n").map(line => line.slice(10)).join("\n");
}

function run(source, variables) {
  const result = spawnSync("python3", ["-I", "-c", source], {
    encoding: "utf8",
    timeout: 5000,
    env: { PATH: process.env.PATH, ...variables },
  });
  assert.equal(result.error, undefined);
  return result;
}

test("plugin-source-only changes select the CI code area", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const areas = JSON.parse(workflow.match(/areas-json: '([^']+)'/)[1]);
  const source = "plugins/example/src/tools/provision.ts";
  assert.ok(areas.code.some(pattern => pattern.endsWith("/**") && source.startsWith(pattern.slice(0, -2))));
  assert.match(workflow, /fromJSON\(needs\.changes\.outputs\.areas\)\.code/);
});

test("root build and typecheck reject invalid plugin source", () => {
  const directory = mkdtempSync(join(tmpdir(), "toolkit-plugin-check-"));
  try {
    mkdirSync(join(directory, "plugins/example/src/tools"), { recursive: true });
    writeFileSync(join(directory, "plugins/example/src/tools/provision.ts"), 'export const count: number = "invalid";\n');
    writeFileSync(join(directory, "tsconfig.json"), readFileSync(new URL("../tsconfig.json", import.meta.url)));
    const require = createRequire(import.meta.url);
    const tsc = require.resolve("typescript/bin/tsc");
    const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    for (const name of ["build", "typecheck"]) {
      const [command, ...args] = scripts[name].split(" ");
      assert.equal(command, "tsc");
      const result = spawnSync(process.execPath, [tsc, ...args], {
        cwd: directory, encoding: "utf8", timeout: 10000,
      });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /TS2322/, `${name} must diagnose the plugin type error, not just missing inputs`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("root tests invoke provider workspace build and test scripts", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(scripts.test, /npm run build --workspaces --if-present/);
  assert.match(scripts.test, /npm run test --workspaces --if-present/);
});

test("standalone broker tests build explicitly with lifecycle scripts disabled", () => {
  const config = readFileSync(new URL("../.npmrc", import.meta.url), "utf8");
  assert.match(config, /^ignore-scripts=true$/m);
  const { scripts } = JSON.parse(readFileSync(new URL("../plugins/github-broker/package.json", import.meta.url), "utf8"));
  assert.match(scripts.test, /^npm run build && node --test /);
  assert.equal(scripts.build, "tsc -p tsconfig.json");
  assert.equal(scripts.pretest, undefined);
});

const lint = script("pr-lint.yml");
const base = {
  EVENT: "pull_request",
  REQUIRE_CARD_REF: "false",
  INTERNAL_ID_LEVEL: "error",
  PR_STANDARDS_MODE: "error",
  TITLE: "feat: add strict policy fixtures",
  BODY: "## Linked Issues or Issue Description\nReusable synthetic policy coverage.\n## Verification\nOffline tests passed with strict fixtures.",
  BRANCH: "feat/policy-fixtures",
};

test("PR lint accepts conventional public text and safely handles event data", () => {
  assert.equal(run(lint, base).status, 0);
  assert.equal(run(lint, { ...base, EVENT: "merge_group", COMMITS: "null" }).status, 0);
  assert.equal(run(lint, { ...base, EVENT: "push", COMMITS: JSON.stringify([{ message: "feat: add policy fixtures" }]) }).status, 0);
  assert.equal(run(lint, { ...base, TITLE: "feat: keep $(false) and `false` inert" }).status, 0);
});

test("PR lint refuses invalid titles, empty sections and internal references without echoing them", () => {
  const tracker = ["TRACK", 123].join("-");
  for (const patch of [
    { TITLE: "not conventional" },
    { TITLE: `feat: ${"a".repeat(100)}` },
    { TITLE: "feat: final period." },
    { BODY: "<!-- template only -->" },
    { BODY: "## Verification\nTests passed offline, but there is no problem description." },
    { TITLE: `feat: ${tracker}` },
    { BODY: `${base.BODY}\n${tracker}` },
    { BRANCH: `feat/${tracker}` },
    { BODY: `${base.BODY}\nhttps://example.invalid/ABC/issues/private` },
    { REQUIRE_CARD_REF: "true" },
    { INTERNAL_ID_LEVEL: "warning" },
    { EVENT: "push", COMMITS: JSON.stringify([{ message: "unconventional commit" }]) },
    { EVENT: "push", COMMITS: JSON.stringify([{ message: `feat: policy\n\n${tracker}` }]) },
  ]) {
    const result = run(lint, { ...base, ...patch });
    assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes(tracker));
  }
});

test("PR lint accepts standardized public identifiers without allowing tracker references", () => {
  for (const reference of ["RFC-1918", "ISO-8601", "UTF-8", "SHA-256"]) {
    assert.equal(run(lint, { ...base, BODY: `${base.BODY}\n${reference}` }).status, 0);
  }
});

test("PR lint rejects unchecked Verification placeholders", () => {
  for (const placeholder of ["- [ ] Run tests", "* [ ] Run tests", "1. [ ] Run tests"]) {
    const BODY = `## Linked Issues or Issue Description\nReusable synthetic policy coverage.\n## Verification\n${placeholder}`;
    assert.equal(run(lint, { ...base, BODY }).status, 1);
    assert.equal(run(lint, { ...base, BODY: `${BODY}\nOffline tests passed with strict fixtures.` }).status, 0);
  }
});

test("workflow lint download bounds transient retries and verifies the pinned archive before extraction", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const block = workflow.match(/      - name: Lint workflows\n        run: \|\n([\s\S]*?)\n\n/)[1];
  assert.match(block, /set -euo pipefail/);
  assert.match(block, /curl -fsSL --retry 3 --retry-delay 1 --retry-max-time 120/);
  assert.match(block, /--connect-timeout 10 --max-time 30 -o "\$lint_dir\/actionlint\.tgz"/);
  assert.doesNotMatch(block, /--retry-all-errors|--insecure|\|\| true/);
  assert.match(block, /https:\/\/github\.com\/rhysd\/actionlint\/releases\/download\/v1\.7\.7\/actionlint_1\.7\.7_linux_amd64\.tar\.gz/);
  const verify = block.indexOf('echo "023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757  $lint_dir/actionlint.tgz" | sha256sum -c -');
  const extract = block.indexOf('tar -xzf "$lint_dir/actionlint.tgz" -C "$lint_dir" actionlint');
  const execute = block.indexOf('"$lint_dir/actionlint" -shellcheck= -pyflakes=');
  assert.ok(verify > block.indexOf("curl -fsSL") && extract > verify && execute > extract);
});

test("ci-ok rejects failed or cancelled prerequisites and accepts intentional skips", () => {
  const aggregate = script("ci.yml");
  for (const result of ["failure", "cancelled", "timed_out", "unknown"]) {
    assert.equal(run(aggregate, { NEEDS_JSON: JSON.stringify({ test: { result } }) }).status, 1);
  }
  assert.equal(run(aggregate, { NEEDS_JSON: JSON.stringify({ lint: { result: "success" }, test: { result: "skipped" } }) }).status, 0);
});
