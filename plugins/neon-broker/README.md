# Neon metadata and catalog source

**Source-only; not an installable plugin, complete provider package or live grant.**
No manifest/worker/tool registration, default fetch, credential placement, SQL,
secret sink or enablement flag is supplied. GET and mocked success do not prove
non-waking behavior. NO MINT / NO BIND / NO ENABLEMENT remains the boundary.

## Typed adapters

`createNeonBranchSchemaOperations(trustedScope, transport)` adds
`getProjectBranchSchema` with one copied project/branch/database/revision and an
explicit selection of at most 30 schema/table/column tuples. A distinct exact
`neon/projects/<project>/branches/<branch>/databases/<database>/schema` grant is
required; catalog, Data API and advisor access do not imply schema authority.
The fixed branch `/schema` GET always sends mandatory db_name and format=json.
It reads current head only: lsn, timestamp, SQL-format and default-target overrides
are refused. Closed output is selected column identities only; SQL DDL, data types,
nullability, generated/default values, constraints and expressions are never
read or emitted. Response tables and columns per table each cap at 30; duplicate
table/column identities, malformed names, contradictory optional ancestry and
unexpected pagination refuse before filtering, even for unselected rows. Names
use the bounded ASCII catalog-name subset, not every legal quoted Postgres name.
Empty selection/output does not establish schema completeness. This endpoint reads
database schema; GET and mocks do not establish non-waking behavior. Native
entitlement/effects, independent review and runtime integration remain unresolved.
No SQL client, live schema call, schema mutation or runtime enablement is supplied.

`createNeonAdvisorOperations(trustedScope, transport)` adds
`getProjectAdvisorSecurityIssues` for a single copied project/branch/database and
revision. Its distinct exact database `advisors/security` grant is not implied by
project, branch, catalog or Data API configuration access. Every fixed GET to
`/projects/<project>/advisors` sends branch_id, database_name, category=SECURITY and
min_severity=INFO. No default branch/database, PERFORMANCE-only or unfiltered
fallback exists. The provider explicitly analyzes the database: this is not a
pure catalog read or qualified non-waking operation. Source and mocked contracts
introduce no live analysis, SQL client, runtime worker or enabled tool.

Closed output is ERROR/WARN/INFO observation counts only. Names, titles, facing,
issue details, metadata, remediation URLs and other content are never evaluated
or emitted. Bounded cache keys are evaluated only to reject duplicate instances;
they never leave projection. The nonpaginated response caps at 30 rows and refuses
malformed severities/categories, absent SECURITY category, duplicate cache keys,
contradictory optional project/branch/database ancestry or unexpected pagination.
Unknown levels fail closed, never silently disappear from counts. An empty result
is zero observed rows, not an all-clear, effective-ACL or completeness verdict.
Alpha availability requires project read access and Data API enabled according to
the pinned schema; native entitlement, effects and runtime qualification remain
unresolved. No repairs, configuration mutation or enablement authority is supplied.

`createNeonOrganizationKeyOperations(trustedScope, transport)` adds `listOrgApiKeys`
for one copied organization/revision and explicit numeric key-ID selection. The
fixed organization `/api_keys` GET requires its dedicated collection grant; no
account-wide list or parent/sibling grant is substituted. The pinned schema
explicitly excludes key tokens and distinguishes numeric IDs from token values.
Closed output is selected IDs only. Names, creator profiles, usage addresses,
timestamps, optional project scope and unexpected token fields are never read or
emitted. The bare-array response is nonpaginated and capped at 30 before filtering;
unsafe/fractional/negative/negative-zero IDs, duplicates, contradictory optional
org_id and pagination refuse even on unselected rows. Unsupported int64 values
refuse rather than round. Empty selection does not imply an empty provider inventory.
No creation, revocation, rotation, token retrieval or live runtime is supplied;
identity presence is not effective entitlement, custody or expiry evidence.

`createNeonCredentialMetadataOperations(trustedScope, transport)` adds
`listCredentials` for one copied project/branch/revision and an explicit opaque
credential-ID selection. It requires the exact branch `credentials` collection
grant, not parent, sibling or individual-credential authority. The pinned Beta GET
contract explicitly excludes secrets. Closed output contains only selected
token_id values and the effective branch_id bound by the fixed request; an absent
provider branch_id uses that request binding, while contradictory ancestry refuses.
Labels, scopes (including unknown future values), principal/function identity,
dates and unexpected secret-like fields are never read, evaluated or emitted.

The nonpaginated response caps at 30 before selection. Duplicate or malformed IDs,
contradictory optional project/branch ancestry and unexpected pagination refuse,
including on unselected rows. IDs support the conservative common ASCII identifier
subset up to 80 characters; unsupported forms refuse without normalization. This
is not a credential-value retrieval, reveal, creation, rotation or revocation path.
Listing identity proves neither effective ACL/scope, expiry, custody, current
usability nor credential completeness. Beta availability, provider effects and
runtime integration remain unqualified; no live grant or enablement is supplied.

`createNeonAuthDetailsOperations(trustedScope, transport)` adds `getAuthDetails`
with a copied exact account ID/revision and dedicated
`neon/accounts/<account>/auth` grant. Caller arguments must name that account; the
fixed credential-bound `/auth` GET has no identity override. Its returned
account_id must match exactly. The closed projection contains only that ID and
one of the pinned auth_method values: keycloak, session_cookie, api_key_user,
api_key_org or oauth. Opaque auth_data, credentials, identity payloads and arbitrary
diagnostics are not read, evaluated or emitted. Unsupported IDs/methods, missing
fields and unexpected pagination refuse; failures never trigger `/users/me`,
organization discovery or another credential fallback.

An account ID is not inferred to be a user or organization ID, and the observed
method does not prove permissions, full credential scope, custody or safe runtime
use. This is not a credential reveal/creation/rotation path or live identity
probe. Native entitlement, provider effects and integration remain unqualified;
all operations stay disabled. The earlier opaque-response exclusion is narrowed
only to this explicit two-field schema-backed projection.

`createNeonMaskingRuleOperations(trustedScope, transport)` adds `getMaskingRules`
with a copied project/branch/revision and explicit database/schema/table/column
selection. It requires the exact branch `masking_rules` collection grant; parent,
sibling, schema and anonymization grants do not imply access. Fixed GET output is
only the selected four-part column identities. All four provider fields are
sensitive: only exact trusted tuples may leave the projection. Masking functions,
literal replacement values and diagnostics are not read, evaluated or emitted.
This conservative subset supports ASCII catalog identifiers up to 63 characters;
other names refuse rather than normalize or truncate.

The nonpaginated response caps at 30 rows before selection. Duplicate tuples,
malformed names, contradictory optional project/branch ancestry and unexpected
pagination refuse without partial success, including on unselected rows. A listed
column is configuration metadata, not proof of successful/effective masking;
missing rules remain missing, not an all-clear verdict. Beta availability and
provider effects remain unqualified. No rule update, anonymization, schema/data
query, SQL execution, credential action or runtime enablement is supplied.

