# Offline work-supply report

A private, credential-free Node 24 command for **operator-supplied exports**, not a dashboard, scheduler, API client or installed plugin. It changes nothing and measures no provider usage or quota. Only the operator can supply quota samples.

From the repository root:

```sh
npm run --silent work-supply -- \
  --input packages/work-supply/fixtures/example.json \
  --at 2026-11-04T12:00:00Z --pool demo-pool

# stdin, with the same JSON envelope:
node packages/work-supply/src/cli.mjs --input - --at 2026-11-04T12:00:00Z < snapshot.json
```

`--at` is required: classification is deterministic, including monitor deadlines and snapshot age. Use `--silent` when invoking npm so stdout contains only the report JSON. Failures return exit 1 and a fixed `invalid_options` or `invalid_snapshot` JSON error on stderr, never a path or parser diagnostic. `--help` prints fixed usage. No other options or positional arguments are supported.

## Input contract

One JSON object combines native rows **without rewriting their fields**:

```json
{
  "capturedAt": "2026-11-04T12:00:00Z",
  "issues": [],
  "runs": [],
  "agents": [],
  "interactions": [],
  "pools": [{"id": "demo-pool", "agentIds": ["agent-sol"]}]
}
```

`capturedAt` is the operator's export time, not an issue's last-update time. The native arrays must represent complete inventories for the selected scope; `[]` asserts a known empty inventory, omission means absent evidence. The classifier cannot detect a falsely labelled complete or fresh export. Pagination, consistency across capture requests and scope selection remain the operator's responsibility. Never assemble a fresh wrapper around stale exports.

Only `issues` is mandatory for parsing. Missing runs, roster, interactions or capture time prevent candidate classification. An issues-only index export commonly lacks `activeRun` enrichment: **missing is not null** and will not become actionable supply. Additional native row fields are ignored and never projected. Unknown envelope keys, non-object rows, invalid JSON/UTF-8 and exceeded input bounds are refused. Unsupported state enums go to unknown rather than useful capacity.

Candidate evidence is intentionally strict. A row needs:

- `todo` or `in_progress`, a single agent assignee, `assigneeUserId: null`, an invokable same-company roster/reporting chain;
- explicit `checkoutRunId`, `executionRunId`, `activeRun`, `executionBlocker`, `scheduledRetry` and `monitorNextCheckAt` all null; `blockerAttention` must be null or a native `none` projection with all four blocker counters zero and no pending-finalize IDs;
- `blockedBy: []`, or only dependencies explicitly `done`; cancelled dependencies are unresolved;
- explicit `executionPolicy` and `executionState`: null or a supported inactive state, with no current participant/stage or configured monitor. Future configured review/approval stages are not themselves pending reviews;
- complete run and interaction inventories, no associated running/queued/retry evidence, and no pending interaction; no known waiting conversation, review-attention path, recovery action, workspace selection, blocked-inbox attention, archive or hidden state;
- a valid capture time no more than 15 minutes before `--at`, not in the future.

A dependency ID list without complete resolved evidence is a wait. Pending-finalize blocker attention is also a blocker. Configured/triggered/expired monitors are never interpreted as new useful work; when their eligibility cannot be proved they remain unknown with an `inert_monitors` caveat.

## Reading the result

The synthetic example reports **1 running run/issue, 1 explicitly queued run/issue, 2 actionable candidates (1 Sol-only), 1 pending-stage reviewer issue, 1 future monitor, 1 overdue monitor, 1 unresolved-blocker issue, 2 pending-interaction issues (1 human, 1 agent), 1 backlog issue, 1 terminal issue and 4 unknown issues**. One separate scheduled-retry run is **not queued**. The blocked issue's monitor is inert. The absent referenced run is not running. Repeated run and issue rows do not inflate unique counts.

