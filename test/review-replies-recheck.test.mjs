import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:https";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/review-replies-recheck.yml", import.meta.url), "utf8");
const script = workflow.split("        run: |\n")[1].split("\n").map(line => line.slice(10)).join("\n");
const name = "PR standards (required entry point)";
const url = "https://github.com/TogetherWeOwn/example/actions/runs/42";
const run = (id, status = "completed", extra = {}) => ({
  id, name, status, event: "pull_request", html_url: url, run_attempt: 1,
  created_at: "2026-11-13T01:00:00Z", ...extra,
});

function execute(pages, { listFails = false, rerunFails = false, detailFails = false, details = [run(42)] } = {}) {
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
let input;
if (args.includes("repos/TogetherWeOwn/example/actions/runs/42")) {
  if (process.env.DETAIL_FAILS === "true") process.exit(1);
  fs.appendFileSync(process.env.REQUESTS, JSON.stringify(args) + "\\n");
  const details = JSON.parse(fs.readFileSync(process.env.DETAILS));
  const index = Number(fs.readFileSync(process.env.POLL_COUNT, "utf8"));
  input = JSON.stringify(details[Math.min(index, details.length - 1)]);
  fs.writeFileSync(process.env.POLL_COUNT, String(index + 1));
} else {
  if (process.env.LIST_FAILS === "true") process.exit(1);
  if (!args.includes("--paginate") || !args.includes("--slurp") ||
      !args.includes("repos/TogetherWeOwn/example/actions/runs?head_sha=abc1234&per_page=100")) process.exit(2);
  process.stdout.write(fs.readFileSync(process.env.PAGES));
  process.exit(0);
}
const result = spawnSync("jq", ["-r", args[args.indexOf("--jq") + 1]], {
  input, encoding: "utf8"
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status);
`, { mode: 0o755 });
    // Advance simulated API states without waiting ten real minutes.
    writeFileSync(join(dir, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(join(dir, "pages.json"), JSON.stringify(pages));
    writeFileSync(join(dir, "details.json"), JSON.stringify(details));
    writeFileSync(join(dir, "poll-count"), "0");
    writeFileSync(join(dir, "requests.jsonl"), "");
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8", timeout: 5000,
      env: {
        PATH: `${dir}:${process.env.PATH}`, REPO: "TogetherWeOwn/example", HEAD_SHA: "abc1234",
        PAGES: join(dir, "pages.json"), REQUESTS: join(dir, "requests.jsonl"),
        LIST_FAILS: String(listFails), RERUN_FAILS: String(rerunFails), DETAIL_FAILS: String(detailFails),
        DETAILS: join(dir, "details.json"), POLL_COUNT: join(dir, "poll-count"),
      },
    });
    assert.equal(result.error, undefined);
    const requests = readFileSync(join(dir, "requests.jsonl"), "utf8").trim();
    return { ...result, requests: requests ? requests.split("\n").map(JSON.parse) : [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("real gh paginates and reruns through the network boundary", async () => {
  const dir = mkdtempSync(join(tmpdir(), "review-recheck-tls-"));
  const key = join(dir, "key.pem"), cert = join(dir, "cert.pem");
  const generated = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", key, "-out", cert]);
  assert.equal(generated.status, 0, generated.stderr?.toString());
  const requests = [];
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") return res.end("{}");
    if (req.url.includes("/runs/42")) return res.end(JSON.stringify(run(42)));
    if (!req.url.includes("page=2")) {
      res.setHeader("Link", `<https://localhost:${server.address().port}${req.url}&page=2>; rel="next"`);
      return res.end(JSON.stringify({ workflow_runs: [run(41)] }));
    }
    return res.end(JSON.stringify({ workflow_runs: [run(42)] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("bash", ["-c", script], {
        env: { ...process.env, GH_HOST: `localhost:${server.address().port}`, GH_ENTERPRISE_TOKEN: "test-token",
          GH_TOKEN: "", SSL_CERT_FILE: cert, REPO: "TogetherWeOwn/example", HEAD_SHA: "abc1234", NO_PROXY: "localhost,127.0.0.1" },
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", data => stdout += data);
      child.stderr.on("data", data => stderr += data);
      child.on("error", reject);
      child.on("close", status => resolve({ status, stdout, stderr }));
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(requests.length, 4);
    assert.match(requests[1], /page=2/);
    assert.match(requests[3], /^POST .*\/runs\/42\/rerun$/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recheck reruns only the latest matching run across pages", () => {
  const result = execute([
    { workflow_runs: [run(43, "completed", { name: "CI" }), run(42), run(44, "completed", { event: "merge_group" })] },
    { workflow_runs: [run(41, "completed", { created_at: "2026-11-12T01:00:00Z" })] },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.requests.filter(args => args.includes("POST")),
    [["api", "--method", "POST", "repos/TogetherWeOwn/example/actions/runs/42/rerun", "--silent"]]);
  assert.ok(result.stdout.split(/\s+/).some(token => token === url), result.stdout);
});

test("recheck does nothing without a matching run", () => {
  const result = execute([{ workflow_runs: [run(42, "completed", { name: "CI" })] }]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.requests, []);
});

test("recheck waits for the latest active run to complete before rerunning it", () => {
  for (const status of ["queued", "in_progress", "waiting", "requested"]) {
    const result = execute([{ workflow_runs: [run(41), run(42, status)] }], {
      details: [run(42, status), run(42, "in_progress"), run(42)],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.requests.length, 4);
    assert.ok(result.requests.slice(0, 3).every(args => !args.includes("POST")));
    assert.deepEqual(result.requests[3],
      ["api", "--method", "POST", "repos/TogetherWeOwn/example/actions/runs/42/rerun", "--silent"]);
  }
});

test("recheck fails visibly if the latest run never completes within the polling window", () => {
  const result = execute([{ workflow_runs: [run(42, "in_progress")] }], {
    details: [run(42, "in_progress")],
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.requests.length, 60);
  assert.ok(result.requests.every(args => !args.includes("POST")));
  assert.match(result.stdout, /::error.*still active/);
});

test("recheck stops at the rerun cap with actionable recovery instructions", () => {
  for (const attempt of [50, 51]) {
    const result = execute([{ workflow_runs: [run(42)] }], {
      details: [run(42, "in_progress", { run_attempt: 49 }), run(42, "completed", { run_attempt: attempt })],
    });
    assert.notEqual(result.status, 0);
    assert.ok(result.requests.every(args => !args.includes("POST")));
    assert.match(result.stdout, /::error.*50/);
    assert.match(result.stdout, /push.*close and reopen/i);
  }
});

test("recheck still allows the attempt immediately below the rerun cap", () => {
  const result = execute([{ workflow_runs: [run(42)] }], {
    details: [run(42, "completed", { run_attempt: 49 })],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.requests.filter(args => args.includes("POST")).length, 1);
});

// The workflow uses the JS-compatible subset of Actions expressions here.
// Implement only its two built-ins, including Actions' case-insensitive contains.
function eligible(eventName, action, login, replyId, headRepo = "TogetherWeOwn/example") {
  const condition = workflow.match(/    if: >-\n((?:      [^\n]*\n)+)/)?.[1]
    ?? workflow.match(/    if: (.*)/)[1];
  return Function("github", "contains", "fromJSON", `return (${condition});`)(
    { repository: "TogetherWeOwn/example", event_name: eventName, event: {
      action, pull_request: { head: { repo: { full_name: headRepo } } },
      comment: { in_reply_to_id: replyId, user: { login } },
    } },
    (items, value) => items.some(item => item.toLowerCase() === value.toLowerCase()),
    JSON.parse,
  );
}

test("recheck excludes review-bot followups and edits but keeps new findings and author answers", () => {
  for (const login of ["devin-ai-integration[bot]", "sourcery-ai[bot]", "coderabbitai[bot]", "CodeRabbitAI[bot]"]) {
    assert.equal(eligible("pull_request_review_comment", "created", login, 123), false);
    assert.equal(eligible("pull_request_review_comment", "edited", login, undefined), false);
    assert.equal(eligible("pull_request_review_comment", "deleted", login, 123), false);
    assert.equal(eligible("pull_request_review_comment", "created", login, undefined), true);
    assert.equal(eligible("pull_request_review", "submitted", login, undefined), true);
  }
  assert.match(workflow, /pull_request_review_comment:\n    types: \[created, edited, deleted\]/);
  for (const action of ["created", "edited", "deleted"]) {
    assert.equal(eligible("pull_request_review_comment", action, "contributor", 123), true);
    assert.equal(eligible("pull_request_review_comment", action, "contributor", 123, "fork/example"), false);
  }
});

test("marking a draft ready schedules a recheck without another review event", () => {
  assert.match(workflow, /\n  pull_request:\n    types: \[ready_for_review\]/);
  assert.equal(eligible("pull_request", "ready_for_review", undefined, undefined), true);
  assert.equal(eligible("pull_request", "ready_for_review", undefined, undefined, "fork/example"), false);
});

test("skipped bot events cannot claim concurrency and cancel a waiting answer recheck", () => {
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.match(workflow, /    concurrency:\n      group: review-replies-recheck-/);
  assert.match(workflow, /      cancel-in-progress: true/);
});

test("recheck surfaces listing and rerun API failures", () => {
  for (const options of [{ listFails: true }, { detailFails: true }, { rerunFails: true }]) {
    const result = execute([{ workflow_runs: [run(42)] }], options);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes("Re-requested"));
  }
});