`createNeonLegacyConsumptionOperations(trustedScope, transport)` adds
`getConsumptionHistoryPerProject` for legacy-plan history only. It copies one
organization/project/revision and a canonical UTC hourly window of at most 24
hours. Its distinct exact
`neon/organizations/<org>/projects/<project>/consumption/legacy` grant is not
interchangeable with V2 history, project metadata or parent grants. Every GET to
`/consumption_history/projects` sends org_id, project_ids, the pinned window,
hourly granularity and only compute_time_seconds. Closed output contains the
exact project ID and observed hourly boundaries with nonnegative safe-integer
CPU seconds. Billing metadata, other metrics and retired storage quantities are
omitted. Absent history remains absent rather than fabricated zero usage.

Ten-row cursor pages, a three-page ceiling, 30 unique periods and 24 total hourly
frames bound the response. Foreign/duplicate projects, contradictory ancestry,
nested pagination, duplicate periods, unsafe quantities and unordered, overlapping
or out-of-window frames refuse without partial output. Billing-period boundaries
accept validated date-times with explicit UTC offsets and millisecond precision;
containment uses epochs without rounding. Finer precision refuses rather than
silently truncating. Legacy-plan availability and provider effects
remain unqualified; 403/404/406 refuse without V2 or unfiltered fallback. The
public non-waking description is not native qualification. No plan upgrade,
mutation, spend enforcement or runtime authority is supplied.

`createNeonBranchConsumptionOperations(trustedScope, transport)` adds
`getConsumptionHistoryPerBranchV2` for one copied organization/project/branch,
revision and explicit UTC hour-aligned window of at most 24 hours. Its exact
`neon/organizations/<org>/projects/<project>/branches/<branch>/consumption/v2`
grant is distinct from project history and all parent/sibling grants. Every GET
sends org_id, project_ids and branch_ids filters, hourly granularity and only
compute_unit_seconds. No missing-filter or project-history fallback exists.
Closed output includes only exact project/branch IDs and observed hourly frames
with nonnegative safe-integer quantities. Billing metadata is omitted; absent
history is not fabricated zero or entitlement evidence. Cursor pages cap at ten
branches with a three-page ceiling; duplicate/foreign branches, conflicting
ancestry, nested pagination, unsafe metrics, duplicate periods and unordered,
overlapping or out-of-window frames refuse without partial success. The same
validated billing date-times and canonical-hour frames as project history apply.
Pinned provider documentation describes this Beta endpoint as non-waking;
native effects/entitlement qualification is still unresolved. No spend control,
mutation or lifecycle enforcement is introduced.

`createNeonConsumptionOperations(trustedScope, transport)` adds
`getConsumptionHistoryPerProjectV2` for a copied organization/project/revision and
an explicit UTC hourly-aligned window of at most 24 hours. Only those exact
org_id/project_id/from/to arguments are accepted. The distinct
`neon/organizations/<org>/projects/<project>/consumption/v2` grant cannot be
replaced by organization, project, catalog or sibling authority. Every request
sends org_id, one project_ids filter, the pinned window, hourly granularity and
compute_unit_seconds; it never falls back to account-wide or legacy consumption.

Closed output contains project_id and observed hourly timeframe boundaries with
nonnegative safe-integer compute_unit_seconds only. Billing period IDs, plans,
period boundaries and arbitrary diagnostics are omitted. Missing history remains
missing, never fabricated zero consumption or budget/entitlement evidence. This
conservative subset requires canonical UTC hour boundaries in returned frames,
one requested metric per frame, at most 30 unique periods and 24 total hourly
frames. Billing-period boundaries share the legacy adapter's validated explicit-zone
date-time parser through millisecond precision; exact epoch comparisons enforce
containment without rounding. Finer precision refuses rather than truncating. Foreign/duplicate projects, duplicate periods, contradictory
ancestry, out-of-window/overlapping/unordered frames, unsafe quantities and
unexpected nested pagination refuse. Cursor pages are fixed at 10 projects with
a three-page ceiling and cycle refusal; no partial success on failure. The pinned
schema explicitly describes this endpoint as non-waking, but this documentary
statement is not native provider-effect/entitlement qualification. No live call,
spend enforcement, mutation or runtime enablement is supplied.

`createNeonBucketObjectOperations(trustedScope, transport)` adds
`listProjectBranchBucketObjects` for one copied project/branch/bucket/revision,
a required prefix and up to 30 unique explicitly selected object keys. Its exact
`neon/projects/<project>/branches/<branch>/buckets/<bucket>/objects` grant is
separate from bucket enumeration, sibling branches and object download authority.
Arguments contain only project_id, branch_id and bucket_name. The transport always
sends the trusted prefix, limit=10 and an encoded continuation cursor when needed;
no delimiter is sent. Inherited objects belong to this selected effective branch.

Closed output contains selected key and nonnegative safe-integer byte size only.
Content, entity tags, modification times and download URLs are omitted. Keys and
prefixes use a conservative nonempty printable-ASCII subset capped at 80 characters;
project/branch IDs and lowercase ASCII bucket names are capped at 60 characters.
Each page requires the exact echoed prefix and an empty folders list. The distinct
`next_cursor`/`is_truncated` contract is validated before filtering; duplicates,
contradictory ancestry, keys outside the prefix, unsafe sizes, unexpected pagination,
cycles and a continuation beyond three pages refuse without partial success. The
30-row aggregate is validated again on detached projection. A missing selected key
is simply not observed, not proof of deletion or access. Unavailable Beta/session
responses never become empty success. No download, presign, content or mutation
fallback is supplied. Availability, native entitlement and provider effects remain
unknown; this source does not claim non-waking reads or runtime qualification.

`createNeonLogFieldOperations(trustedScope, transport)` adds
`listProjectBranchLogFields` for one copied project/branch/revision and an explicit
selection of up to 30 unique field names. Its dedicated
`neon/projects/<project>/branches/<branch>/logs/fields` grant cannot be replaced by
parent, log-query, sibling-branch or field-value authority. Only project_id and
branch_id are accepted as arguments; the fixed GET has no query parameters.

The pinned schema describes dynamically observed field names, not a fixed enum.
Closed output is only selected names, each printable ASCII and at most 80
characters (a conservative supported subset). The nonpaginated response is capped
at 30 rows before filtering; malformed/duplicate names, contradictory ancestry
and unexpected pagination refuse, even on unselected rows. Empty observed or
selected lists remain empty; an unavailable response never becomes empty success.
Log entries, messages, field values and diagnostics are not read or emitted. No
log query, value discovery, download, mutation or alternate endpoint is supplied.
Private Beta availability, native entitlement and provider effects remain unknown;
GET/mocks do not establish non-waking behavior or lifecycle enforcement.

`createNeonAuthEmailOperations(trustedScope, transport)` adds
`getNeonAuthEmailAndPasswordConfig` with copied project/revision/branch selection
and its dedicated `neon/projects/<project>/branches/<branch>/auth/email_and_password`
grant. Parent/auth, email-provider and webhook grants cannot substitute. The fixed
GET has no query, delivery or mutation path. Project/branch IDs follow the pinned
60-character lowercase ASCII constraint; at most 30 unique branches are selected.

