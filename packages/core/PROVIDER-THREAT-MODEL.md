# Provider v1 threat model and acceptance matrix

Candidate core 0.2.0 / `toolkit.provider-broker/v1`. Not an installed provider.
No Security/Crypto/QA acceptance is implied. The exact reviewed SHA, Actions jobs,
artifact and trusted configuration envelope belong in review evidence; every
provider package must add its own per-tool ceiling and acceptance/runbook.

## Assets and exposed surface

Assets: provider main/derived credentials, current native identity/approval,
resource ownership/revision, bounded validated plan/artifact, permanent replay
records and attributable audit. The core has no credential binding of its own;
resolve one provider's binding only in its worker and only after authorization.
Each tool has an exact registered name/schema/tier. No arbitrary HTTP/SQL, SDK
method, shell, URL, headers, identity/approval argument or generic provider tool.
Existing GitHub restrictions remain stronger than generic surface completeness.

## Trust boundaries and deputy attacks

Model JSON, issue text, repository files, upstream errors/results and resource
names are untrusted data. Host runtime identity and current ownership come from
accepted authenticated adapters. Policies and registry entries are trusted
configuration. Native approval is independent authority, never a local flag.
The executor snapshots inputs/targets and checks agent AND resource allowlists;
provider-conditional writes must reject stale revisions/fences. A host-side read
cannot make a remote provider mutation transactional. Adapters are trusted code
with access to credentials; the core is not an OS sandbox. Shared UID is not
isolation, and a compromised worker retains its credential's full ceiling.

## Credential escape and injection

Projection first, bounded JSON and exact/common-encoding canary refusal second.
No upstream exception/cause/header/body/argument is logged or persisted. Derived
credentials must be included in the lease's redaction set and revoked by close.
Do not expose trace/crash/subprocess/filesystem sinks. No memory-zeroization or
universal transformed-secret/customer-data DLP guarantee; per-provider safe
output schemas are essential. Untrusted data cannot configure authority, secret
references, endpoints, spend or approval. Prompt instructions are not controls.

## Replay, limits and failure

All calls require durable key/target claims. Claim identity excludes run/version/
policy/args so a changed execution cannot repeat the same request. Tombstones
survive completion/refusal/uncertainty and restart. No time-only takeover or
mutation retry. A timeout signals abort but retains uncertainty because the
provider may still finish. Audit intent and outcome are linked; sink/state/close
failure never silently succeeds. Durable audit outage reconciliation/outbox,
HA/fencing and operator recovery remain concrete production adapter obligations.

JSON uses existing bounds; execution timeout max 30 seconds; authority freshness
max five minutes; no automatic retries. Provider transport separately enforces
fixed origin/method/path, no redirects, pagination/bytes/concurrency/rate caps.
Resource creation additionally requires existing atomic TTL/spend reservation
and independent auto-teardown before any provider provisioning. `lifecycle` is
metadata, not proof of that integration or permission to enable a creator.
Read compute-wake/billing/secret-data side effects need provider-specific caps.

## Refusal/behavior matrix

| Class | Named evidence in `test/provider-core.test.mjs` unless noted |
| --- | --- |
| Dispatch/schema | unknown dispatch; closed typed arguments; canonical targets |
| Verified identity and cross-binding | identity is verified host context; changed verified company/agent/project/task/run |
| Agent AND resource policy | agent AND resource allowlist required; resource ownership/revision failures |
| Revocation/TOCTOU | policy/resource change during credential resolution; exact native target mutations |
| Native unavailable/stale/replay | reserved operation without authority; stale/future/overlong native evidence; concurrent consumption |
| Credential/log/state reflection | projected credential reflection; raw upstream exceptions; cleanup failures |
| Audit before/after effect | audit intent outage; audit outcome outage; intent/outcome correlation |
| Durable replay/concurrency/restart | concurrent request claims; request replay after changed inputs/run/policy; SQLite process contention/reopen |
| Timeout/ambiguous effects | ambiguous mutation and timeout retains tombstones; no retry |
| Coverage manifests | `test/provider-coverage.test.mjs`: inventory omission/contradiction, unknown/incomplete entitlement, disabled review, prohibited executor, denied placeholder |
| Existing lifecycle/caps | unchanged existing lifecycle/revalidation/failure tests; not new proof of any provider creator |

Tests default to synthetic local fixtures, no provider network. Process-local
native authority is **test-only**, not an authority database. SQLite proves only
the selected fixture's durable key uniqueness/ownership; it has no recovery
service, authenticated grants or independent scheduler. Native plugin governance
and immutable audit coverage must be demonstrated on the exact target version.

## Acceptance/install status

- Versioned source/fixtures and operation-map consistency checks: candidate.
- GitHub Actions exact-head type/suite/policy results: pending, not run locally.
- Fresh-context implementation review: pending.
- Security, Crypto, then final QA: pending; no waiver.
- Production host/native approval/journal/audit/lifecycle adapters: not supplied.
- Install/enablement: not authorized; operator only after package acceptance.
- Credential creation/rotation, new spend or security exception: not authorized.

Revocation/rollback: disable affected provider tools/secret binding via accepted
operator procedure; retain replay records and owned-resource teardown/recovery.
Additive core rollback does not migrate or erase existing state. Merge alone
installs/enables nothing. REA angle: existing core lifecycle and GitHub broker
contracts, not a replacement native permission/approval database.
