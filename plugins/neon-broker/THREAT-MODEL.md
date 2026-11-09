# Source-slice threat model

## Reserved branch trusted-redirect deletion delta

`deleteBranchNeonAuthTrustedDomain` copies one exact branch/provider/canonical HTTPS
origin/revision. Its dedicated provider/hostname/delete grant cannot be replaced
by list, branch, legacy or another-provider authority. Reserved native exact-plan
authorization precedes credential resolution. Mandatory full nonpaginated list
validation caps at 30 rows, refuses duplicate provider/domain pairs and conflicting
ancestry/pagination, and requires exact case-sensitive selected origin presence.
Other bounded printable domain strings are data only and never followed/emitted.

One fixed DELETE carries only the documented provider and singleton domains body.
The documented empty HTTP200 must terminate empty within the existing request
size/time/cancellation controls; JSON, redirects, nonzero length, content encoding,
wrong status or failed stream are ambiguous, not success. Projection acknowledges
only: it does not independently prove effective redirect removal, revoke tokens
or sessions, fence connections or establish credential completeness. Origin names
are not immutable IDs; preflight is not atomic CAS. Ambiguity gets one bounded
list observation and stays uncertain even on absence or replacement. No retry;
common permanent journal prevents replay/restart. Legacy/bulk/wildcard/port/path/
query/fragment targets remain unsupported. No live change, URL following, host
registration, custody or qualification is provided. Source/common contracts cover
exact authority/identity/resource/replay/TOCTOU, closed projection, reflection,
request/response bounds and ignored metadata. Native independent reviews remain.

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
| Redirect/SSRF/path injection | Explicit fixed GET methods, one reserved snapshot DELETE and one structured log-query POST, constrained identifiers/catalog names, encoded cursor, fixed origin, redirect:error, no arbitrary URL/header arguments, no default fetch. Auth-status reads omit OAuth login/consent URLs, MCP resources and audiences; no secondary fetch. |
| Pagination/response/time amplification | 64 KiB per response; 1 s request including streamed body; 3.5 s operation; 10 branches/operations per page, three pages, duplicate/cycle checks; branch next/sort and operation cursor shapes are distinct; 30-row cap for other lists. No retries/partial success. |
| Aggregate disclosure | Project-wide endpoint/operation collections and total branch counts have distinct exact-resource targets. Child/project grants never imply aggregate authority; response filtering is not request authorization. |
| Read waking compute | No compute mutation/SQL/connection/secret fallback exists. GET is NOT proof; independent provider evidence and accepted enablement gates remain unsatisfied. |
| Replay, stale policy, audit failure | Reused common fixture exercises refusal and revalidation. No local replacement authority/store. Production durable journal/audit/credential/recovery adapters absent. |
| Candidate mistaken for authority | Type-only commit-pinned excerpt; candidate tested in isolated Actions checkout; no runtime worker, manifest or registration. Reviewed compatible core is still a qualification prerequisite. |

## Reserved single-object deletion source delta

The exact copied project/effective branch/bucket/key/expected size/revision and
reserved native exact-plan authority bind a separate object/delete grant. Terminal
bounded prefix-list preflight checks all pages and exact key/size before one encoded,
bodyless DELETE. Key/size are not immutable object identity; preflight is not atomic
CAS and same-key/same-size replacement is unresolved. Inherited visibility proves no
origin ownership or deletion propagation. Hashes, timestamps, content and diagnostics
are not evaluated or emitted. Only empty204 acknowledges, not independent deletion,
access/session/fencing/completeness proof. Ambiguity receives one bounded list
observation, remains uncertain even on absence/replacement, and never retries.
Permanent common journal protects same-request replay/restart only. No bulk deletion,
download, live provider call or enablement. Native session/entitlement/effects,
host/custody/durable recovery and independent review gates remain unresolved.

## Reserved branch bucket-deletion source delta

Copied exact project/effective branch/bucket name/expected access level/revision,
dedicated bucket/delete grant and reserved native exact-plan authority precede
credentials. Mandatory bounded nonpaginated list preflight validates all names,
access levels, duplicates and optional ancestry before one bodyless DELETE.
Selected names are a conservative bounded subset; no force/cascade/object-delete
or ancestor fallback. Inherited visibility is not origin ownership or deletion
propagation proof. Names are not immutable IDs; preflight is not atomic CAS and
same-name replacement race remains unresolved. No emptiness/completeness claim.

Only empty HTTP204 acknowledges; not independently observed deletion, sessions,
fencing or lifecycle enforcement. Creation times/object metadata/diagnostics are
never evaluated/emitted. Ambiguity gets one bounded list observation then stays
uncertain even on absence/access drift; no retry. Permanent common journal blocks
restart/replay, not external writers. Native authority/host/custody/durable recovery,
effects/entitlement/Beta availability and independent reviews remain unresolved.
Source/mocks only; no live deletion, installation or enablement.

## Reserved explicit project-grant removal source delta

Exact copied project/member UUID/user UUID/expected org-role/explicit permission and
revision require a dedicated member/role/remove grant and reserved native exact-plan
authority before credentials. A terminal bounded list preflight validates identities,
explicit grant and expected permission: 10 rows/page, three pages, pagination.next,
duplicate/reassociation/ancestry/cycle/ceiling refusal before the sole bodyless DELETE.
Preflight is not atomic CAS. No confirm_self_lockout is sent; provider self-lockout
controls remain intact. Provider idempotence does not authorize a mutation retry.

Only HTTP200 exact project/member/user/org-role echo acknowledges. Organization-default
access still applies; this is not independent effective-access removal, credential
revocation, session closure, fencing, completeness or cutover enforcement. Profile,
default/effective permission and rotation hints are never evaluated/emitted. Ambiguity
gets at most one bounded list observation and remains uncertain even on absence or
default access. Permanent common journal blocks restart/replay, not external writers.
Each request remains bounded at 64KiB/1s; an 8s operation ceiling covers up to seven
requests. Native host/authority/custody/durable recovery, effects/entitlement and
independent reviews remain unresolved. Source/mocks only; no live grant removal.

## Reserved organization-member removal source delta

Exact copied organization/member UUID/user UUID/expected role/revision and a dedicated
member/remove grant require reserved native exact-plan authority before credentials.
Mandatory detail GET binds all identities and expected role before one bodyless DELETE.
Provider enforces admin and last-admin constraints; there is no bypass, role-change
or project-member fallback. Profile fields and joined_at are never evaluated/emitted.

Only HTTP200 bounded empty JSON object acknowledges; returned member_id is the trusted
target, not a provider echo. Acknowledgement is not independent access removal,
completeness, session closure or cutover fencing. Preflight is not atomic CAS.
Ambiguity gets at most one bounded member-detail observation and stays uncertain
even on absence or matching state; no mutation retry. Permanent common journal
barriers block restart/replay, not external writers. Native authority/host/custody,
durable recovery, provider effects/entitlement and independent reviews remain
unresolved. Source/mocks only; no live member removal or runtime enablement.

## Reserved project-permission revocation source delta

Exact copied project/permission ID/revision and a dedicated permission/revoke grant
require reserved native exact-plan authority before credentials. A bounded 30-row
project-permission-list preflight validates all IDs/duplicates/ancestry and requires
the selected ID before one bodyless DELETE. The selected canonical identifier
subset is narrower than the upstream opaque string; unrelated printable IDs are
validated but never become targets. No email lookup or member-role fallback.

HTTP200 exact ID echo yields closed acknowledgement only. Email and timestamps,
including optional revoked_at, are never evaluated/emitted or used as enforcement
proof. This is not independent effective-access removal, access completeness,
session closure or cutover fencing. Preflight is not atomic CAS. Ambiguity gets at
most one bounded list observation and remains uncertain even on absence or revoke
timestamps. No mutation retry; permanent common journal barriers block restart/replay,
not external writers. Native host/authority/custody/durable recovery, effects and
entitlement qualification and independent reviews remain unresolved. Source/mocks
only; no live revoke, grant, credential retrieval or enablement.

## Reserved branch-credential revocation source delta

Exact copied project/branch/opaque ID/revision and a dedicated credential/revoke
grant require reserved native exact-plan authority before credentials. A bounded
branch-list preflight validates IDs/duplicates/ancestry and requires explicit
matching anchor branch and customer-managed `principal_type: user` for the selected
ID. Missing anchors, platform-internal and unknown principals refuse. This narrower
subset does not claim all credential types. Scopes (including future values),
labels, dates, function identity and secret-like extras are never evaluated/emitted.

