const ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]);
const RUN_STATUSES = new Set(["queued", "scheduled_retry", "running", "succeeded", "interrupted", "failed", "cancelled", "timed_out"]);
const STATE_STATUSES = new Set(["idle", "pending", "changes_requested", "completed"]);
const INTERACTION_STATUSES = new Set(["pending", "accepted", "rejected", "answered", "cancelled", "expired", "failed"]);
const INVOKABLE = new Set(["active", "idle", "running", "error"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ISSUE_IDENTIFIER = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,9}$/;
export const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 20000;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const own = (value, key) => Object.hasOwn(value, key);
const list = value => Array.isArray(value) ? value : [];
const terminal = status => status === "done" || status === "cancelled";

export function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  // Date.parse normalizes invalid calendar days; do not accept those as evidence.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19) ? time : NaN;
}

function invalid() { throw new Error("invalid_snapshot"); }

export function parseSnapshot(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_BYTES) invalid();
  let snapshot;
  try { snapshot = JSON.parse(text); } catch { invalid(); }
  let nodes = 0;
  function bounded(value, depth) {
    if (++nodes > 500000 || depth > 32) invalid();
    if (object(value) || Array.isArray(value)) {
      for (const child of Object.values(value)) bounded(child, depth + 1);
    }
  }
  bounded(snapshot, 0);
  if (!object(snapshot) || !Array.isArray(snapshot.issues)) invalid();
  const keys = new Set(["capturedAt", "issues", "runs", "agents", "interactions", "pools"]);
  if (Object.keys(snapshot).some(key => !keys.has(key))) invalid();
  for (const key of ["issues", "runs", "agents", "interactions", "pools"]) {
    if (own(snapshot, key) && (!Array.isArray(snapshot[key]) || snapshot[key].length > MAX_ROWS || snapshot[key].some(row => !object(row)))) invalid();
  }
  return snapshot;
}

function groups(rows, caveats, kind) {
  const result = new Map();
  for (const row of rows) {
    if (!id(row.id)) { caveats[`invalid_${kind}_ids`]++; continue; }
    if (!result.has(row.id)) result.set(row.id, []);
    else caveats[`duplicate_${kind}_rows`]++;
    result.get(row.id).push(row);
  }
  return result;
}

// Compare only contract fields, never descriptions, adapter env or arbitrary payloads.
function signature(row, keys) {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  return JSON.stringify(keys.map(key => own(row, key) ? [key, canonical(row[key])] : [key]));
}

function pendingReviewer(issue) {
  const state = issue.executionState;
  const participant = state?.currentParticipant;
  return state?.status === "pending" && ["review", "approval"].includes(state.currentStageType) && id(state.currentStageId) &&
    ((participant?.type === "agent" && id(participant.agentId)) || (participant?.type === "user" && id(participant.userId)));
}

function monitorWait(issue, at) {
  const policy = issue.executionPolicy?.monitor;
  const state = issue.executionState?.monitor;
  const value = own(issue, "monitorNextCheckAt") ? issue.monitorNextCheckAt : policy?.nextCheckAt;
  const present = value != null || policy != null || state != null;
  if (!present) return null;
  const next = timestamp(value);
  const timeout = timestamp(policy?.timeoutAt ?? state?.timeoutAt);
  const max = policy?.maxAttempts ?? state?.maxAttempts;
  const attempts = issue.monitorAttemptCount ?? state?.attemptCount;
  const eligible = ["in_progress", "in_review"].includes(issue.status) && id(issue.assigneeAgentId) && issue.assigneeUserId === null &&
    Number.isFinite(next) && Number.isFinite(timeout) && timeout > at && Number.isSafeInteger(max) && max > 0 &&
    Number.isSafeInteger(attempts) && attempts >= 0 && attempts < max;
  return eligible ? (next > at ? "monitor_future" : "monitor_overdue") : "inert";
}

