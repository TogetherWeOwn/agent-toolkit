import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { classify, MAX_BYTES, parseSnapshot, timestamp } from "../src/classify.mjs";

const at = "2026-11-04T12:00:00Z";
const fixture = JSON.parse(readFileSync(new URL("../fixtures/example.json", import.meta.url), "utf8"));
const cli = new URL("../src/cli.mjs", import.meta.url).pathname;
function snapshot(patch = {}) {
  return structuredClone({ capturedAt: at, issues: [fixture.issues[3]], runs: [], agents: fixture.agents, interactions: [], ...patch });
}
function run(value = snapshot(), options = {}) { return classify(value, { at, ...options }); }
function candidate(patch = {}) { return { ...structuredClone(fixture.issues[3]), ...patch }; }
function count(report, bucket) { return report.issues[bucket].count; }
function invoke(input, args = ["--input", "-", "--at", at]) {
  return spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } });
}

const expected = {
  running: ["DEMO-1"], queued: ["DEMO-2"], assigned_actionable_candidates: ["DEMO-3", "DEMO-4"], pending_stage_reviewers: ["DEMO-5"],
  monitor_future: ["DEMO-6"], monitor_overdue: ["DEMO-7"], unresolved_blockers: ["DEMO-8"], pending_human_interactions: ["DEMO-9"],
  pending_interactions: ["DEMO-10", "DEMO-9"], pending_agent_interactions: ["DEMO-10"], parked_backlog: ["DEMO-11"], terminal: ["DEMO-12"], unknown: ["DEMO-13", "DEMO-14", "DEMO-15", "DEMO-8"],
};
for (const [bucket, identifiers] of Object.entries(expected)) {
  test(`synthetic category ${bucket}`, () => {
    const report = run(fixture);
    assert.deepEqual(report.issues[bucket], { count: identifiers.length, issueIdentifiers: identifiers });
  });
}

test("running, queued and scheduled retries are distinct deduplicated evidence", () => {
  const report = run(fixture);
  assert.deepEqual(report.runs, { running: 1, queued: 1, scheduled_retry: 1, terminal: 0, unknown: 0 });
  assert.equal(report.solOnly.runs.running, 1);
  assert.equal(report.solOnly.runs.queued, 0);
  assert.equal(report.solOnly.assignedActionableCandidates.count, 1);
  assert.equal(report.caveats.missing_run_objects, 1);
  assert.equal(report.caveats.inert_monitors, 1);
  assert.equal(report.caveats.duplicate_issue_rows, 1);
  assert.ok(report.caveats.duplicate_run_rows >= 2);
});

test("overlapping running review, monitor and interaction buckets are not additive", () => {
  const issue = { ...fixture.issues[5], ...fixture.issues[6], id: "overlap", identifier: "DEMO-50", status: "in_review" };
  const report = run(snapshot({ issues: [issue, issue], runs: [{ id: "overlap-run", status: "running", issueId: issue.id }],
    interactions: [{ id: "question", issueId: issue.id, status: "pending", effectiveResolverPolicy: "human_only" }] }));
  for (const bucket of ["running", "pending_stage_reviewers", "monitor_future", "pending_human_interactions"]) assert.equal(count(report, bucket), 1);
  assert.equal(count(report, "assigned_actionable_candidates"), 0);
});

for (const status of ["todo", "in_progress", "done", "blocked", "cancelled"]) {
  test(`pending review overrides status drift ${status}`, () => {
    const report = run(snapshot({ issues: [{ ...fixture.issues[5], status }] }));
    assert.equal(count(report, "pending_stage_reviewers"), 1);
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
    assert.equal(count(report, "terminal"), 0);
  });
}

test("configured future stages are not pending reviewers or a present wait", () => {
  const issue = candidate({ executionPolicy: { stages: [{ id: "future-stage", type: "review", participants: [{ type: "agent", agentId: "agent-other" }] }] } });
  const report = run(snapshot({ issues: [issue] }));
  assert.equal(count(report, "pending_stage_reviewers"), 0);
  assert.equal(count(report, "assigned_actionable_candidates"), 1);
});