One bodyless DELETE accepts only documented empty HTTP204. The transport normalizes
a closed acknowledgement, not an upstream identity echo, independent enforcement,
credential completeness, session closure or cutover fencing. Preflight is not atomic
CAS. Provider idempotence does not authorize retries: ambiguity gets at most one
bounded same-credential list observation and stays uncertain even on absence or
revoked metadata. Permanent common journal barriers block restart/replay, not
external writers. Native authority/custody/host/durable recovery, effects/entitlement
and independent reviews remain gates. No live revoke, reveal, mint, rotation,
credential retrieval or enablement is introduced.

## Reserved organization-key revocation source delta

Exact copied organization/numeric key ID/revision and a dedicated organization/key/revoke
grant require reserved native exact-plan authority before credentials. A fixed
organization-specific 30-row key-list preflight validates all IDs/duplicates/ancestry
and requires the selected numeric ID before one bodyless DELETE. No account-wide
or user-key fallback is allowed. Numeric IDs are not tokens. HTTP200 exact ID plus
explicit revoked=true acknowledge only, not independently observed enforcement,
credential completeness, session closure, expiry or cutover fencing. Legitimate
project-scope metadata, profile/usage data and credential extras are never evaluated
or emitted. Preflight is not atomic CAS or protection against external writers.

Ambiguity gets at most one bounded same-credential organization-key-list observation
and stays uncertain even on absence or observed revoked state; no retry, alternate
identity or invented idempotency header. Three requests have a 3.5s operation ceiling
with per-request 64KiB/1s bounds. Common permanent journal blocks same-request
restart/replay. Native credential authority, host/policy/custody, durable recovery,
effects/entitlement and independent reviews remain gates. Source/mocks only, no live
revoke, credential retrieval, runtime registration or enablement.

## Reserved user-key revocation source delta

Exact copied user/numeric key ID/revision and a dedicated user/key/revoke grant
require reserved native exact-plan authority before credentials. Same-credential
`/users/me` identity proof precedes a capped 30-row key-list preflight and one
bodyless DELETE. Userless/wrong-user keys refuse before the account-wide list.
All list IDs/duplicates/ancestry are validated before selection. Numeric IDs are
not tokens. HTTP200 exact ID and explicit revoked=true acknowledge only, not
credential completeness, independently observed revocation enforcement, session
closure, expiry or cutover fencing. Unused credential/profile/usage fields never
enter projection. Preflight is not atomic CAS or a guard against external writers.

Ambiguity gets at most one bounded same-credential list observation and remains
uncertain even on absence or observed revoked state; no mutation retry, alternate
identity, organization fallback or invented idempotency header. The four-request
worst-case path has a 4.5s operation ceiling, each request retains 64KiB/1s bounds.
Permanent common journal barriers block same-request restart/replay. Native
credential authority, host/policy/custody, durable recovery, effects/entitlement and
independent reviews remain gates. Source/mocks only, no live revoke or enablement.

## Reserved role-deletion source delta

Copied exact project/branch/role name/creation fingerprint/revision and a distinct
role/delete grant require reserved native exact-plan authorization before credentials.
A fixed detail GET checks name/branch/expected `created_at` and explicit `protected: false`
before one bodyless DELETE; protected or missing-protection roles refuse. Creation
fingerprints are not immutable IDs or chronology evidence, and preflight is not atomic
CAS. Same-name replacement after preflight remains a native qualification limit; no
conditional or idempotency header is invented. Only HTTP200 exact bound echo and
bounded unique operation-ID/status observations acknowledge the request. No completed
role deletion, effective ACL revocation, credential expiry, session fence, zero sessions,
no reconnect or lifecycle enforcement is proved, even by finished operation statuses.

HTTP204/ambiguity triggers at most one bounded detail observation then stays uncertain,
even on absence or replacement. No mutation retry, SQL, cascade or protection change.
Passwords, DSNs, authentication methods, updated dates, actions/errors and endpoints
are not evaluated or emitted. Permanent common journal barriers block same-request
restart/replay, not concurrent external actors. Native host/policy/custody/authority,
durable recovery, effects/entitlement, production deletion authority and independent
reviews remain gates. Source/mocks only; no live credential action or runtime registration.

## Reserved endpoint-deletion source delta

Exact copied project/branch/endpoint/revision and a distinct endpoint/delete grant
are required, plus reserved common-core native exact-target/plan authorization
before credentials. Fixed detail GET binds mandatory immutable ancestry before
one bodyless DELETE; not atomic conditional deletion. Caller force, action,
configuration and authority overrides refuse. Only HTTP200 exact endpoint echo and
bounded unique operation-ID/status observations acknowledge the request. Optional
operation ancestry cannot contradict the copied target. Status data, even finished,
is not complete-chain verification or completed deletion/session-closure evidence.
Provider-documented dropped connections are not proved by mocked acknowledgements.

HTTP204 (absent/already deleted) is not causal success. Ambiguity permits one bounded
observation then stays uncertain even on absence; never mutate again or invent an
idempotency header. Permanent common journal barriers block same-request restart/replay,
not concurrent external writers. Unrelated hosts/settings/states/errors/dates remain
unevaluated. No new fence, no-reconnect/deadline enforcer, scheduler, live deletion or
runtime registration. Native effects/entitlement, host/policy/custody, durable recovery,
production authority and independent reviews remain unresolved qualification gates.

## Reserved endpoint-suspension source delta

Exact copied project/branch/endpoint/revision and a distinct endpoint/suspend grant
are required. Reserved common-core native authorization binds the exact plan/target
before resolving credentials; write-tier policy alone cannot substitute. A fixed
detail GET validates mandatory immutable ancestry before one bodyless POST. Closed
arguments reject disabled/security flags, settings, other actions and authority.
HTTP200 exact endpoint echo and bounded unique operation-ID/status observations
acknowledge the request only; optional operation ancestry must not contradict it.
Unrelated fields, states, hosts, settings, actions/errors and dates are not evaluated.

Suspension is not a fence, session drain, no-reconnect guarantee, deadline enforcer
or completed lifecycle evidence. No disabled flag or new scheduler/actor is supplied;
connections can wake computes again. An ambiguous response triggers at most one
bounded detail observation, then remains uncertain even on idle. Permanent common
journal barriers prevent same-request restart/replay, not independent external actions.
No retry, idempotency header, live provider call or runtime registration. Native
host/policy/custody, effects/entitlement, durable recovery and independent reviews
remain gates; the separately missing enforcing actor is not supplied by this source.

## Endpoint label-update source delta

The endpoint rename subset copies exact project/branch/endpoint/revision and
expected/desired bounded labels, requiring a separate exact endpoint/rename grant.
Closed args reject compute sizing, connection/security flags, suspend timeout,
settings, pooling, provisioner and branch changes. Unnamed endpoints are unsupported.
A detail GET validates mandatory immutable ID/project/branch and expected name
before one name-only PATCH; this preflight is not atomic CAS or a dry-run.

Provider endpoint updates can activate idle compute. No exception for name-only
updates, non-waking claim, readiness or lifecycle guarantee is asserted. Only HTTP200
exact identity/name echo yields a closed response acknowledgement. Operations,
hosts, settings, states and other unrelated fields are not read or emitted. One
bounded observation after ambiguity remains uncertain even on desired state;
no retry or invented idempotency header. Permanent common journal barriers block
same-request replay/restart, not independent concurrent external writers. Native
host/policy/custody, effects/entitlement, concurrency, durable recovery and independent
review remain prerequisites. No live endpoint update or runtime enablement introduced.

## Project label-update source delta

The project rename subset copies exact project/revision/expected-desired labels
and requires a distinct project/rename grant; parent, branch, read and delete
grants do not substitute. Closed args refuse settings/IP allowlist/quota, default
compute, history retention and caller authority. The exact diff leaves all those
fields unchanged. Fixed project-detail ID/label preflight precedes one name-only
PATCH, not a provider dry-run or atomic CAS. External concurrent writers remain a
native qualification limit; no serializability or persistent-state claim is made.

Only HTTP200 exact project/desired-label echo yields a closed acknowledgement;
labels, operations and unrelated sensitive metadata are omitted. Ambiguity gets
one bounded detail observation then stays uncertain even on desired state. No
retry, invented idempotency header or observation-to-success conversion exists.
Common permanent complete/uncertain journal barriers prevent same-request replay
across restart; durable recovery/custody, entitlement/effects, host/policy and
independent native reviews remain prerequisites. No runtime registration, lifecycle
enforcement or permission for live project updates is introduced.

## Branch label-update source delta