Closed output preserves the seven required booleans (`enabled`,
`require_email_verification`, `auto_sign_in_after_verification`,
`send_verification_email_on_sign_up`, `send_verification_email_on_sign_in`,
`disable_sign_up`, `revoke_sessions_on_password_reset`) and required
`email_verification_method` enum (`link` or `otp`). Missing fields never become
false/default status. Passwords, email-provider settings and arbitrary diagnostics
are not read or emitted. Optional project/branch identity must agree with the
selection and exact requested branch; pagination refuses. Non-200/invalid output
never triggers a fallback endpoint. This only reads configuration: it sends no
mail, changes no authentication policy and revokes no sessions. Effective auth
behavior, native entitlement and provider effects remain unqualified. The pinned
nonsecret response justifies moving this inventory row from reserved to read;
credential-bearing aggregate/email-provider reads remain incomplete.

`createNeonAuthWebhookOperations(trustedScope, transport)` adds
`getNeonAuthWebhookConfig` with strict project/branch arguments and the separate
`neon/projects/<project>/branches/<branch>/auth/webhooks` grant. Construction copies
one project/revision and up to 30 unique branch IDs, constrained to the pinned
60-character lowercase ASCII path-ID pattern. Parent/auth/plugin grants never
imply webhook-config authority. The fixed GET has no query, delivery or mutation
path, and never follows the returned destination URL.

Closed output is required boolean `enabled`, optional `enabled_events` (at most
the seven known unique event names), and optional integer `timeout_seconds` in
1–10. Absent events/timeout stay absent, not fabricated empty/default values;
false status, empty events and explicit timeout values remain distinct. Webhook
URLs, signing material and arbitrary diagnostics are not read or emitted. The
provider schema has no identity fields; the authenticated request path binds the
response. Optional project/branch identity must agree, including the requested
branch during execution; pagination refuses. Non-200 never becomes disabled
status or an alternate endpoint. This reads configuration, not proof of actual
webhook delivery, endpoint health or event handling. Native entitlement/effects
and all enablement qualification remain unresolved.

`createNeonProjectCountOperations(trustedScope, transport)` adds `countProjects`
with mandatory closed `org_id` and the dedicated aggregate grant
`neon/organizations/<org>/projects/count`. Construction copies one organization and
revision. The fixed GET always sends `org_id`; unfiltered/account-wide fallback is
unsupported. Parent, project-list, child-project and branch-count grants do not
imply this aggregate authority. Output contains only a nonnegative safe-integer
`count`, including zero; unsafe, fractional and negative-zero values refuse.

The pinned beta endpoint counts active projects accessible in the organization,
excluding projects being created/deleted. It is not a count of selected project
IDs, a permission/entitlement inventory, or evidence of capacity to provision.
Its ID-less response is bound by the exact authenticated organization-filtered
request, not invented ancestry; optional org_id must agree. Project/branch identity,
pagination and non-200 responses refuse without fabricated zero or another API
fallback. Project records, names, owners and diagnostics are not read or emitted.
No enumeration, provisioning, live qualification or mutation is supplied.

`createNeonRegionOperations(trustedScope, transport)` adds `getActiveRegions`
with mandatory closed `org_id` and exact collection grant
`neon/organizations/<org>/regions`. Construction copies one organization/revision
and up to 30 unique selected AWS/Azure region IDs (conservative 80-character ASCII
subset). The fixed GET always sends `org_id`; the provider's optional unfiltered
catalog is deliberately unsupported, with no retry or fallback to it.

The nonpaginated response is capped at 30 rows before filtering to the trusted
selection. Output is only `regions: [{ region_id, default }]`; descriptive names,
coordinates and arbitrary diagnostics are omitted. All rows, including unselected
ones, must have valid IDs/default booleans, no duplicates or contradictory ancestry.
Missing selected regions are not fabricated. Empty output is not an entitlement,
permission or capacity verdict. The provider's default flag is descriptive, not
permission to provision a project; catalog presence is not current native evidence.
No account discovery, geographic lookup, provisioning or configuration mutation is
introduced. Non-200 and unexpected pagination refuse without partial success.

`createNeonDataAPIOperations(trustedScope, transport)` adds `getProjectBranchDataAPI`
with closed `project_id`, `branch_id`, `database_name` arguments and exact resource
`neon/projects/<project>/branches/<branch>/data-api/<database>`. Scope copies up to
30 unique branch/database-name pairs under one project/revision. Project/branch IDs
follow the pinned lowercase 60-character path subset; database names use the same
conservative 63-character ASCII subset as catalog reads. Unsupported names refuse,
never normalize into another target. Database metadata or parent/collection grants
do not authorize this configuration read.

Output contains only `status`: a nonempty lowercase ASCII token up to 64 characters,
not a fabricated enum, boolean or qualification verdict. Provider strings outside
that conservative subset refuse. Endpoint/JWKS URLs, settings, available database
schemas, observation time, auth-provider/name/audience metadata are neither read nor
followed. The pinned response has no identity fields, so ancestry is the exact
fixed authenticated request path; optional returned identities must match the
requested project/branch/database. Pagination and non-200 refuse without fallback.
Cached responses are not current database/authentication evidence; no schema query,
auth inference, mutation or non-waking qualification is supplied.

`createNeonMetadataOperations(trustedScope, transport)` exposes exactly:

| Tool | Closed arguments | Authorization resource |
|---|---|---|
| `neon.getProject` | `project_id` | `neon/projects/<project>` |
| `neon.listProjectBranches` | `project_id` | `neon/projects/<project>/branches` |
| `neon.getProjectBranch` | `project_id`, `branch_id` | `neon/projects/<project>/branches/<branch>` |
| `neon.listProjectBranchEndpoints` | `project_id`, `branch_id` | `neon/projects/<project>/branches/<branch>/endpoints` |
| `neon.getProjectEndpoint` | `project_id`, `endpoint_id` | `neon/projects/<project>/branches/<bound-branch>/endpoints/<endpoint>` |

`createNeonCatalogOperations(trustedScope, transport)` adds eight read descriptors:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.getProjectOperation` | `project_id`, `operation_id` | `operations/<operation>` |
| `neon.listProjectOperations` | `project_id` | `operations` |
| `neon.countProjectBranches` | `project_id` | `branches/count` |
| `neon.listProjectEndpoints` | `project_id` | `endpoints` |
| `neon.listProjectBranchDatabases` | `project_id`, `branch_id` | `branches/<branch>/databases` |
| `neon.getProjectBranchDatabase` | `project_id`, `branch_id`, `database_name` | `branches/<branch>/databases/<database>` |
| `neon.listProjectBranchRoles` | `project_id`, `branch_id` | `branches/<branch>/roles` |
| `neon.getProjectBranchRole` | `project_id`, `branch_id`, `role_name` | `branches/<branch>/roles/<role>` |

Catalog scope additionally contains exact operation UUIDs and nullable branch/endpoint
bindings, database numeric-ID/name/branch bindings, and role name/branch bindings.
Database/role names support the common resource alphabet's conservative canonical
ASCII subset (letters/digits/underscore/hyphen, beginning with a letter/underscore),
max 63 characters. Other selected provider-valid names remain unavailable, never
normalized into another target; unrelated quoted/Unicode names in a collection are
filtered without blocking configured canonical names. Unselected project endpoints
on unconfigured branches are likewise omitted, while selected bindings stay exact.
Each of the five catalog binding arrays is capped at 16: a full registry fits the
common 256-node configuration guard, and every possible selected operation output
fits its 256-node output guard. This is a selection ceiling, not a provider limit;
larger trusted selections fail closed at construction and need scoped integration.
Operation output contains bound IDs, known action/status and bounded failure/duration
counters, not arbitrary errors or timestamps. Database output is ID/branch/name;
role output is branch/name and optional boolean protected. Passwords/DSNs are never
selected, even when supplied by the role API. A total branch count is project-wide,
not a count of allowlisted children: it requires its own exact `branches/count` grant.

`createNeonCapabilityOperations(trustedScope, transport)` adds four metadata reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.getAvailablePreloadLibraries` | `project_id` | `available_preload_libraries` |
| `neon.getAnonymizedBranchStatus` | `project_id`, `branch_id` | `branches/<branch>/anonymized_status` |
| `neon.listSnapshots` | `project_id` | `snapshots` |
| `neon.getSnapshotSchedule` | `project_id`, `branch_id` | `branches/<branch>/backup_schedule` |