test("pending participant, not returnAssignee or all configured participants, defines review", () => {
  const issue = candidate({ executionState: { status: "pending", currentStageId: "stage", currentStageType: "approval", currentParticipant: { type: "user", userId: "review-user" } } });
  assert.equal(count(run(snapshot({ issues: [issue] })), "pending_stage_reviewers"), 1);
  issue.executionState.currentParticipant = null;
  const report = run(snapshot({ issues: [issue] }));
  assert.equal(count(report, "pending_stage_reviewers"), 0);
  assert.equal(count(report, "unknown"), 1);
});

for (const field of ["blockedBy", "blockerAttention", "executionBlocker", "scheduledRetry", "checkoutRunId", "executionRunId", "activeRun", "monitorNextCheckAt", "executionState", "executionPolicy"]) {
  test(`candidate requires explicit negative wait evidence: ${field}`, () => {
    const issue = candidate();
    delete issue[field];
    const report = run(snapshot({ issues: [issue] }));
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
    assert.equal(count(report, "unknown"), 1);
  });
}

for (const [name, patch] of [
  ["unsupported issue status", { status: "ready" }], ["unsupported execution state", { executionState: { status: "ready" } }],
  ["blocked without concrete edge", { status: "blocked" }], ["unrouted review", { status: "in_review" }],
  ["dependency", { blockedBy: [{ id: "blocker", status: "todo" }] }], ["cancelled dependency", { blockedBy: [{ id: "blocker", status: "cancelled" }] }],
  ["pending finalize", { blockerAttention: { pendingFinalizeBlockerIssueIds: ["blocker"] } }],
  ["retry", { scheduledRetry: { runId: "later" } }], ["missing run object", { executionRunId: "absent" }],
]) {
  test(`does not promote ${name} to useful work`, () => {
    assert.equal(count(run(snapshot({ issues: [candidate(patch)] })), "assigned_actionable_candidates"), 0);
  });
}

test("a resolved dependency is not an unresolved blocker", () => {
  const report = run(snapshot({ issues: [candidate({ blockedBy: [{ id: "resolved", status: "done" }] })] }));
  assert.equal(count(report, "unresolved_blockers"), 0);
  assert.equal(count(report, "assigned_actionable_candidates"), 1);
});

for (const [name, patch] of [
  ["expired timeout", { executionPolicy: { monitor: { timeoutAt: "2026-11-04T11:59:00Z", maxAttempts: 4 } } }],
  ["exhausted attempts", { monitorAttemptCount: 4 }], ["user assignment", { assigneeUserId: "user" }],
  ["no assignee", { assigneeAgentId: null }], ["invalid date", { monitorNextCheckAt: "not-a-date" }],
  ["top-level cleared schedule", { monitorNextCheckAt: null }], ["parked", { status: "backlog" }], ["blocked", { status: "blocked" }],
]) {
  test(`inert monitor: ${name}`, () => {
    const issue = { ...candidate(), ...structuredClone(fixture.issues[6]), ...patch };
    const report = run(snapshot({ issues: [issue] }));
    assert.equal(count(report, "monitor_future"), 0);
    assert.equal(count(report, "monitor_overdue"), 0);
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
    assert.equal(report.caveats.inert_monitors, 1);
  });
}

test("monitor field-specific fallback and overdue boundary", () => {
  const issue = { ...candidate(), ...structuredClone(fixture.issues[6]) };
  delete issue.monitorNextCheckAt;
  delete issue.monitorAttemptCount;
  issue.executionPolicy.monitor.nextCheckAt = at;
  issue.executionState = { status: "idle", monitor: { attemptCount: 1, maxAttempts: 1, timeoutAt: "2026-11-04T11:00:00Z" } };
  const report = run(snapshot({ issues: [issue] }));
  assert.equal(count(report, "monitor_overdue"), 1);
  assert.equal(count(report, "assigned_actionable_candidates"), 0);
});

test("effective interaction restrictions and open audience never become candidate supply", () => {
  const issue = candidate();
  for (const interaction of [
    { effectiveResolverPolicy: "human_only", resolverPolicy: "anyone" },
    { addresseeAgentId: "agent-other" },
    { effectiveResolverPolicy: "anyone" },
  ]) {
    const report = run(snapshot({ interactions: [{ id: "ask", issueId: issue.id, status: "pending", ...interaction }] }));
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
  }
  assert.equal(count(run(snapshot({ interactions: [{ id: "ask", issueId: issue.id, status: "answered" }] })), "assigned_actionable_candidates"), 1);
});