The branch rename subset requires a copied exact project/branch/revision and
expected/desired bounded label, with a dedicated branch/rename grant. Parent,
sibling, read or delete grants do not substitute. Caller protection, expiry and
approval overrides refuse. The exact before/after plan is not a provider dry-run.
Detail preflight checks immutable ID/project and expected label before one fixed
name-only PATCH; no protection/expiry field is sent. Preflight is not atomic CAS
and cannot stop an external concurrent writer. Live qualification must resolve or
accept that limitation; no serializability is claimed.

Only HTTP200 exact identity/desired-label echo yields a closed acknowledgement.
Provider operations, settings, expiry/protection and labels never enter output or
safe audit. A lost/invalid acknowledgement permits one bounded detail observation,
then remains uncertain regardless of observed desired state or read failure.
There is no automatic PATCH retry, invented provider idempotency header or
read-to-success conversion. The common permanent journal prevents same-request
restart/replay; native durable custody/recovery, effects/entitlement, host/policy
integration and independent reviews remain prerequisites. Source/mocks are not
runtime registration, lifecycle enforcement or permission for live branch changes.

## Reserved snapshot-deletion source delta

This source is a destructive mutation request, not a read, an enabled worker or a
lifecycle enforcer. Its separate exact snapshot/delete grant, copied immutable
ID/source-branch/revision and validated request-only plan require the common
reserved native authority path. Policy alone cannot authorize it. No caller
approval fields, native issuer, durable production journal, custody adapter or
runtime registration are added. Missing native authority refuses before credential
resolution; fixtures exercise exact target/plan binding and single-use consumption.

A bounded project snapshot-list preflight requires the exact selected immutable ID
and source branch. It validates the whole <=30-row nonpaginated list, rejecting
duplicates and contradictory ancestry before a single fixed DELETE. It does not
claim label/expiry CAS or lock the provider. HTTP202 and closed operation UUID/status
observations mean only asynchronous acceptance, not removal or completion. No
compute-scoped, foreign-project/branch or malformed receipt becomes success.

Ambiguous effects trigger at most one bounded read, then stay uncertain regardless
of observed absence/presence/read failure. No automatic DELETE retry, provider
idempotency-header invention, 404-as-success or live polling exists. The consumed
core's permanent journal tombstone blocks restart/replay; native recovery remains
an integration prerequisite and may never discard an uncertain claim just to retry.
Production deletion authority, provider entitlement/effects and native reviews
remain unresolved; no live mutation, credential action or enablement occurs.
Existing read-only tier statements below describe those individual deltas only.

## Selected OAuth-provider metadata delta

Legacy project and branch OAuth-provider lists have distinct exact collection
grants, copied project/branch/revision and a fixed nonempty known-provider selection.
Parent, sibling, plugin and cross-project authority cannot substitute. Strict args
reject caller identity, selection, credentials, endpoint and update overrides.
Closed output includes only selected provider ID/standard-or-shared type; all
<=5 rows are validated before filtering. Unknown enums, duplicates, malformed rows,
contradictory optional ancestry and pagination refuse without partial output.

The pinned GET schema explicitly calls client_secret masked (Apple uses a masked
private-key fingerprint). Even masked material, client IDs, tenant/team/key IDs
and arbitrary diagnostics are not evaluated or emitted. This is not a general
secret scrubber or authority to fetch an email/aggregate response that may include
stored passwords. Those reads and binary object downloads remain incomplete.
Legacy sunset and branch Beta availability, entitlement, provider effects and
native qualification remain unresolved. A failed request never becomes an empty
list or another endpoint. Fixed errors and common credential-reflection/audit
boundaries remain mandatory. No OAuth flow, credential action, mutation, live call,
runtime registration or lifecycle enforcement is added.

## Bounded log-query count delta

`queryProjectBranchLogs` has a dedicated exact branch/logs/query grant and copied
source/revision/absolute window <=1h. Its fixed structured POST always sends
source/start_time/end_time/limit30/ascending order. Raw LogQL, content filters,
caller pagination, relative/default windows and GET/content fallbacks are absent.
The public schema documents a read, but POST/mocks do not prove safe effects.
Private Beta availability and sensitive-log entitlement remain unresolved.

Only observed_count leaves projection; message, attributes, entity/trace identity,
severity, cursor and diagnostics never do. This is bounded occurrence counting,
not unique-event count, complete log evidence or an all-clear verdict. The
nontruncated terminal response must fit30 rows; any continuing cursor, malformed
row, source/optional ancestry contradiction, unexpected pagination or timestamp
outside the half-open interval refuses without partial success. Exact UTC ordering
preserves nanoseconds; equal timestamps are legitimate. Ignored fields are not
comprehensive upstream-schema validation. Authenticated fixed path supplies the
ancestry absent from provider rows. Host revision and common principal/resource,
replay, TOCTOU, audit and lease boundaries remain mandatory. No live provider call,
credential action, mutation, registration or lifecycle enforcement is added.

## Selected log-value observation delta

`listProjectBranchLogFieldValues` reads selected observed values, not a passive
field catalog or log entries. It requires a distinct exact field-values grant,
copied field/source/revision and UTC-second window <=1h. Every request explicitly
sends start_time/end_time/source/limit=30; no relative/default window or query
fallback. Unknown fields and unavailable Beta refuse without discovery. Selected
values cap at30 with80-character printable ASCII bounds. Duplicate/malformed rows,
contradictory ancestry/window/source and pagination refuse before filtering;
is_truncated must be exactly false, including when the provider's scan cap binds.
No partial output, log entries, URLs or arbitrary diagnostics are emitted.

Explicit selection is not general secret DLP. Sensitive log-value entitlement,
provider effects and native runtime qualification remain missing; common leased
credential reflection checks still apply to selected values. Scope revision and
canonical arguments bind the selected window/source; host revalidation remains
required. No live provider call, credential action, mutation or runtime
registration is added. GET and mocks alone do not establish non-waking behavior.

## Selected database-schema identity delta

`getProjectBranchSchema` is a database-schema read, not configuration metadata.
One copied exact project/branch/database/revision and explicit column selection
bind the fixed current-head JSON GET and its distinct database/schema grant.
Historical selectors, SQL format and omitted/default database paths refuse;
there is no schema comparison, SQL connection or fallback. Provider effects and
non-waking behavior require separate qualification; no live read is performed.

Projection emits only selected schema/table/column identities. SQL DDL, types,
nullability, defaults, generated expressions and constraints are not evaluated.
Thirty tables and thirty columns per table bound validation before filtering;
duplicates, malformed/unselected rows, contradictory optional ancestry and
pagination refuse without partial output. The explicit selection caps at thirty
identities to fit common output budgets. The constrained ASCII identifier subset
can refuse valid quoted Postgres names; empty selected output is not evidence of
schema completeness or permission to mutate schema. No runtime registration,
credential action or lifecycle enforcement is added.

## Database-bound advisor summary delta

`getProjectAdvisorSecurityIssues` is database analysis, not passive catalog
metadata. The fixed GET always pins the copied project, branch and database,
SECURITY category and INFO minimum severity; no default target or analysis
fallback exists. A dedicated exact database/advisors/security grant is required.
GET and mocks do not establish non-waking safety, and actual entitlement/effects,
Data API availability, independent native reviews and runtime integration remain
unqualified. No live analysis or SQL connection is performed by source delivery.

Only severity observation counts are returned. Names, detail, descriptions,
metadata and remediation links are ignored without accessor evaluation. Cache
keys are bounded and used solely for duplicate-instance refusal; no key leaves
projection. Unknown severity, malformed/missing SECURITY categories, over-limit
rows, duplicate instances, contradictory optional ancestry or pagination refuse
without partial counts or invented empty success. Repeated issue types may be
separate instances and are not deduplicated by name. Zero observations is not a
security verdict or proof of effective protections. No repair, mutation, runtime
registration, credential action or lifecycle enforcement is introduced.

## Selected branch credential identity delta

`listCredentials` copies an exact project/branch/revision and explicit opaque-ID
selection. Its dedicated branch/credentials collection target does not follow from
parent, sibling or individual-credential grants. The pinned metadata GET excludes
secrets; projection evaluates only token_id and optional project/branch ancestry.
Scope strings, principal/function identity, labels, dates and unexpected payloads
are ignored without accessor evaluation. No credential-value request or mutation
is introduced, and identity listing is not scope/ACL/expiry/custody qualification.

