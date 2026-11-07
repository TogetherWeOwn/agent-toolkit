# Provider broker contract v1

Contract `toolkit.provider-broker/v1`, core package `0.2.0`. Import the additive
`providerV1` namespace from core, or `src/provider/index.js` in the compiled tree.
Existing lifecycle, schema and synthetic fixture exports remain unchanged.
Maintainer role: toolkit engineering. This is a library loaded independently in
one worker per provider, not a credential-bearing central service or plugin.

**Status: candidate, not security/crypto accepted, installed or enabled.** No
production host, policy store, native authority, journal, audit, credential or
lifecycle adapter is provided. TypeScript interfaces specify obligations; they
are not proof that an installed Paperclip version implements them.

## Integration

`createProviderBroker(dependencies).call(tool, rawArguments, runtimeContext, requestKey)`
returns `{ok:true,value,event}` or `{ok:false,code,event}`. See
[`src/provider/contracts.ts`](src/provider/contracts.ts) for exact types. The
operation registry and all dependencies are trusted broker configuration, never
agent inputs. Each externally registered tool has its own exact name/schema/tier;
this internal dispatch library is not an agent-facing provider multiplexer.
Runtime context comes from the authenticated tool callback, never the JSON args.
Request keys are opaque bounded labels; the broker hashes their authenticated
company/agent/project/task/provider/tool scope. Changing run, policy, arguments or
tool version does not let the same request execute twice.

Provider roots: `plugins/cloudflare-broker`, `plugins/planetscale-broker`,
`plugins/neon-broker`, existing `plugins/github-broker`. They remain independent
packages/credentials. Existing GitHub handlers are not switched by this change.
Adapters/maps/mock tests can develop against this interface before merge;
qualification needs a reviewed compatible core and actual host evidence.

### ProviderOperation

- `name`, `version`, `tier` (`read`, `write`, `reserved`), `timeoutMs` (1–30,000),
  `lifecycle` (`none`, `managed`) are registry-owned.
- `prepare(raw)` uses the existing closed-schema validators. It returns a
  `Prepared` with canonical `resource:{id,revision}`, validated non-secret
  `arguments`, accurate validated `plan`, and `artifactDigest` (SHA-256 or null).
  No agent identity, approval, headers, credential reference or arbitrary origin.
  A validated plan is **not** a provider dry-run when the API has no dry-run.
- `execute(prepared,credential,signal,requestKey)` builds an exact typed provider
  request. Honor the AbortSignal, fixed egress/no redirects, request/response and
  pagination bounds, and provider revision/ETag/fencing preconditions. No automatic
  mutation retries. The core snapshots/freezes the prepared request and never
  takes a wider decision from the adapter. Trusted adapter code holds credentials
  and is not sandboxed against its own malicious behavior: review is essential.
- `project(raw)` allowlists result fields and removes customer/secret content.
  Core bounds JSON and refuses exact credential and common URL/base64 reflections
  in serialized keys and values. This is defense in depth, not universal DLP or
  permission to return arbitrary text. Provider redaction remains mandatory.

`lifecycle` describes integration requirements, not an enablement flag. Resource
creators use existing `DurableState` atomic reservation, finite worst-case spend,
immutable TTL, provider idempotency and independent `CleanupCoordinator` before
provisioning. An executor timeout is **not** resource auto-teardown. A package
cannot enable creators without its accepted lifecycle implementation. Reads with
compute-wake, billing or customer-data effects require their corresponding caps
and redaction too; a `read` label is not evidence of harmlessness.

### Authenticated host, policy and native authority

The host verifies company/agent/project/task/run, current assignment, resource
ownership/revision and live binding. An agent-supplied principal or copied handle
never substitutes. Policy snapshots are scoped by the trusted adapter to that
principal and exact tool, and require BOTH an agent and a resource allowlist.
Every call rechecks identity, full policy snapshot and resource binding before
credentials and immediately before execution. Provider preconditions must close
the remaining non-atomic host/provider interval; current reads alone do not.

Reserved operations require `NativeAuthority.verify` and atomic `consume` from
an authenticated independent native authority. Evidence must bind target hash,
reference, issuance/expiry (maximum 5 minutes), approved outcome and revocation.
`consume` rechecks target/revocation and single-use state across processes. No
implementation, self-issued approval database or `approved:true` escape exists.
Unsupported native authorization means `AUTHORIZATION_UNAVAILABLE`, never a
placeholder executor. Policy/host/network credentials do not confer approval.