function hasBlocker(issue) {
  return list(issue.blockedBy).some(blocker => !object(blocker) || blocker.status !== "done") ||
    list(issue.blockedByIssueIds).length > 0 || issue.executionBlocker != null ||
    list(issue.blockerAttention?.pendingFinalizeBlockerIssueIds).length > 0 || issue.blockerAttention?.unresolvedBlockerCount > 0;
}

function clearBlockerAttention(value) {
  return value === null || (object(value) && value.state === "none" &&
    ["unresolvedBlockerCount", "coveredBlockerCount", "stalledBlockerCount", "attentionBlockerCount"].every(key => value[key] === 0) &&
    (value.pendingFinalizeBlockerIssueIds === undefined || (Array.isArray(value.pendingFinalizeBlockerIssueIds) && value.pendingFinalizeBlockerIssueIds.length === 0)));
}

function modelAgreesWithRoster(issue, model) {
  const overrides = issue.assigneeAdapterOverrides;
  if (overrides == null) return true;
  if (!object(overrides)) return false;
  const config = overrides.adapterConfig;
  return config == null || (object(config) && (!own(config, "model") || config.model === model));
}

function noWaitEvidence(issue) {
  return Array.isArray(issue.blockedBy) && issue.blockedBy.every(blocker => object(blocker) && blocker.status === "done") &&
    (issue.blockedByIssueIds === undefined || (Array.isArray(issue.blockedByIssueIds) && issue.blockedByIssueIds.length === 0)) &&
    issue.executionBlocker === null && clearBlockerAttention(issue.blockerAttention) && issue.scheduledRetry === null &&
    [issue.conversationState, issue.externalConversationState].every(value => value == null || value === "active") &&
    issue.activeRecoveryAction == null && issue.workspacePendingSelection == null && issue.blockedInboxAttention == null &&
    issue.archivedAt == null && issue.hiddenAt == null &&
    (issue.reviewAttention == null || (object(issue.reviewAttention) && issue.reviewAttention.state === "none" && Array.isArray(issue.reviewAttention.paths) && issue.reviewAttention.paths.length === 0)) &&
    issue.checkoutRunId === null && issue.executionRunId === null && issue.activeRun === null &&
    issue.monitorNextCheckAt === null &&
    (issue.executionPolicy === null || (object(issue.executionPolicy) && (issue.executionPolicy.mode === undefined || ["normal", "auto"].includes(issue.executionPolicy.mode)) && Array.isArray(issue.executionPolicy.stages) &&
      issue.executionPolicy.stages.every(stage => object(stage) && ["review", "approval"].includes(stage.type) && Array.isArray(stage.participants)) &&
      issue.executionPolicy.monitor == null)) &&
    (issue.executionState === null || (object(issue.executionState) && ["idle", "changes_requested", "completed"].includes(issue.executionState.status) &&
      issue.executionState.currentParticipant === null && issue.executionState.currentStageId === null && issue.executionState.monitor == null));
}

function invokable(agentId, companyId, agents) {
  if (!id(agentId)) return false;
  const seen = new Set();
  let current = agentId;
  let first = true;
  while (current != null) {
    if (!id(current) || seen.has(current) || seen.size >= 128) return false;
    seen.add(current);
    const rows = agents.get(current);
    if (!rows || rows.length !== 1) return false;
    const agent = rows[0];
    if (agent.companyId !== companyId || (first ? !INVOKABLE.has(agent.status) : !new Set([...INVOKABLE, "paused"]).has(agent.status))) return false;
    if (!own(agent, "reportsTo")) return false;
    current = agent.reportsTo;
    first = false;
  }
  return true;
}

function safeIdentifier(rows) {
  const identifiers = new Set(rows.map(row => row.identifier).filter(value => typeof value === "string" && ISSUE_IDENTIFIER.test(value)));
  if (identifiers.size === 1 && rows.every(row => row.identifier === [...identifiers][0])) return [...identifiers][0];
  return UUID.test(rows[0].id) ? rows[0].id.toLowerCase() : null;
}

