# Adapter contracts and assurance boundary

`packages/policy` has **no production state, secret, approval, network or scheduler implementation**. Its TypeScript interfaces are obligations, not evidence that a host satisfies them. Maintainer role: toolkit engineering; every new service requires its own Security acceptance and operator runbook.

## Atomic reservation and owned ledger

A `DurableState` adapter must transact a unique creation intent, immutable binding (tenant, agent, project, task), canonical argument fingerprint and immutable artifact digest, server-derived absolute expiry, resource ceiling and integer smallest-currency worst-case reservation **before** the first side effect. Persist every deterministic child target or provider idempotency key before its creation. Account for storage, egress, retries, minimum billable periods and delayed teardown. A caller-supplied spend limit is not a cost model. Unknown/unbounded worst-case cost refuses creation.

Reservations are global across processes sharing the budget domain, not counters local to one worker. Lock/transaction/CAS the aggregate count and outstanding cost together with creation. Do not expire budget holds merely because the lease time passed: an expired resource may still incur costs. Pending/ambiguous resources retain the whole reservation until reconciliation and verified deletion. Stop provisioning when cleanup or budget health is unavailable. Define overflow-safe totals, currency, billing window, reconciliation and incident behavior per service.

The handle is not authority. Every read, mutation and cleanup checks the ledger binding and lifecycle. Prefix grammar only rejects malformed names. Validate trusted current assignment immediately before effects. Record revocation and upstream ownership drift, not just initial name ownership. Never accept account, tenant, project, task, destination, secret reference or credential in model arguments. Require host-deserialized JSON; arbitrary in-process proxies/getters are not a supported input boundary.

## Lease, ambiguous mutation and recovery

Persist the intent and audit correlation before contacting the provider. Use a provider-supported idempotency key bound to the full request when available. A timeout, malformed success or lost response may have created a resource: mark uncertain and reconcile using the original immutable target, never retry creation under a new name. Durable recovery must include an intent left by a crash before the outcome write.

Use conditional/fenced transitions. Competing recovery workers must not delete a replacement resource or close/release a lease while another worker is creating it. Define monotonically increasing fence tokens, provider preconditions and ownership rechecks for a production implementation. `DurableState` is a minimal shape; implementers must add fencing/child progress appropriate to their provider. It is not a turnkey lifecycle framework.

An independent durable coordinator must enqueue absolute expiry, completion/cancellation hooks and an orphan sweep. Creation consent preauthorizes only deletion of exact owned child IDs at immutable expiry/caps. Early operator destruction uses the declared approval policy. A scheduler never accepts model-supplied targets. Revoke internal derived credentials first, delete every owned child/artifact, follow complete pagination, and verify absence. Unknown/failed/paginated verification is not success. Persist bounded retries, per-child progress and an operator escalation target. Keep non-secret ledger/audit evidence until removal is verified. No `setTimeout`, run-local callback or agent heartbeat alone meets this contract.

## Approval authority

`ApprovalAuthority.consume` must use an authenticated independent authority, not a flag or a self-issued grant. Verify current access policy, approved outcome, issuance/expiry, revocation and a target containing binding, tool/version, policy version, exact resource, canonical arguments and immutable artifact digest when relevant. Atomically consume one grant before a side effect. Replayed, concurrent, changed, expired or forged targets fail closed. Revalidate policy and scope at execution; a consumed grant does not override revocation. Separate unrelated services and approval domains.

The host must demonstrate native plugin calls traverse the real governance evaluator and immutable call-event audit in its exact version. MCP profile configuration is not that demonstration. Native `ctx.tools.register` coverage has **not** been verified here. No destructive plugin may be installed based on this scaffold.

## Secrets, outputs, transport and audit

Resolve only the trusted configured reference through `ctx.secrets.resolve` in the authorized call path. A real adapter must not expose broad or internal-derived credentials through results, logs, state, issue records, trace/crash artifacts, files or subprocess environments. Avoid logging arbitrary strings even if a redactor exists. The policy boundary projects results to two fixed statuses and errors to fixed codes; the reference transport records only expected safe method/path, never credential/body/header/error data. There is no memory-zeroization guarantee.

Implement fixed HTTPS origin/method/path allowlists, no credential-bearing redirects, bounded requests/response bytes/deadlines/pagination/retries/concurrency and explicit safe parsing. Never pass arguments wholesale into an SDK. `StrictTransport` is a synthetic matching queue, not an HTTP client. Cloudflare/GitHub fixture builders describe expected messages only, not their providers' security or API completeness.

`DurableAudit.append` must acknowledge a durable immutable record, with access control, retention and integrity protection. `boundary` generates a random correlation ID, fixed operation/phase/decision codes, server time and a digest of verified binding; unknown names/arguments are never logged. It records intent and outcome under one event ID. Failed preflight emits a refusal, unless the sink itself is unavailable. Pre-effect audit failure means no new side effect. After an effect, audit failure means a failed result plus the retained intent and durable resource ledger for recovery—not unqualified success or automatic mutation retry. A real adapter must additionally bind reservation, approval, child progress, duration and safe upstream request identifiers in fixed-field records, and provide a durable outbox for outcome-write outages. Outage-resilient expiry cleanup needs its own accepted audit/outbox design, not abandonment of expired resources.

## What the SQLite fixture proves—and does not

`SqliteFixture` is test-only. It uses SQLite `BEGIN IMMEDIATE`, FULL synchronization, a unique handle, disk-backed aggregate cap reservation, conditional lifecycle transitions and atomic approval consumption. Tests reopen the database and contend from separate Node processes. Credentials, raw provider bodies and errors are not stored. SQLite files are temporary and removed by the test runner.

It deliberately does **not** provide authenticated approval issuance, HA, production policy revocation, per-provider billing, resource-fencing, verified native governance, a durable audit outbox or an independent scheduler. Its `grant` helper trusts the test author. The synthetic handler's `recover` method is manually driven by tests; it proves recovery transitions and negative deletion evidence, not restart-safe autonomous teardown. Do not import either into an installable service. Additional tests against the chosen real coordination mechanism, provider and target host are mandatory before acceptance.