Capability scope contains one project/revision, up to 30 branch IDs and up to 30
snapshot-ID/source-branch bindings. These arrays and maximum selected outputs fit
the common JSON budgets. Snapshot lists filter unselected IDs, enforce selected
source branches and expose only ID/source branch/validated UTC creation time and
optional manual flag. The schema makes source_branch_id optional: selected rows
without it refuse rather than invent binding evidence. Project binding otherwise
comes from the fixed authenticated project path; a returned project_id must agree.
Snapshot names, LSNs and arbitrary annotations are omitted. Library output contains
bounded canonical library/version strings and default/experimental booleans, not
descriptions. Anonymization output contains bound project/branch and known state,
not status_message/last_run (which may contain table names or actor identities).
Schedule output contains known frequency and bounded optional hour/day/month/retention
values. All four endpoints are nonpaginated in the pinned schema: lists cap at 30
rows, unexpected pagination refuses, and no partial/truncated result is returned.
These are source projections, not native side-effect or entitlement evidence.

`createNeonBranchFeatureOperations(trustedScope, transport)` adds three branch-status reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.getProjectBranchRealtime` | `project_id`, `branch_id` | `branches/<branch>/realtime` |
| `neon.getProjectBranchStorage` | `project_id`, `branch_id` | `branches/<branch>/storage` |
| `neon.getProjectBranchAiGateway` | `project_id`, `branch_id` | `branches/<branch>/ai_gateway` |

Branch-feature scope contains one project/revision and up to 30 unique branch IDs,
validated and copied at construction. Realtime projects only enabled/pending booleans
and an optional positive int32 revision. Storage/gateway project only enabled=true:
the pinned schema defines their 200 response as usable; false/unknown success shapes
refuse. A 404 remains unavailable, not fabricated disabled status. Response schemas
lack identity fields, so binding is the exact authenticated project/branch request
path. Any returned project_id/branch_id must agree with the request. No response
URLs, origins, regions, secrets, credentials or diagnostics are exposed or followed.
These are real management-status projections, not data-plane endpoint lookup,
provisioning, secret reveal, entitlement verification or non-waking qualification.

`createNeonAuthStatusOperations(trustedScope, transport)` adds three dedicated auth-status reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.getNeonAuthAllowLocalhost` | `project_id`, `branch_id` | `branches/<branch>/auth/allow_localhost` |
| `neon.getNeonAuthPhoneNumberPlugin` | `project_id`, `branch_id` | `branches/<branch>/auth/plugins/phone-number` |
| `neon.getNeonAuthOAuthProviderPlugin` | `project_id`, `branch_id` | `branches/<branch>/auth/plugins/oauth-provider` |

Auth-status scope contains one project/revision and up to 30 unique branch IDs,
validated and copied at construction. Each status has a distinct resource: neither
branch/auth parent nor sibling status grants imply access. Output is a boolean
allow_localhost or enabled, plus optional phone OTP lifetime (integer 60–600 seconds).
Both true and false are preserved; omitted lifetime stays omitted, not filled from
a documented default. Unknown/malformed status, contradictory ancestry, pagination
and non-200 responses refuse. Identity comes from the fixed request path; any returned
project_id/branch_id must agree. OAuth login/consent URLs, MCP configuration and
resource audiences are not exposed or followed. These dedicated endpoints do not
fetch aggregate plugin configs or email providers, whose pinned schema can include
credential-bearing email responses. Those operations remain incomplete; no authority
is inferred for them. Status source does not authorize an update, auth session access,
secret lookup, runtime grant or a non-waking claim.

`createNeonAuthDomainOperations(trustedScope, transport)` adds two auth-domain list reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.listNeonAuthRedirectURIWhitelistDomains` | `project_id` | `auth/domains` |
| `neon.listBranchNeonAuthTrustedDomains` | `project_id`, `branch_id` | `branches/<branch>/auth/domains` |

Auth-domain scope contains one project/revision and up to 30 unique branch IDs,
validated and copied at construction. Legacy project and branch collections require
separate exact grants; neither implies the other. Closed output is at most 30
`domain`/`auth_provider` pairs (mock, stack or better_auth), with no pagination,
truncation or duplicate provider/domain pairs (case-insensitive domain comparison).
Domains preserve spelling but accept only a conservative ASCII hostname subset,
optional leading wildcard, max 253 characters and 63 per label. URLs, userinfo,
ports, paths, Unicode and other provider-valid strings outside this subset refuse;
there is no normalization, fetching or following a returned domain. Empty lists
remain empty. Project/branch binding comes from the fixed authenticated path;
contradictory optional identities refuse. Extra credentials/diagnostics are dropped.
The legacy endpoint is deprecated with sunset 2026-03-01 in the pinned schema:
source coverage is not an availability claim. Non-200 (including 404/410) refuses,
never fabricates an empty list or falls back to a branch or other provider. OAuth
provider lists remain incomplete/excluded because their schema carries sensitive
client-secret fields. No domain mutation, native verification or live grant occurs.

`createNeonAuthIntegrationOperations(trustedScope, transport)` adds two integration metadata reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.getNeonAuth` | `project_id`, `branch_id` | `branches/<branch>/auth` |
| `neon.listNeonAuthIntegrations` | `project_id` | `auth/integrations` |

Integration scope contains one project/revision and up to 30 unique branch IDs,
validated and copied at construction. Collection access requires its own exact
project-level grant, not a child-auth grant. Closed output contains only the bound
branch ID, known auth_provider and owned_by enums, plus optional known transfer_status.
Missing transfer_status remains unknown/omitted. External provider project IDs,
database names, application names, timestamps and JWKS/base URLs are neither exposed
nor followed. Detail responses must match the exact requested branch, even if another
branch is allowlisted. Legacy list output is a `data` array capped at 30 rows; every
row must bind to a configured branch, duplicate branch/provider pairs and pagination
refuse, and no filtering/truncation fabricates a complete result. Optional project
identities must match. Legacy removal was scheduled for 2026-03-01 in the pinned schema;
source support does not establish availability. A 404/410 stays unavailable, not an
empty list, unconfigured status or fallback to another endpoint. These projections
do not retrieve credentials, prove provider effects or authorize integration mutation.

