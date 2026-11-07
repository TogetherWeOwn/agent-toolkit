# Native workspace selection

Status: investigation and acceptance runbook, not an installed broker or a claim that native selection has passed runtime acceptance.

Use native project defaults, explicit task repository selection and normal admission before considering another plugin. Workspace selection is not session reset, live migration or authority to repair another task. This runbook introduces no credential, API proxy, checkout manager or host automation.

## Capability boundary

| Operation | Classification | Evidence required before claiming success |
| --- | --- | --- |
| Create a task against an authorized configured repository with isolated settings | Native configuration choice | Read back the project/company, exact repository workspace, explicit task selection and isolation policy; verify realization separately |
| Inspect task workspace inventory and binding revision | Documented native read | Successful scoped response with a usable revision and authorized inventory; documentation alone is insufficient |
| Select a configured source for the assigned task | Candidate native intent operation | Principal authorization, inspected binding revision, stable request key, retention safeguards and an accepted response; later admission must realize and validate it |
| Prepare an authorized repository | Candidate native preparation operation | Authorized repository discovery, supported ref handling and an accepted response; preparation must not silently reset an existing checkout |
| Reuse or inherit a workspace | Deliberate continuity choice, not automatic repository correctness | Exact source/repository/ref compatibility, authorized reuse, and dirty/live preservation |
| Change board-only settings, reset a session or repair the host | Separate authority | An actual demonstrated requirement and the supported authorized owner; selection documentation does not confer this authority |
| Rename branches, clear retained bindings, hand-clone, write core DB state or relocate/cancel live work | Excluded from this workflow | Refuse; preserve existing work and use the supported recovery path |

## Start with repository identity

Read the assigned task and project repository inventory through supported interfaces. Select the exact configured repository, not the project's primary by accident. A multi-repository project can intentionally have a different primary repository. A project name or matching folder basename does not prove a repository binding.

Before editing, building, testing or committing in a realized workspace, compare:

1. Task company, project, explicit project-workspace ID and retained execution-workspace ID.
2. Configured source repository and ref against the runtime's repository, root, strategy and recorded branch.
3. Physical cwd and Git top-level against the assigned native root.
4. All stored origin URLs: require exactly one matching repository and inspect without displaying userinfo, query strings or credentials.
5. Current branch against the recorded managed branch, plus dirty/untracked state.

Read-only Git inspection may use `pwd -P`, `git rev-parse --show-toplevel`, `git config --local --null --get-all remote.origin.url`, `git branch --show-current` and `git status --short` with optional Git locks disabled. Capture origin output inside a sanitizer; never print a raw credential-bearing remote. Do not change origin or normalize away a host/owner/repository/root mismatch.

On mismatch, stop repository work and preserve existing files and bindings. Record sanitized expected/observed identities, commit, branch and dirty/untracked state. Do not reset, clean, move, overwrite, clone another copy or rename the managed branch to make validation pass. A clean workspace proves neither general isolation nor preservation of dirty/live work.

## Native selection contract

Use the canonical task UUID for these routes, not a display identifier. In the inspected `2026.1106.0` distribution, the workspace router does not share the ordinary issue router's display-identifier resolver. A canonical-UUID inventory read succeeded in a bounded runtime check after a display-identifier read had failed. This establishes a usable read path, not successful selection or general endpoint acceptance.

The bundled native workspace reference and installed route describe:

- `GET /api/issues/:issueId/workspace`: binding, binding revision, pending selection, repository inventory and preparation capabilities.
- `PUT /api/issues/:issueId/workspace`: stable `requestKey`, inspected `expectedBindingRevision`, and one typed selection.
- `POST /api/issues/:issueId/workspace/repositories`: stable `requestKey` and an authorized repository selection; discover catalog IDs through the supported repository inventory.

For a configured source, the documented selection shape is:

```json
{
  "kind": "configured_source",
  "projectWorkspaceId": "<authorized-configured-source-id>",
  "mode": "managed_isolated"
}
```

This is a contract illustration, not a standalone request or permission grant. Do not guess the binding revision, invent repository IDs, derive authorization from a caller-supplied task ID, or substitute a broad credential if the current principal is denied. Preserve the native request-key and revision semantics. Resolve ambiguous outcomes using the supported owning layer; do not send a new intent blindly.

Root selection and preparation are documented to return `next_normal_admission`. The current process keeps its root. Do not claim the pending checkout exists, change directories to an imagined root, interrupt the run, or repeatedly request selection. Verify the authoritative root/origin/branch after normal realization.

### Principal, replay and preservation limits

