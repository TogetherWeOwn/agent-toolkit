import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("ci-ok rejects failed or cancelled prerequisites and accepts intentional skips", () => {
  const aggregate = script("ci.yml");
  for (const result of ["failure", "cancelled", "timed_out", "unknown"]) {
    assert.equal(run(aggregate, { NEEDS_JSON: JSON.stringify({ test: { result } }) }).status, 1);
  }
  assert.equal(run(aggregate, { NEEDS_JSON: JSON.stringify({ lint: { result: "success" }, test: { result: "skipped" } }) }).status, 0);
});
