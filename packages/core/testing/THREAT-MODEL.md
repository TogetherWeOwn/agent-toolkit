# Synthetic reference handler threat model

Status: test-only, not an installable plugin. Maintainer role: toolkit engineering. Runtime: Node 24, TypeScript pinned in root lockfile. No Paperclip SDK dependency or upstream API version is used; Cloudflare v4/GitHub REST-shaped fixtures are messages, not live integrations.

## Credential ceiling versus exposed subset

The synthetic secret resolver holds one generated broad canary. Provider fixtures may reflect an independently generated internal-derived canary; this demo does not mint any real derived credential. The broad value is resolved at call time, never returned, logged or persisted. No shell, subprocess or network adapter receives it; only the injected synthetic transport sees it for in-memory equality matching. Child processes in concurrency tests receive only a temporary SQLite path and non-secret policy inputs.

| Synthetic verb | Risk class | Allowed | Forbidden |
| --- | --- | --- | --- |
| inspect | read | GET the two deterministic children of an active owned lease | Foreign handles, expired leases, arbitrary reads/SQL/endpoints/headers, provider diagnostics |
| provision | write | Reserve 50 synthetic smallest-currency units, create exactly two children from a bound artifact digest | More than 2 aggregate leases or 100 reserved units, TTL over 60 seconds, refresh/retry of a known handle, unbounded payloads or arbitrary builds |
| destroy | destructive | One approval bound to principal, exact handle, argument/artifact digest and policy/tool versions; delete and negatively verify both children | Self-approval flags, replay, changed artifacts, foreign or stale state; calling provider administrative APIs |
| manually driven recovery | destructive, not model-dispatchable | Test author invokes expiry, completion/cancellation or orphan recovery for exact ledger targets | Prefix discovery/deletion, claims of automatic scheduling, production credentials or resources |

The canary is an opaque fixture credential, not a scoped provider permission. The synthetic cost model is exactly 50 units per lease with no real billing; it cannot justify a cloud cost cap. No credential ceiling for Cloudflare, GitHub or another live provider has been accepted here.

## Principals and boundaries

Model arguments are hostile JSON. `Host.identity` stands in for a trusted authenticated assignment; it must match the synthetic tenant/agent/project/task and durable ledger. Wrong binding, absent context or changed identity is refused. Tool descriptions, task text, API output and artifact content do not supply authority, destination, credentials or policy. A digest is accepted, never executable content. Output fields are fixed enums, not upstream strings.

State and approvals are trusted SQLite fixtures. Prefix names do not confer ownership. Exact binding/fingerprint prevents copied handles and approval drift. Production must additionally prove authority, fences, policy revocation and upstream ownership preconditions; the fixture's test-author `grant` is not an approval service. The manually invoked recovery method is not accessible through the model dispatch table.

## Confused deputy, injection and escape paths

Attack classes include nested/prototype keys, forged task/project/agent/tenant, correct-prefix foreign handles, credential/base URL/header injection, stale assignment, mutable input after parsing, API instructions, reflected secrets, forged/replayed approvals, artifact drift and audit failures. The registry has no HTTP, shell or provider-method fallback. `closed` returns frozen snapshots. Unknown dispatch and preflight denials never resolve secrets or call the transport.

Raw upstream errors, causes, headers and bodies are dropped. Only expected safe method/path values enter fixture call records. Audit uses fixed operation/decision/phase fields and a binding digest. Database files, audit rows, result/error objects and call records are searched for runtime-generated canaries on both success and failure. There are no issue/artifact/file/trace writers in the handler, and no SDK logging or crash reporter is configured. This is not proof of a future host's sinks; real plugins must test those actual writers.

## Lifecycle and residual risk

Reservation/approval contention uses separate Node processes sharing a disk database. Intent, immutable expiry and held cost survive connection reopen. Partial or ambiguous provision retains `uncertain` state and full cost; no creation retry is allowed. Destroy must match the persisted artifact digest even when a changed artifact has a separate grant. Approval consumption uses current host time after ownership lookup. Credential-bearing reads/deletes recheck identity after ledger awaits, including verification after DELETE. Cleanup requires exact unpaginated negative evidence for both children, retains ledger/cost on failure and attempts the second child and later leases even if an earlier target fails. A durable per-handle operation claim excludes competing handlers across connections/processes for the full asynchronous provider call; recovery re-reads the current lease under that claim. Only the owning operation releases, and claims never expire. A crashed owner leaves a claim that blocks cleanup; the fixture provides no crash takeover. Time-only takeover would permit a late creation after cleanup, so production requires proven quiescence/provider fencing and an accepted recovery procedure. This exclusion and revalidation are not provider-enforced fences against other production actors. Audit intent precedes approval consumption and mutation; a failed intent leaves the grant unused, and a later approval denial is an audit outcome. Outcome outage yields failure plus durable intent/ledger rather than unqualified success.

Not implemented: autonomous scheduler, HA/fencing, authenticated authority, production audit outbox, native plugin governance, live provider scope/ownership verification and real billing bounds. File-store compromise, broker compromise or a malicious trusted adapter defeats fixture assumptions. No installation is allowed. See [adapter contracts](../../../ADAPTER-CONTRACTS.md) for the requirements a real service must implement and test.

REA angle: the existing Cloudflare source demonstrates minted-policy verification, distinct Worker name/tag identities, negative relists and cursor handling; those informed these tests without copying deployment data. The managed command launcher is a separate credential-to-subprocess boundary, not a substitute for operation authorization.