In the inspected distribution, reads require company access and `issue:read`; writes require `issue:mutate` and an authenticated task-bound agent JWT matching the target task. Agent writes are rejected in Ask/Plan modes. A long-lived agent key alone is not the supported write principal. Returned capability metadata describes support/timing, not permission. Disclosure of a reused workspace also checks its project and retained task-data sources; visibility of one task does not authorize every linked task's data.

Selection locks the task row and checks the expected revision. Repeating the current applied/pending key with the same original revision and normalized intent deduplicates; conflicting reuse fails. Scheduling and application increment the binding revision. This is current-state deduplication, not an unlimited historical ledger: a subsequent valid request can replace pending intent. Do not generalize it to permanent replay protection.

Pending selection is applied before a later normal admission, not during an already admitted run. Live ownership and unsettled recovery/finalization fence application. **Selection itself does not inspect Git dirtiness or copy existing changes.** Deferred rebinding is not a dirty-workspace retention handoff. Native lifecycle cleanup is a separate mechanism; inspected cleanup skips dirty/unverifiable workspaces, nonterminal task trees and undelivered branches and rechecks Git state before deletion. Its default cooldown is not permanent retention.

Repository preparation separately validates directory containment, Git identity and ownership/pinned-commit receipts. A conflicting repository/ref receipt is rejected; existing managed checkouts are reused rather than silently reset. Retain application-level preservation evidence instead of treating these source checks as a completed live test.

Project mode and strategy are distinct. An isolated mode alone does not establish `git_worktree`; enabled defaults and explicit strategy resolution must be checked. The parsed `allowIssueOverride` setting is not by itself proof of an enforced mode lock in the inspected resolver.

### Intended repository and retained-work decision table

Native access is a ceiling, not an intended-repository allowlist. In the inspected release, configured-source selection can accept another accessible company source after project authorization. Explicit authorized reuse is also supported. Neither behavior proves that the source is appropriate for this task. This workflow must compare the exact assigned source/repository before submitting intent and again after realization; stop if another accessible source is selected. Do not claim that native authorization will reject every business-wrong repository.

| Observed state | Safe workflow action | What this does not prove |
| --- | --- | --- |
| New task, no retained root, explicit intended source | Use supported isolated defaults; inspect and validate the later native realization | Selection-write or preservation acceptance |
| Matching retained source/root/origin/branch | Continue in place after preflight; do not reselect merely to obtain another isolated root | Permission to reset or discard existing state |
| Conflicting retained source, repository, ref or branch | Stop repository work; preserve the binding and files; route the exact supported repair | That selecting the correct source migrates old work |
| Inherited or explicitly shared root | Verify intended repository and authorized linked-task access; retain continuity only when compatible | That parent/project membership authorizes all retained data or supplies isolation |
| Dirty, untracked or ignored files; live process or runtime service | Preserve in place; do not use selection as a repair or experiment; require separately authorized preservation/recovery handling before rebinding | That next-admission deferral copies files or permanently retains the old root |
| Stale/foreign/inaccessible workspace, source or intent | Refuse this workflow; inspect the supported failure without broadening the principal or clearing the binding | That refreshing a revision makes a different intent safe |
| Unsettled recovery or previous run still owns persistence | Let the owning native recovery finish; do not cancel the holder or bypass the fence | That submitting pending intent transfers runtime ownership |

These are caller workflow decisions, not a claim that the native service automatically implements every row as a refusal. At admission, the inspected service checks the current persisted intent, run/task/responsible-user identity, source/project access and trust before applying it. It does not classify disk contents there. A binding revision is not a version of repository configuration or a disk-integrity receipt. Changed assignment/configuration, concurrency, response loss and revocation still need acceptance evidence for the actual path used.

For the demonstrated configured-source case, no acquisition/preparation operation is necessary. Keep preparation out of any proposed adapter unless a concrete requirement justifies it and its separate security review. No adapter or plugin invocation is selected by this runbook, so plugin-specific principal propagation, shared rate/audit enforcement and output projection remain conditional requirements—not controls established by native source inspection.

### When inspection fails

A server error is not a permission denial, absence of a repository or proof that a broad broker is required. Preserve the exact status, endpoint class, runtime version and safe correlation evidence. Diagnose the supported route/service and deployment compatibility before attempting a selection write. Never use raw database access, installed-core edits, retained-binding clearing, a session reset or a stronger principal as a diagnostic workaround.

Do not classify a documented endpoint as operational until a successful runtime response is observed. Conversely, one failed request does not establish that every native admission or configured-source default is broken.

## Acceptance matrix

Collect evidence for the exact runtime/procedure or reviewed adapter artifact. Record source reasoning, offline fixture results and live observations separately.