/** Classify parsed JSON only. No I/O, clock, credentials, network or mutations. */
export function classify(snapshot, { at, pool = null } = {}) {
  const now = timestamp(at);
  if (!Number.isFinite(now) || (pool !== null && !id(pool))) throw new Error("invalid_options");
  // Keep the programmatic entrypoint under the same bounds and shape contract as the CLI.
  snapshot = parseSnapshot(JSON.stringify(snapshot));
  const caveats = Object.fromEntries([
    "missing_run_inventory", "missing_interaction_inventory", "missing_roster", "missing_capture_time", "stale_snapshot", "future_snapshot",
    "invalid_issue_ids", "invalid_run_ids", "invalid_agent_ids", "duplicate_issue_rows", "duplicate_run_rows", "duplicate_agent_rows",
    "conflicting_issue_rows", "conflicting_run_rows", "conflicting_agent_rows", "missing_run_objects", "unsupported_issue_states",
    "inert_monitors", "missing_wait_evidence", "unknown_agent_eligibility", "unknown_model_eligibility", "unknown_pool_eligibility", "redacted_issue_identifiers", "unknown_interactions",
  ].map(key => [key, 0]));
  if (!own(snapshot, "runs")) caveats.missing_run_inventory = 1;
  if (!own(snapshot, "interactions")) caveats.missing_interaction_inventory = 1;
  if (!own(snapshot, "agents")) caveats.missing_roster = 1;
  const captured = timestamp(snapshot.capturedAt);
  if (!Number.isFinite(captured)) caveats.missing_capture_time = 1;
  else if (captured > now) caveats.future_snapshot = 1;
  else if (now - captured > 15 * 60 * 1000) caveats.stale_snapshot = 1;
  const fresh = Number.isFinite(captured) && captured <= now && now - captured <= 15 * 60 * 1000;
  const issues = groups(snapshot.issues, caveats, "issue");
  const agents = groups(list(snapshot.agents), caveats, "agent");
  for (const [agentId, rows] of agents) {
    const keys = ["companyId", "status", "reportsTo", "adapterConfig"];
    if (new Set(rows.map(row => signature(row, keys))).size === 1) agents.set(agentId, [rows[0]]);
    else caveats.conflicting_agent_rows++;
  }
  const runRows = [...list(snapshot.runs)];
  const links = new Map();
  const badRunIssues = new Set();
  for (const [issueId, rows] of issues) {
    for (const issue of rows) {
      if (object(issue.activeRun) && id(issue.activeRun.id)) {
        runRows.push(issue.activeRun);
        if (!links.has(issue.activeRun.id)) links.set(issue.activeRun.id, new Set());
        links.get(issue.activeRun.id).add(issueId);
      } else if (issue.activeRun != null) badRunIssues.add(issueId);
      for (const key of ["executionRunId", "checkoutRunId"]) {
        if (id(issue[key])) {
          if (!links.has(issue[key])) links.set(issue[key], new Set());
          links.get(issue[key]).add(issueId);
        } else if (issue[key] != null) badRunIssues.add(issueId);
      }
    }
  }
  for (const row of runRows) {
    if (!id(row.id) && id(row.issueId)) badRunIssues.add(row.issueId);
  }
  const runs = groups(runRows, caveats, "run");
  const liveByIssue = new Map();
  const runCounts = { running: 0, queued: 0, scheduled_retry: 0, terminal: 0, unknown: caveats.invalid_run_ids };
  const solRunCounts = { running: 0, queued: 0, unknown_eligibility: 0 };
  for (const [runId, rows] of runs) {
    const statuses = new Set(rows.map(row => row.status));
    const owners = new Set(rows.map(row => row.agentId).filter(value => value != null));
    const companies = new Set(rows.map(row => row.companyId).filter(value => value != null));
    const issueIds = new Set([...(links.get(runId) ?? []), ...rows.map(row => row.issueId).filter(value => value != null)]);
    const conflict = statuses.size !== 1 || owners.size > 1 || companies.size > 1 || issueIds.size > 1 || [...issueIds].some(value => !id(value));
    const status = rows[0].status;
    if (conflict || !RUN_STATUSES.has(status)) {
      runCounts.unknown++;
      if (conflict) caveats.conflicting_run_rows++;
      for (const issueId of issueIds) badRunIssues.add(issueId);
      continue;
    }
    const category = ["running", "queued", "scheduled_retry"].includes(status) ? status : "terminal";
    runCounts[category]++;
    for (const issueId of issueIds) {
      if (!liveByIssue.has(issueId)) liveByIssue.set(issueId, new Set());
      if (category !== "terminal") liveByIssue.get(issueId).add(category);
    }
    if (["running", "queued"].includes(category)) {
      const agentId = [...owners][0];
      const companyId = [...companies][0] ?? issues.get([...issueIds][0])?.[0].companyId;
      if (!id(companyId) || !invokable(agentId, companyId, agents)) solRunCounts.unknown_eligibility++;
      else {
        const model = agents.get(agentId)[0].adapterConfig?.model;
        const matching = typeof model === "string" && model && issueIds.size > 0 &&
          [...issueIds].every(issueId => issues.has(issueId) && issues.get(issueId).every(issue => modelAgreesWithRoster(issue, model)));
        if (!matching) solRunCounts.unknown_eligibility++;
        else if (model === "gpt-6.1-sol") solRunCounts[category]++;
      }
    }
  }
  for (const [runId, issueIds] of links) {
    if (!runs.has(runId)) {
      caveats.missing_run_objects++;
      for (const issueId of issueIds) badRunIssues.add(issueId);
    }
  }
  const names = ["running", "queued", "assigned_actionable_candidates", "pending_stage_reviewers", "monitor_future", "monitor_overdue",
    "unresolved_blockers", "pending_interactions", "pending_human_interactions", "pending_agent_interactions", "parked_backlog", "terminal", "unknown"];
  const buckets = Object.fromEntries(names.map(name => [name, new Set()]));
  const solCandidates = new Set();
  const poolCandidates = new Set();
  const pending = new Map();
  let interactionEvidence = Array.isArray(snapshot.interactions);
  for (const interaction of list(snapshot.interactions)) {
    if (!id(interaction.id) || !id(interaction.issueId) || !INTERACTION_STATUSES.has(interaction.status)) {
      caveats.unknown_interactions++;
      interactionEvidence = false;
      continue;
    }
    if (interaction.status !== "pending") continue;
    if (!pending.has(interaction.issueId)) pending.set(interaction.issueId, new Set());
    const policy = interaction.effectiveResolverPolicy ?? interaction.resolverPolicy;
    pending.get(interaction.issueId).add(id(interaction.addresseeAgentId) ? "pending_agent_interactions" :
      (id(interaction.addresseeUserId) || policy === "human_only" ? "pending_human_interactions" : "unknown"));
  }
  const issueKeys = ["companyId", "status", "assigneeAgentId", "assigneeUserId", "checkoutRunId", "executionRunId", "activeRun", "executionPolicy",
    "executionState", "monitorNextCheckAt", "monitorAttemptCount", "blockedBy", "blockedByIssueIds", "executionBlocker", "blockerAttention", "scheduledRetry",
    "conversationState", "externalConversationState", "activeRecoveryAction", "workspacePendingSelection", "reviewAttention", "blockedInboxAttention", "archivedAt", "hiddenAt", "assigneeAdapterOverrides"];
  for (const [issueId, rows] of issues) {
    const add = name => buckets[name].add(issueId);
    const conflict = new Set(rows.map(row => signature(row, issueKeys))).size > 1;
    if (conflict) { caveats.conflicting_issue_rows++; add("unknown"); }
    let waiting = false;
    let review = false;
    let unsupported = false;
    for (const issue of rows) {
      if (!ISSUE_STATUSES.has(issue.status) || (issue.executionState != null && (!object(issue.executionState) || !STATE_STATUSES.has(issue.executionState.status)))) unsupported = true;
      if (pendingReviewer(issue)) { add("pending_stage_reviewers"); review = true; waiting = true; }
      else if (issue.executionState?.status === "pending") { add("unknown"); waiting = true; }
      if (hasBlocker(issue)) { add("unresolved_blockers"); waiting = true; }
      const monitor = monitorWait(issue, now);
      if (monitor) {
        waiting = true;
        if (monitor === "inert") { caveats.inert_monitors++; add("unknown"); }
        else add(monitor);
      }
      if (issue.scheduledRetry != null) { waiting = true; add("unknown"); }
    }
    for (const category of pending.get(issueId) ?? []) { add("pending_interactions"); add(category); waiting = true; }
    for (const status of liveByIssue.get(issueId) ?? []) {
      if (status === "scheduled_retry") { waiting = true; add("unknown"); }
      else add(status);
    }
    const issue = rows[0];
    if (badRunIssues.has(issueId)) add("unknown");
    if (unsupported) { caveats.unsupported_issue_states++; add("unknown"); }
    // Pending review survives terminal/status drift; all other buckets are observations, not a partition.
    if (!review && rows.every(row => terminal(row.status))) { add("terminal"); continue; }
    if (rows.every(row => row.status === "backlog")) { add("parked_backlog"); continue; }
    if (waiting || liveByIssue.get(issueId)?.size || conflict || unsupported || badRunIssues.has(issueId)) continue;
    const eligible = id(issue.companyId) && invokable(issue.assigneeAgentId, issue.companyId, agents);
    if (!eligible) caveats.unknown_agent_eligibility++;
    const evidence = rows.every(noWaitEvidence) && interactionEvidence && Array.isArray(snapshot.runs);
    if (!evidence) caveats.missing_wait_evidence++;
    if (!["todo", "in_progress"].includes(issue.status) || issue.assigneeUserId !== null || !eligible || !evidence || !fresh) { add("unknown"); continue; }
    add("assigned_actionable_candidates");
    const model = agents.get(issue.assigneeAgentId)[0].adapterConfig?.model;
    if (typeof model !== "string" || !model || !rows.every(row => modelAgreesWithRoster(row, model))) caveats.unknown_model_eligibility++;
    else if (model === "gpt-6.1-sol") solCandidates.add(issueId);
    if (pool !== null) {
      const matching = list(snapshot.pools).filter(row => row.id === pool);
      if (matching.length !== 1 || !Array.isArray(matching[0].agentIds) || !matching[0].agentIds.every(id)) caveats.unknown_pool_eligibility++;
      else if (matching[0].agentIds.includes(issue.assigneeAgentId)) poolCandidates.add(issueId);
    }
  }
  function summary(values) {
    const identifiers = [...values].map(issueId => issues.has(issueId) ? safeIdentifier(issues.get(issueId)) : (UUID.test(issueId) ? issueId.toLowerCase() : null));
    return { count: values.size, issueIdentifiers: [...new Set(identifiers.filter(Boolean))].sort() };
  }
  // Runs may refer to issues outside a partial issue export; retain their count and only safe IDs.
  for (const [issueId, statuses] of liveByIssue) {
    if (!issues.has(issueId)) for (const status of statuses) {
      buckets[status === "scheduled_retry" ? "unknown" : status].add(issueId);
      buckets.unknown.add(issueId);
    }
  }
  for (const issueId of badRunIssues) if (id(issueId)) buckets.unknown.add(issueId);
  for (const [issueId, categories] of pending) {
    if (!issues.has(issueId)) {
      buckets.pending_interactions.add(issueId);
      for (const category of categories) buckets[category].add(issueId);
      buckets.unknown.add(issueId);
      caveats.unknown_interactions++;
    }
  }
  for (const rows of issues.values()) if (!safeIdentifier(rows)) caveats.redacted_issue_identifiers++;
  return {
    version: 1,
    runs: runCounts,
    issues: Object.fromEntries(names.map(name => [name, { ...summary(buckets[name]), count: buckets[name].size + (name === "unknown" ? caveats.invalid_issue_ids : 0) }])),
    solOnly: { runs: solRunCounts, assignedActionableCandidates: summary(solCandidates) },
    requestedPool: { assignedActionableCandidates: summary(poolCandidates) },
    caveats,
  };
}