`createNeonFunctionOperations(trustedScope, transport)` adds two beta function metadata reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.listProjectBranchFunctions` | `project_id`, `branch_id` | `branches/<branch>/functions` |
| `neon.getProjectBranchFunction` | `project_id`, `branch_id`, `slug` | `branches/<branch>/functions/<slug>` |

Function scope copies up to 16 branch IDs and 16 exact ID/slug/branch bindings,
unique by ID and by branch/slug. This ceiling fits common configuration and output
budgets even with both deployment fields. Selected slugs use the pinned detail
path's narrower lowercase alphanumeric 1–20 character pattern, not the broader
DNS-label response description. Unsupported selected slugs refuse without rewriting;
unselected DNS-label rows may be filtered. Detail ID/slug and all optional ancestry
must match the exact request. A list also refuses a selected ID from another branch
or a changed ID behind a trusted slug. Collection grants never imply detail grants,
or vice versa. Filtering is additional projection, not request authorization.

Closed output is ID/slug plus optional current/active deployment ID and known build
status. Absent deployments remain absent; active deployment must be completed, and
current pending/building/completed/failed remains distinct from active. Names,
invocation URLs, source, environment names, runtime, memory, errors and timestamps
are omitted and never followed. Pagination uses fixed 10-row pages and bounded
encoded response `pagination.next` (request `cursor`) for at most three pages.
Absent `next`, including an empty pagination object, terminates the sequence;
unexpected sort metadata refuses because the endpoint has no sorting parameters.
Duplicated IDs/slugs, oversized
pages, cursor cycles and an unfinished third page refuse rather than silently
truncate. Beta availability, provider side effects and runtime qualification remain
unknown; 404 never becomes an empty list, a fabricated status or a deployment/invoke
fallback. These reads create, deploy, invoke and delete nothing.

`createNeonTriggerOperations(trustedScope, transport)` adds two beta trigger metadata reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.listProjectBranchTriggers` | `project_id`, `branch_id` | `branches/<branch>/triggers` |
| `neon.getProjectBranchTrigger` | `project_id`, `branch_id`, `trigger_id` | `branches/<branch>/triggers/<trigger>` |

Trigger scope copies up to 16 branch IDs and 16 exact ID/branch/function-slug
bindings, unique by branch/ID. Inherited triggers retain a project-wide ID: selecting
one on a parent does not select or authorize it on a child. Each effective branch
needs an explicit binding and grant. Selected IDs use the common resource alphabet
(1–80 ASCII letters/digits/underscore/hyphen, beginning alphanumeric), a conservative
subset of the provider's 128-character/dot-capable ID schema; unsupported selected
IDs refuse without normalization. Unselected provider-valid IDs are filtered from
an authorized collection. Selected function slugs must match their trusted binding.
The exact authenticated request path establishes branch context; optional returned
project/branch fields must agree. The execute result carries that request context
into projection, not fabricated provider ancestry evidence.

Closed output is trigger_id, known type (schedule/storage_object_created), bound
function_slug, enabled/inherited booleans and positive safe-integer version. Int64
versions outside JavaScript's safe range refuse instead of rounding. Names, function
paths, cron, bucket names/prefixes and next-run timestamps are omitted without being
read or followed. Both enabled states and inherited status are preserved independently.
The pinned list endpoint is nonpaginated: max 30 rows before filtering, duplicate
IDs or any pagination refuse, no truncation. Detail must match the requested ID,
not just another configured trigger. Collection/detail/function grants never imply
each other. No trigger creation, update, enable, delete, invocation, scheduling or
independent lifecycle enforcement is supplied. Beta availability/effects remain
unknown, and non-200 responses never fabricate disabled/empty success or fallback.
Maximum selections/output fit common JSON budgets.

`createNeonAuthClientOperations(trustedScope, transport)` adds two beta OAuth-client metadata reads:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.listNeonAuthOAuthClients` | `project_id`, `branch_id` | `branches/<branch>/auth/oauth-provider/clients` |
| `neon.getNeonAuthOAuthClient` | `project_id`, `branch_id`, `client_id` | `branches/<branch>/auth/oauth-provider/clients/<client>` |

Scope copies up to 16 branch IDs and 16 exact client-ID/branch bindings, unique per
branch/ID, within common configuration/output budgets. Project/branch IDs follow the
pinned path schema (lowercase alphanumeric/hyphen, 1–60); selected client IDs follow
the detail path (ASCII alphanumeric, 1–64), without normalization. Unselected bounded
printable IDs can be filtered from an authorized collection. Selection is per branch;
no parent, sibling, collection or detail grant implies another. Identity is the fixed
authenticated request path; optional returned identities must agree. Execute carries
request branch context into projection, not invented provider ancestry evidence.
Detail returns an unwrapped client and must match the exact requested client ID.

Closed output contains only client_id, known type (public/confidential), skip_consent
and disabled booleans. Both states remain independent; absent fields refuse, not default.
Names, redirect URIs, resource audiences, timestamps and unexpected secrets are not
read or emitted. The pinned GET response schemas explicitly exclude client secrets;
create and rotate-secret responses are distinct and never requested. The list has
no pagination: at most 30 rows before filtering; duplicate IDs, pagination and
contradictory ancestry refuse, not truncate. Non-200 stays unavailable, never empty
or disabled success or another endpoint fallback. No OAuth flow, client mutation,
secret reveal/rotation, runtime grant or lifecycle enforcement is supplied. Beta
availability, entitlement and provider effects remain unverified.

`createNeonBranchResourceOperations(trustedScope, transport)` adds two beta resource lists:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.listProjectBranchBuckets` | `project_id`, `branch_id` | `branches/<branch>/buckets` |
| `neon.listProjectBranchCustomDomains` | `project_id`, `branch_id` | `branches/<branch>/custom-domains` |

Scope copies up to 12 branch IDs, 12 bucket-name/branch pairs and 12 domain/branch/
function-slug bindings. Selection is explicit on each effective branch, including
inherited buckets. Collection grants stay distinct from parent, sibling, function
and object grants. Project/branch paths use the pinned lowercase alphanumeric/hyphen
1–60 character subset. Selected bucket names use bounded lowercase ASCII letters,
digits, dots, underscores and hyphens, max 255, starting alphanumeric. Unsupported
selected names refuse; unselected bounded printable names can be filtered. Domains
must be normalized lowercase ASCII hostnames with at least two labels, max 253 total
and 63 per label, no wildcard/trailing dot/URL/port. No normalization or DNS request
occurs. Selected entity_type must be function and entity_id the trusted 1–20 lowercase
alphanumeric function slug; future unselected entity types are filtered.

Output contains bucket name/access_level (private/public_read), or domain/entity_type/
entity_id plus optional status. Known pending/active/error statuses are preserved;
a bounded future status becomes the literal unknown, and absent status stays absent.
Timestamps, CNAME activation targets, DNS/binding diagnostics, reasons, object keys,
content and credentials are neither selected nor followed. Request context binds
branch ancestry; optional returned project/branch identities must agree. Buckets
are nonpaginated, capped at 30 rows before filtering. Domains use fixed 10-row pages,
response pagination.next, encoded cursors and a three-page ceiling. Duplicate names/
domains, invalid ancestry, cursor cycles and unfinished pagination refuse without
partial output. Maximum scope/output fits common budgets. Beta entitlement/effects
remain unknown; non-200 never becomes empty success or another API fallback. No
bucket/domain mutation, DNS activation, invocation or object-data access is provided.

