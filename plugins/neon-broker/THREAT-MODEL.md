# Source-slice threat model

The caller controls JSON arguments, not runtime identity, trusted scope, operation
registry, transport implementation, credential resolution or policy. Provider
responses/errors are untrusted, including otherwise plausible metadata strings.
Host deserialization must yield ordinary JSON; in-process proxies are not safely
sandboxed. This source is trusted adapter code, not an adversarial-code sandbox.

| Threat | Source controls and remaining obligations |
|---|---|
| Caller identity/approval spoof | Closed args reject claims; shared core fixture tests authenticate only the host context. Actual host integration remains required. |
| Cross-agent/resource access | Common agent AND exact-resource policy; separate collection targets; copied trusted scope; exact response project/child binding. No broad list inferred from project access. |
| Provider scope drift | Bound scope revision enters canonical target and is revalidated by host/core before transport; exact provider IDs/parent relations checked. Actual current binding adapter remains required. |
| Secrets in response/error/audit | Allowlist projection excludes settings/hosts/owners/credentials/passwords/URIs and arbitrary errors/timestamps. Database/role names are emitted only when exact trusted bindings match; other arbitrary names stay excluded. Fixed errors discard raw bodies. Common reflected-lease checks and safe audit envelopes remain mandatory. Arbitrary secret DLP is not claimed. |
| Redirect/SSRF/path injection | Twenty-seven fixed GET methods, constrained identifiers/catalog names, encoded cursor, fixed origin, redirect:error, no arbitrary URL/header arguments, no default fetch. Auth-status reads omit OAuth login/consent URLs, MCP resources and audiences; no secondary fetch. |
| Pagination/response/time amplification | 64 KiB per response; 1 s request including streamed body; 3.5 s operation; 10 branches/operations per page, three pages, duplicate/cycle checks; branch next/sort and operation cursor shapes are distinct; 30-row cap for other lists. No retries/partial success. |
| Aggregate disclosure | Project-wide endpoint/operation collections and total branch counts have distinct exact-resource targets. Child/project grants never imply aggregate authority; response filtering is not request authorization. |
| Read waking compute | No compute mutation/SQL/connection/secret fallback exists. GET is NOT proof; independent provider evidence and accepted enablement gates remain unsatisfied. |
| Replay, stale policy, audit failure | Reused common fixture exercises refusal and revalidation. No local replacement authority/store. Production durable journal/audit/credential/recovery adapters absent. |
| Candidate mistaken for authority | Type-only commit-pinned excerpt; candidate tested in isolated Actions checkout; no runtime worker, manifest or registration. Reviewed compatible core is still a qualification prerequisite. |

## Auth-integration metadata delta

| Tool | Exact boundary and refusal evidence |
|---|---|
| `getNeonAuth` | Fixed branch-auth GET; caller selects only a configured branch. Returned branch must equal the requested branch, not merely another configured branch. Output is bound branch/provider/ownership and optional transfer-state enums; database names, external provider IDs, names, timestamps and JWKS/base URLs are excluded and never fetched. |
| `listNeonAuthIntegrations` | Fixed legacy project integration collection GET with its own exact grant, not inferred from branch/auth access. At most 30 rows; every branch must be configured, branch/provider pairs unique, no pagination/truncation/filtering. Deprecated/sunset availability is unknown; 404/410 never becomes empty success or branch-endpoint fallback. Same closed row projection as detail. |

`auth-integrations.test.mjs` maps both operations to canonical arguments, fixed
requests, detached execute/revision revalidation, contradictory ancestry, enum and
list bounds, poisoned outputs, abort/credential-injection refusal and unavailable
response tests. `core.compat.mjs` adds each to authenticated identity, per-agent AND
exact-resource policy, replay and post-credential TOCTOU refusal tests, plus maximum
configuration/output budget, collection/branch non-interchangeability and reflected
lease-material tests. Read source creates no integration, session, user, key or
billing resource: provisioning TTL/spend/cleanup are not applicable. Transport
rate/time/size limits and common replay/audit remain applicable; actual provider
non-waking effects, entitlement and native custody/host integration remain unknown.

No live Neon calls or secrets are needed for these tests. Public source inventory
is not entitlement evidence. Failed/aborted transport calls never retry or turn into
start/restart/resume/suspend, SQL, connection lookup or secret-fetch requests.
