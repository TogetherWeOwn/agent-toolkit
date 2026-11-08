# PlanetScale provider package

**Partial source build. Not installable, reviewed, enabled, or feature-complete.**
Maintainer role: toolkit engineering. Package version: 0.1.0. No runtime plugin
manifest, network executor, credential resolver, or tool registration is supplied.
The 134 adapters are pure request builders and bounded output projections,
not an alternative policy or approval system. They cannot perform a live call.

## Official surface and scope

The machine-readable [operation map](api/operation-map.json) inventories **291**
operations from the official Swagger 2.0 / v1 schema, downloaded 2026-11-07:

- Reference: <https://planetscale.com/docs/api/reference>
- Schema: <https://api.planetscale.com/v1/openapi-spec>
- Original bytes: 959547
- SHA-256: `ae45866599cb5d248fadb9d7f0ed30fd6aed440a17ec0950c4e9e0d58da4cb73`

The snapshot hash pins the original document, not a claim of provider stability.
Regenerate with `python3 -I plugins/planetscale-broker/scripts/inventory.py /path/to/openapi.json`.
Download the document into a new empty directory. The extractor verifies the
entire source hash before using it; a changed source needs explicit review and a
new pin. It does not fetch anything or execute downloaded content.

Each row retains method/path, API areas, resource parameters, parameter schemas,
success-schema references, operation hash, separately documented service-token
accesses and OAuth scope alternatives, intended tool, tier/review state,
implementation/test state and missing prerequisites. No documented service-token
access table means **unknown**, not proof of denial or permission. Listed
alternatives are not cumulative scope requirements. The actual credential kind,
organization/database/branch scope, grants, expiry and entitlement have **not**
been Operator-verified. Do not fetch credential values to fill this gap.

### Current source coverage

| Outcome | Count | Meaning |
| --- | ---: | --- |
| Official operations mapped | 291 | Schema inventory, not implementation |
| Offline metadata adapters | 134 | Narrow projections; not full operation coverage |
| Missing source adapters | 157 | Explicitly incomplete, never denied placeholders |
| Runtime-integrated operations | 0 | Reviewed compatible common core required |
| Security/Crypto/QA accepted | 0 | Exact-version reviews pending |
| Enabled / adopted | 0 / 0 | Separate live authorization and install gates |

134 adapter rows have a provisional read tier; twenty-two protected-operation
rows have explicit **unreviewed reserved-tier candidates**. The remaining 135
rows stay `unresolved`. None of these classifications is runtime policy or
approved authority. The intended tools are not registered. GET alone is not proof
of harmless, non-waking or non-billable behavior. Billing/admin, token/role/password, SSO/OIDC, query/metrics/log exports,
backups/restore, schema/deploy, topology, maintenance and every other official
area remain in the map even when access or implementation is missing.

## Configuration-cancellation plan subsets

`src/configuration-cancel-plans.ts` adds two pure previews, not API adapters or
executors. Both accept empty arguments and closed immutable broker snapshots of
database/branch/change IDs, parent names, revision and production/state flags.
Branch cancellation supports vtgate only; keyspace cancellation independently
binds keyspace ID/name and supports mysqld/vttablet only. Parent/keyspace IDs are
not supplied by the official change-request response and require trusted bindings.
Both official summaries limit cancellation to draft/pending. Queued, applying and
terminal states refuse; no force, new/previous option values or rollback path is
supplied. Each prepares a fixed bodyless DELETE, with no query or caller selectors.

Release Manager obligations and conjunctive security/spend/host effects remain
unreviewed candidates, not obtained or consumed authority. A cancellation could
remove a planned security improvement: trusted effect classification must not
infer safety from the cancel verb. No executor, native precondition, provider
dry-run or authority mechanism is supplied. Revision/state snapshots cannot
prove freshness, unchanged settings, successful rollback or closure. Actual use
requires reviewed native identity/policy/approval binding, fresh parent/keyspace
identity and state revalidation plus uncertain-outcome recovery.

There are nine separately counted local plan subsets. All remain missing API
adapters: coverage is 134/291 bounded metadata subsets, 157 missing, zero
integrated/reviewed/enabled/adopted operations.

## Deployment-stop plan subsets

`src/deployment-stop-plans.ts` supplies two pure previews, not API adapters or
executors. Broker-owned snapshots bind database/request/source/destination IDs,
parent and branch names, request number, revision, production and state flags.
The official deploy-request response has no destination branch ID: intoBranchId
requires a separate trusted binding. Both require open requests and a non-deleted
source, and refuse equal source/destination IDs or names. Close supports only
pending/ready/no_changes, preparing PATCH with fixed `{state: "closed"}`; cancel
supports only queued, preparing a bodyless POST to the fixed cancel path. Caller
arguments are empty. Started/cutover/revert/finished states, force and arbitrary
state changes are unsupported, not a retry or rollback path.

Both retain unreviewed Release Manager obligations; trusted spend/security/host
side effects still need independent conjunctive classification. These lists do
not obtain or consume authority. Plans freeze all fields and explicitly retain
execution not-implemented, remote preconditions not-verified and provider dry-run
not-performed. A hash or reported state proves neither freshness nor a native
precondition. Real use needs reviewed identity/policy/approval binding, independent
current destination identity, fresh state revalidation and uncertain-outcome
recovery. Cancellation does not prove that deployment never began, that no schema
changed, or that rollback/closure completed. No network or runtime is supplied.

Including configuration cancellation, there are nine local plan subsets; these operations remain
missing API adapters. Adapter coverage is unchanged at 134/291, 157 missing;
zero integrated, reviewed, enabled or adopted operations.

## Backup-deletion plan subsets

`src/backup-deletion-plans.ts` adds two pure previews, **not API adapters or
executors**. Both accept empty arguments and snapshot broker-owned database ID,
parent names and revision; backup deletion also binds branch ID/name and backup
ID. It refuses protected/required backups and any state other than success.
Policy deletion binds policy ID and documented production/development target,
and refuses required policies. These are deliberately narrower than the API.
No force, unprotect, scheduling, retention, restore or cascade path is supplied.

The proposed requests are fixed DELETE paths with no query or body. Backup
removal retains Release Manager authority; policy removal retains both Release
Manager and owner-security authority because it removes recovery protection.
Trusted new-spend, security, production and host-application effects still need
independent classification and conjunctive authority. These unreviewed candidate
lists neither obtain nor consume approvals. Plans explicitly say local plan,
not provider dry-run; execution is not-implemented and remote preconditions are
not-verified. Snapshot booleans and hashes do not authenticate current provider
state, ownership, protection, inventory completeness or safe recovery. Actual use
requires reviewed native identity/policy/approval binding, fresh target/protection
revalidation and uncertain-outcome recovery. Nothing is installed or enabled.