- `runs` counts unique run IDs, including terminal, scheduled-retry and unknown runs. `issues` counts unique issue IDs in each observation bucket, not runs. **Buckets overlap and must not be summed:** a reviewer can have a running execution and an eligible monitor while also waiting on an interaction. Candidates never overlap known execution/wait buckets.
- A pending review/approval uses `executionState.status: "pending"`, its current stage type and `currentParticipant`, not all configured reviewers or `returnAssignee`. It survives issue-status drift, even a terminal status. It is not ordinary executor supply.
- Running/queued counts are **observations in the supplied snapshot**, not proof of current execution. Stale/missing capture caveats apply to all observations and suppress candidates. A candidate is not a confirmed run, idle slot, dispatch promise, useful-throughput measurement or quota measurement.
- Monitors need an agent-only assignment, `in_progress`/`in_review`, valid scheduling/timeout evidence and remaining attempts. An eligible overdue unconsumed monitor is still a wait, never a candidate. Top-level `monitorNextCheckAt` (including explicit null) wins over policy scheduling; policy timeout/max attempts win over state; top-level attempt count wins over state.
- Pending interactions are conservatively waits, not declarations that a human is presently blocked. Historical unanswered questions may be obsolete. `effectiveResolverPolicy` wins over the legacy resolver policy. Open/ambiguous audiences also appear in unknown; the generic pending-interactions bucket retains them.
- Native roster invokability is not free capacity: `active`, `idle`, `running`, `error` are supported, paused agents are excluded, invalid/cross-company/cyclic/terminated reporting chains are excluded. Paused ancestors are allowed, matching native eligibility. Reporting chains longer than 128 fail closed.
- `solOnly` uses the supplied roster's exact `adapterConfig.model === "gpt-6.1-sol"`; no adapter/env inference, provider calls or model reassignment. Missing model evidence and per-issue model overrides that disagree with the roster are caveated and excluded, not used to move the model. Sol run counts also require linked issue evidence; these are roster-associated observations, not a measurement of the effective provider/model used. Other model names/aliases do not enter this subtotal. `requestedPool` is independent and only uses the optional operator-supplied `pools` membership evidence; missing/ambiguous pool membership is unknown, not inferred from model names. It does not change the all-model counts.
- Duplicate issue/run/agent IDs are deduplicated. Conflicting state versions fail to unknown and cannot produce candidates; known waits from any conflicting issue version remain visible. No timestamp-based optimistic winner is chosen.
- Output values are counts and safe issue identifiers only. Identifiers use a bounded ASCII issue-key grammar, falling back to canonical UUID issue IDs; unsafe identifiers are omitted, not echoed. Counts may exceed identifier-list length. Invalid issue IDs cannot be deduplicated: their rows contribute to unknown and a separate invalid-ID caveat. Unmatched run-to-issue references are unknown issue evidence.

## Reuse assessment / REA angle

The existing `run-eval-harvest/scripts/harvest.mjs` is an authenticated API-backed metrics command (`--since`, `--until`, `--no-logs`), not an offline work inventory. Its M1–M19 metrics aggregate runs/usage/interactions, not this classification. The adjacent `owner-routing.mjs --from-file` only classifies interaction routing. Neither provides the required coverage, so running a live harvest would not demonstrate reuse.

The implementation composes the existing native concepts from `packages/shared/src/types/{issue,heartbeat}.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/agent-eligibility.ts`, `server/src/services/recovery/issue-graph-liveness.ts` and `server/src/services/issue-monitors.ts`: pending participant precedence, explicit queued/running statuses, distinct retry status, invokability and eligible future/overdue monitors. Those helpers are not imported because their host/API dependency graph is outside this standalone package. No separate reverse-engineering request, copied live export or new company procedure is needed. These are a bounded supported subset, not a full simulation of host scheduling/recovery.

## Verification and boundaries

```sh
npm run test --workspace @agent-toolkit/work-supply
npm run check
```

All fixtures are synthetic. See [THREAT-MODEL.md](THREAT-MODEL.md) for bounds, refusal evidence and the explicit distinction from an accepted operational credential broker. Security and QA review are required before merge; merge authorizes no installation or live runtime integration.