`createNeonProjectSecurityOperations(trustedScope, transport)` adds two project security-metadata collections:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.getProjectJWKS` | `project_id` | `jwks` |
| `neon.listProjectVPCEndpoints` | `project_id` | `vpc_endpoints` |

Scope copies up to 16 branch IDs, 16 unique JWKS-ID/branch bindings and 16 unique
VPC endpoint IDs. A null trusted JWKS branch binding means project-level configuration:
its returned branch_id must be absent, not null or any branch. A selected branch-bound
JWKS must return that exact branch, not another allowlisted branch. Every JWKS row
must contain the exact project_id. Project collection grants remain distinct from
parent/child and sibling grants; filtering is additional minimization after request
authorization. Selected IDs use a conservative 1–80 ASCII alphanumeric/underscore/
hyphen subset starting alphanumeric, with no normalization. Unselected bounded
printable IDs can be filtered. This is not a complete project restriction inventory.

Output is only JWKS configuration ID/project/optional bound branch or VPC endpoint ID.
JWKS URLs, provider names, JWT audiences, roles, labels and timestamps are neither
selected nor followed. No cryptographic key material is fetched. Both pinned lists
are nonpaginated, capped at 30 rows before filtering; duplicate IDs, contradictory
project ancestry or unexpected pagination refuse without partial/truncated success.
VPC rows cannot claim branch context. Maximum configuration/output fits common JSON
budgets. Non-200 refuses without empty success, another provider endpoint or mutation
fallback. These reads change no authentication or network restrictions; availability,
entitlement, side effects and native qualification remain unverified.

`createNeonProjectAccessOperations(trustedScope, transport)` adds two project access-metadata lists:

| Tool | Closed arguments | Authorization resource suffix (under project) |
|---|---|---|
| `neon.listProjectPermissions` | `project_id` | `permissions` |
| `neon.listProjectMembers` | `project_id` | `members` |

Scope copies up to 16 permission IDs and 16 unique member-ID/user-ID pairs. Selected
permission IDs use the common conservative ASCII identifier subset; member/user IDs
are canonical lowercase UUIDs. Unsupported selected identities refuse, not normalize.
Each collection requires its own exact grant; project/child/sibling grants do not
imply it. Fixed authenticated project paths bind responses; contradictory optional
project identity or any branch identity refuses. Selection minimizes authorized
collection output and does not replace request authorization.

Permission output is ID only, never email or grant/revocation timestamps; an ID is
not a claim of active access. Member output is the bound member/user IDs, known org
role and optional known effective_project_permission/grant_source. Missing status
stays absent, not defaulted to denied, viewer or active. Names, email, project_role,
other permission levels, timestamps and diagnostics are not read or exposed. This
selected result is not a complete effective-ACL, credential-entitlement or custody
receipt. Member/user reassociation and duplicate member/user identities refuse,
including unselected rows that collide with a configured identity.

Permissions are nonpaginated and capped at 30 before filtering. Members use fixed
10-row pages, encoded response pagination.next as the next request cursor, and a
three-page ceiling. Empty pagination terminates; unexpected sort/request-cursor
fields, cursor cycles, malformed rows, over-limit pages and an unfinished third
page refuse without partial results. Maximum scope and output fit common budgets.
A 404 may mean no access, disabled per-project role management or non-org ownership;
it remains unavailable, never empty success or another endpoint fallback. No access
mutation, grant/revoke, member-role update, credential inspection, runtime permission
or lifecycle enforcement is supplied. Provider effects/availability remain unknown.

`createNeonOrganizationVPCOperations(trustedScope, transport)` adds three organization network-metadata reads:

| Tool | Closed arguments | Authorization resource suffix (under `neon/organizations/<org>/vpc`) |
|---|---|---|
| `neon.listOrganizationVPCEndpointsAllRegions` | `org_id` | `vpc_endpoints` |
| `neon.listOrganizationVPCEndpoints` | `org_id`, `region_id` | `region/<region>/vpc_endpoints` |
| `neon.getOrganizationVPCEndpointDetails` | `org_id`, `region_id`, `vpc_endpoint_id` | `region/<region>/vpc_endpoints/<endpoint>` |

Scope copies one organization/revision, up to 16 unique region IDs and 16 unique
endpoint-ID/region bindings; every endpoint must bind to a configured region. The
organization path follows the pinned lowercase alphanumeric/hyphen 1–60 pattern;
selected endpoint IDs use the common 1–80 ASCII identifier subset, and regions use
bounded canonical aws/azure identifiers. Construction also rejects any composed
endpoint-detail resource exceeding the common broker's 256-character resource limit. Other provider-valid selected identifiers
are unavailable rather than rewritten. An organization parent, regional collection,
all-regions collection, endpoint detail or project VPC grant never implies another.

Closed output contains only selected endpoint IDs and their bound region IDs. Labels,
sensitive state, restricted-project counts/examples and arbitrary diagnostics are
not read or emitted. This is not a complete network-restriction or connectivity
receipt. Detail must match the exact requested endpoint, not another allowlisted
endpoint in the same region. Region-list/detail schemas lack required ancestry:
execute carries the authenticated request region into projection, not invented
provider evidence. All-regions rows must return region_id; selected IDs relocated
to a different region refuse. Contradictory optional organization/region identity,
project/branch identity, duplicate pairs and any pagination refuse. Both lists are
nonpaginated with a 30-row ceiling before filtering, without partial success or
truncation. Maximum configuration/output fits common budgets. Azure detail is
explicitly unsupported in the pinned schema and refuses before transport; Azure
lists remain source-supported, not provider-qualified. Non-200 never becomes empty
success or another endpoint fallback. No endpoint assignment, network-restriction
mutation, external URL follow or live grant is supplied. Entitlement, availability,
provider effects and native integration remain unknown.

`createNeonOrganizationOperations(trustedScope, transport)` adds two organization configuration reads:

| Tool | Closed arguments | Exact authorization resource |
|---|---|---|
| `neon.getOrganization` | `org_id` | `neon/organizations/<org>` |
| `neon.getOrganizationSpendingLimit` | `org_id` | `neon/organizations/<org>/billing/spending_limit` |

Scope validates and copies one organization ID and revision. Organization paths use
pinned lowercase alphanumeric/hyphen IDs, 1–60 characters, without normalization.
Detail, spending-limit, billing-parent, VPC and project grants never imply one another.
Detail returns only the exact bound ID and optional require_mfa/allow_hipaa_projects
booleans; absent flags stay absent, not false or qualified. Names, handles, plan,
manager and timestamps are not read or exposed. This is not an effective-MFA,
HIPAA-compliance, credential-entitlement or security-qualification receipt.

Spending output is only spending_limit_cents: null means no configured limit, zero
is preserved, and nonnegative safe integers remain exact cents without conversion.
Negative, fractional, negative-zero and unsafe int64 values refuse rather than round.
No configured cap is claimed to enforce a budget, authorize spend or establish current
usage. This beta read is documented only for Launch/Scale members with read access;
entitlement is unverified. The response has no required organization ID, so binding
comes from the fixed authenticated organization path, not invented provider ancestry.
Optional org_id must agree; project/branch identities and pagination refuse on both
reads. Non-200 stays unavailable, never an absent limit, disabled security or another
endpoint fallback. No account enumeration, limit update, organization mutation,
credential retrieval or runtime enforcement is introduced. Maximum scope/output fit
common budgets; provider effects and native qualification remain unknown.

`createNeonOrganizationMemberOperations(trustedScope, transport)` adds
`getOrganizationMembers` and `getOrganizationMember`, with exact resources
`neon/organizations/<org>/members` and `neon/organizations/<org>/members/<member>`.
Collection, detail, organization-parent and project-access grants never imply one
another. Scope copies one organization/revision and up to 16 one-to-one member UUID /
user UUID bindings. Arguments accept only org_id and, for detail, a configured member_id.
The collection preserves the pinned members/member envelope but omits user profiles;
each member exposes only id, user_id, org_id and a known role. Email, joined timestamps,
MFA and deactivation information are not read. No active-access or MFA qualification
is inferred. Detail is an unwrapped exact requested member, not a collection wrapper.

Collection transport fixes limit=10, sort_by=joined_at and sort_order=desc, follows only
pagination.next for at most three pages, and checks optional sort echoes. Accumulated
rows validate before another request, bounded to 30 before filtering; duplicates,
user/member reassociation, contradictory organization/project/branch ancestry, changed
ordering, cursor cycles and page exhaustion refuse without partial success. Unselected
members never expand the trusted binding. No role/access mutation, invitation handling,
account enumeration, runtime enforcement or live provider qualification is introduced.

`createNeonOrganizationInvitationOperations(trustedScope, transport)` adds
`getOrganizationInvitations`, requiring the exact collection resource
`neon/organizations/<org>/invitations`. Organization-parent, member, individual
invitation and project grants never imply collection access. Scope validates and
copies one organization/revision and up to 16 unique canonical lowercase invitation
UUIDs. Arguments accept org_id only. Selected rows expose just id, org_id and known
role. Schema-sensitive email, inviter identity, timestamps and unexpected credentials
are not read or emitted. The schema's summary mentions pending/accepted invitations
while its response description mentions pending only: no invitation-status or
active-access inference is made. This selected output is not a complete access inventory.

The pinned endpoint is nonpaginated, with a 30-row ceiling before filtering. Duplicate
IDs (including unselected ones), contradictory organization/project/branch ancestry,
malformed identities/roles and any pagination refuse without partial/truncated success.
The fixed authenticated organization path supplies request binding; every row must also
return that exact org_id. Empty or wholly unselected lists stay empty, not an assertion
that nobody has access. Maximum scope/output fit common budgets. Non-200 stays
unavailable, never empty success or a fallback. No invitation send/revoke/accept,
member mutation, account enumeration or runtime enforcement is provided. Availability,
entitlement, provider effects and native qualification remain unknown.

Trusted metadata scope contains one project, a revision, explicit branch IDs and endpoint
parent bindings. Construction validates and copies it. Caller IDs only select
already-configured resources; no caller identity, authority, origin, credential,
cursor, generic action or approval claim is accepted. The common core—not these
adapters—authenticates runtime company/agent/project/task/run and enforces BOTH
agent and exact-resource policy before credential access and execution. Aggregate
collection targets require their own policy grant; a project or child grant does
not confer collection authority. The upstream project/branch list request is
therefore explicitly collection-scoped; child filtering is additional projection,
not a replacement for authorizing that upstream request.

Response IDs and project/branch/endpoint relationships are checked. Output contains
only project ID/region/Postgres major; branch ID/project/state/default/protected;
endpoint ID/project/branch/type/state/disabled. Names, hosts, owners, settings,
passwords, credentials and connection strings are excluded. Unknown lifecycle
states fail closed until explicitly supported. No error body/headers are surfaced.
Common lease-reflection checks remain necessary even in these selected fields.

`createNeonMetadataTransport(injectedFetch)` has sixty-seven typed methods only. Its
internal request builder fixes origin `https://console.neon.tech`, `/api/v2`
paths, GET, JSON content, no redirects and no retries. No global fetch fallback
exists. Each response is bounded to 64 KiB and 1 s, including streamed body time;
each operation has a 3.5 s common-core deadline. Branch lists request 10 rows per
page, fixed name/ascending order and no deleted rows, for at most three pages.
Opaque cursors are bounded, encoded, never output/audited, and cycles refuse.
Over-limit/inconsistent pages refuse rather than return silent partial success.
Operation lists use the pinned schema's distinct `pagination.cursor`, fixed 10-row
pages and the same three-page ceiling; a remaining cursor at the ceiling refuses.
Endpoint/database/role lists have no pagination in the pinned API and cap at 30 rows;
unexpected pagination refuses. No request wakes/starts/resumes/suspends/restarts compute or
fetches connection metadata/secrets as a fallback. This describes requests we
construct, **not provider non-wake evidence**.