The response has a nonpaginated 30-row ceiling. Duplicate IDs, malformed shapes,
contradictory optional ancestry and pagination refuse before filtering. An absent
branch_id is bound to the fixed request's effective branch, never inferred from a
caller-supplied token or discovered elsewhere. Copied scope, exact collection and
principal policy, replay/TOCTOU, detached resource/revision, malformed/accessor
responses, reflected-lease refusal and maximum common JSON budgets have source
contracts. Unsupported IDs/availability refuse, with no reveal or broader catalog
fallback. Native entitlement, provider effects and integration remain unqualified.

## Exact-account authentication metadata delta

`getAuthDetails` copies a trusted account/revision and requires the exact
account/auth resource, not user, organization, project or parent authority. Caller
arguments cannot override the fixed credential-bound `/auth` request. Required
account_id must match the trusted account before any result can leave projection;
only that ID and the pinned five-value auth_method enum are returned. Opaque
auth_data and unexpected credential/identity/diagnostic payloads are ignored
without accessor evaluation. Account identity is not coerced into another
namespace, and the method does not prove permissions or credential completeness.

Missing/malformed fields, unknown method, wrong account and unexpected pagination
refuse without a profile/catalog fallback, fabricated status or partial result.
Source/common-core contracts cover copied scope, canonical arguments, exact
account grants, principal policy, replay/TOCTOU, cancellation/resource revision,
poisoned/accessor output, reflected lease values and maximum JSON budgets. No
live credential probe, mint/rotate/reveal, authority change or runtime registration
is supplied; native entitlement, effects and custody qualification remain unknown.

## Selected masking-rule identity delta

`getMaskingRules` copies one exact project/branch/revision and bounded explicit
four-part database/schema/table/column tuples. Its exact branch/masking_rules
collection grant is distinct from parent, sibling, schema and anonymization
resources. The fixed GET returns sensitive configuration: only exact selected
identities are projected. Masking expressions, literal replacement data and
arbitrary diagnostics are ignored without accessor evaluation; no expression,
function, SQL or data query is executed. This is not an effective-masking verdict.

Thirty rows cap the nonpaginated collection before filtering. Duplicate tuples,
malformed catalog names, unexpected pagination and contradictory optional ancestry
refuse even on unselected rows. Closed arguments reject caller selection/authority;
construction copies nested tuples. Source and common-core contracts cover exact
identity/resource policy, replay/TOCTOU, detached execution, redaction/reflection,
maximum input/output budgets and unavailable or failed responses. Beta availability
and non-waking/provider effects remain unresolved native gates. No rule mutation,
anonymization trigger, schema read or lifecycle authority is introduced.

## Legacy project consumption delta

`getConsumptionHistoryPerProject` uses a distinct legacy consumption target with
copied organization/project/revision and exact hour-aligned UTC window <=24h.
Mandatory org_id/project_ids filters and compute_time_seconds selection prevent
an account-wide or default multi-metric request. V2 and parent grants do not
authorize legacy history. The fixed legacy endpoint is never a fallback from V2.

Only exact project ID, observed hourly boundaries and safe-integer CPU seconds
are projected. Billing identifiers/plans, other metrics, retired storage values
and diagnostics are not read or exposed. Missing observations are not zero usage,
capacity or entitlement evidence. Full pages validate before output; duplicates,
conflicting ancestry, malformed periods, unsafe quantities, nested pagination,
cycles and overlapping/unordered/out-of-window frames refuse without partial
success. Ten rows/page, three pages, 30 periods and 24 total frames bound work.

Strict copied arguments, detached execution, exact grants, identity, replay/TOCTOU,
reflection and maximum budgets have authored source/common-core contracts.
Unavailable legacy plans/ranges refuse; no upgrade, V2 fallback, mutation or spend
control exists. Provider documentation describes a non-waking read, but native
provider-effect and entitlement qualification remain required. No runtime
registration, live grant or lifecycle authority is introduced.

## Selected bucket-object metadata delta

`listProjectBranchBucketObjects` copies one project/branch/bucket/revision, required
prefix and explicit object-key selection. Its exact bucket/objects collection grant
cannot be replaced by bucket-list, parent, sibling or download authority. Provider
listing includes inherited objects in the requested effective branch; contradictory
optional project/branch/bucket ancestry refuses. No origin-branch inference is made.

The fixed GET supplies prefix and limit=10 without delimiter. Each page must echo
the prefix, have no folders and pair is_truncated with a valid next_cursor, or an
absent/empty cursor on completion. Three pages and 30 rows are the total ceiling;
duplicate keys, cycles, malformed rows, out-of-prefix keys and unsafe sizes refuse
before selection. Detached projection revalidates the entire completed aggregate.
Only explicitly selected printable-ASCII keys (80 characters) and safe integer byte
sizes are emitted. Content, entity tags, modification times and download URLs are
not read or exposed; arbitrary unused fields are ignored without accessor evaluation.

Source/common-core contracts cover strict copied scope, detached execution,
exact/sibling grants, authenticated identity, replay/TOCTOU, reflected lease data,
maximum configuration/output and failed or unavailable Beta/session responses.
No download/presign, content read, mutation, lifecycle or runtime registration is
introduced. Beta entitlement, session availability and provider effects remain
unqualified; GET/mocks are not non-waking evidence. Missing selected keys are only
unobserved in this bounded catalog, not deletion or authorization evidence.

## Selected branch log-field catalog delta

`listProjectBranchLogFields` copies one project/branch/revision and explicit field
selection, requiring the exact branch/logs/fields grant. The ID-less response is
bound by the fixed authenticated path; optional ancestry must match that branch.
Names are dynamically observed data, not a hardcoded provider enum. The closed
projection exposes only selected printable ASCII names of at most 80 characters.
The nonpaginated 30-row bound and duplicate/shape/ancestry/pagination checks apply
before filtering; malformed unselected names still refuse. Empty observation and
selection are valid, but non-200 never becomes empty success or a query fallback.

No log entry, message, field-value discovery, download, mutation or lifecycle
primitive is introduced. Unexpected content/diagnostics are not read or emitted.
Source/common contracts cover copied scope, strict arguments, exact/sibling grants,
accessors and malformed/poisoned output, transport bounds/cancellation, principal
binding, replay/TOCTOU, reflected names and maximum JSON budgets. Private Beta
availability, entitlement and provider effects remain unknown; mocks are not
non-waking evidence or native runtime qualification.

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

## Function metadata delta

The beta branch function collection and slug detail have separate exact grants;
project/branch grants are insufficient. Trusted ID/slug/branch bindings are copied,
unique and capped at 16. Detail identity and optional ancestry match the exact
request. A changed ID at a trusted slug or a selected ID returned for the wrong
branch refuses; unrelated DNS-label functions are filtered after collection access
is authorized. The pinned detail parameter is narrower than the response's slug
description: selected slugs are lowercase alphanumeric 1–20, never normalized.

Output is ID/slug and optional deployment ID/status only. Invocation URLs, names,
environment names, errors, runtime/memory/source and timestamps are dropped without
following any location. Current deployment may still be building/failed; active
must be completed. Missing deployments do not imply deployed or disabled. Tests in
`functions.test.mjs` cover these boundaries, injected accessors, strict arguments,
request identity, bounded pagination/cycles/duplicates/overflows and unavailable
responses. Common compatibility tests cover each operation's identity, exact agent
AND resource policy, stale/replayed requests, TOCTOU changes, poisoned diagnostics,
reflected lease material and maximum selection/output JSON budgets.

Fixed 10-row pages, at most three, use encoded opaque cursors; no incomplete page
sequence returns success. No create/deploy/invoke/delete or secret/SQL fallback is
provided. Source mocks establish no beta entitlement, non-waking behavior, custody
or native integration; these remain qualification gates. No resources are created,
so provisioning TTL/spend/teardown is not applicable to this read-only source tier.

## Trigger metadata delta

The beta trigger list/detail use separate exact branch collection/ID resources,
not inferred from project, branch, function or inherited parent-trigger grants.
Copied trusted bindings are branch/ID/function-slug tuples, unique per branch/ID,
with at most 16 branch IDs and 16 bindings. Inherited project-wide IDs may appear
on multiple explicitly bound branches; selection on one branch never selects the
other. Fixed request paths bind effective branch context through execute/project;
optional provider identities must agree, and detail must match the exact requested
ID. Unsupported selected IDs outside the common 80-character resource subset refuse;
provider-valid unselected IDs may be filtered, not normalized into selected targets.