Including deployment-stop and configuration cancellation, there are nine local plan subsets.
Adapter coverage stays 134/291,
with 157 missing adapters including these two. Remaining table/keyspace-table
metric GETs have no documented success schema and remain missing; no projection
or response identity is invented from the other metric endpoints.

## MoveTables status availability metadata

`planetscale.get_move_tables_workflow_status` prepares one fixed GET with the
required `target_keyspace` query. Broker-owned branch/keyspace IDs and parent,
workflow and target-keyspace names are snapshotted; caller arguments are empty.
Names use the bounded slug subset and are not immutable workflow identity.
The required `data` object may omit all three documented fields. Traffic text
is capped at 4,096 UTF-16 code units; optional table-copy and shard-stream maps
are each capped at 32 object-valued entries within the shared 64 KiB wire cap.
Documented copy counters must be safe integers and percentages finite numbers;
no progress, completion or range semantics are inferred. Stream contents stay
opaque. Only request-bound branch/keyspace IDs and nonempty string/map presence
booleans survive, with provenance/executionAuthority explicitly not-established.
No workflow/keyspace/table/shard names, traffic text, progress or stream details
are returned.

The response has no branch, keyspace or workflow identity. Fresh ownership and
workflow/keyspace name bindings, trusted request/response transport, raw-body
custody, collection permission and non-waking semantics remain prerequisites.
Presence is not traffic safety, copy completion, freshness, native closure or
mutation authority. Full workflow status and the opaque workflow list/detail
contracts remain incomplete; this subset supplies no executor or live grant.

## Data-topology availability metadata

`planetscale.get_data_topology` binds an immutable branch ID and parent names,
accepts no caller arguments and prepares one fixed GET. The official
`NekiDataTopology` exposes an opaque object and nullable sync string, not a typed
topology or target identity. The adapter bounds the object at 32 top-level entries,
the sync string at 80 UTF-16 code units and the whole wire at 64 KiB. It returns
only requestBranchId, topologyReported (nonempty object), syncTimeReported
(nonempty string), and freshness/provenance not-established. Object keys,
nested contents and timestamps never leave the projection. Invalid nonempty
sync text is presence only, not a validated time or freshness verdict.

Fresh branch ID/name ownership, trusted transport/request binding, raw-body
custody, collection permission and non-waking semantics remain prerequisites.
The bound ID is not verified response identity. This availability subset does
not implement topology inspection, integrity validation, routing, mutation or
execution authority.

## Keyspace VSchema availability metadata

`planetscale.get_keyspace_vschema` reuses the broker-owned immutable keyspace
ID/name binding and fixed parent path, with no caller arguments. The required
`raw` field must be a string of at most 32,768 UTF-16 code units within the
shared 64 KiB wire cap. Only requestKeyspaceId, rawReported (nonempty text) and
explicit provenance/executionAuthority not-established flags survive. Raw
schema, table/vindex names and other response fields are never returned or
executed. Empty text is distinct from nonempty invalid schema: neither proves
validity, safe routing, completeness, effective configuration or native authority.

The official response has no target identity. The request-bound ID is not an
independently verified response identity; fresh parent/keyspace ID/name ownership,
trusted transport-to-request binding, raw-body custody and non-waking semantics
remain required. This availability subset does not deliver full VSchema content,
validation, mutation or routing capability.

## Historical-metric availability metadata

`planetscale.get_branch_metrics` supports only `queries` / `query_errors`;
`planetscale.get_tablet_metrics` supports only `replication_lag` /
`primary_cpu_usage`. One metric and canonical UTC from/to stamps are broker-bound,
with a positive window at most 15 minutes and fixed `steps=16`. No caller filters.
Responses must match both stamps and the selected metric; bounded type/interval,
series and finite chronological point-pair checks refuse the whole response on
failure. Caps are eight series, sixteen points per series and 64 KiB wire.
Only request-bound branch ID, metric enum, series/sample-presence booleans and
`health` / `provenance: not-established` survive. No values, labels, role/pod/query
details or times are returned. Empty series and empty samples remain distinct.

The official `MetricSeries` response has **no branch identity**. A request-bound
ID is not an independently verified response identity; matching stamps/metric
cannot prove provenance. Integration requires trusted transport-to-request binding,
fresh branch ID/name ownership, whole-branch collection permission, raw-body
custody and non-waking evidence. No label, pod, shard or keyspace isolation,
completeness, health, freshness, rollback or closure is established. Other metrics,
filters/windows/steps and full capability remain incomplete.

`planetscale.get_branch_query_metrics` and `planetscale.get_branch_tag_metrics`
reuse the same scope, `queries` / `query_errors` subset, fixed window/steps and
validator. They request the fixed `/metrics/query` and `/metrics/tag` endpoints
without optional query/fingerprint/keyspace/tag-set/search/tablet/budget/rule
selectors. These are **whole-branch availability subsets**, not isolated query or
tag reads; branch-wide collection permission is required. Neither labels nor
query/tag identifiers or contents leave the projection. The official response
has no branch, query or tag identity; matching a metric/window cannot authenticate
origin or selector application. All ownership/transport/custody/non-waking
prerequisites above remain; full query/tag metrics and filters are incomplete.

## Instant-metric availability metadata

`planetscale.get_instant_branch_metrics` and
`planetscale.get_instant_tablet_metrics` each request one broker-bound documented
metric enum with no caller filters. Response branch ID/name must independently
match immutable bindings; only that metric may be returned (at most one row and
32 samples, within the shared 64 KiB wire cap). Sample shapes are validated, but
values/pods/roles, labels and timestamps are never returned. The receipt contains
bound branch ID, metric enum and a samples-present boolean, plus
`health: not-established`. An absent metric and an empty sample array remain
distinct. Neither presence nor absence proves freshness, health, restore
completion, topology, native closure or authority. Optional filters and full
metrics capability remain incomplete; the historical subset is separate above. No pod/keyspace-level
isolation is claimed; current branch ownership, parent collection permission,
raw-body custody and non-waking evidence remain integration prerequisites.

## Query-tag metadata

`planetscale.list_branch_query_tags` reads only `page=1&per_page=10`;
`planetscale.get_branch_query_tag` routes by a broker-bound tag **name**, not its
ID. Both independently match the response ID/name pair. Output contains only
the bound ID, the documented `sql`/`system` source enum and
`executionAuthority: not-established`. Tag names/values, SQL-derived dimensions,
counts, actors and timestamps are omitted. The list snapshots 1–32 unique ID/name
pairs and refuses the whole page on unknown/rebound/duplicate IDs, malformed
pagination or over-cap data. Optional nullable page fields follow the official
schema; no returned URL is exposed or followed. The detail route refuses the
reserved `summaries` literal so it cannot select the separate grouped endpoint.
Names/IDs use a deliberately restricted identifier grammar; other formats,
optional filters/later pages and full tag capability remain incomplete. Source
metadata never proves query provenance, enforcement, completeness or authority.
Current parent/ID/name ownership, separate collection permission, broker raw-body
custody and non-waking evidence remain prerequisites.