for (const key of ["runs", "agents", "interactions", "capturedAt"]) {
  test(`absent inventory ${key} fails closed`, () => {
    const value = snapshot();
    delete value[key];
    const report = run(value);
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
    assert.equal(count(report, "unknown"), 1);
    assert.equal(report.solOnly.assignedActionableCandidates.count, 0);
  });
}

for (const capturedAt of ["2026-11-04T11:44:59Z", "2026-11-04T12:00:01Z", "garbage"]) {
  test(`stale, future or invalid capture time ${capturedAt}`, () => {
    const report = run(snapshot({ capturedAt }));
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
    assert.equal(count(report, "unknown"), 1);
  });
}

test("duplicates dedupe without ordering dependence and conflicting issues cannot be candidates", () => {
  const issue = candidate();
  let report = run(snapshot({ issues: [issue, { ...issue, description: "ignored" }] }));
  assert.equal(count(report, "assigned_actionable_candidates"), 1);
  const rows = [issue, { ...issue, status: "blocked", blockedBy: [{ id: "dep", status: "todo" }] }];
  report = run(snapshot({ issues: rows }));
  assert.equal(count(report, "assigned_actionable_candidates"), 0);
  assert.equal(count(report, "unresolved_blockers"), 1);
  assert.equal(count(report, "unknown"), 1);
  assert.deepEqual(report, run(snapshot({ issues: rows.toReversed() })));
});

for (const changed of [{ status: "queued" }, { agentId: "agent-other" }, { issueId: "foreign-issue" }, { companyId: "other-company" }]) {
  test(`conflicting duplicate runs fail unknown: ${Object.keys(changed)[0]}`, () => {
    const row = fixture.runs[0];
    const report = run(snapshot({ issues: [], runs: [row, { ...row, ...changed }] }));
    assert.equal(report.runs.running, 0);
    assert.equal(report.runs.queued, 0);
    assert.equal(report.runs.unknown, 1);
  });
}

test("run without an issue row retains counts, not invented issue content", () => {
  const report = run(snapshot({ issues: [], runs: [fixture.runs[0]] }));
  assert.equal(report.runs.running, 1);
  assert.equal(count(report, "running"), 1);
  assert.equal(count(report, "unknown"), 1);
  assert.deepEqual(report.issues.running.issueIdentifiers, []);
});

for (const [name, change] of [
  ["paused", agent => { agent.status = "paused"; }], ["unknown status", agent => { agent.status = "ready"; }],
  ["missing manager", agent => { agent.reportsTo = "absent"; }], ["cycle", agent => { agent.reportsTo = agent.id; }],
  ["cross company", agent => { agent.companyId = "other-company"; }], ["absent reporting evidence", agent => { delete agent.reportsTo; }],
]) {
  test(`roster eligibility refuses ${name}`, () => {
    const value = snapshot();
    change(value.agents[0]);
    assert.equal(count(run(value), "assigned_actionable_candidates"), 0);
  });
}

test("duplicate consistent roster is fine; conflicting roster and missing model fail Sol eligibility", () => {
  const value = snapshot();
  value.agents.push(structuredClone(value.agents[0]));
  assert.equal(run(value).solOnly.assignedActionableCandidates.count, 1);
  value.agents.at(-1).status = "paused";
  assert.equal(run(value).solOnly.assignedActionableCandidates.count, 0);
  value.agents = [value.agents[0]];
  delete value.agents[0].adapterConfig.model;
  assert.equal(run(value).solOnly.assignedActionableCandidates.count, 0);
});

test("explicit pool evidence only, independently from the Sol subtotal", () => {
  let report = run(fixture, { pool: "demo-pool" });
  assert.equal(report.requestedPool.assignedActionableCandidates.count, 1);
  report = run(fixture, { pool: "unlisted-pool" });
  assert.equal(report.requestedPool.assignedActionableCandidates.count, 0);
  assert.equal(report.caveats.unknown_pool_eligibility, 2);
  assert.equal(report.solOnly.assignedActionableCandidates.count, 1);
});