Output is ID/type/slug/enabled/inherited/positive safe-integer version only. Cron,
function paths, names, storage bucket/prefix configuration and timestamps are not
read or emitted. Unknown types, malformed states, unsafe int64 versions, selected
slug drift, contradictory ancestry, duplicate IDs, pagination and lists over 30
rows refuse. Configuration/output ceilings fit the common JSON budgets. Every
operation participates in common identity, exact-resource, replay, TOCTOU and
redaction tests; trigger-specific contracts cover inherited bindings, fixed requests,
closed output, malformed shapes/accessors, bounds and beta-unavailable failures.
No provisioning, TTL/spend/cleanup, scheduler or lifecycle enforcement is introduced.
A trigger enabled flag is metadata, not execution authority or runtime readiness.
No create/update/delete/invoke fallback exists; provider effects, beta availability,
entitlement and native custody/host integration remain unverified qualification gates.

## OAuth-client metadata delta

The beta OAuth-client collection/detail have separate exact branch resources and
copied client-ID/branch bindings (16 branches/bindings maximum). Project/branch and
client identifiers follow pinned path limits; no caller authority, URL or secret is
accepted. Fixed authenticated paths establish ancestry, optional returned identities
must match, and detail must return the exact requested client ID in the unwrapped
schema. Execute carries request context into projection. Collection filtering is
additional minimization after collection authorization; it grants no detail access.
Lists cap at 30 before filtering and reject duplicate IDs/pagination, never truncate.

Output is client ID/type/skip-consent/disabled only. Names, redirect/resource URLs,
timestamps and unexpected client secrets are dropped without reading or fetching
them. Pinned GET schemas exclude client secrets; create/rotate schemas are never
used. Unknown types, missing/malformed flags, wrong selected detail and ancestry
refuse. Non-200 does not become empty/disabled success or mutation/secret fallback.
`auth-clients.test.mjs` covers strict requests, detached revalidation, copied scope,
exact paths/envelopes, poisoned outputs, accessors, bounds and unavailable transport.
Each operation also consumes common identity, per-agent AND exact-resource, replay,
TOCTOU, reflected-lease and maximum-scope/output budget tests. No resources, OAuth
flows, grants, secrets, TTL/spend/teardown or lifecycle enforcement are introduced.
Provider effects, beta availability, entitlement and native custody/host integration
remain qualification gates; mock success proves none of them.

## Project security-metadata delta

`getProjectJWKS` and `listProjectVPCEndpoints` require distinct exact project
collection grants before credential access. Scope copies bounded explicit IDs;
JWKS bindings distinguish project-level absence from an exact trusted branch.
Selected rows require the configured project and branch, and all JWKS rows must
contain the project ID. VPC rows cannot introduce branch context. Collection
filtering is minimization, not an alternative authorization mechanism or proof of
complete network restrictions. Outputs contain configuration/VPC IDs and bound
JWKS ancestry only, never URLs, provider names, audiences, roles, labels or times.
Returned JWKS URLs are not fetched; no key material or cryptographic verification
is implemented. Both lists are nonpaginated and cap at 30 before selection, with
duplicate, malformed, ancestry and pagination refusal rather than partial output.
No authentication/network mutation or fallback is exposed. Dedicated contracts
cover poisoned output, missing branch versus null, malformed/accessor inputs,
transport failures and copied scope; common contracts cover identity, exact-resource
policy, replay/TOCTOU, credential reflection and maximum configuration/output.
Provider effects, entitlement and native qualification remain unverified.

## Project access-metadata delta

`listProjectPermissions` and `listProjectMembers` use separate exact project
collection resources. Trusted scope copies bounded permission IDs and member/user
pairs. Output is selected permission ID or paired member/user IDs with known org
role and optional effective permission/grant source. Email, names, timestamps and
other permission levels are omitted without access. Neither ID presence nor an
omitted permission is evidence of active/denied access or complete effective ACLs.
Member/user reassociation, identity collisions, contradictory project/branch
ancestry and malformed selected status refuse. Lists cap before filtering;
permissions reject pagination, members use fixed 10-row pages and response next
cursors for at most three pages. Every accumulated page validates before another
request. No partial result escapes after duplicate/cycle/limit/failure refusal.
There is no role/access mutation or runtime authority extension. Dedicated tests
cover selection, copied bindings, sparse/accessor inputs, output poisoning,
ancestry, encoded pagination and transport failures. Common contracts enforce
principal/exact-resource separation, replay/TOCTOU, credential reflection and
maximum configuration/output budgets. Native effects/entitlement remain unknown.

## Organization configuration metadata delta

`getOrganization` and `getOrganizationSpendingLimit` bind one copied organization
ID/revision, using separate exact detail and spending-limit resources. No parent,
child, billing, VPC or project grant implies another. Detail output is the exact ID
and optional boolean MFA/HIPAA flags only; absence stays unknown, never fabricated
false or a compliance/qualification verdict. Names, handles, plan/manager strings
and timestamps are not read. Spending output preserves null, zero and nonnegative
safe-integer cents distinctly; unsafe int64, negative, fractional and negative-zero
values refuse without rounding or a fabricated absent cap. Reported configuration
is not runtime spend enforcement or authority to spend/change a limit. Fixed request
paths establish organization context for the ID-less spending response; optional
org_id must agree, project/branch ancestry and pagination refuse. Non-200 never
becomes default/empty success or a cross-endpoint fallback. Tests cover canonical
arguments, output poisoning, copied bindings, nullable/numeric boundaries, transport
failure and common principal/resource/replay/TOCTOU/reflection/budget contracts.
Provider entitlement/effects and independent runtime qualification remain unknown.

## Organization membership metadata delta

`getOrganizationMembers` and `getOrganizationMember` use distinct exact collection
and member resources, with copied one-to-one member/user UUID bindings under one
organization. The collection's nested member records and unwrapped detail expose
only IDs, organization and known role; email/profile, MFA/deactivation and timestamps
are not read. No identity is discovered into policy and no active-access conclusion
is implied. A returned configured sibling cannot satisfy the requested detail.
Fixed 10-row pages use joined_at/desc ordering and response next cursors for at most
three pages, validating echoed ordering and accumulated rows before another request.
Duplicate identities, reassociation, ancestry, malformed pagination, cursor cycles
and page exhaustion refuse without partial success. Contracts cover closed arguments,
copying, selection, poisoned output, transport failures, exact grant separation,
common identity/replay/TOCTOU/reflection and maximum-scope budgets. No member mutation,
invitation flow or lifecycle authority is supplied. Native effects remain unverified.

## Organization invitation metadata delta

`getOrganizationInvitations` requires its own exact collection grant under one
copied organization/revision and at most 16 unique invitation UUID bindings. Parent,
member and individual invitation resources do not authorize the collection. Output
contains only selected id/org_id/known-role fields; schema-sensitive email, inviter
identity, timestamps and unexpected credential fields are not read. Conflicting
schema prose about pending/accepted invitations is not turned into a status or
active-access claim. The authenticated fixed request path and every row's required
org_id must agree. This is not a complete invitation or access inventory.

The pinned endpoint has no pagination; at most 30 rows are validated before
filtering. Duplicate IDs, including unselected ones, malformed roles/identities,
contradictory ancestry and pagination refuse without partial success. Source and
common contracts cover copied scope, canonical arguments, poisoned/accessor output,
non-200/oversized transport, exact grants, principal binding, replay, TOCTOU,
reflected credentials and maximum JSON budgets. No send/revoke/accept or member
mutation occurs. Availability, effects and native qualification remain unknown.

## Database-bound Data API status delta

`getProjectBranchDataAPI` copies at most 30 unique branch/database pairs under one
project and revision. Its exact database configuration resource is distinct from
parent, collection, sibling and catalog-database grants. The fixed authenticated
path supplies ancestry absent from the pinned response; any returned project,
branch or database identity must agree with that specific request. Contradictory
ancestry and pagination refuse. Closed status-only output is a bounded lowercase
ASCII token, not an inferred enabled state, provider enum or readiness verdict.
Malformed/unsupported status strings refuse instead of returning defaults.

Endpoint/JWKS URLs, settings, available schemas, observation time and provider or
audience fields are not read or followed. Cached status is not current database or
authentication evidence. There is no schema/content query, provisioning/mutation,
URL fallback or live integration. Contracts cover copying, exact database grants,
malformed/accessor/poisoned output, transport refusal, common identity/replay/TOCTOU,
credential reflection and maximum-scope configuration/output budgets. Entitlement,
non-waking effects and native runtime qualification remain unknown.

## Organization-filtered project count delta