| Case | Required result |
| --- | --- |
| Authorized new task, explicit correct repository, isolated settings | Later normal admission realizes the correct native root, origin and managed branch |
| Project primary differs from explicitly selected repository | The explicit authorized repository wins; no silent primary substitution |
| Accessible but unintended repository/source or incompatible inherited workspace | Workflow preflight stops before submitting intent or starting repository work; do not expect native access checks alone to enforce task intent |
| Foreign task/company/project or stale assignment | Native authorization refuses; no credential expansion or cross-task effect |
| Stale binding revision or conflicting request-key reuse | Native conflict/refusal, not overwrite or automatic revision guessing |
| Dirty/untracked existing work | No reset, clean, move, overwrite or silent ref replacement |
| Live work and pending selection | Active root and process remain unchanged; no cancellation or relocation |
| Unavailable inventory, policy or identity | Fail closed; no selection write or fallback authority |
| Session-reset or host-repair request disguised as selection | Refuse and route the distinct authority requirement |

Use offline fixtures for negative/mutating scenarios unless an explicitly authorized disposable native target is available. Do not use a production or live dirty workspace as an experiment. Source inspection of a safeguard is not an end-to-end preservation test. Tests of a proposed helper do not certify unexercised native runtime behavior.

## Broker decision and security

A new broker is justified only by a necessary residual gap that supported native configuration/interfaces cannot already satisfy. Its design must identify an actual trusted host principal and the supported invocation path. An agent-supplied issue ID, shared filesystem/UID or plugin process separation is not an authorization boundary.

If needed, use separate exact read/select tools with closed runtime schemas, fixed native endpoints, per-agent/project/task policy, bounded response/time/rate limits and durable safe intent/outcome audit. No arbitrary URL, path, ref, command, identity, credential, header or cross-task target belongs in agent arguments. Reuse native revision, retention, idempotency and admission authority; do not implement a second ledger, scheduler or checkout manager.

Credential resolution, result projection, refusal tests, lifecycle applicability and native governance coverage must meet [the tool standard](../STANDARD.md). Prefer the existing narrow native principal to a new broad credential. Security acceptance must bind the exact source/artifact and configuration before any installation; installation and credential placement remain separate authorized operations. Shared process or host compromise remains a residual risk, not solved by a tool description.

## Outcome measurement

Preregister complete matched pre/post windows, cohort and a success threshold before enabling a change. Count actual workspace/session operator actions and unexpected workspace-validation failures per eligible admission, retaining auditable action attribution. Separate native selection from session resets, board-only configuration and host repairs; separate expected safety refusals from unexpected failures.

An anecdotal daily step count is not a measured baseline. Missing action records or zero eligible admissions mean inconclusive, not zero cost or successful removal of work. Report source merged, procedure/tool enabled, successful adoption and measured improvement as separate milestones. A merged runbook is not an operational selection tool.

## Source ledger and evidence limits

Read-only inspection of the installed `paperclipai@2026.1106.0` distribution, relative to its `node_modules` directory:

| Topic | Distribution source |
| --- | --- |
| Routes and task-bound write context | `@paperclipai/server/dist/routes/task-workspaces.js:16–50`; `services/project-tool-context.js:5–28` in the same server distribution |
| Closed selection schema | `@paperclipai/shared/dist/validators/task-workspace.js:2–15` |
| Linked task-data access | Server `services/task-workspace-access.js:12–126` |
| Revision, key and scheduled application | Server `services/execution-workspaces.js:1050–1204,1242–1264`; `services/heartbeat.js:1272–1282` |
| Legacy binding fence and lifecycle cleanup | Server `services/execution-workspaces.js:955–982,1275–1280,1454–1470,1613–1667,2746–2788` |
| Repository preparation and containment | Server `services/execution-workspace-repositories.js:66–89,120–190,341–356,401–519`; `services/managed-repository-checkout.js:15–39` |
| Mode and strategy resolution | Server `services/execution-workspace-policy.js:31–51,68–123,152–159,258–301,316–368` |
| Identifier resolution and route ordering | Server `routes/issues.js:5307–5315,5479–5488`; `app.js:655,740–748` |

These locations identify the inspected release, not an assertion that other releases are identical. A bounded canonical-UUID GET and one normal isolated admission were observed. Selection/preparation writes, refusal/preservation scenarios, complete impact measurement and installation acceptance remain unverified. No new plugin is justified by the read failure alone.

REA angle: inspect the shipped workspace admission policy, selection/preparation interfaces and configured isolation behavior; reuse their contracts instead of building a competing workspace manager.