## Exact-user profile read

`createNeonUserProfileOperations` copies one trusted user ID and scope revision.
`getCurrentUserInfo` requires exactly `{ user_id }` matching that copied user and
an exact `neon/users/<user>/profile` grant. Parent/user, sibling profile, project
and organization grants are not substitutes. The provider request has no user
parameter: it always reads `/users/me`, so its returned `id` must prove that the
credential resolved to the selected user. A mismatch refuses, never rebinds the
selection or falls back to account enumeration.

Closed output contains only the bound ID and nonnegative safe-integer
`projects_limit` and `branches_limit`; zero is preserved, unsafe values refuse.
Names, email/login, avatar URL, linked auth accounts, billing/plan information,
compute/autoscaling quotas and diagnostics are omitted without being followed or
interpreted. These provider-reported limits are not current capacity, entitlement
or permission to provision. Pagination is unsupported and refuses. No profile
mutation, authentication-details lookup, key retrieval or live qualification is
introduced. Runtime entitlement and provider effects remain unknown.

## Exact-user organization catalog

`createNeonUserOrganizationOperations` adds `getCurrentUserOrganizations` with
closed `{ user_id }` matching a copied trusted user/revision and a dedicated
`neon/users/<user>/organizations` collection grant. Parent, profile, other-user and
organization-detail grants cannot substitute. Up to 30 unique organization IDs
are copied at construction; only selected IDs can be emitted.

The pinned catalog endpoint can return the owning organization for an organization-
or project-scoped key without identifying any user. This adapter deliberately
supports only user-bound credentials: fixed `GET /users/me` must first return the
exact selected user ID, then fixed `GET /users/me/organizations` uses the same
resolved credential. Wrong-user, userless, failed or aborted identity proof refuses
before the catalog; there is no fallback or inferred user-to-organization binding.
Both requests use the existing per-request bounds and one operation deadline.

Closed output is `organizations: [{ id }]` only. Names, handles, plan/manager,
MFA/HIPAA flags, timestamps, profile and billing data are omitted. The collection
is nonpaginated, capped at 30 before filtering; malformed/duplicate IDs, contradictory
optional ancestry and unexpected pagination refuse without truncation or empty-
success fallback. Empty output is not absence-of-membership, complete entitlement
or current access evidence. No membership mutation, transfer, account discovery,
credential retrieval or live qualification is introduced. The identity proof is
part of this exact catalog operation, not a separately exposed profile grant.

## Organization-filtered project catalog