`list_branch_query_tag_summaries` stays missing/unresolved: its documented rows
have untyped `dimensions` and no stable ID. The package builder must provide a
reviewed bounded dimensions identity/projection contract with raw-value custody
and refusal tests; no invented ID or generic map export is counted as coverage.

## Query-fingerprint statistics metadata

`planetscale.get_query_statistics` reads a fixed first page (`page=1&per_page=10`)
for a broker-bound query fingerprint and required keyspace;
`planetscale.get_query_summary` reads one separately bound summary for that same
context. Every row must match both fingerprint and keyspace as well as its
independently bound summary/query ID. Output is only the bound ID and strict
`multishard` or `explainable`/`truncated` flags, plus
`executionAuthority: not-established`. SQL, passwords, fingerprints, keyspace
text, metrics, tables, users, addresses and timestamps are omitted. Statistics
snapshot 1–32 unique query IDs and refuse whole pages on unknown, rebound or
duplicate rows, invalid pagination and over-cap data. Summary IDs and individual
query IDs are not interchangeable. No URL is exposed or followed; first-page
coverage and flags prove neither completeness nor EXPLAIN/replay/execution
authority. Fingerprint/keyspace selector grammars are deliberately bounded;
other formats, optional filters/later pages and full insights remain incomplete.
Current parent/context/child bindings, independent collection permission,
broker-side raw-body custody and non-waking evidence remain prerequisites.

## Query-error metadata

`planetscale.list_branch_query_errors` reads one fixed first page and validates
broker-bound summary ID/error-fingerprint pairs; output is the bound summary ID
only plus `executionAuthority: not-established`. `planetscale.get_branch_query_error`
reads the fixed first query page for one bound error fingerprint, with separately
bound query IDs and strict `explainable`/`truncated` flags. Both use
`page=1&per_page=10`, snapshot at most 32 bindings and refuse the whole page on
unknown/rebound/duplicate IDs or malformed pagination. Optional nullable official
`current_page`/`per_page` fields are checked when present. No URLs are followed.
Error messages, SQL, password objects, fingerprints, users, addresses, tags,
metrics and times never enter output. Query fingerprints are not error
fingerprints: the query response proves neither error provenance nor ownership.
First-page coverage/hasMore never proves completeness or grants remediation,
EXPLAIN, replay or execution authority. Fingerprints are restricted to the
broker's bounded identifier grammar; other formats, filters and later pages
remain incomplete. Current trusted parent/fingerprint/query bindings, separate
collection permission, raw-body custody and non-waking evidence remain required.

## Query-record metadata

`planetscale.list_branch_queries` reads only the fixed first summary page
(`page=1&per_page=10`); `planetscale.get_branch_query` reads one separately bound
individual query ID. Summary IDs are not assumed to identify individual queries.
The projections return only bound IDs and strict `multishard` (summary) or
`explainable`/`truncated` (detail) flags, with `executionAuthority: not-established`.
No SQL, password object, fingerprints, tags, users, addresses, table/keyspace
names, metrics or timestamps are returned. The summary list uses the official
`type/next_page/prev_page/data` envelope; malformed envelopes, unknown or duplicate
IDs and over-cap data refuse the whole page. No provider URLs are followed;
`hasMore` and first-page-only coverage never claim completeness. Broker bindings
are snapshotted and capped at 32. Flags never grant EXPLAIN, replay, execution,
remediation or native approval authority. Current parent ownership, independent
collection authorization, broker-side raw-body custody/reflected-secret guards
and operation-specific non-waking evidence remain prerequisites. Optional
filters/later pages and full insights capability remain incomplete.

## Audit-event metadata

`planetscale.list_audit_logs` is a fixed organization first-page read with
`limit=10`. It snapshots 1–32 broker-owned event IDs and returns only bound IDs,
`auditActionRecorded` string-presence flags and `integrity: not-established`.
Action strings, actor/target identities, display names, IP/location/ASN, change
metadata and timestamps are omitted. Unknown IDs, duplicates, malformed rows,
over-cap pages and inconsistent cursor envelopes refuse the whole response.
No cursor is exposed or followed; `hasMore` and explicit first-page-only coverage
never establish history completeness. Presence never proves event integrity,
correct authorization, effective enforcement or native closure. The documented
`read_audit_logs` scope is separate from general organization/database reads;
actual entitlement, independent organization collection permission, trusted
ownership, raw-body custody and operation-specific non-waking proof remain
prerequisites. Later pages and full audit-log capability remain incomplete.

## Vitess parameter metadata

`planetscale.list_branch_vitess_parameters` is a fixed branch read returning only
broker-bound definition names, documented component/type and strict override flag.
The scope snapshots separate VTGate names and keyspace → VTTablet/MySQL names;
unknown keyspaces/names, component mismatches, duplicate names within a component
and malformed rows refuse the whole response. Each collection is capped at 32;
empty scopes and results are allowed but never establish completeness. Names are
not immutable resource IDs. Current/default values, options, titles, descriptions
and other free text are omitted. The official description specifies the same
parameter format for keyspace components as VTGate; no opaque objects are exposed.
`configurationAuthority: not-established` means an override flag never grants
configuration, restart, enforcement, wake or spend authority. Current parent/engine
bindings, independent collection permission, broker-side raw-body custody and
operation-specific non-waking evidence remain prerequisites. Full configuration
capability and all mutations remain incomplete; no live read is implemented.

## Anomaly metadata

`planetscale.list_branch_anomalies` and `planetscale.get_branch_anomaly` return
only broker-bound anomaly ID and strict active flag, explicitly paired with
`remediationAuthority: not-established`. SQL correlations, fingerprints, keyspace
names, latency/duration metrics and timestamps are omitted. Lists snapshot 1–32
unique IDs and refuse the entire page on unknown, duplicate or malformed rows.
Pagination is explicit and bounded; no provider URL is followed. Empty/last pages
are not scope-completeness evidence. Provider active/inactive state is neither
remediation authority nor proof of recovery, safe retry or native closure.
Current parent ownership, independent upstream collection permission, broker-side
raw-body custody, reflection guards and operation-specific non-waking evidence
remain prerequisites. Optional time/period filters and full anomaly/insights
capability remain incomplete. No SQL query or live remediation is implemented.

## Schema diagnostic metadata

`planetscale.lint_branch_schema` returns only broker-allowlisted keyspace names
and documented table/vschema/routing-rule subject-type enums. Scope snapshots
1–32 unique names; unknown keyspaces or malformed subjects refuse the whole page.
Pagination is explicit and bounded; repeated subject rows are distinct errors,
not duplicates to drop. Error codes/descriptions, table/column names, DDL, URLs
and arbitrary detail strings are omitted. Empty/last pages do not prove a safe
schema, effective rights or scope completeness.

