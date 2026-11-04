# Work-supply CLI threat model and acceptance matrix

Maintainer role: toolkit maintainers. Version: 0.1.0, private/offline only. Runtime: Node 24; no SDK, API dependency or new dependency. Operation: read one explicitly supplied JSON file or stdin and emit one fixed-schema report. No installation, registration, API access, host automation or resource provisioning is part of this package.

## Assets, exposed subset and trust boundaries

| Asset / capability | Exposed | Deliberately absent |
| --- | --- | --- |
| Export contents | Bounded JSON parsing and deterministic status facts | Descriptions, titles, interaction payloads, adapter env, credentials or arbitrary content in output |
| Local filesystem | Read one explicit regular input file | Directory traversal/search, output files, execution, plugins, arbitrary imports |
| Native issue/run/agent state | Read operator-supplied snapshots as untrusted evidence | Host authentication, mutations, checkout, scheduling, agent/model moves |
| Provider identity / spend | None | Credential resolution, outbound calls, quota/usage claims, billable resources |
| Report | Counts, fixed keys, safe issue identifiers | Run/agent IDs, arbitrary input values, paths, raw exceptions |

The caller chooses the input scope, capture time, classification time and optional pool membership evidence. These are **not authenticated host assertions**. Falsified/truncated exports can misrepresent work and cannot authorize any action. Matching issue/agent IDs are joins for a report, not resource authorization. Same-company and reporting-chain checks limit accidental cross-company eligibility; this is not a substitute for a host authorization boundary. The CLI must not be installed as a broker or used as a scheduler decision oracle.

Snapshot text and arbitrary native fields remain data. No dynamic imports, shell, subprocess, URL fetch, plugin registration or secret resolver exists in the delivered command. Instructions inside descriptions/env/payloads cannot select credentials, destinations, paths or actions. The operator-supplied input path is the only file read. Any integration that adds other actions is new scope requiring its own threat model and acceptance.

## Bounds, lifecycle and failure behavior

- Input bytes: 8 MiB; at most 20,000 rows per envelope array; 500,000 JSON nodes; depth 32; at most 128 roster ancestors. Parsing/record traversal is finite. Regular-file size is checked before reading and accumulated size is checked during reading. Nonblocking open allows refusal of FIFOs/devices/directories without waiting for a writer.
- The input-stream deadline is 5 seconds; it is not a claim to interrupt a slow filesystem syscall or synchronous CPU execution. No retries, outbound requests, timers after invocation, durable state or resident process.
- Capture freshness: 15 minutes; future/invalid/missing capture times suppress candidates. Scheduled monitor eligibility uses the supplied native deadline and attempt ceiling, not a new scheduler or lease.
- No resource creation, credentials, billing or state mutation: provisioning TTL, spend reservation, automatic teardown, revocation, destructive approval and credential call-time resolution requirements are not applicable. There is no credential ceiling to delegate.
- Each invocation emits one report or one fixed error record; errors return exit 1, no partial report. No input filenames, arbitrary exception messages or causes are printed. The CLI does not create a durable audit store; an operator may retain stdout/stderr under their existing retention policy. This is **not** a claim of compliance with the operational broker durable-audit/governance standard.
- Residual risks: compromised Node/process/host can read files available to that process; input is not an OS sandbox. JSON parsing temporarily holds input bytes in memory. Explicit safe issue identifiers are intentionally disclosed; arbitrary strings that happen to satisfy that identifier grammar cannot be distinguished from identifiers. Caller-provided paths can follow symlinks, so callers must only name files they intend to read. Export completeness, source truth and concurrent capture consistency remain caller responsibilities.

## Acceptance evidence map

All tests are in `test/classify.test.mjs`, run offline with `npm run test --workspace @agent-toolkit/work-supply` and through root `npm run check`.

| Control / refusal | Test names |
| --- | --- |
| Every requested category | `synthetic category ...` table and the committed synthetic example |
| Queued vs running vs retry; unique IDs | `running, queued and scheduled retries are distinct deduplicated evidence` |
| Overlapping observations, no additive capacity | `overlapping running review, monitor and interaction buckets are not additive` |
| Review precedence under status drift | `pending review overrides status drift ...`, `pending participant, not returnAssignee ...` |
| Future stages not an active review | `configured future stages are not pending reviewers or a present wait` |
| Candidate negative evidence and unknown states | `candidate requires explicit negative wait evidence: ...`, `does not promote ...` |
| Blockers/cancelled dependencies/finalize | `does not promote dependency ...`, `does not promote cancelled dependency ...`, `does not promote pending finalize ...` |
| Eligible vs inert/future/overdue monitors | `inert monitor: ...`, `monitor field-specific fallback and overdue boundary` |
| Missing/stale inventories | `absent inventory ...`, `stale, future or invalid capture time ...` |
| Dedupe/conflicts/missing run objects | `duplicates dedupe ...`, `conflicting duplicate runs ...`, missing-run synthetic row |
| Roster/model/pool evidence | `roster eligibility refuses ...`, `duplicate consistent roster ...`, `explicit pool evidence only ...`, `known non-Sol per-issue overrides ...` |
| Native external/recovery/visibility waits | `native external/recovery/unsupported wait ...`, `native zero blocker/review projections ...` |
| Closed envelope, bounds, malformed rows | `malformed snapshot is refused ...`, `size and nesting limits are enforced` |
| Safe identifiers and arbitrary-output refusal | `calendar dates ...`, `unidentifiable issue evidence ...`, `fixed output projection redacts ...` |
| CLI paths/stdin/options/error projection | `CLI file and stdin reports agree ...`, `fixed output projection redacts ...` |
| Purity and no provider use | `classification is pure and does not read a live provider` |

Security acceptance must be recorded by an independent Security reviewer on the exact PR head, followed by QA and required checks before merge. This document supplies the review matrix, not acceptance. There is no install/upgrade/secret-binding runbook because no operational tool is being installed. Rollback is removal/reversion of this offline package; it has no resources to revoke or tear down.