`countProjects` validates and copies one organization/revision and requires the
exact aggregate resource `neon/organizations/<org>/projects/count`. Caller arguments
contain only that org_id; the fixed GET always includes it, with no unfiltered
fallback. Parent/list/project/branch-count grants do not imply this authority.
Closed output is only a nonnegative safe integer, including zero; unsafe,
fractional, negative and negative-zero numbers refuse rather than round/default.
The provider excludes creating/deleting projects: this aggregate is not a selected
project count, an access inventory or provisioning capacity evidence. The ID-less
response is bound by its authenticated organization-filtered request; optional
organization identity must agree, project/branch identity and pagination refuse.
Project records, names, owners and diagnostics are not read or emitted. Non-200
never becomes zero or another endpoint fallback. Source/common contracts cover
canonical arguments, copied scope, exact grants, numeric/accessor/poisoned output,
transport failure, principal binding, replay, TOCTOU and maximum JSON budgets.
No enumeration or mutation is introduced; beta availability, native entitlement,
provider effects and runtime qualification remain unknown.

## Auth webhook configuration delta

`getNeonAuthWebhookConfig` copies project/revision/branch selection and requires
its exact branch/auth/webhooks resource, not parent/auth/plugin authority. The
fixed path GET returns only boolean enabled status, at most seven unique known
event names and optional integer timeout of 1–10 seconds. Missing optional values
are not defaulted. Destination URLs, signing material and arbitrary diagnostics
are not read or emitted; no URL following, delivery/test, update or deletion path
is introduced. Optional ancestry must match the trusted selection and the exact
requested branch; pagination refuses. Non-200/invalid output never becomes disabled
status or a fallback. Cached configuration is not evidence of delivery success,
endpoint health or actual event processing. Source/common contracts cover copied
scope, canonical arguments, exact grants, sibling/cross-branch refusal, output
accessors/duplicates/enums/bounds, reflected material, replay/TOCTOU and maximum
JSON budgets. Native entitlement, provider effects and runtime qualification stay
unknown; no non-waking claim follows from mocks.

## Exact-user profile delta

`getCurrentUserInfo` copies a trusted user ID/revision and requires its dedicated
user/profile resource. Arguments must name that user, but are never forwarded as
a query override: the fixed `/users/me` request is credential-bound. The returned
ID must match exactly, preventing silent cross-account response rebinding. Parent,
sibling, project and organization grants do not imply this profile authority.
Closed output includes only the ID and project/branch limits as nonnegative safe
integers. Unsupported IDs, unsafe limits, missing fields and pagination refuse;
non-200 never becomes zero capacity or an alternate enumeration request.

Names, email/login, avatars, linked authentication accounts, billing/plan details,
compute/autoscaling quotas and diagnostics are neither projected nor followed.
Reported limits do not prove available capacity, current entitlements or authority
to provision. Source/common contracts cover copied identity, canonical arguments,
exact grants, wrong-credential identity, malformed/accessor/poisoned output,
transport failure, reflected material, replay/TOCTOU and maximum JSON budgets.
No profile mutation, opaque authentication-details/credential read or live runtime
integration is supplied. Entitlement and effects remain unknown; GET/mocks are
not evidence of non-waking behavior.

## Email-auth configuration delta

`getNeonAuthEmailAndPasswordConfig` copies project/revision/branch selection and
requires the exact branch/auth/email_and_password grant. The pinned response has
seven required booleans and a required link/otp verification enum, not passwords
or email-provider credentials. The closed projection preserves all required
values, including false; missing fields, unknown enum values, accessors,
contradictory ancestry and pagination refuse. Execution additionally matches the
exact requested branch. Fixed bounded GET transport never changes configuration,
sends mail, follows URLs, resets passwords or revokes sessions. Optional unexpected
password/provider/diagnostic fields are not read or emitted. Non-200 never becomes
disabled/default policy or an alternate endpoint. Reading a configured revocation
flag does not establish actual session-closure or lifecycle enforcement.

Source/common contracts cover canonical arguments, copied scope, exact/sibling
grants, malformed/poisoned output, cancellation, response bounds, reflected values,
replay/TOCTOU and maximum JSON budgets. This nonsecret schema-backed read moves
one inventory row from reserved to read without enabling it; sensitive aggregate
and email-provider reads stay incomplete. Provider effects and entitlement remain
unknown; mocks do not qualify authentication behavior or non-waking safety.

## Organization-filtered project catalog delta

`listProjects` requires an exact organization collection grant and copied trusted
project-ID selection. The fixed request always carries org_id, limit=10 and
recoverable=false; no caller-controlled search/filter/cursor or account-wide
fallback is available. Organization/project/count grants are not interchangeable.
Optional response ancestry is checked on every page and row; selected IDs are
validated and deduplicated across all pages before filtering. Closed output is
only ID, region and PostgreSQL version, never provider settings, owner metadata,
names, URLs, usage/billing or application/integration maps.

The pinned Pagination.cursor contract is used, not PaginationNext.next. Malformed
or cyclic cursors, overlarge pages and continuation beyond three pages refuse
without partial success. Every page validates unavailable_project_ids and refuses
when a selected project is reported unavailable, preventing incomplete reads from
becoming an apparently complete empty result. Malformed/duplicate unavailable IDs
also refuse; unselected unavailable IDs are not exposed. No retry, recovery, creation, deletion, live integration
or provisioning authority is introduced. Tests cover immutable scope, strict
arguments, cancellation, cross-organization ancestry, duplicate/unselected rows,
closed metadata, fixed transport and common identity/policy/replay/TOCTOU/reflection
boundaries. Catalog presence does not prove entitlement, capacity or non-waking
provider effects; all qualification and credential-custody holds remain.

## Exact-user organization catalog delta

`getCurrentUserOrganizations` needs the exact selected user's organizations
collection grant, not a profile, parent or organization-detail grant. Trusted
user/revision and up to 30 unique organization IDs are copied. The pinned catalog
can return an owning organization for userless keys; a fixed `/users/me` identity
proof must therefore match the selected user before the catalog is requested with
the same resolved credential. Failure, wrong identity or cancellation stops the
sequence without a fallback. This is two bounded GETs, not atomic membership or
current entitlement evidence; native provider-effect/custody qualification remains.

Projection rechecks the identity proof and emits only selected organization IDs.
Names, handles, plans, manager strings, timestamps, user profiles and diagnostics
are not read or followed. Every row is validated before selection; lists over 30,
duplicates, contradictory optional ancestry and pagination refuse without partial
success. Detached execution rechecks exact arguments/resource/revision; contracts
cover userless/wrong-user refusal before catalog, cancellation between requests,
fixed paths/same credential, malformed/accessor/poisoned output and common-core
identity/exact-grant/replay/TOCTOU/reflection/output budgets. No transfer, membership
mutation, credential discovery, live integration or runtime authority is supplied.

## Exact-user shared-project catalog delta

`listSharedProjects` requires its dedicated exact-user shared_projects collection
grant and copied explicit project selection. Profile, organization catalog and
project-detail authority cannot substitute. The same resolved credential first
proves the exact selected user via fixed /users/me, then reads /projects/shared;
wrong-user and userless keys refuse before the catalog. No ownership or effective
permission is inferred from shared membership. Output is selected ID/region/PG
version only, omitting owner/profile/organization details, names, URLs, settings,
permission labels, usage and diagnostics.

All rows are validated before filtering; duplicate IDs, contradictory optional
user/project/branch ancestry, malformed or repeated cursors and pages over ten
refuse. Three catalog pages plus one identity request fit a single 4.5-second
operation deadline; continuation at the ceiling refuses without partial success.
Every page and detached projection rejects unavailable selected IDs. No caller
search/cursor/limit, cross-catalog fallback, blind retry, mutation or live runtime
is introduced. The proof and catalog are not an atomic access snapshot. Mocked
contracts cover strict scope/arguments, cancellation, availability, pagination,
closed output and common-core identity/grant/replay/TOCTOU/reflection/budget
boundaries; native provider-effect/entitlement/custody gates remain unresolved.

## Selected organization API-key identity delta

`listOrgApiKeys` copies one organization/revision and bounded explicit numeric ID
selection, requiring its exact organization/api_keys collection resource. The
pinned GET returns a bare metadata array without tokens; numeric IDs are distinct
from key values. Closed output is only selected IDs. Names, creator/profile data,
usage addresses, timestamps, project scope and unexpected key fields are neither
read nor emitted. Optional org_id must match; pagination and non-array wrappers
refuse. All rows are validated before selection: duplicate/unsafe/fractional/
negative/negative-zero identities and more than 30 rows refuse without partial
success. The ID-less outer response binds to the fixed authenticated org path,
not caller-provided metadata. Empty selection does not assert inventory emptiness.
There is no account-wide fallback, credential-value retrieval or mutation. This
one schema-backed inventory row moves reserved to read, not to enabled. Native
provider effects, entitlement, placement and independent acceptance remain gates;
mocked source success proves no effective access, custody, expiry or completeness.