`createNeonProjectOperations` adds `listProjects`. Trusted construction copies an
exact organization/revision and up to 30 unique project IDs. Canonical arguments
require that `org_id`; the dedicated `neon/organizations/<org>/projects` collection
grant is distinct from organization detail, project detail and project-count grants.
Transport always sends `org_id`, `limit=10` and `recoverable=false` to fixed
`GET /projects`. Search, caller pagination, recovery and unfiltered fallback are
not exposed.

Only selected project ID, region ID and PostgreSQL version are emitted. Names,
owners, URLs, settings, billing/usage data and application/integration maps are
omitted. The fixed organization filter and trusted project selection bind rows;
optional organization ancestry must not contradict the selection. Every row is
validated before filtering, and duplicate IDs across pages refuse. The pinned
`Pagination.cursor` is forwarded unchanged, distinct from the newer `next` schema;
absent pagination terminates, malformed pagination or repeated cursors refuse.
Three 10-row pages are the maximum, with no partial success at the ceiling.
Every page validates the bounded unique `unavailable_project_ids` list; a selected
project reported unavailable refuses instead of becoming empty or partial success.
Unselected unavailable IDs never become output.

Catalog membership is not provisioning authority, entitlement, current capacity or
provider-effect evidence. No creation, recovery, deletion, URL follow, live call
or runtime enablement is introduced. Empty selections emit no project metadata;
failed upstream requests never become empty success or drop the organization filter.

## Exact-user shared-project catalog

`createNeonSharedProjectOperations` adds `listSharedProjects` with canonical
`{ user_id }`, a copied exact user/revision and up to 30 unique selected project
IDs. Its `neon/users/<user>/shared_projects` grant is distinct from profile,
organization catalog, organization project catalog and project-detail grants.
Fixed `GET /users/me` must first prove the selected user; only then does fixed
`GET /projects/shared?limit=10` use the same credential. Userless/wrong-user keys
refuse before catalog transport. Search and caller-controlled pagination are not
exposed, and no other catalog is used as fallback.

Only selected project ID, region and PostgreSQL version are emitted. Names,
owners, organization details, effective permissions, URLs, settings and usage are
omitted. Shared catalog membership under the proven user plus explicit trusted
project selection binds output; it does not establish ownership or active access.
Every row is validated and deduplicated before filtering. Pagination uses the
pinned `Pagination.cursor`, with ten rows per page and three catalog pages at most;
continuing at that ceiling refuses without partial output. Selected unavailable
project IDs refuse on every page and detached projection, not empty success.

Identity proof plus pagination uses up to four bounded requests within one
4.5-second operation deadline. Failure, cancellation, malformed or cyclic
pagination and contradictory optional user/project/branch ancestry refuse without
retry or discovery. This is not an atomic access snapshot or non-waking evidence;
credential custody, native integration, entitlement and provider-effect gates
remain. No mutation, live call, secret retrieval or runtime enablement is added.

## Exact-user API-key identities

`createNeonUserKeyOperations` copies an exact user/revision and explicit selection
of at most 30 unique nonnegative safe-integer API-key IDs. `neon.listApiKeys`
requires exactly `{ user_id }` and the dedicated
`neon/users/<user>/api_keys` collection grant; a user profile, individual key,
organization or account grant does not authorize this request.

The fixed `/users/me` identity proof must match the selected user before the same
resolved credential calls `/api_keys`. Userless/wrong-user credentials refuse
before the collection request. Closed output contains only selected numeric IDs
under `api_keys`; those IDs are not tokens. Names, creator profiles, usage
addresses, timestamps and unexpected token fields are neither read nor emitted.
All rows are validated before filtering: duplicate, malformed, unsafe, fractional,
negative or negative-zero IDs, contradictory optional user/org/project/branch
ancestry, unexpected pagination and over-30 arrays refuse without partial success.
Zero remains valid. An empty selection/output is not a complete key inventory.

The pinned GET explicitly excludes tokens. This schema-backed metadata read moves
one inventory row from reserved to read, not to enabled. Two bounded requests fit
within the 3.5-second operation deadline; no retry, account-wide output/fallback,
credential creation, rotation, reveal or revocation is introduced. Identity proof
and collection are not an atomic permission snapshot. Credential custody, effective
scope/ACL, expiry, entitlement, provider effects and native review remain separate
unresolved obligations. No live provider or SQL calls are needed for the contracts.

## Shared contract and candidate compatibility

Contract: `toolkit.provider-broker/v1`. Merged core: [PR #17](https://github.com/TogetherWeOwn/agent-toolkit/pull/17),
squash `a838436aa4492c77dc7fb995bc776ec7c7d922e7` in this source base; the new catalog imports its type contract directly.
The compatibility job still consumes the immutable pre-merge candidate commit
`3ce5639db8ebd7d1d2d77e69b28761bd044b6ca3`. The metadata type-only excerpt in
`compat/provider-contracts.d.ts` is byte-compared declaration-by-declaration in
Actions against that exact source. It contains no common executor, policy,
authorization store, scheduler or runtime implementation. Once reviewed compatible
core is available, replace the excerpt with its type import before qualification.
No unreviewed candidate is linked into a live worker.

The ordinary Actions suite builds and runs mocked adapter/transport contracts.
The additional `Neon candidate contract (not live qualification)` job checks out
the immutable candidate separately, builds it in Actions, and runs `core.compat.mjs`
against its reusable `providerFixture`. This proves only compatibility with that
candidate and synthetic host/policy/journal/audit/credential adapters. It does
not establish durable/native grants, acceptance of core or safe live integration.
There is no test-time network fallback if the fixture is missing.

## Coverage and verification

`api-snapshot.json` preserves all 194 documentary operation rows, checked against
the official [v2 schema](https://neon.com/api_spec/release/v2.json), SHA-256
`bcc73bd5e55a57a5349791a6367e62b39763cc512e49346b27a4436bb79ebafa`.
`operation-map.json` uses the common v1 machine-readable format: sixty-seven implemented
source adapters, 127 incomplete rows, unknown credential entitlement everywhere,
and `reviewed: false`, `enabled: false` throughout. These conservative qualification
flags do not undo the earlier metadata source merge in [PR #20](https://github.com/TogetherWeOwn/agent-toolkit/pull/20).
V1's closed manifest has no merged/provenance fields; recording machine-readable
source merge evidence requires a compatible common-core schema extension, not an
adapter-side fork. Internal consistency validation does not make the package complete.

The 194 management rows do not establish credential completeness. Retained key-scope
metadata is NOT OBTAINED: the public [API reference](https://neon.com/docs/reference/api)
and [key-scope documentation](https://neon.com/docs/manage/api-keys/) are descriptive,
not evidence of the credential's effective entitlements or placement. No authenticated
inspection or key retrieval was performed. The separate fixed-query staging inspector
(effective ACL, custody, expiry, revoke/cancel and session closure) remains absent;
it is outside the public management schema, not an implied 195th implemented API.
No generic SQL/data-plane or connection-string fallback is supplied.

GitHub Actions is CI of record. No local full suite, build/typecheck or CI mirror
was run. Exact-head run/job results belong in the PR verification packet; missing
or failed checks remain gates.

REA angle: reuse the official Neon API schema, existing closed-schema validators,
and the common ProviderOperation/fixture contract instead of inventing authority.