`planetscale.check_deploy_request_storage` returns only strict enough-storage and
upgradeable flags. Bytes, capacity and per-keyspace/shard details are omitted.
The response supplies no request/target/branch identity: a fixed request number
never proves immutable current ownership. Both tools explicitly return
`deploymentAuthority: not-established`; flags never authorize deploy, upgrade,
safety weakening, spend or wake. Current parent/target bindings, independent
collection permission, broker-side raw-body custody, reflection guards and
operation-specific non-waking evidence remain prerequisites. Full diagnostics
and mutations remain incomplete.

Move-tables list/get records are opaque additional-properties objects in the
pinned schema; status contains free-text traffic state and table/shard-keyed
objects. All three remain missing pending a package-builder-owned reviewed
Vitess identity/state/safe-projection contract. No arbitrary object or generic
count adapter is counted as implementation, and no live probe is authorized.

## Query report metadata

`planetscale.get_query_patterns_report_status` and
`planetscale.list_generated_query_patterns_reports` return only bound report IDs
and documented pending/completed/failed state. URLs (including download URLs),
actors, timestamps and report/SQL content are omitted. Lists snapshot 1–32 unique
broker-owned IDs, validate the official cursor envelope, cap rows at 10 and refuse
the whole result on unknown/duplicate/malformed records. Only the first page with
fixed `limit=10` and empty arguments is supported. `hasMore` records a partial
result; `coverage: first-page-only-not-completeness-evidence` never claims full
collection/scope coverage, even when false. No cursor, provider URL or redirect is
followed. Later pages, report generation and full details remain incomplete.
The download GET is officially 302-only and remains missing pending a reviewed
redirect/custody contract; it is not a successful metadata read. Completed state
and `downloadAuthority: not-established` never grant export access, prove native
closure or authorize retry. Current immutable parent ownership, independent
collection permission, broker-side raw-body custody, final selected-field reflection
guards and operation-specific non-waking evidence remain prerequisites.

## Compute catalog metadata

`planetscale.get_admin` binds an exact admin ID and projects its documented state.
`planetscale.list_admin_size_skus`, `planetscale.list_router_size_skus` and
`planetscale.list_cluster_size_skus` project only broker-allowlisted names and,
where supplied, the enabled flag. Plain arrays have 32-row/64-KiB limits; an
unknown/duplicate name refuses the entire result. Scopes snapshot 1–32 unique
names. Cluster engine is broker-bound (`mysql`, `postgresql`, `neki`), with
`rates=false`; callers cannot enable pricing or optional filters. Prices, capacity,
recommended sizes, provider/architecture and free text are omitted. Names are not
immutable resource IDs. State/enabled and `actionAuthority: not-established`
never authorize purchase, resize, restart or wake, or prove entitlement. Trusted
current parent ownership and independent collection permission remain required;
non-waking semantics and full optional capability are not demonstrated.

## Initial adapters

| Exact prospective tool | Projection |
| --- | --- |
| `planetscale.get_organization` | Matching configured name, SSO flag |
| `planetscale.get_database` | Matching name, engine kind, ready/deletion-protected flags |
| `planetscale.get_branch` | Matching name, ready/production/protection/safe-migrations flags |
| `planetscale.list_roles` / `planetscale.get_role` | Role ID/name, ready/expired, documented inherited-role enums |
| `planetscale.list_passwords` / `planetscale.get_password` | Password-record ID/name, role enum, expired flag; never password value |
| `planetscale.relation_exists` | Exact requested relation and existence boolean; never DDL/HTML |
| `planetscale.list_databases` | Bound child ID/name, engine, ready/deletion-protected flags |
| `planetscale.list_branches` | Bound child ID/name, ready/production/protection/safe-migrations flags |
| `planetscale.list_database_regions` / `planetscale.list_regions_for_organization` / `planetscale.list_public_regions` | Bound region ID/slug and enabled flag; no addresses/provider URLs |
| `planetscale.get_default_role` | Default-role marker required; same bounded role metadata, never connection/password fields |
| `planetscale.get_current_user` | Bound user ID and MFA-configured flag; no contact/profile/default-organization data or enforcement claim |
| `planetscale.list_organizations` | Bound organization ID/name and informational SSO flag; no billing, features, budget or MCP-access values |
| `planetscale.list_read_only_regions` | Bound read-only-region ID/ready flag and independently bound region ID/slug/enabled; no addresses, actor or timestamps |
| `planetscale.list_postgres_versions` | Bound version ID/default flag for fixed documented `neki` engine; no free-text version strings or upgrade authority |
| `planetscale.list_backups` / `planetscale.get_backup` | Bound backup ID, state and protection/required/emergency flags; no contents, names, download URLs or cost estimates |
| `planetscale.list_backup_policies` / `planetscale.get_backup_policy` | Bound policy ID, production/development target enum and required flag; no schedules or arbitrary strings |
| `planetscale.list_deploy_requests` / `planetscale.get_deploy_request` | Bound request ID/number/source branch ID/name and target name, state/deployment-state enums and source-deleted flag; no DDL, notes, actor or approval authority |
| `planetscale.get_deployment` / `planetscale.get_deploy_queue` | Bound deployment ID/request number/target name, state and auto-cutover/auto-delete/queue-paused flags; no errors, actors, nested operations or permission claim |
| `planetscale.list_deploy_operations` | Bound operation ID, state and can-drop-data/table-locked flags; no table/keyspace names, DDL, errors or progress estimates |
| `planetscale.list_deploy_request_reviews` | Bound review ID and informational provider state; native approval explicitly not established, no review body or actor |
| `planetscale.list_schema_recommendations` / `planetscale.get_schema_recommendation` | Bound recommendation ID/number and state/type enums; no title, table/keyspace names, DDL or actor |
| `planetscale.list_service_tokens` / `planetscale.get_service_token` / `planetscale.list_oauth_tokens` / `planetscale.get_oauth_token` | Bound token-record ID and expiry/usage timestamp presence only; no token, refresh token, actors, grant bodies or effective authority |
| `planetscale.list_webhooks` / `planetscale.get_webhook` | Bound webhook ID, enabled/header-configured flags and nullable last-send success; no secret, URL, event names or result text |
| `planetscale.list_keyspaces` / `planetscale.get_keyspace` | Bound ID/name and sharded/external/ready/resizing/default flags; no configuration maps, SKU or storage details |
| `planetscale.list_shards` / `planetscale.get_shard` | Bound ID and ready/authoritative topology flags; no names, profiles or timestamps |
| `planetscale.list_maintenance_events` / `planetscale.get_maintenance_event` | Bound event ID/branch ID/name, state enum and urgent flag; no description, impact text, timestamps or execution windows |
| `planetscale.list_organization_members` / `planetscale.get_organization_membership` | Bound membership/user IDs and informational role enum; no contact details, profile or effective-authority claim |
| `planetscale.list_organization_teams` / `planetscale.get_organization_team` | Bound team ID/slug and managed flag; no members, creator, database lists or authority claim |
| `planetscale.list_organization_team_members` / `planetscale.get_organization_team_member` | Bound membership/user IDs only; no passwords, addresses, actors, contact details or effective grants |
| `planetscale.list_bouncers` / `planetscale.get_bouncer` | Bound bouncer ID/name, branch ID/name and target enum; no connection parameters, SKU, actor or timestamps |
| `planetscale.list_bouncer_resize_requests` / `planetscale.list_branch_bouncer_resize_requests` | Bound resize ID and bouncer ID/name, informational state enum; no parameters, size/price or execution authority |
| `planetscale.list_branch_resize_requests` / `planetscale.get_branch_resize_request` / `planetscale.list_keyspace_resize_requests` / `planetscale.get_keyspace_resize_request` | Bound resize ID and informational state enum only; no cluster names, capacity, actors, prices or timestamps |
| `planetscale.list_branch_change_requests` / `planetscale.get_branch_change_request` | Bound PostgreSQL change ID and state enum only; no parameters, storage, version, SKU, actor or timestamps |
| `planetscale.list_branch_config_change_requests` / `planetscale.get_branch_config_change_request` / `planetscale.list_keyspace_config_change_requests` / `planetscale.get_keyspace_config_change_request` | Bound config-change ID/type/keyspace and state enum; no option values, errors, actors or timestamps |