for (const text of ["{", "null", "[]", "1", '{"issues":null}', '{"issues":[null]}', '{"issues":[],"runs":{}}', '{"issues":[],"unknown":true}', JSON.stringify({ issues: Array(20001).fill({}) }), JSON.stringify({ issues: [], runs: [], agents: [], interactions: [], capturedAt: "x", pools: "x" })]) {
  test(`malformed snapshot is refused without reflection: ${text.length} bytes`, () => {
    assert.throws(() => parseSnapshot(text), /^Error: invalid_snapshot$/);
  });
}

test("size and nesting limits are enforced", () => {
  assert.throws(() => parseSnapshot(" ".repeat(MAX_BYTES + 1)), /invalid_snapshot/);
  let nested = {};
  for (let index = 0; index < 33; index++) nested = { nested };
  assert.throws(() => parseSnapshot(JSON.stringify({ issues: [nested] })), /invalid_snapshot/);
});

test("calendar dates, strict UTC and control-character identifiers", () => {
  for (const value of ["2026-02-30T12:00:00Z", "2026-11-04", `${at}\n`, "2026-11-04T12:00:00+00:00"]) assert.ok(Number.isNaN(timestamp(value)));
  const report = run(snapshot({ issues: [candidate({ identifier: "DEMO-3\n" })] }));
  assert.deepEqual(report.issues.assigned_actionable_candidates.issueIdentifiers, []);
  assert.equal(report.caveats.redacted_issue_identifiers, 1);
});

test("unidentifiable issue evidence is counted as unknown", () => {
  const report = run(snapshot({ issues: [candidate({ id: "/private/input" })] }));
  assert.equal(count(report, "assigned_actionable_candidates"), 0);
  assert.equal(count(report, "unknown"), 1);
  assert.equal(report.caveats.invalid_issue_ids, 1);
});

test("fixed output projection redacts arbitrary fields, descriptions, env, paths and exceptions", () => {
  const canary = `synthetic-private-${crypto.randomUUID()}`;
  const value = snapshot();
  value.issues[0].description = canary;
  value.issues[0].title = canary;
  value.issues[0].path = `/private/${canary}`;
  value.agents[0].adapterConfig.env = { TOKEN: canary };
  value.interactions = [{ id: "resolved", issueId: value.issues[0].id, status: "answered", payload: { body: canary } }];
  const result = invoke(JSON.stringify(value));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(!result.stdout.includes(canary));
  assert.ok(!result.stdout.includes("adapterConfig"));
  assert.ok(!result.stdout.includes("agent-sol"));
  const failure = invoke(`{"issues":${canary}}`);
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, "");
  assert.deepEqual(JSON.parse(failure.stderr), { error: "invalid_snapshot" });
  const missing = invoke("", ["--input", `/private/${canary}`, "--at", at]);
  assert.equal(missing.status, 1);
  assert.ok(!missing.stderr.includes(canary));
});