The target binds contract/provider/tool/version/tier, all five principal fields,
resource ID/revision, canonical argument and plan hashes, artifact digest and
policy revision. `canonicalHash` reuses core sorted-object-key SHA-256 after
bounded JSON validation (16 KiB, depth 8, 256 nodes); array order is significant,
Unicode is not normalized, unsupported values/accessors/sparse arrays are denied.
Providers reject ambiguous identifiers before hashing. Hashes are not encryption;
never feed secrets into audit target material.

### Credentials and durable execution

`credentials.resolve(target)` occurs only on the authorized path. Return a
`CredentialLease` with broker-only value, every derived credential in `redactions`,
and idempotent `close` that revokes/verifies attenuation where supported. Every
broad/derived value must contain at least five UTF-8 bytes so the common base64
refusal has a stable core at every alignment; shorter values refuse the lease
before execution with `CREDENTIAL_UNAVAILABLE`. This is not an entropy guarantee.
Without attenuation, document the broad credential's residual process boundary. Core
never returns the credential or raw upstream exceptions and never logs raw args,
provider responses, headers or errors. No managed-runtime zeroization claim.

Audit intent precedes durable claim and side effects. `journal.claim` atomically
inserts a principal-scoped request-key tombstone and exact target/event across
processes. Existing pending/complete/refused/uncertain entries all refuse replay;
there is no automatic retry or cached success. Do not remove/expire tombstones
while replay remains possible. Claims do not expire just because time passes;
reconciliation needs provider fencing/proven quiescence, not a heartbeat guess.
`finish` records completion/refusal/uncertainty under the original owner and must
allow an outcome-write failure to mark a formerly completed record uncertain.

A timeout cannot prove the provider stopped. Core aborts the signal, closes the
credential lease and retains an uncertain tombstone. A late result cannot return
success or retry. The provider/accepted recovery adapter must reconcile late
completion and owned resources. `ProviderJournalFixture` proves SQLite unique
claims across processes and reopen only; it is not an installed journal/outbox,
native approval service, takeover procedure or scheduler.

Every available audit sink receives intent/outcome/refusal records with random
correlation, server timestamp, fixed codes and known registry tool plus principal
and target hashes. Unknown agent tool names, raw arguments and free-form errors
are never included. Audit outage prevents effects; after execution it returns
`OUTCOME_UNCERTAIN` and preserves the intent/journal, never unqualified success.
Production requires accepted durable immutable audit/outbox/retention controls.

## Operation maps and acceptance

`validateOperationMap` checks a versioned machine-readable official reference
URL/version/hash, full snapshot `inventory`, and exactly one entry per operation:
API area/tool, target scope, side effects, tier/authorization, credential
entitlement, implementation/review/enabled status, tests and prerequisite. See
`OperationMap`/`OperationMapEntry` for field names and `test/provider-coverage.test.mjs`
for examples. Full snapshot completeness, entitlement and actual review evidence
must be independently verified: consistent metadata is not proof of execution,
review or API completeness. Unknown entitlement, incomplete status and entitled
but unimplemented non-prohibited operations prevent `complete`. An explicitly
prohibited operation has no executor and does not prevent `complete` solely
because it is entitled but unimplemented. Thus `complete` is not proof that every
entitled operation is implemented, reviewed or enabled; prohibitions stay denied.

GitHub owner-token execution, APPROVE execution, workflow-file writes and
Actions/Checks/Statuses writes remain expressly prohibited. Generic completeness
requirements do not override these restrictions or authorize dormant executors.

Fixtures: [`testing/provider-v1.json`](testing/provider-v1.json), reusable
[`testing/provider-fixture.mjs`](testing/provider-fixture.mjs) and test-only
`src/testing/provider-journal.ts`. No live provider network or credentials.

CI of record: exact-head GitHub Actions for `npm ci --ignore-scripts`,
`npm run typecheck`, `npm test`, native supply-chain policy, and inherited required
checks. No local full suite/CI mirror. Security **and Crypto**, then final QA,
review pinned source and each complete provider package/tier. Final approval
requires Actions/checks and finding dispositions; merge is SHA-pinned. Install,
enablement, new credentials/spend and production decisions remain separate gates.
Rollback: remove the additive namespace/adapter adoption, leaving existing
handlers unchanged; never remove durable tombstones or owned-resource recovery.

REA angle: reuse existing core closed schemas/hash/lifecycle contracts and the
GitHub broker's staged identity/policy/credential/projection/cleanup pipeline.
Do not treat its read cache as durable replay protection or assume native
`ctx.tools.register` approval coverage from MCP profile configuration.