Schedule tools: `planetscale.get_maintenance_schedule`,
`planetscale.list_maintenance_schedules`, `planetscale.get_branch_maintenance_window`
and `planetscale.list_maintenance_windows`; all are offline metadata subsets.

The five discovery lists require a broker-owned closed scope containing 1–32
unique child ID/name pairs (region names are slugs). Any unknown or rebound child
refuses the **entire page**, not a partial result. The scope is snapshotted during
preparation and cannot be widened by later mutation. This is output confinement,
not authorization: upstream parent-collection access must be independently allowed
before a list executes. An agent allowed one database cannot acquire organization-
wide listing permission through this adapter. `complete` means no next provider
page, not a scope/entitlement/completeness attestation. Optional provider filters
are not yet exposed; metadata projections are not full provider-operation coverage.
`get_default_role` discovers metadata; it does not establish an accepted catalog
principal, effective rights, immutable branch binding or safe credential reuse.

Backup/policy collections additionally require 1–32 unique broker-bound IDs.
Deploy-request reads require exact ID/number/source branch ID/name/target-name
bindings, unique by ID and number for lists. Unknown or rebound entries refuse the
whole page. Parent collection authorization is still independent; neither a
matching response nor provider deployment state grants deployment approval. The
schema does not supply an immutable target-branch ID in this projection, so its
name is not an immutable destination or a safe execution precondition. No backup
restore/export or deployment mutation is implemented. Optional filters, schedule/
retention policy details, contents and full-operation coverage remain missing.

Deployment-detail and recommendation collections also snapshot 1–32 unique
broker-owned child bindings. Deployment responses match ID, request number and
target name; recommendations match ID/number. Child operation/review responses
supply no parent identity, so their bound ID membership and fixed request path
are not proof of parent ownership. Trusted parent-child binding and current
immutable destination revalidation remain integration prerequisites. No returned
state or `canDropData` flag grants permission; provider review `approved` is
explicitly paired with `nativeApproval: not-established`. DDL, arbitrary table/
keyspace names, review bodies and actor data are never projected. Recommendation
branch/state filters and full deployment details remain incomplete.

Service-token and OAuth-token record reads return only a bound ID, expiry/usage
timestamp **presence** flags and `effectiveAuthority: not-established`. They never
return token/refresh-token values, names, actors, addresses, grant bodies or raw
timestamps. Presence does not prove unexpired, enabled, revoked or usable authority.
Webhook reads return only a bound ID, enabled/header-configured flags and nullable
last-send success; no URL, secret, event name or response/error text. Lists snapshot
1–32 unique broker-owned IDs and refuse the entire page on an unknown ID. These
responses do not establish organization/application/database ownership: trusted
parent binding and parent-collection authorization are separate prerequisites.
The pinned webhook schema contains a secret even on reads. Future transport must
keep raw bodies broker-side with no logging/reflection, including error paths;
these offline projections neither authorize fetching such bodies nor prove custody.

Keyspace reads require exact broker-owned ID/name bindings; shard reads require
bound IDs and expose only ready/authoritative flags. `authoritative` describes
provider topology, not agent authorization or effective rights. Maintenance-event
bindings additionally match the response branch ID/name; state and urgency are
informational, never reschedule/execute authority. Collections snapshot 1–32 unique
child IDs and refuse the whole page on unknown or rebound identities. Keyspace
configuration maps/storage/SKUs, shard names/profiles and maintenance descriptions,
impact text, timestamps and available execution windows are omitted. Trusted parent
ownership, independent parent-collection permission and non-waking evidence remain
prerequisites. Optional search/profile and branch/state filters, topology counts,
full configuration and maintenance scheduling capabilities remain incomplete.

Organization membership/team/member reads snapshot exact broker-owned bindings.
Collections require 1–32 unique IDs and unique user IDs or team slugs; unknown or
rebound identities refuse the whole page. `admin`, `managed` and team membership
are provider metadata, always paired with `effectiveAuthority: not-established`.
Contact/profile fields, actors, descriptions, team database/member lists, nested
passwords and connection addresses are omitted. Membership responses contain no
parent identity; fixed paths and matching child IDs do not prove organization/team
ownership. Trusted current parent bindings (including team ID/slug revalidation),
parent-collection authorization and final reflection guarding remain integration
prerequisites. Team-member responses are credential-bearing even on GET; future
transport must keep raw bodies broker-side without logging/reflection, including
errors. These pure projections do not authorize fetching them or prove custody.
Optional member/team search and full membership/grant capability remain incomplete.

Bouncer reads additionally match the broker-bound branch ID/name; bouncer resize
records match the bound bouncer ID/name. Per-bouncer resize scopes reject records
bound to a different bouncer before preparing a request. Branch/keyspace resize
responses have no parent identity; fixed paths and matching child IDs do not prove
ownership. Trusted current branch/keyspace/bouncer ID/name binding and independent
parent-collection permission remain prerequisites. Lists snapshot 1–32 unique child
IDs and refuse the whole page on unknown or rebound identities. Provider state and
primary/replica targets never grant resize, spend or cancellation authority.
Connection/configuration parameters, SKU/cluster names, capacity/cost estimates,
actors and timestamps are omitted. Keyspace completion-time filtering and full
resize details remain incomplete. No sizing, resize or cancellation mutation, live
call, credential binding or compute wake is implemented or authorized.

