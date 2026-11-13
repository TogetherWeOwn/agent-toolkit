import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/review-replies-recheck.yml", import.meta.url), "utf8");
const script = workflow.split("        run: |\n")[1].split("\n").map(line => line.slice(10)).join("\n");
const name = "PR standards (required entry point)";
const url = "https://github.com/TogetherWeOwn/example/actions/runs/42";
const run = (id, status = "completed", extra = {}) => ({
  id, name, status, event: "pull_request", html_url: url,
  created_at: "2026-11-13T01:00:00Z", ...extra,
});

function execute(pages, { listFails = false, rerunFails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "review-replies-recheck-"));
  try {
    // Fake only the network boundary. Real jq evaluates the workflow's filter.
    writeFileSync(join(dir, "gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args.includes("POST")) {
  fs.appendFileSync(process.env.REQUESTS, JSON.stringify(args) + "\\n");
  process.exit(process.env.RERUN_FAILS === "true" ? 1 : 0);
}
if (process.env.LIST_FAILS === "true") process.exit(1);
if (!args.includes("--paginate") || !args.includes("--slurp") ||
    !args.includes("repos/TogetherWeOwn/example/actions/runs?head_sha=abc1234&per_page=100")) process.exit(2);
const result = spawnSync("jq", ["-r", args[args.indexOf("--jq") + 1]], {
  input: fs.readFileSync(process.env.PAGES), encoding: "utf8"
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status);
`, { mode: 0o755 });
    writeFileSync(join(dir, "pages.json"), JSON.stringify(pages));
    writeFileSync(join(dir, "requests.jsonl"), "");
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8", timeout: 5000,
      env: {
        PATH: `${dir}:${process.env.PATH}`, REPO: "TogetherWeOwn/example", HEAD_SHA: "abc1234",
        PAGES: join(dir, "pages.json"), REQUESTS: join(dir, "requests.jsonl"),
        LIST_FAILS: String(listFails), RERUN_FAILS: String(rerunFails),
      },
    });
    assert.equal(result.error, undefined);
    const requests = readFileSync(join(dir, "requests.jsonl"), "utf8").trim();
    return { ...result, requests: requests ? requests.split("\n").map(JSON.parse) : [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("recheck reruns only the latest matching run across pages", () => {
  const result = execute([
    { workflow_runs: [run(43, "completed", { name: "CI" }), run(42), run(44, "completed", { event: "merge_group" })] },
    { workflow_runs: [run(41, "completed", { created_at: "2026-11-12T01:00:00Z" })] },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.requests, [["api", "--method", "POST", "repos/TogetherWeOwn/example/actions/runs/42/rerun", "--silent"]]);
  assert.ok(result.stdout.includes(url));
});

test("recheck does nothing without a matching run", () => {
  const result = execute([{ workflow_runs: [run(42, "completed", { name: "CI" })] }]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.requests, []);
});

test("recheck does not rerun an older completion while the latest run is active", () => {
  for (const status of ["queued", "in_progress", "waiting", "requested"]) {
    const result = execute([{ workflow_runs: [run(41), run(42, status)] }]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.requests, []);
  }
});

test("recheck surfaces listing and rerun API failures", () => {
  for (const options of [{ listFails: true }, { rerunFails: true }]) {
    const result = execute([{ workflow_runs: [run(42)] }], options);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes("Re-requested"));
  }
});
