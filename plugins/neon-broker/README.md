# Neon metadata and catalog source

**Source-only; not an installable plugin, complete provider package or live grant.**
No manifest/worker/tool registration, default fetch, credential placement, SQL,
secret sink or enablement flag is supplied. GET and mocked success do not prove
non-waking behavior. NO MINT / NO BIND / NO ENABLEMENT remains the boundary.

## Typed adapters

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
encoded `pagination.cursor` for at most three pages. Duplicated IDs/slugs, oversized
pages, cursor cycles and an unfinished third page refuse rather than silently
truncate. Beta availability, provider side effects and runtime qualification remain
unknown; 404 never becomes an empty list, a fabricated status or a deployment/invoke
fallback. These reads create, deploy, invoke and delete nothing.

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

`createNeonMetadataTransport(injectedFetch)` has twenty-nine typed methods only. Its
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
`operation-map.json` uses the common v1 machine-readable format: twenty-nine implemented
source adapters, 165 incomplete rows, unknown credential entitlement everywhere,
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