PostgreSQL branch-change reads reuse the bounded resize-state projection.
Configuration-change bindings additionally pin type and nullable keyspace name:
`vtgate` requires null, `mysqld`/`vttablet` require a bound keyspace slug. Branch
config detail accepts only `vtgate`; the branch collection explicitly supports
mixed branch/keyspace records, each with its own bound ID/type/keyspace. Keyspace
endpoints reject a different parent or branch-only type before preparation.
Unknown/rebound records refuse the entire page; later scope mutation cannot widen
bindings. Option maps, parameters, storage/version/SKU, errors, actors and times
are omitted. State/type is informational, never config, resize, spend or native
approval authority. These response shapes supply no immutable parent identity;
trusted current branch/keyspace ownership and independent collection permission
remain prerequisites. Optional period/completion filters and full details are
incomplete. The official admin-change list/get aliases document **308 only** and
no success schema: both remain missing with an explicit reviewed-alias-contract
prerequisite. No redirect following or substitution is implemented or counted.

Maintenance schedule list/get and branch-window reads return only a bound schedule
ID, enabled/required flags and frequency-unit enum. Window lists return bound IDs
and start/finish timestamp presence, not timestamps or proof of successful execution
or native session/resource closure. Display names, timing/duration, versions and
free text are omitted. Scope snapshots constrain IDs (1–32 unique for collections);
unknown IDs refuse the whole page. Response shapes contain no immutable parent
identity: trusted current schedule/database/branch/window ownership and independent
parent-collection permission remain prerequisites. A provider schedule is never an
authorized use window; flags never grant execution, rescheduling or wake authority.
Full scheduling details/mutations and non-waking semantics remain incomplete.

Router and dedicated-read-replica list/get tools require exact broker-owned ID/name
bindings. Router output is ID/name, state and default/autoscaling flags; replica
output is ID/name, prose-documented state and ready flag. Connection hosts, private
service/address/region data, configuration parameters, SKU/cost/storage/counts and
actors are omitted. Unlike paginated collections, these two list operations return
plain arrays and have no query parameters in the pinned schema: empty closed
arguments only, 32-row/64-KiB caps and whole-array refusal on unknown/rebound children.
No pagination or collection-completeness attestation is invented. Larger arrays
remain unsupported rather than silently truncated. Scopes snapshot 1–32 unique
ID/name pairs; trusted parent ownership and independent collection authority are
still required. Switchover list/get tools bind IDs, with bounded pagination for
the list; output is ID, state and start/finish timestamp presence only, not errors,
method or actor. Failed switchover outcomes can be ambiguous; state and timestamp
presence never prove unchanged primary, rollback, safe retry or native closure.
Readiness/default/autoscaling flags never grant restart, failover, resize, wake or
spend authority. Full details/mutations and non-waking semantics remain incomplete.

Unified change-request list/get tools bind ID, matching type/target-type pair,
nullable target ID and a bounded target-name slug. Mixed-target lists are supported
only with each exact broker-owned binding. Null target ID stays null, never an
immutable resource claim. Replica-change lists additionally bind replica ID/name.
Unknown or rebound identities refuse the whole page. Output contains only those
bindings, state and (for unified records) the informational `canDelete` flag: no
configuration/storage/version/SKU, actor, errors or timestamps. State/`canDelete`
never grants deletion, cancellation, resize, spend or safe-retry authority. Trusted
parent ownership, target revalidation and independent collection permission remain
prerequisites. Optional state/target/period/completion filters and full details are
not implemented. Unsupported target names fail closed rather than leaking arbitrary
text. The four router/neki list/get aliases, like the two admin-change aliases,
document 308 only and remain missing pending an explicitly reviewed fixed-alias
contract. No redirect is followed and no alias is counted as an implemented read.

OAuth-application list/get tools return a bound ID and dynamic-registration,
single-organization and organization-scope-required flags, always paired with
`effectiveAuthority: not-established`. Names, client IDs, secrets, redirects,
domains, scopes/tool groups and token counts are omitted. SSO status binds the
immutable organization ID and returns only enabled/configured/directory/verified-
domain flags; these are provider metadata, not effective enforcement or native
acceptance. Nested domains and verification URLs are not projected. Separate SSO
domain list/get tools return bound IDs, state and verification timestamp presence
only: no domain names, failure reasons, verification material or raw times.
Invitation lists return bound IDs, informational role and expired flag, never
contact details, sender/recipient profiles or accepted membership/authority.

Application/invitation lists use bounded explicit pagination. SSO domain lists
use the official plain-array contract with empty arguments and a 32-row cap; no
pagination/completeness claim is invented. Collections snapshot 1–32 unique broker-
owned IDs and refuse the entire page/array on an unknown ID. Fixed paths and child
IDs do not prove trusted parent ownership or upstream collection authority; both
remain separate integration prerequisites. Domain verification presence is not
current domain control, and provider SSO flags never authorize enforcement changes.
Full details, mutations and non-waking semantics remain incomplete.

Invoice list/get tools return only a bound invoice ID and paid/overdue flags;
line-item reads return bound item IDs and the Cloudflare-billed flag. Amounts,
billing periods, descriptions, metric names, database/resource names and nested
resource bodies are omitted. Payment-method metadata returns only the bound ID;
brand, card digits, expiry and cardholder data are never projected. Payment setup
reads return bound ID/state only, not checkout URLs, client secrets, errors or
timestamps. All billing summaries explicitly say `spendingAuthority: not-established`:
paid/overdue/completed status and billing channel never authorize spending or
prove payment-method validity, native expiry or session closure.

Invoice and line-item lists use bounded pagination and snapshot 1–32 unique
broker-owned IDs; unknown IDs refuse the whole page. The request's parent invoice
ID is separately fixed. Responses do not establish parent organization/invoice
ownership; trusted current bindings and independent upstream collection permission
remain prerequisites. A changed current payment-method ID refuses instead of
silently rebinding. The official setup-status GET requires **write_payment_method**,
unlike payment-method GET (**read_payment_method**) and invoice reads
(**read_invoices**). Read projection does not imply read-only credential entitlement
or justify expanding a credential. Raw payment/checkout bodies must stay broker-
side without logging/reflection; these offline projections do not authorize a
fetch or prove custody. Full billing details/mutations and non-waking semantics
remain incomplete.

Configuration-profile list/get tools bind exact ID/name pairs and project only
ID/name, state and default/metal flags. Profile-shard list/get tools additionally
match the response's configuration-profile name and project bound shard IDs and
ready/authoritative flags. Storage/architecture/SKU, replica/shard counts, version
values, display names and timestamps are omitted. Profiles use the official plain-
array shape, empty arguments and a 32-row cap; profile shards use bounded explicit
pagination. Collections snapshot 1–32 unique child bindings; profile names and IDs
are both unique. Unknown/rebound identities refuse the entire page/array. Parent
profile names do not prove immutable current ownership: trusted current branch/
profile/shard bindings and independent upstream collection permission remain
prerequisites. Metadata state/flags never authorize configuration, assignment,
resize, spend or compute wake. Optional shard search, full configuration details,
mutations and non-waking semantics remain incomplete. The default-profile GET
is officially **302 only**, without a success response schema; it remains missing
pending a reviewed fixed-alias contract. No redirect following or fabricated
successful adapter is implemented or counted.