test("CLI file and stdin reports agree and unsupported options are refused", () => {
  const directory = mkdtempSync(join(tmpdir(), "work-supply-"));
  try {
    const file = join(directory, "snapshot.json");
    const input = JSON.stringify(fixture);
    writeFileSync(file, input);
    const fromFile = invoke("", ["--input", file, "--at", at]);
    const fromStdin = invoke(input);
    assert.equal(fromFile.status, 0, fromFile.stderr);
    assert.equal(fromStdin.status, 0, fromStdin.stderr);
    assert.deepEqual(JSON.parse(fromFile.stdout), JSON.parse(fromStdin.stdout));
    for (const args of [[], ["--help", "extra"], ["--input", file, "--at", at, "--input", file], ["--input", file, "--at", at, "--url", "https://example.invalid"], ["--input", directory, "--at", at]]) {
      const result = invoke("", args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^\{"error":"invalid_(options|snapshot)"\}\n$/);
    }
    assert.match(invoke("", ["--help"]).stdout, /^Usage:/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("freshness boundary and UUID-only fallback retain safe evidence", () => {
  const value = snapshot({ capturedAt: "2026-11-04T11:45:00Z", issues: [candidate({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", identifier: "unsafe/private/value" })] });
  const report = run(value);
  assert.deepEqual(report.issues.assigned_actionable_candidates.issueIdentifiers, ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
  assert.equal(report.caveats.stale_snapshot, 0);
});

test("malformed interaction evidence cannot silently enable candidates", () => {
  const report = run(snapshot({ interactions: [{ id: "question", issueId: "issue", status: "future-status" }] }));
  assert.equal(count(report, "assigned_actionable_candidates"), 0);
  assert.equal(report.caveats.unknown_interactions, 1);
});

test("roster ancestry is bounded and a paused ancestor is not a paused assignee", () => {
  const value = snapshot();
  value.agents[0].reportsTo = "manager";
  value.agents.push({ id: "manager", companyId: "demo-company", status: "paused", reportsTo: null });
  assert.equal(count(run(value), "assigned_actionable_candidates"), 1);
  value.agents[0].reportsTo = "manager-0";
  for (let index = 0; index < 128; index++) value.agents.push({ id: `manager-${index}`, companyId: "demo-company", status: "idle", reportsTo: index === 127 ? null : `manager-${index + 1}` });
  assert.equal(count(run(value), "assigned_actionable_candidates"), 0);
});

test("CLI refuses non-UTF8, oversized streams and nonregular files", () => {
  for (const input of [Buffer.from([0xff, 0xfe]), " ".repeat(MAX_BYTES + 1)]) {
    const result = invoke(input);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stderr), { error: "invalid_snapshot" });
    assert.equal(result.stdout, "");
  }
  if (process.platform !== "win32") {
    const directory = mkdtempSync(join(tmpdir(), "work-supply-fifo-"));
    try {
      const pipe = join(directory, "pipe");
      const made = spawnSync("mkfifo", [pipe], { encoding: "utf8", timeout: 5000 });
      assert.equal(made.status, 0, made.stderr);
      const result = invoke("", ["--input", pipe, "--at", at]);
      assert.equal(result.status, 1);
      assert.deepEqual(JSON.parse(result.stderr), { error: "invalid_snapshot" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});

for (const patch of [
  { conversationState: "waiting" }, { externalConversationState: "waiting" },
  { reviewAttention: { state: "covered", paths: [{ kind: "external_response" }] } },
  { activeRecoveryAction: { status: "open" } }, { workspacePendingSelection: { kind: "pending" } },
  { archivedAt: at }, { hiddenAt: at }, { executionPolicy: { mode: "unsupported", stages: [] } },
]) {
  test(`native external/recovery/unsupported wait is never actionable: ${Object.keys(patch)[0]}`, () => {
    const report = run(snapshot({ issues: [candidate(patch)] }));
    assert.equal(count(report, "assigned_actionable_candidates"), 0);
  });
}

test("native zero blocker/review projections are evidence, positive blocker attention is a blocker", () => {
  const issue = candidate({ blockerAttention: { state: "none", unresolvedBlockerCount: 0, coveredBlockerCount: 0, stalledBlockerCount: 0, attentionBlockerCount: 0 },
    reviewAttention: { state: "none", paths: [] } });
  assert.equal(count(run(snapshot({ issues: [issue] })), "assigned_actionable_candidates"), 1);
  issue.blockerAttention.unresolvedBlockerCount = 1;
  const report = run(snapshot({ issues: [issue] }));
  assert.equal(count(report, "unresolved_blockers"), 1);
  assert.equal(count(report, "assigned_actionable_candidates"), 0);
});

test("known non-Sol per-issue overrides cannot enter the roster-Sol subtotal", () => {
  const issue = candidate({ assigneeAdapterOverrides: { adapterConfig: { model: "other-model" } } });
  const report = run(snapshot({ issues: [issue] }));
  assert.equal(count(report, "assigned_actionable_candidates"), 1);
  assert.equal(report.solOnly.assignedActionableCandidates.count, 0);
  assert.equal(report.caveats.unknown_model_eligibility, 1);
  const running = run(snapshot({ issues: [{ ...issue, executionRunId: "overridden-run" }], runs: [{ id: "overridden-run", issueId: issue.id, agentId: "agent-sol", companyId: "demo-company", status: "running" }] }));
  assert.equal(running.solOnly.runs.running, 0);
  assert.equal(running.solOnly.runs.unknown_eligibility, 1);
});

test("classification is pure and does not read a live provider", () => {
  const input = snapshot();
  const before = structuredClone(input);
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("outbound request forbidden"); };
  try { assert.deepEqual(run(input), run(input)); }
  finally { globalThis.fetch = previous; }
  assert.deepEqual(input, before);
});