## Exact-user API-key identity delta

`listApiKeys` copies the exact user/revision and an explicit bounded numeric-ID
selection. The exact user/api_keys collection grant is distinct from profile,
account, organization and individual-key authority. Before the fixed `/api_keys`
GET, `/users/me` must prove this exact user under the same resolved credential;
wrong-user/userless identities and cancellation refuse before collection. Output
is only selected numeric IDs, not tokens or evidence of credential scope/custody.
Names, creator profiles, usage addresses, dates and unexpected secret extras are
never evaluated. The pinned GET explicitly excludes tokens; mint/revoke/rotate
remain separate incomplete obligations, not source-enabled operations.

All rows are validated before selection with a 30-row nonpaginated ceiling and
safe-integer/negative-zero/duplicate/contradictory-ancestry refusal. No partial
success, account-wide output/fallback, key retrieval or live effect is introduced.
Detached projection rechecks the identity proof; execute rechecks exact arguments,
resource and revision. Both requests remain bounded inside one operation deadline.
An empty selection/output is not completeness, and the two GETs do not prove an
atomic permission snapshot or non-waking safety. Provider effects, entitlement,
credential placement and independent native acceptance remain unresolved.

## Current-head directional schema-comparison observation delta

`getProjectBranchSchemaComparison` requires a copied exact project, target branch,
distinct base branch, database and revision. A single directional pair/database
comparison resource grants this request: either branch's schema grant, a parent,
sibling database, different base or reversed pair is insufficient. Composed resources
are checked against the common 256-character limit at construction. The fixed GET
always sends explicit base_branch_id and db_name; it refuses caller historical,
format, default-base and same-branch alternatives. No schema extraction or SQL
fallback, mutation, migration or live call is introduced.

The provider returns a unified SQL diff, which can contain sensitive schema/literal
data. It is never executed or emitted. Only bounded nonemptiness becomes the closed
boolean has_diff observation; empty is not a semantic equivalence or completeness
verdict, and arbitrary nonempty text is not parsed as trustworthy SQL. The required
diff string caps at 16,384 UTF-8 bytes, permits multiline Unicode scalar data and
refuses other controls/lone surrogates. Missing/malformed/oversized content,
contradictory optional project/target/base/database ancestry and pagination refuse,
not false/no-diff success. Unused SQL/diagnostic/credential fields are not evaluated.
Source/common-core contracts cover exact pair authority, copied scope, canonical
arguments, detached execution, accessor/output bounds, abort/unavailable transport,
principal binding, replay, TOCTOU and maximum request/resource/output budgets.
The authenticated fixed request supplies ancestry absent from the pinned response;
this does not establish atomicity across live branch heads. Database comparison
may wake compute; native effects, entitlement and independent acceptance remain
unresolved. No runtime tool is enabled.

## Reserved database-deletion acknowledgement delta

`deleteProjectBranchDatabase` binds copied project/branch/database name/immutable
numeric database ID/revision to a dedicated database/delete resource and reserved
native exact-plan authority. Parent/read, project/branch-delete, sibling-database
and cross-agent grants never substitute. Mandatory detail GET requires exact
ID/name/branch before one bodyless DELETE. Same-name replacements refuse, but
preflight is not atomic CAS and cannot eliminate a subsequent rename/replacement
race without provider support. No SQL, force/cascade, recovery, credential or
arbitrary URL override is accepted. Source mocks authorize no live deletion.

Only bounded HTTP200 exact identity plus unique operation-ID/status observations
yield closed acknowledgement, not completed deletion, session closure, no reconnect,
fencing, recovery or cutover enforcement. Owner names, timestamps, operation actions,
endpoint IDs and diagnostics are omitted without evaluation. HTTP204, lost, rejected
or malformed responses get at most one bounded observation and stay uncertain even
on absence or name reuse; no mutation retry or invented idempotency header. Native
durable journal integration must retain complete/uncertain tombstones across restart.
Custody, host/policy, durable recovery, native authority, effects/entitlement,
production deletion authority and independent reviews remain unresolved; no runtime
tool enabled. GET/mocks do not prove non-waking safety.

## Reserved project-deletion acknowledgement delta

`deleteProject` binds copied project/owning organization/revision to a dedicated
project/delete resource and reserved native exact-plan authority. Parent/read,
rename, branch-delete, sibling-project and cross-agent grants never substitute.
Mandatory detail preflight requires exact project ID and required owner_id; optional
org_id must agree. Exactly one bodyless DELETE explicitly cascades to all endpoints,
branches, databases and users, not a selected subset. No caller cascade/force,
credential, recovery or arbitrary URL override is accepted. Preflight is not atomic
CAS or proof of ownership at mutation. Source mocks authorize no live deletion.

Only bounded HTTP200 exact project/owner echo yields a closed acknowledgement,
not completed cascade deletion, fencing, zero sessions/no reconnect or cutover
enforcement. Provider-documented recovery within seven days is not verified or
performed here. Names, hosts, settings, usage, owner profiles and diagnostics are
omitted without evaluation. HTTP204, lost, rejected or malformed responses get at
most one bounded observation and stay uncertain even on absence; no mutation retry,
recovery/catalog fallback or invented idempotency header. Native durable common
journal integration must retain complete/uncertain tombstones across restart.
Custody, host/policy, durable recovery, effects/entitlement, production deletion
authority and independent reviews remain unresolved; no runtime tool enabled.

## Reserved branch-deletion acknowledgement delta

`deleteProjectBranch` binds one copied project/branch/parent/revision to a dedicated
branch/delete resource and reserved native exact-plan authority. Parent/project,
rename, endpoint-delete, sibling-branch and cross-agent grants do not authorize it.
Mandatory detail preflight binds immutable project/branch/parent, refuses root,
default or protected branches and requires explicit false flags before one bodyless
DELETE. No force/cascade, protection/default change, caller authority or arbitrary
URL is accepted. Child constraints remain provider-enforced; preflight is not atomic
CAS or a complete child inventory. Provider deletion idles compute and breaks client
connections; source/mocks authorize no live disruption.

Only bounded HTTP200 exact branch identity and unique operation-ID/known-status
observations produce a closed acknowledgement. Empty lists and individual finished
statuses never establish completed deletion, a connection fence, zero sessions,
no reconnect or cutover enforcement. Names, endpoint IDs, state, dates, action/error
and arbitrary diagnostics are omitted without evaluation. HTTP204 (absent/already
deleted), lost, malformed or rejected mutation responses receive at most one bounded
identity observation and remain uncertain even on absence; no automatic mutation
retry or invented idempotency header. Native durable common journal integration must
block restart/replay. Custody, host/policy, effects/entitlement, production deletion
authority and independent native reviews remain unresolved; no runtime tool enabled.

## Reserved endpoint-restart acknowledgement delta

`restartProjectEndpoint` binds one copied project/branch/endpoint/revision to a
dedicated endpoint/restart resource and reserved native exact-plan authority.
Parent, start, rename, suspend, delete, sibling endpoint and cross-agent grants
do not authorize it. Mandatory detail preflight requires immutable endpoint/project/
branch identity before one bodyless POST /restart. The provider immediately suspends
then starts compute; preflight is not atomic CAS or provider-effect qualification.
No caller authority, action, configuration, credential or arbitrary URL is accepted.
Mocks authorize no live disruption, activation or spend; native production and spend
authority remain prerequisites where applicable.

Only bounded HTTP200 exact identity and unique operation-ID/known-status observations
produce a closed acknowledgement, not readiness or successful complete-chain evidence.
Empty operations and individual finished states do not establish a successful restart,
connection fence, session closure or cutover-enforcement verdict. Unused host/settings/
state and arbitrary action/error fields are never evaluated/emitted. Malformed or lost
mutation responses get at most one bounded detail observation then remain uncertain,
including an active endpoint. No automatic mutation retry, success inferred from
observation or invented provider idempotency header. The common permanent journal must
survive native restart/replay; durable integration and independent acceptance remain
unresolved. The separate metadata factory gains no mutation descriptor or fallback.

## Reserved endpoint-start acknowledgement delta

`startProjectEndpoint` binds one copied project/branch/endpoint/revision to a dedicated
endpoint/start resource and reserved native exact-plan authority. Parent, rename,
suspend, delete, sibling endpoint and cross-agent grants do not authorize it.
Mandatory detail preflight requires immutable endpoint/project/branch identity before
one bodyless POST /start; this is not atomic CAS or provider-effect qualification.
No caller authority, action, configuration, credential or arbitrary URL is accepted.
The start explicitly requests compute activation; mocks authorize neither live
activation nor spend. Native custody, policy, entitlement/effects and any applicable
spend authority remain prerequisites.