Extension lists (`list_extensions`, `list_shard_configuration_profile_extensions`)
return bound definition names, can-enable/internal flags and nullable enabled state.
Missing/null enabled remains unknown, never disabled. Parameter lists
(`list_parameters`, `list_admin_parameters`, `list_router_parameters`,
`list_shard_configuration_profile_parameters`) return bound namespace/name pairs,
parameter-type enums and internal/disabled/required/restart flags. Engine-specific
namespace enums are validated before request preparation and during projection.
Values/defaults/options/limits/units, descriptions/display names, nullable IDs,
nested extension parameters, URLs, actors and times are omitted. Definition names
and namespace/name pairs are not immutable resource IDs. Profile/router parents
have broker-bound ID/name inputs, but the response does not prove parent identity;
trusted current engine/parent ownership and independent upstream collection
permission remain prerequisites. These are plain arrays capped at 32 rows/64 KiB,
with 1–32 unique snapshotted definition bindings and whole-array refusal on unknown
names/pairs. Optional internal filtering is not exposed; no pagination is invented.
Flags never authorize enablement, configuration changes, restarts, spend or wake.
Full configuration details/mutations and non-waking semantics remain incomplete.

IP-restriction list/get tools (`list_database_postgres_cidrs`,
`get_database_postgres_cidr`) return bound entry IDs only, explicitly paired with
`enforcementAuthority: not-established`. CIDR ranges, schema/role selectors,
descriptions, actors and timestamps are omitted; this is not an effective network
policy or access receipt. Lists snapshot 1–32 unique IDs and refuse the entire
page on an unknown entry. Pagination is explicit and bounded.

Database and deploy-request throttler tools (`get_database_throttler`,
`get_deploy_request_throttler`) match the immutable configurable-resource ID and
return only that ID plus bound keyspace names and configuration-presence flags.
Scopes snapshot 1–32 unique keyspace names; responses are capped at 32 eligible
keyspaces and configurations. Unknown/duplicate names, configurable ID mismatch,
configurations outside the returned eligible list and ratios outside the documented
0–95 range refuse the entire response. Ratios, configurable names, actors and times
are not returned. A zero ratio still means a configuration is present, not that
throttling is effective. Empty eligible/configuration arrays are supported; no
collection-completeness claim is made. `configurationAuthority: not-established`
never grants changes, deployment, safety weakening, spend or wake authority.

Response ID/name confinement is not current database/deploy-request/keyspace
ownership, immutable parent mapping or independent upstream collection permission;
these remain reviewed integration prerequisites, along with selected-field secret
reflection guards and non-waking evidence. CIDR and throttler full details and
mutations remain missing. The database throttler's service-token alternatives are
`read_deploy_request` / `create_deploy_request`, while its OAuth alternatives are
`read_databases` / `read_database`: metadata projection never expands entitlements.

Keyspace rollout status (`get_keyspace_rollout_status`) returns only the matching
keyspace name, snapshotted allowed shard names and non-empty state/start/finish
string-presence flags. Names are not immutable IDs; no rollout state enum is
invented for the official free-text fields. Presence is not a parsed timestamp,
successful rollout, complete topology or native closure. Unknown/duplicate shard
names, malformed selected fields and more than 32 shards refuse the whole response.
Empty shard arrays are supported, never a completeness receipt. Scope requires
1–32 unique allowed names, including range-style names such as `-80` and `80-`.

Vtctld operation status (`get_vtctld_operation`) matches the exact bound operation ID
and documented `VtctldOperation` type. Only ID, state enum and nullable completion-
string presence are returned. The official `completed` field is documented as a
string, not a boolean: it is neither coerced nor projected. Action, metadata,
results, errors, timeout, creation time and raw completion time are omitted.
Completed/failed/cancelled states do not prove topology, rollback, safe retry or
session closure. Both summaries say `executionAuthority: not-established`.
Current branch/keyspace/shard/operation ownership, immutable target revalidation,
independent collection permission and non-waking evidence remain prerequisites.
The configuration-profile change list/get aliases document **308 only**, like the
other change aliases, and remain missing pending a reviewed fixed-alias contract.
No automatic redirect following or fabricated success adapter is implemented.

Traffic-budget list/get (`list_traffic_budgets`, `get_traffic_budget`) returns only
broker-bound ID and documented `enforce`/`warn`/`off` mode. Scopes snapshot exact
budget IDs; list scopes require 1–32 unique IDs. Unknown IDs, duplicate IDs and
malformed selected fields refuse the whole page. Budget names, numeric limits,
actors, rules, tags, query fingerprints, keyspaces, SQL and timestamps are omitted.
`effectiveEnforcement: not-established` means a reported mode never establishes
actual throttling, rule applicability, safety, change permission or spend authority.
`list_traffic_budgets_for_query` additionally fixes a broker-bound fingerprint and
requires a snapshotted keyspace filter, with the same bounded pagination and
budget-ID projection. Fingerprint/keyspace text never enters the receipt. The
response does not identify its query context outside omitted rules; trusted
request/response provenance and current fingerprint/keyspace/budget ownership
remain required. No rule applicability or enforcement is inferred. Unfiltered
query-wide selection, other selector formats and full capability remain
incomplete. Requesting a parent-wide list needs independent collection permission and broker-side raw-body
custody: output confinement does not restrict what the provider sends. Current
parent ownership, immutable branch mapping, selected-field reflection guards and
operation-specific non-waking evidence remain integration prerequisites.

Arguments are closed, scalar and bounded. Configured resource scope is separate
from arguments and must eventually be resolved by the shared core from an
authorized resource handle, not accepted from a model. Each request fixes HTTPS
origin, GET method and endpoint shape. Pagination is explicit, at most 10 items
per page and 100 pages; output marks partial results and never follows provider
URLs. Maximum response body is 64 KiB. There is no HTTP/SQL multiplexer, retry,
secret resolution, runtime scope decision or authority consumption here.

Role inheritance is **not an effective direct/transitive ACL receipt**. Branch
schema projection is not proof of SQL catalog namespace existence or non-waking
semantics. See [acceptance prerequisites](ACCEPTANCE.md) for those missing pieces.

## Offline PostgreSQL catalog artifacts

