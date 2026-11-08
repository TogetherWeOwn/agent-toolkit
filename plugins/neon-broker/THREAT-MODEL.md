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
| Redirect/SSRF/path injection | Explicit fixed GET methods, one reserved snapshot DELETE and one structured log-query POST, constrained identifiers/catalog names, encoded cursor, fixed origin, redirect:error, no arbitrary URL/header arguments, no default fetch. Auth-status reads omit OAuth login/consent URLs, MCP resources and audiences; no secondary fetch. |
| Pagination/response/time amplification | 64 KiB per response; 1 s request including streamed body; 3.5 s operation; 10 branches/operations per page, three pages, duplicate/cycle checks; branch next/sort and operation cursor shapes are distinct; 30-row cap for other lists. No retries/partial success. |
| Aggregate disclosure | Project-wide endpoint/operation collections and total branch counts have distinct exact-resource targets. Child/project grants never imply aggregate authority; response filtering is not request authorization. |
| Read waking compute | No compute mutation/SQL/connection/secret fallback exists. GET is NOT proof; independent provider evidence and accepted enablement gates remain unsatisfied. |
| Replay, stale policy, audit failure | Reused common fixture exercises refusal and revalidation. No local replacement authority/store. Production durable journal/audit/credential/recovery adapters absent. |
| Candidate mistaken for authority | Type-only commit-pinned excerpt; candidate tested in isolated Actions checkout; no runtime worker, manifest or registration. Reviewed compatible core is still a qualification prerequisite. |

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

No live Neon calls or secrets are needed for these tests. Public source inventory
is not entitlement evidence. Failed/aborted transport calls never retry or turn into
start/restart/resume/suspend, SQL, connection lookup or secret-fetch requests.