Only bounded HTTP200 exact identity and unique operation-ID/known-status observations
produce a closed acknowledgement. The pinned contract requires successful completion
of the last operation in the chain for readiness; neither an empty list nor an
individual finished status establishes that requirement. No chain polling, readiness,
session or cutover-enforcement verdict is supplied. Unused host/settings/state and
arbitrary action/error fields are never evaluated/emitted. Malformed or lost mutation
responses get at most one bounded detail observation then remain uncertain, including
an active endpoint. No automatic mutation retry, success inferred from observation,
or invented provider idempotency header. The common permanent journal must survive
native restart/replay; durable integration and independent acceptance remain unresolved.
The separate metadata factory does not gain any mutation descriptor or fallback.

## Reserved OAuth-client deletion acknowledgement delta

One copied exact project/branch/client/revision binds a dedicated client/delete
resource and reserved native exact-plan authorization. Mandatory fixed detail
preflight validates the selected client and optional ancestry before one bodyless
DELETE. Caller authority, scope, secret, URL and retry overrides refuse. The detail
GET contract excludes client secrets; unused names, redirects, resources, flags,
timestamps and unexpected secrets are never evaluated/emitted. Preflight is not
atomic CAS and does not prove durable identity across the mutation race.

Only the documented empty HTTP204 normalizes to a closed acknowledgement; no
provider identity echo is invented. Already-issued tokens explicitly remain valid
under the upstream contract: deletion is not token revocation, session closure,
connection fencing or cutover enforcement. Ambiguous responses receive at most one
bounded detail observation, remain uncertain even on absence or disabled state,
and never retry. The common permanent journal prevents restart/replay; native
host/authority/custody/durable recovery/effects/entitlement qualification and all
independent reviews remain prerequisites. No live deletion, secret action, OAuth
flow, create/rotate fallback or runtime registration is introduced.

## Reserved JWKS-deletion acknowledgement delta

Copied exact project/JWKS ID/nullable branch/revision binds a dedicated delete
resource and reserved native exact-plan authorization. Null requires absence of a
branch field; it never widens to any branch. Mandatory nonpaginated list preflight
caps at 30 rows, rejects duplicate/foreign/malformed/paginated observations and
requires selected identity presence before one bodyless DELETE. HTTP200 must echo
exact ID/project/branch. URLs, provider names, audiences, roles, timestamps and
unexpected secrets are never evaluated or followed; caller identity, authority,
URL, credential, target and retry overrides refuse. Preflight is not atomic CAS.

Acknowledgement does not independently establish JWT-authentication refusal,
effective ACL removal, session closure, credential completeness or fencing.
Ambiguity receives one bounded list observation and remains uncertain even on
absence; no mutation retry, alternate provider/SQL path or fabricated idempotency
header. Common permanent journal recovery must survive restart/replay. Native
host/authority/custody/effects/entitlement qualification and independent acceptance
remain prerequisites. No live mutation, key retrieval or runtime grant is added.

## Bounded binary object byte-count observation delta

One copied project/branch/bucket/key/revision binds an exact object/download grant,
separate from listing, metadata, presign, parent or sibling access. Conservative
canonical key segments reject empty/dot segments, encoded escapes and path/query
injection; nested slashes are encoded into one provider path segment. Resource
length is checked against the common 256-character ceiling at construction.
No caller identity, header/range, credential, URL or dynamic selector is accepted.

Raw object bytes may contain arbitrary sensitive data. The transport counts and
discards stream chunks, never buffers or decodes the object, never parses it as
JSON and never emits content, hash/ETag, filename/disposition or arbitrary headers.
Only a closed terminal observed_bytes integer (0..65,536) leaves the boundary.
Content-Length is mandatory and must equal the total stream bytes. Missing/invalid
length, wrong MIME/encoding, partial HTTP206, redirects, short/long streams, size
limits, failures and cancellation/deadline refuse without partial-success output
or alternate endpoint/credential/retry. Existing JSON methods keep their parser;
the binary mode is private and reachable only through the fixed object endpoint.

The Beta endpoint's user-session/Editor-or-higher/OAuth-project-update entitlement
is not established by metadata access, a test credential or a source name. Those
native custody/entitlement and provider-effect prerequisites remain unresolved,
as do all independent review gates. Effective ancestry comes from the exact fixed
branch request, including inherited objects; the count is not snapshot/integrity
or credential-completeness evidence. Source mocks do not authorize a live object
read, secret retrieval, configuration change or runtime registration. The three
password-bearing email/aggregate reads remain incomplete. No tool is enabled.

## Reserved trigger-deletion delta

The dedicated branch/trigger/delete grant and reserved native exact-plan authority
precede credential access. Copied scope binds one effective branch and project-wide
trigger ID to its expected function slug, type, positive safe-integer version and
explicit inherited/enabled flags. Mandatory detail preflight validates those fields
and any optional wrapper/row ancestry before one bodyless DELETE. Selected IDs use
a conservative common-resource/detail-transport subset; unsupported provider IDs
refuse without normalization. Parent, read, function and sibling grants cannot
substitute. Names, cron, function paths, bucket/prefix configuration and timestamps
are never evaluated or emitted; no scheduler or invocation executor is introduced.

The documented empty204 is normalized to a closed acknowledgement, not an identity
echo, independent effective stoppage, completed delivery cancellation or fencing
proof. Inherited deletion writes a tombstone on the exact requested effective
branch, never an ancestor delete. Already-committed invocations are explicitly not
cancelled. Preflight is not atomic CAS and version checks cannot fence another
writer. Ambiguity gets one bounded detail observation then remains uncertain even
on absence/disabled/drifted state; no mutation retry or invented conditional or
idempotency header. Permanent common journal protects same-request restart/replay,
not external writers. Source/mocks only, zero enabled; native host/authority/custody,
durable recovery, effects/entitlement/Beta availability and independent reviews
remain qualification gates. No live deletion, session closure or cutover claim.

## Reserved function-deletion delta

The dedicated exact branch/function-slug/delete grant and reserved native exact-plan
authorization precede credential access. Copied scope includes a stable function ID
and immutable slug; detail preflight binds both before one bodyless DELETE. Optional
wrapper/row ancestry must match. Read, parent, trigger, deployment and sibling grants
cannot substitute. Names, invocation URLs, deployment/environment/error fields and
timestamps are never evaluated/emitted. Provider-valid IDs outside the conservative
selected subset refuse rather than being normalized.

Empty HTTP204 acknowledges only; it is not an identity echo, independently verified
invocation refusal, committed-work cancellation, session closure or fencing proof.
Preflight is not atomic CAS and cannot prevent a same-slug replacement after the
GET. Ambiguity gets one bounded detail observation and remains uncertain even on
absence/replacement. No retry or invented conditional/idempotency header; permanent
common journal blocks restart/replay, not external writers. Native host/authority,
custody, durable recovery, provider effects/Beta entitlement and independent review
remain unresolved. Source/mocks only, zero enabled; no live deletion or lifecycle
enforcement claim.

## Reserved custom-domain deletion delta

Copied project/branch/normalized domain/function-slug/revision and the dedicated
exact domain/delete resource require common reserved native exact-plan authority.
Parent/read, registration, function/trigger and cross-agent grants cannot substitute.
Terminal bounded list preflight validates 10 rows per page and at most three pages,
including duplicate/ancestry/continuation checks after an early target match, before
one bodyless DELETE. Selected domain must still bind the expected function slug.
Provider project-Admin restrictions are not bypassed; no caller authority/URL/DNS,
force/registration or credential override is supported. Names are not immutable IDs;
preflight is not atomic CAS and same-name rebinding remains unresolved.

Only documented empty HTTP204 acknowledges the request. It is not provider identity
echo, independent routing stoppage, DNS/certificate removal, invocation refusal,
session closure or fencing. CNAME activation targets, validity status and routing/DNS
diagnostics are never evaluated/emitted. Ambiguity gets one bounded list observation
and stays uncertain even on absence/rebinding; no mutation retry or invented provider
idempotency header. Permanent common journal blocks same-request replay/restart,
not external writers. Native host/authority/custody, durable recovery, Beta effects/
entitlement and independent reviews remain gates. Source/mocks only, zero enabled;
no DNS following, live deletion or lifecycle enforcement.

No live Neon calls or secrets are needed for these tests. Public source inventory
is not entitlement evidence. Failed/aborted transport calls never retry or turn into
start/restart/resume/suspend, SQL, connection lookup or secret-fetch requests.