`src/catalog-artifacts.ts` adds nine fixed, hash-identified SELECT artifacts for
identity, role attributes, independent ADMIN/INHERIT/SET membership edges, database
ACLs, namespaces, relations, column ACLs, default ACLs and function metadata. These
are a separate data-plane surface, **not nine additional official API adapters**.
They target PostgreSQL 17 catalog shapes; no MySQL/Vitess or older-version
compatibility is claimed. No statement is executed or registered as a live tool.

Each builder accepts only an empty argument object. There is no supplied SQL,
target, database, secret, approval, window or pagination argument. Every query
has a 1,001-row overflow sentinel; projection refuses over 1,000 rows or 256 KiB.
Large catalogs therefore remain unsupported pending reviewed bounded pagination
or a narrower fixed scope. This is not full catalog collection. Strict row schemas
reject extra fields and preserve NULL ACLs rather than treating them as no rights.
No customer rows, secret columns, function bodies/configuration or statistics are
selected. Unsupported names, malformed results and overflow fail with fixed codes.

Every receipt says completeness is unverified and effective rights are not
computed, including empty results. Direct ACL rows are not a transitive evaluator;
PUBLIC/default/ownership/column/function paths and visibility limits still require
an accepted analysis. Additional catalog dependencies, type/function signatures,
parameter/initial ACLs and trigger paths remain missing. Selected-field secret
reflection still requires the final core guard before results reach an agent.

These artifacts do not establish credential-hidden custody, immutable target or
reference versions, PostgreSQL catalog visibility, effective rights, native expiry,
revocation, session termination, or timeout/cancellation closure. A query hash is
provenance, not permission. SQL can wake compute; the lifecycle declaration
requires an explicitly authorized bounded window and forbids silent API fallback.
No connector or replacement broker is introduced.

## Local mutation-plan artifacts — not executors

`src/mutation-plans.ts` supplies three pure, bounded previews. They are **not API
adapters**, do not consume authority and do not increase the 134-adapter count.
Each artifact labels itself `validated-local-plan-not-provider-dry-run`, with
execution not implemented, remote preconditions not verified and provider dry-run
not performed. No network executor, output projector or secret placement exists.

| Operation | Bounded plan | Candidate mandatory deciders |
| --- | --- | --- |
| `delete_branch` | One configured branch; explicit `delete_descendants=false`; refuses a deletion-protected snapshot | Release Manager for destructive data change |
| `create_backup` | Named non-emergency backup; explicit hourly retention 1–24 | Release Manager and owner Money decision; no price/budget assumption |
| `disable_safe_migrations` | Exact configured branch; requires the snapshot to have safe migrations enabled | Release Manager and owner Security decision |

The broker-owned target includes organization/database/branch names, immutable
branch ID, a trusted binding/classification revision digest, production and safety
flags. This is a required **input shape**, not proof of an existing host binding or
a provider ETag. Plans snapshot the target/arguments; later caller mutation cannot
retarget the artifact. All request paths, methods, bodies and authority labels are
fixed by the specific builder. Caller approval, credential, SQL, URL, environment,
descendant-delete and emergency-backup fields are rejected. Production never
removes required deciders. A preview's requested name is not remote identity:
before any future execution, the host/provider must revalidate current immutable
ID/name/revision, protection, environment and plan, and enforce remote fencing.
Missing native preconditions or fencing remain an owning prerequisite, never
permission to use a stale preview.

The operation map separately records twenty unreviewed policy candidates: the
three above, backup/backup-policy deletion, deployment-stop previews,
SSO/directory enforcement removal, billing payment-method changes,
and nine credential creation/refresh/renewal/reset operations (including signed
log access). These require their actual decider; provider permissions do not
substitute. Conditional production/data/schema/deploy, new-spend, security-weakening
and approved host/secret-placement obligations are conjunctive, never alternatives.
The candidates only document requirements; native routing, expiry, exact-target
binding, atomic consumption, replay/concurrent-use refusal and approved placement
are **not implemented or tested as authority enforcement here**. Credential routes
remain incomplete until a broker-only sink and reconciliation are accepted. The
other 137 tier classifications are unresolved, not automatically harmless reads or
ordinary writes. `localPlan` and `policyCandidate` are progress fields, never
implementation/review/enablement evidence. Full optional capability remains missing
in these bounded subsets, including recursive deletion and extended backup options.

## Required common interface

Reuse one reviewed, versioned common provider core for:

- Host-authenticated current agent/company/project/task/run and independently
  resolved resource scope/environment; per-agent **and** resource allowlists.
- Validated canonical arguments, exact operation/tool/version, policy revision,
  production classification and validated plan/diff/artifact digest.
- Native issuance/expiry/revocation verification and atomic single-use approval
  consumption; reject replay, concurrent use, stale ownership and mismatches.
- Conjunctive approval routes: production/data/schema/deploy to Release Manager;
  money, credential creation/rotation and security weakening to owner; board/host
  placement/configuration to Operator. One approval never substitutes for another.
- Broker-side configured credential resolution, trusted secret placement/opaque
  receipts, and final secret-reflection checks even in selected metadata fields.
- Durable audit intent/outcome, bounded transport with redirect refusal, policy
  revalidation immediately before execution, durable write idempotency and
  reconciliation after ambiguous outcomes. No blind mutation retries.
- Independently verified non-waking reads or an authorized bounded use window,
  cost caps and native closure/expiry evidence before waking operations.

No per-call token minting is implemented or authorized. Service tokens are not
assumed to support per-call attenuation. Without supported authorized attenuation,
broker-side scope enforcement retains a shared-credential/shared-UID compromise
boundary; neither process separation nor a TypeScript type proves isolation.

## Verification and rollout

Mocked contracts belong to [test/metadata.test.mjs](test/metadata.test.mjs).
They exercise pure adapters, not native identity, effective policy, approvals or
live provider semantics. Root compilation includes these sources; root `npm test`
runs this workspace's fixtures on GitHub Actions. No production secrets or live
provider requests belong in CI. Local full suites and CI mirrors are not used.

No installation or deployment is provided by this package. All live tiers remain
disabled until exact-version Security → Crypto → final QA review, exact-head
Actions/Devin/ruleset evidence, applicable Release Manager acceptance and Operator
installation/configuration are complete. Source merge, enablement and affected-agent
adoption must be reported separately. Rollback at this stage is removal of the
uninstalled source package; it changes no live grant or runtime.

Staging/preview qualification must start on demand, bind readiness and a bounded
use window to the tested SHA/environment, and retain native stop/scale-to-zero and
expiry/cleanup evidence on success, failure and cancellation. Inventory containers,
Durable Objects/alarms, schedules, stream inputs and database compute; a sleeping
container alone is insufficient. Do not introduce always-on staging resources or
keep-alives. Any recurring-cost exception needs dated owner authorization, exact
scope/cost and expiry. Production is unchanged.

REA angle: use the official schema/permission tables and existing shared broker
helpers. They describe provider capabilities and integration obligations, not live
authority or a replacement authorization service.
