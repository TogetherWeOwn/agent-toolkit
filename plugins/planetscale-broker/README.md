# PlanetScale provider package

**Partial source build. Not installable, reviewed, enabled, or feature-complete.**
Maintainer role: toolkit engineering. Package version: 0.1.0. No runtime plugin
manifest, network executor, credential resolver, or tool registration is supplied.
The 134 adapters are pure request builders and bounded output projections,
not an alternative policy or approval system. They cannot perform a live call.

## Account and availability preparation increment

Four pure `Prepared` bindings cover existing current-user, organization-list,
read-only-region-list and Postgres-version-list GETs. Closed host identities,
revision, bounded child bindings and applicable host pagination bind fixed
requests and empty caller arguments. Existing account binding parsers are
exported/reused without behavior changes. Every variable field enters plan/full
hashes, including user/child IDs absent from requests. The sole documented
Postgres engine remains `neki`; its plain array has no invented pagination.

`test/core-account-availability-read-preparation.test.mjs` supplies 39 synthetic
contracts for fixed requests, hash binding, immutable captures, input/accessor/
envelope/whole-response refusal and redacted projections. User ID matching does
not authenticate the credential's principal; organization tuples do not prove
user association. Read-only-region and nested region tuples do not prove parent
ownership. The version-catalog resource is a local namespace, not provider
identity. MFA/SSO/ready/enabled/default flags do not establish enforcement,
upgrade readiness or native authority. Personal/contact/connection/billing/
version text, actors and raw times are omitted. Independent principal/parent
mapping, collection permission, credential entitlement, current revision,
trusted transport/raw-body custody and non-waking proof remain prerequisites.
No executor, credential resolution, registration or authority consumption.

Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**124 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
New contracts require exact-head Actions; older counts below are historical.

## Query-error and tag-list preparation increment

Two pure `Prepared` bindings cover the existing error-fingerprint query page and
query-tag list GETs. Closed immutable host parents/revision, error fingerprint
plus unique query IDs or unique tag ID/name pairs bind fixed first-page requests
and empty caller arguments. Existing bounded parsers are exported/reused without
behavior changes. Every field enters plan/full hashes, including response-only
bindings absent from paths. No executor, credentials or authority consumption.

`test/core-query-error-tag-read-preparation.test.mjs` supplies 21 synthetic
contracts for fixed requests, every-field hashes, immutable captures, closed/
bounded inputs, accessor/injection/whole-page refusal and redacted output.
Error-query receipts match query IDs, not error provenance; query fingerprints
are not error fingerprints. Tag receipts match ID/name pairs, not parent ownership.
SQL/password objects, tag names/values, fingerprints, metrics, actors and raw times
are omitted. Flags/source do not grant execution authority. Both retain fixed
first-page-only coverage; later pages/filters and grouped tag summaries remain
unsupported. Collection permission, current bindings/revision, trusted transport/
raw-body custody and independent non-waking proof remain prerequisites. Coverage
stays **134/291 offline adapters; 157 missing**, twelve previews and **120 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions; older counts below are historical.

## Query-fingerprint preparation increment

Two pure `Prepared` bindings cover existing query-statistics first-page and
fingerprint-summary GETs. Closed immutable host parents, keyspace ID/name,
revision and fingerprint plus separate query IDs or summary ID bind fixed requests
and empty caller arguments. The existing unique bounded query-ID parser is
exported/reused without behavior changes. Every field enters plan/full hashes,
including response-only IDs absent from paths. No executor, registration,
credential resolution or authority consumption.

`test/core-query-fingerprint-read-preparation.test.mjs` supplies 21 synthetic
contracts for fixed requests, every-field hashes, immutable captures, closed and
bounded inputs, accessor/injection/envelope/whole-page refusal and redacted output.
Query IDs are not summary IDs. Response fingerprint/keyspace-name matching does
not prove immutable keyspace identity, parent ownership or trusted provenance.
Receipts omit SQL/password objects, fingerprints/keyspace text, errors, metrics,
actors and raw times. Flags never grant EXPLAIN or execution authority. Statistics
retain fixed first-page-only coverage; optional filters and later pages remain
unsupported. Collection permission, current identity/name/revision bindings,
trusted transport/raw-body custody and independent non-waking proof remain
prerequisites. Coverage stays **134/291 offline adapters; 157 missing**, twelve
previews and **118 pure preparations**, zero runtime-integrated/reviewed/enabled/
adopted. New contracts require exact-head Actions; older counts below are historical.

## Query-summary first-page preparation increment

Two pure `Prepared` bindings cover existing query-summary and error-summary list
GETs. Closed immutable host parents/revision and reused bounded unique summary IDs
or error ID/fingerprint pairs bind fixed first-page requests and empty arguments.
Every field enters plan/full hashes, including response-only bindings absent from
paths. Existing parsers are exported/reused without behavior changes. No executor,
registration, credential resolution or authority consumption.

`test/core-query-summary-read-preparation.test.mjs` supplies 21 synthetic contracts
for fixed requests, every-field hashes, immutable captures, closed/bounded inputs,
accessor/envelope/whole-page refusal and redacted projections. Summary IDs are not
individual-query IDs; error fingerprints bind records but never prove error-query
provenance or parent ownership. Receipts omit SQL/password objects, fingerprints,
error text, metrics, actors and raw times; flags never grant execution authority.
Both collections retain their distinct official first-page envelopes and explicit
first-page-only coverage. Later pages/filters remain unsupported. Child confinement
is not upstream collection permission. Current ownership/revision/bindings, trusted
transport/raw-body custody and independent non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**116 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New
contracts require exact-head Actions; older counts below are historical.

## Unified/replica change collection preparation increment

Two pure `Prepared` bindings cover existing unified change-request and dedicated-
replica change-request list GETs. Closed immutable host parents/revision, reused
unique bounded child/target bindings and host pagination bind fixed requests and
empty caller arguments. Every field enters plan/full hashes, including IDs absent
from paths. Existing binding parsers are exported/reused without behavior changes.
No executor, registration, credential resolution or authority consumption.

`test/core-unified-change-collection-read-preparation.test.mjs` supplies 21 synthetic
contracts for exact requests, every-field hashes, immutable captures, closed and
bounded inputs, accessor/page/whole-response refusals and redacted projections.
Unified collections preserve all exact type/target pairs and nullable target IDs;
replica collections preserve multiple replica ID/name pairs. Informational states
and canDelete flags are not cancellation restrictions or native authority. Receipts
match child/target bindings, not immutable parent ownership. Child confinement is
not upstream collection permission. Configuration/storage/errors/actors/raw times
are omitted; state never proves unchanged settings, rollback or closure. Current
ownership/revision/bindings, collection permission, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **114 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions; older counts below are historical.

## Deployment collection preparation increment

Four pure `Prepared` bindings cover the existing deploy queue, deploy-operation,
deploy-review and schema-recommendation collection GETs. Closed immutable host
parents/revision, unique bounded child bindings, applicable request ID/number/source
snapshot and host pagination bind fixed GETs and empty caller arguments. Existing
binding parsers are exported/reused without behavior changes. Every field enters
plan/full hashes, including independent IDs absent from paths. No executor,
registration, credential resolution or authority consumption.

`test/core-deployment-collection-read-preparation.test.mjs` supplies 39 synthetic
contracts for fixed requests, every-field hashes, immutable captures, closed and
bounded inputs, accessor/page/whole-response refusals and redacted projections.
Queue receipts match ID/number/destination name, not immutable destination or parent
ownership. Recommendation receipts match ID/number; operations/reviews match child
ID, not their request association. Child confinement is not upstream collection
permission. Provider approval is explicitly not native approval; states/flags never
prove safety, DDL execution, rollback or closure. SQL/DDL/errors/actors/raw times
are omitted. Current ownership/revision/bindings, collection permission, trusted
transport/raw-body custody and independent non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and **112
pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions; older counts below are historical.

## Audit-log preparation increment

One pure `Prepared` binding covers the existing organization audit-log first-page
GET. Closed immutable host organization ID/name, revision and unique bounded event
IDs bind the fixed `limit=10` request and empty caller arguments. The existing ID
parser is exported/reused without behavior changes. Every field enters plan/full
hashes, including independent organization/event IDs absent from paths. No executor,
credential resolution, registration or authority consumption.

`test/core-audit-read-preparation.test.mjs` supplies twelve synthetic contracts for
exact requests, every-field hashes, immutable captures, closed/bounded input and
accessor refusals, cursor/whole-response refusal, operation separation and canary
omission. Receipts match event IDs, not organization ownership. Event confinement
is not organization-wide collection permission or the distinct `read_audit_logs`
entitlement. Action presence is not event integrity, completeness, native authority
or closure. Action text, actors/targets, network/location, metadata and raw times
are omitted. Current ownership/revision, collection permission, trusted transport/
raw-body custody and independent non-waking proof remain prerequisites. Coverage
stays **134/291 offline adapters; 157 missing**, twelve previews and **108 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions; older counts below are historical.

## Insight collection preparation increment

Three pure `Prepared` bindings cover existing branch-anomaly, traffic-budget and
generated-query-report collection GETs. Closed immutable host parents/revision,
unique bounded child IDs and applicable host pagination bind fixed requests and
empty caller arguments. Reports retain their fixed first page (`limit=10`) and
cursor envelope, not invented generic pagination. Existing ID parsers are
exported/reused without behavior changes. Every field enters plan/full hashes,
including independent parent/child IDs absent from paths. No executor, credential
resolution, registration or authority consumption.

`test/core-insight-collection-read-preparation.test.mjs` supplies 28 synthetic
contracts for requests, every-field hashes, deep snapshots, closed/bounded input,
accessor and whole-response refusals, operation separation and canary omission.
Receipts match child IDs, not parent ownership. Child confinement is not upstream
collection permission. Active/mode/state metadata never proves remediation,
effective enforcement, download permission, safe retry, closure or native authority.
SQL/correlations/fingerprints, rules/tags/thresholds, metrics, report contents/URLs,
actors and raw times are omitted. Current ownership/revision, collection permission,
trusted transport/raw-body custody and independent non-waking proof remain required.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**107 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
New contracts require exact-head Actions; older counts below are historical.

## Billing collection preparation increment

Two pure `Prepared` bindings cover existing invoice and invoice-line-item collection
GETs. Closed immutable host organization/revision, invoice ID where applicable,
unique bounded child IDs and host pagination bind fixed requests and empty caller
arguments. The existing billing ID parser is exported/reused without behavior
changes. Every field enters plan/full hashes, including IDs absent from paths.
No executor, credential resolution, registration or authority consumption.

`test/core-billing-collection-read-preparation.test.mjs` supplies 19 synthetic
contracts for requests, every-field hashes, deep snapshots, closed/bounded input,
accessor and whole-page refusals, operation separation and canary omission.
Receipts match child IDs, not organization ownership or line-item invoice
association. Child confinement is not upstream collection permission; paid,
overdue and billed flags never establish spending or native authority. Amounts,
payment/contact/checkout material, descriptions, actors and raw times are omitted.
Current ownership/revision, collection permission, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **104 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions; older counts below are historical.

## Organization-security collection preparation increment

Three pure `Prepared` bindings cover existing OAuth-application, SSO-domain and
invitation collection GETs. Closed immutable host organization/revision captures,
reused unique bounded record-ID arrays and host pagination bind fixed requests
and empty caller arguments. Domain lists retain plain arrays without invented
pagination. Every host field enters plan/full hashes, including IDs absent from
requests. No executor, credential resolution, registration or authority consumption.

`test/core-organization-security-collection-read-preparation.test.mjs` supplies
27 synthetic contracts for exact requests, every-field hashes, frozen snapshots,
host/caller/accessor refusals, whole-response refusal and canary omission. Receipts
match child IDs, not organization ownership. Child confinement does not authorize
upstream collections; flags, verification presence and invitation roles never
prove effective enforcement, membership or native authority. Contact/domain/client/
scope/verification material, actors and raw times are omitted. Current ownership,
revision, collection permission, trusted transport/raw-body custody and independent
non-waking proof remain prerequisites. Coverage stays **134/291 offline adapters;
157 missing**, twelve previews and **102 pure preparations**, zero runtime-
integrated/reviewed/enabled/adopted. New contracts require exact-head Actions;
older counts below are historical.

## Profile collection preparation increment

Two pure `Prepared` bindings cover existing configuration-profile and profile-shard
list GETs. Closed immutable host parents/revision and 1–32 unique child bindings
reuse the profile parsers. Profile lists retain their plain-array shape without
invented pagination; profile-shard lists capture profile ID/name and a bounded
host page. Empty caller arguments and fixed GETs bind every field into plan/full
hashes, including independent IDs absent from the upstream path.

`test/core-profile-collection-read-preparation.test.mjs` supplies 18 synthetic
contracts for requests, hashes, deep snapshots, host/caller/accessor refusals,
whole-response refusal and canary omission. Profiles match child ID/name; shards
match child ID and profile name, not immutable profile/parent ownership. Child
confinement is not upstream collection permission. State/default/metal/ready/
authoritative metadata never grants configuration, assignment, spend, wake or
native authority. Configuration/SKU/cost/versions/actors/raw times are omitted.
Current ownership/revision/bindings, collection permission, trusted transport/raw
body custody and independent non-waking proof remain prerequisites. No executor,
registration, credential resolution or authority consumption. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **99 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New execution
requires exact-head Actions; older counts below are historical.

## Compute collection preparation increment

Five pure `Prepared` bindings cover existing bouncer, branch-wide/bouncer-specific
bouncer-resize, branch-resize and keyspace-resize list GETs. Closed immutable host
parents/revision, 1–32 unique child IDs with captured names/target pairs, optional
bouncer/keyspace ID/name and host pagination reuse the existing resize parsers.
Empty caller arguments and fixed GETs bind every field into plan/full hashes,
including IDs absent from paths. Bouncer-specific resize lists require every
captured target pair to match; branch-wide lists retain multiple bouncer targets.

`test/core-compute-collection-read-preparation.test.mjs` supplies 43 synthetic
contracts for requests, hashes, deep snapshots, bounded/unique bindings,
host/caller/accessor refusals, whole-page refusal and canary omission. Bouncer
receipts match branch ID/name; resize receipts match record ID and, where supplied,
bouncer ID/name. They do not authenticate database/organization ownership or the
keyspace association. Child confinement is not upstream collection permission.
State/target metadata never grants resize, cancellation, spend, wake or native
authority or proves rollback/closure. Configuration/SKU/cost/errors/actors/raw
times are omitted. Current ownership/revision/bindings, collection permission,
trusted transport/raw-body custody and independent non-waking proof remain
prerequisites. No executor, registration, credential resolution or authority
consumption. Coverage stays **134/291 offline adapters; 157 missing**, twelve
separate previews and **97 pure preparations**, zero runtime-integrated/reviewed/
enabled/adopted. New execution requires exact-head Actions; older counts below
are historical.

## Change collection preparation increment

Three pure `Prepared` bindings cover existing branch-change and branch/keyspace
configuration-change list GETs. Closed immutable host parents/revision, 1–32
unique child IDs (with exact config type/keyspace pairs), optional keyspace
ID/name and host pagination reuse the existing change parsers. Empty caller
arguments and fixed GETs bind every field into plan/full hashes, including
child IDs and keyspace ID whose rebinding leaves the upstream path unchanged.
The branch-config collection preserves mixed vtgate/null and mysqld/vttablet
keyspace bindings; it does not inherit the branch-detail vtgate-only restriction.
Keyspace collections require every config type/keyspace to match their endpoint.

`test/core-change-collection-read-preparation.test.mjs` supplies 30 synthetic
contracts for requests, hashes, deep snapshots, bounded/unique bindings,
host/caller/accessor refusals, whole-page refusal and canary omission. Receipts
match child ID and captured config type/keyspace name, not immutable parents or
keyspace identity. States never grant configuration, cancellation, spend, wake
or native authority, or prove unchanged settings, rollback or closure.
Configuration values, errors, actors and raw times are omitted. Current parent
ownership/revision/bindings, upstream collection permission, trusted transport/
raw-body custody and independent non-waking proof remain prerequisites. No
executor, registration, credential resolution or authority consumption. Coverage
stays **134/291 offline adapters; 157 missing**, twelve separate previews and
**92 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New
execution requires exact-head Actions; older counts below are historical.

## Routing collection preparation increment

Three pure `Prepared` bindings cover existing router, dedicated-read-replica and
switchover list GETs. Closed immutable host parents/revision and 1–32 unique
child ID/name pairs (switchover IDs only) reuse the existing routing parsers.
Routers/replicas retain official plain-array collections with no pagination;
switchovers capture host page 1–100/perPage 1–10. Empty caller arguments and
fixed requests bind every field into plan/full hashes, including children whose
rebinding leaves the upstream collection request unchanged.

`test/core-routing-collection-read-preparation.test.mjs` supplies 27 synthetic
contracts for requests, every-field hashes, deep snapshots, unique bounded
bindings, host/caller/accessor refusals, whole-response refusal and redaction.
Receipts match child ID/name or ID, not immutable parent ownership. Router and
replica flags/state never grant topology, scaling, spend, wake or native authority.
Switchover failure/completion presence does not establish unchanged primary,
rollback or closure. Configuration, connections, SKU/cost, errors, actors and raw
times are omitted. Current ownership/revision, upstream collection permission,
trusted transport/raw-body custody and independent non-waking proof remain required.
No executor, registration, credential resolution or authority consumption. Coverage
stays **134/291 offline adapters; 157 missing**, twelve separate previews and
**89 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New
execution requires exact-head Actions; older counts below are historical.

## Security-record collection preparation increment

Three pure `Prepared` bindings in `src/core-read-preparation.ts` cover existing
service-token, OAuth-token and webhook list GETs. Reuse the existing 1–32 unique
record-ID parser. Closed immutable host parents/revision, OAuth application ID
where applicable and pagination (page 1–100, perPage 1–10) bind fixed requests and
empty caller arguments. Every field enters plan/full hashes; record-ID rebinding
can leave the upstream collection path unchanged. OAuth resources retain their
application ID rather than treating the organization as the token collection.

`test/core-security-record-collection-read-preparation.test.mjs` supplies 30
synthetic contracts for requests, every-field hashes, deep snapshots, bounded
unique IDs, host/caller/accessor refusals, whole-page refusal and canary omission.
Receipts match record ID, not organization/application/database ownership. Token
expiry/usage presence is not token validity, rights or native authority. Webhook
flags are not delivery or execution authority. Secrets, refresh tokens, endpoints,
raw authorization headers, access/scope bodies, actors and raw times are omitted.
Child confinement does not authorize the upstream collection or resolve custody
of raw secret-bearing responses. Current ownership/revision, collection permission,
trusted transport/raw-body custody and independent non-waking proof remain required.
No executor, registration, credential resolution or authority consumption. Coverage
stays **134/291 offline adapters; 157 missing**, twelve separate previews and
**86 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New
execution requires exact-head Actions; older counts below are historical.

## Organization collection preparation increment

Three pure `Prepared` bindings in `src/core-read-preparation.ts` cover existing
organization member, team and team-member list reads. Reuse the organization
parsers for 1–32 unique membership/user ID pairs or team ID/slug pairs. Closed
immutable host organization/revision, optional team ID/slug and pagination
(page 1–100, perPage 1–10) bind fixed GETs and empty caller arguments. Every field
enters plan/full hashes; child rebinding and team ID changes can leave the
upstream request unchanged while still changing the prepared authority binding.

`test/core-organization-collection-read-preparation.test.mjs` supplies 30 synthetic
contracts for fixed requests, every-field hashes, deep snapshots, bounded/unique
bindings, caller/host/accessor refusals, whole-page refusal and canary omission.
Receipts match child ID/user ID or ID/slug, not organization/team ownership. Roles
and managed flags never establish effective rights, native approval or collection
permission. Contact details, credentials, nested password grants, actors and raw
times are omitted. Current parent ownership/bindings/revision, upstream collection
permission, trusted transport/raw-body custody and independent non-waking proof
remain prerequisites. No executor, registration, credential resolution or authority
consumption. Coverage stays **134/291 offline adapters; 157 missing**, twelve
separate previews and **83 pure preparations**, zero runtime-integrated/reviewed/
enabled/adopted. New execution requires exact-head Actions; older counts below
are historical.

## Topology collection preparation increment

Three pure `Prepared` bindings in `src/core-read-preparation.ts` cover existing
keyspace, shard and maintenance-event list reads. Reuse the topology parsers for
1–32 unique child IDs, keyspace names and maintenance branch ID/name tuples.
Closed immutable host parents/revision and pagination (page 1–100, perPage 1–10)
bind fixed GETs and empty caller arguments. Every field enters plan/full hashes,
including child bindings that do not change the upstream collection request.

`test/core-topology-collection-read-preparation.test.mjs` supplies 30 synthetic
contracts for requests, every-field hashes, deep snapshots, caps, host/caller/
accessor refusals, whole-page refusal and redaction. Projections match child IDs,
keyspace names or maintenance branch tuples, not immutable parent ownership.
Ready/authoritative/urgent/state fields never grant topology or maintenance
execution, compute wake, spend or native authority. Parent collection permission,
current ownership/revision, trusted transport/raw-body custody and independent
non-waking proof remain prerequisites. No executor, registration, credential
resolution or authority consumption. Coverage stays **134/291 offline adapters;
157 missing**, twelve separate previews and **80 pure preparations**, zero
runtime-integrated/reviewed/enabled/adopted. New execution requires exact-head
Actions; older counts below are historical.

## Lifecycle collection preparation increment

Three pure `Prepared` bindings in `src/core-read-preparation.ts` cover existing
backup, backup-policy and deploy-request list reads. Closed immutable host
parents/revision, 1–32 unique child IDs (deploy requests also bind number, source
branch ID/name and destination name) and host pagination (page 1–100, perPage
1–10) bind fixed GETs and empty caller arguments. Reuse the existing lifecycle
ID/request parsers. Every field enters plan/full hashes, including child bindings
that do not change the upstream collection request.

`test/core-lifecycle-collection-read-preparation.test.mjs` supplies 30 synthetic
contracts for fixed requests, every-field hashes, deep snapshots, closed/accessor/
injection refusals, caps, whole-page refusal and redaction. Receipts retain bound
IDs and strict metadata; deploy receipts retain source/destination names, state
and source ID, not an immutable destination ID or native approval. Backup flags
and policy targets are metadata, never deletion, scheduling or spend authority.
Parent ownership/collection permission, current bindings/revision, trusted
transport/raw-body custody and independent non-waking proof remain prerequisites.
No executor, credential resolution, registration or authority consumption.
Coverage stays **134/291 offline adapters; 157 missing**, twelve separate previews
and **77 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
New contracts require exact-head Actions; older counts below are historical.

## Discovery collection preparation increment

Five pure `Prepared` bindings in `src/core-read-preparation.ts` cover existing
list-databases, list-branches and database/organization/public-region reads. Closed
host snapshots capture immutable parent IDs/names where applicable, revision,
1–32 unique child ID/name pairs and bounded pagination (page 1–100, perPage 1–10).
The existing discovery binding parser is shared, not copied. Caller arguments
stay empty: callers cannot change the captured page, allowlist or transport.
Every host field and child binding enters the plan/full hashes, including IDs
absent from the path. Public regions use a fixed local catalog resource namespace,
not a claimed immutable provider identity.

`test/core-discovery-read-preparation.test.mjs` supplies 47 synthetic contracts
for exact requests, every-field hashes, child rebinding, nested immutable captures,
closed/accessor/injection refusals, limits, whole-page refusal and redaction.
Receipts intentionally retain allowlisted child names and strict metadata flags;
secret/connection/config/actor/time fields and unverified parent claims are omitted.
Response child ID/name matching does not prove immutable parent ownership or
authorize a parent-wide upstream collection. Pagination completeness describes
only the reported cursor, not an exhaustive trusted inventory or freshness.
Current ownership/revision, collection permission, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. No executor,
registration, credential resolution or authority consumption is supplied.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**74 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
Exact-head Actions must execute the contracts; older counts below are historical.

## MoveTables status preparation increment

One pure `Prepared` binding in `src/core-read-preparation.ts` covers the existing
MoveTables workflow-status GET. A closed host snapshot captures immutable parent
and target-keyspace IDs, revision, workflow name and target-keyspace name. The
fixed request includes the required `target_keyspace` query; empty caller arguments
cannot retarget it. The keyspace resource and every target field enter the hashes,
including workflow names for which the schema supplies no immutable workflow ID.
The response has no branch/keyspace/workflow identity: request-bound IDs never
establish response provenance, current name ownership or freshness.

`test/core-move-tables-read-preparation.test.mjs` supplies ten synthetic contracts
for fixed requests, every-field hashes, immutable capture, host/caller/accessor
refusal, query injection, projection limits and cross-operation separation.
Receipts report presence only, never traffic text, copy progress, stream contents,
names, actors or times. Presence is not copy completion, safe traffic, rollback,
closure or authority. Trusted current ownership/name bindings, transport/custody
and independent non-waking proof remain prerequisites. No executor, registration,
credential resolution or authority consumption is supplied. Coverage stays
134/291 offline adapters, 157 missing, twelve separate previews and **69 pure
preparations**; zero runtime-integrated/reviewed/enabled/adopted. Opaque workflow
list/detail contracts remain separate missing adapters. Exact-head Actions must
execute these contracts; source declarations are not passing evidence.

## Maintenance schedule preparation increment

Two pure `Prepared` bindings in `src/core-read-preparation.ts` cover the existing
database maintenance-schedule and branch maintenance-window GETs. Closed host
snapshots capture immutable parent/schedule IDs, names and revision. The branch
singleton independently binds a schedule ID absent from its path. Both plans
share the schedule resource, with distinct operation/request/target hashes and
empty caller arguments. Projections match schedule ID only, not immutable parent
ownership or branch association; trusted current bindings remain prerequisites.

`test/core-maintenance-read-preparation.test.mjs` supplies 18 synthetic contracts
for fixed requests, every-field hashes, immutable capture, host/caller/accessor
refusals, schedule rebinding and existing redaction. Receipts retain strict
scheduling flags and frequency enum, never names or raw timings. Provider metadata
is not an authorized execution/use window or permission to schedule, wake compute,
spend or act. Transport/custody, current ownership/revision and independent
non-waking proof remain required. No executor, registration, credential resolution
or approval consumption is supplied. Coverage stays 134/291 offline adapters,
157 missing, twelve separate previews and **68 pure preparations**; zero runtime-
integrated/reviewed/enabled/adopted. Exact-head Actions must execute the contracts;
source declarations and older counts below are not current-head pass evidence.

## Metric preparation increment

Six pure `Prepared` bindings in `src/core-read-preparation.ts` cover the existing
instant branch/tablet and historical branch/tablet/query/tag metric reads. Closed
host snapshots capture immutable organization/database/branch IDs, names, revision
and one allowlisted metric. Historical requests reuse canonical UTC windows of
1–900 seconds and fixed steps=16; empty caller arguments cannot change scope,
selectors, windows or requests. All operations share the branch resource while
operation/request/target hashes remain distinct. Instant projections match branch
ID/name, not parents; historical responses have no branch identity and retain the
explicit request-bound-only limitation. Query/tag reads are whole-branch, not
isolated per query or tag. Trusted collection permission remains required.

`test/core-metric-read-preparation.test.mjs` supplies 55 synthetic contracts for
fixed requests, hashes, immutability, selectors/windows, host/caller/accessor
refusal and existing availability-only projection limits. Samples, labels, raw
times and unknown parent claims are not returned. Presence is not health,
freshness, integrity, provenance or execution authority. Transport/custody,
current ownership/revision and independent non-waking proof remain prerequisites.
There is no executor, registration, credential resolution or approval consumption.
Coverage remains 134/291 offline adapters, 157 missing, twelve separate previews
and now 66 pure preparations; zero runtime-integrated/reviewed/enabled/adopted.
Exact-head Actions execution is required; this source declaration is not a pass.

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

134 adapter rows have a provisional read tier; twenty-five protected-operation
rows have explicit **unreviewed reserved-tier candidates**. The remaining 132
rows stay `unresolved`. None of these classifications is runtime policy or
approved authority. The intended tools are not registered. GET alone is not proof
of harmless, non-waking or non-billable behavior. Billing/admin, token/role/password, SSO/OIDC, query/metrics/log exports,
backups/restore, schema/deploy, topology, maintenance and every other official
area remain in the map even when access or implementation is missing.

## Shared-core operation-map seam

[Core-format map](api/core-operation-map.json) is generated alongside the detailed
provider inventory for `toolkit.provider-broker/v1`. The inspected interface is
`packages/core/src/provider/coverage.ts` at merged source commit
`a838436aa4492c77dc7fb995bc776ec7c7d922e7`, SHA-256
`6e96d7ab98ceb630af33007134bff79c996963c9a0deab23cee21db3f1110e68`.
The main map records a validator-consumer source seam, **not runtime integration**.
`test/core-operation-map.test.mjs` consumes the actual compiled shared validator,
checks its pinned source digest and requires `complete=false` with all 291 IDs
incomplete. Negative contracts reject missing/duplicate inventory, unknown fields,
claim inflation and destructive-tier downgrades. Execution evidence comes only
from exact-head Actions; this source declaration is not a passing result.

`src/core-preparation.ts` supplies twelve pure `Prepared` seams for branch,
backup and backup-policy deletion, deploy-request close/cancel, branch/keyspace
configuration cancellation, individual change cancellation, query-report deletion,
schema-recommendation dismissal, bounded backup creation and migration-safety
removal previews. Trusted host-owned closed snapshots bind
`planetscale/branch/<immutable-id>`, `planetscale/backup/<immutable-id>` or
`planetscale/backup-policy/<immutable-id>` and revision. Parent IDs/names,
production/protection classifications, the fixed request and all obligations
remain in the hashed preview. Backup-policy removal retains **both** RM and
owner-security obligations, including development policies; neither is obtained
or consumed here. Required policies and protected/required/non-success backups
refuse at binding time. Operation-specific closed caller arguments cannot replace
the target or supply authority. No artifact bytes are executed (`artifactDigest=null`). These
seams have no execute/project hook or registration and are not complete adapters.
Host ownership/revision revalidation and provider preconditions are still required;
a digest snapshot alone does not prove freshness or safe deletion. Distinct
resource namespaces prevent a backup/policy ID collision, but do not establish
provider-global ID uniqueness or parent ownership. Core backup contracts live in
`test/core-backup-preparation.test.mjs`; previews remain separately tested and
counted as missing adapters.

The deploy-request bindings use `planetscale/deploy-request/<immutable-id>` for
both operations. The complete preview hash also binds the operation, request
number/path, method/body, source/destination IDs/names, state and production
classification. Close permits pending/ready/no_changes only; cancel permits
queued only. Both retain RM obligations and refuse deleted/ambiguous branches
or closed/started/terminal requests. The fixed close body is deeply frozen;
cancel has no body. `test/core-deployment-stop-preparation.test.mjs` covers these
bindings. A hash is not proof of current ID/number mapping, independently bound
destination identity, freshness, remote preconditions, rollback or closure.
Neither operation executes, consumes approval or increases adapter coverage.

Configuration-cancellation bindings use distinct
`planetscale/branch-config-change/<immutable-id>` and
`planetscale/keyspace-config-change/<immutable-id>` namespaces. The full preview
hash retains parent IDs/names, keyspace binding where applicable, change type,
production/state/revision and the fixed bodyless DELETE. Only draft/pending
snapshots bind; branch requests require vtgate and keyspace requests require
mysqld/vttablet. `test/core-configuration-cancel-preparation.test.mjs` covers
captured immutable snapshots, empty arguments, refusal and hash separation.
Both keep RM obligations unconsumed; independent conjunctive effect classification
and current identity/state checks remain prerequisites. These seams neither
prove remote cancellability, unchanged settings or rollback nor register an
executor, consume approval or increase adapter coverage.

Individual change cancellation, query-report deletion and recommendation dismissal
use distinct `planetscale/change-request/<immutable-id>`,
`planetscale/query-patterns-report/<immutable-id>` and
`planetscale/schema-recommendation/<immutable-id>` resources. The complete preview
hash retains all parent/target identities, revision, classification and fixed
request; recommendation sequence numbers do not replace immutable IDs. Change
cancellation requires matching documented types, draft/pending and canDelete=true;
reports require completed/failed; recommendations require open. These local
restrictions never prove remote preconditions, freshness or native authority.
`test/core-record-mutation-preparation.test.mjs` covers retained RM obligations,
deep snapshots, caller/host refusal, hash and cross-kind separation, and independent
recommendation ID/number binding. Report deletion remains reserved despite the
provider's read entitlement. No executor, approval consumption, runtime registration
or adapter-coverage increase is supplied; current parent/target mapping and
independent conjunctive effect classification remain prerequisites.

Backup creation and migration-safety removal share the branch resource with branch
deletion; operation/request/argument/obligation hashes keep their previews distinct.
The backup target is captured through the same closed branch parser as the preview,
without imposing deletion protection on backup creation. Caller backup arguments
remain exactly `name` and integer `retentionHours` from 1 through 24, deeply frozen
and bound to the fixed non-emergency request. RM **and** owner-money obligations
remain; a bounded retention is not a cost estimate or spend approval. Migration-safety
removal requires safeMigrations=true at binding time, accepts empty arguments and
retains RM **and** owner-security even for a development branch. Neither approval
is obtained or consumed here. `test/core-branch-effect-preparation.test.mjs` covers
snapshots, refusal, argument/target hash sensitivity and shared-resource separation.
These bindings prove neither current settings, remote preconditions, backup success
nor rollback/closure, and do not add an executor or increase adapter coverage.

`src/core-read-preparation.ts` supplies three additional pure `Prepared` seams for
organization, database and branch detail reads. Closed trusted host snapshots bind
immutable organization/database/branch IDs, parent names and a revision digest;
empty caller arguments cannot replace scope, requests, approval or artifacts.
Resources use `planetscale/organization/<id>`, `planetscale/database/<id>` and
`planetscale/branch/<id>`. Full plan hashes retain every parent ID/name, operation
and the existing fixed GET request. The branch resource is shared with branch
mutation previews, but their operation/plan hashes remain distinct.

These initial response projections validate names only, not immutable response
IDs: `responseIdentity=name-only-not-immutable` explicitly retains that gap.
`nonWaking=not-verified` is not a permission or compute-cost guarantee. Host current
ownership, immutable ID/name/parent/revision revalidation, policy and broker-side
transport/custody remain prerequisites. No execute/project hook, registration,
credential resolution or runtime tier authority is supplied by the preparation
functions. `test/core-read-preparation.test.mjs` covers the closed snapshots,
hash sensitivity, refusal, resource-kind separation and existing projection limits.
Adapter coverage stays 134/291, with 157 missing; these are not three new adapters
or runtime-integrated operations.

Three further seams in the same module bind existing backup, backup-policy and
number-addressed deploy-request detail reads. Closed host snapshots retain parent
organization/database IDs and names, resource IDs and revision; backups also bind
the branch, and deploy requests capture immutable source ID/name, request ID/number
and an independently supplied destination branch ID/name. Resources share the
existing mutation-preview namespaces, not their operation/plan hashes. Every host
field is retained in the full plan hash, including IDs absent from the provider
request. Caller arguments remain empty; no executor or project hook is returned.

These projections match record IDs; the deploy projection additionally matches
number/source ID and both branch names. They do not authenticate parent IDs or the
destination ID. Plans explicitly report `record-id-only-parent-not-verified` or
`record-and-source-ids-destination-not-verified`, never full response identity.
Neither a host snapshot nor a provider flag establishes current ownership,
approval, non-waking behavior, backup restorability or safe deployment. Trusted
transport/current identity and parent/destination revalidation remain required.
`test/core-lifecycle-read-preparation.test.mjs` covers deep immutable captures,
every-field hashes, nested ID/number refusals, projection limits and closed caller
arguments. These eighteen pure preparations remain separate from integration.

Three topology detail seams additionally bind existing keyspace, shard and
maintenance-event GETs. Closed host snapshots retain organization/database/branch
IDs and names, nested child IDs/names where supplied, and revision. Resources use
`planetscale/keyspace/<id>`, `planetscale/shard/<id>` and
`planetscale/maintenance-event/<id>`; every host field enters the full plan hash,
including IDs not present in request paths. Keyspaces route by name while shards
and events route by ID. Empty caller arguments cannot retarget the snapshot.
Keyspace/shard projections authenticate child identity, not parent IDs; maintenance
projections also match branch ID/name but still cannot authenticate the database
parent. Plans explicitly retain these limits and unverified non-waking semantics.
`test/core-topology-read-preparation.test.mjs` covers fixed requests, nested
capture/refusal, every-field hash sensitivity, namespace separation and projection
limits. Provider ready/authoritative/state/urgent flags never grant topology,
maintenance, wake or spend authority or prove completion/closure. Current trusted
parent/child mapping, policy, transport/custody and non-waking proof remain required.
Those twenty-one pure preparations remain separate from runtime integration.

Three organization detail seams additionally bind existing membership, team and
team-member GETs. Closed immutable host snapshots retain organization ID/name,
revision, membership ID/user ID and team ID/slug as applicable. Memberships route
by ID; teams route by slug. Resources use `planetscale/organization-membership/<id>`,
`planetscale/organization-team/<id>` and
`planetscale/organization-team-member/<team-id>/<membership-id>`; team-member
resource identity retains the team even if membership IDs are reused. Every host
field enters the plan hash, including IDs absent from the request path. Empty
caller arguments cannot supply another target, credential, request or authority.

Existing projections match membership/user IDs or team ID/slug, but do not verify
organization identity or the team parent of a membership response. Plans retain
`record-and-user-ids-parent-not-verified` or `record-id-only-parent-not-verified`
and unverified non-waking semantics. Provider role/managed flags do not establish
effective authority. Trusted current parent/child/user mapping, policy and bounded
broker-side transport/custody remain prerequisites; no executor, project hook or
credential resolution is added. `test/core-organization-read-preparation.test.mjs`
covers deep snapshots, every-field hashes, response binding refusals, canary
omission and resource identity separation. Twenty-four total pure preparations
still mean zero runtime-integrated operations; adapter coverage stays 134/291
with 157 missing.

Three security-record detail seams additionally bind existing service-token,
OAuth-token and webhook metadata GETs. Closed immutable host snapshots retain
organization ID/name, revision, record ID and the OAuth application ID or database
ID/name as applicable. Resources use `planetscale/service-token/<id>`,
`planetscale/oauth-token/<application-id>/<token-id>` and
`planetscale/webhook/<id>`; OAuth identity includes its application even if token
IDs are reused. Every host field enters the plan hash. Empty caller arguments
cannot supply another target, secret, request or authority.

Existing projections verify only the record ID, not organization, database or
application parent identity. Plans retain `record-id-only-parent-not-verified`
and unverified non-waking semantics. Token timestamp presence does not establish
validity, revocation or effective authority; webhook flags do not establish
endpoint trust, delivery or authorization. Secret-bearing raw response bodies
still require accepted broker-only transport/redaction/custody; safe synthetic
projections are not that evidence. No executor, project hook, credential resolution
or grant is supplied. `test/core-security-record-read-preparation.test.mjs` covers
immutable snapshots, every-field hashes, binding refusals, secret canaries and
resource separation. Twenty-seven total pure preparations remain separate from
runtime integration; adapter coverage stays 134/291 with 157 missing.

Two deployment-detail seams additionally bind existing deployment and schema-
recommendation GETs. Closed host snapshots retain organization/database IDs and
names, record ID, positive sequence number and revision; deployments also retain
destination branch name and independently supplied immutable branch ID. Resources
use `planetscale/deployment/<id>` and `planetscale/schema-recommendation/<id>`.
Every field enters the plan hash; caller arguments remain empty. Number-addressed
requests require independent current ID/number/parent binding before future use.
Existing projections check record ID/number and deployment destination name, not
immutable response parent/destination identity. Plans retain these limitations and
unverified non-waking semantics. State/flags never grant deployment, dismissal,
DDL, spend or native approval authority. No executor, registration or credential
resolution is added. `test/core-deployment-detail-read-preparation.test.mjs` covers
17 synthetic snapshot/hash/refusal/canary contracts. Twenty-nine total pure
preparations remain separate from runtime integration; coverage stays 134/291,
157 missing.

Three change-detail seams additionally bind existing PostgreSQL branch-change,
branch-config-change and keyspace-config-change GETs. Closed trusted host snapshots
retain organization/database/branch IDs and names, change ID and revision; config
reads also capture the existing type/nullable-keyspace contract, and keyspace reads
independently bind keyspace ID/name. Branch config accepts vtgate/null only;
keyspace config accepts mysqld/vttablet with a matching keyspace name. Resources use
`planetscale/branch-change/<id>`, `planetscale/branch-config-change/<id>` and
`planetscale/keyspace-config-change/<id>`; config reads share resource namespaces
with cancellation previews, not their operation/plan hashes. Every variable host
field enters the full plan hash; caller arguments remain empty.

These projections match record ID and config type/keyspace where applicable,
not immutable parent/keyspace identity. Plans retain `record-id-only-parent-not-verified`
and unverified non-waking semantics. State/type never grants configuration,
resize, cancellation, spend or native approval authority. Current trusted ownership,
parent/keyspace binding, revision revalidation and broker transport/custody remain
prerequisites. No executor, registration or credential resolution is added.
`test/core-change-read-preparation.test.mjs` supplies 28 synthetic snapshot/hash/
refusal/canary contracts, including branch/keyspace type separation. Thirty-two
pure preparations remain separate from runtime integration; coverage stays
134/291 with 157 missing adapters.

Three compute-detail seams additionally bind existing bouncer and branch/keyspace
resize GETs. Closed trusted host snapshots retain organization/database/branch IDs
and names, child ID and revision; bouncers bind their name, and keyspace resizes
independently bind keyspace ID/name. Resources use `planetscale/bouncer/<id>`,
`planetscale/branch-resize/<id>` and `planetscale/keyspace-resize/<id>`.
Every variable host field enters the plan hash; caller arguments remain empty.
Bouncers route by name and match response ID/name plus branch ID/name, not immutable
organization/database identity. Resize projections match only record ID, not parent
or keyspace identity. Plans retain these limits and unverified non-waking semantics.
State/target metadata never grants resize, restart, cancellation, wake, spend or
native approval authority. Trusted current ownership/name bindings, revision
revalidation and broker transport/custody remain prerequisites. No executor,
registration or credential resolution is added.
`test/core-compute-read-preparation.test.mjs` supplies 25 synthetic snapshot/hash/
refusal/canary contracts. Thirty-five pure preparations remain separate from
runtime integration; coverage stays 134/291 with 157 missing adapters.

Three routing-detail seams additionally bind existing router, dedicated-read-replica
and switchover GETs. Closed host snapshots retain organization/database/branch IDs
and names, child ID, revision and router/replica name. Resources use distinct
`planetscale/router/<id>`, `planetscale/dedicated-read-replica/<id>` and
`planetscale/switchover/<id>` namespaces. Every host field enters the plan hash;
caller arguments remain empty and requests remain fixed. Router/replica responses
match ID/name; switchover responses match ID. None authenticates immutable parent
identity, current name bindings, freshness or non-waking semantics. State, ready,
autoscaling and timestamp-presence flags never grant failover, resize, wake, spend
or native authority; failed switchover does not prove an unchanged primary,
rollback or closure. Trusted current ownership, revision/name revalidation and
broker transport/custody remain prerequisites. No executor, registration,
credential resolution or authority consumption is added.
`test/core-routing-read-preparation.test.mjs` supplies 25 synthetic snapshot/hash/
refusal/canary contracts. Thirty-eight pure preparations remain separate from
runtime integration; coverage stays 134/291 with 157 missing adapters.

Two configuration-profile detail seams additionally bind existing profile and
profile-shard GETs. Closed host snapshots retain immutable parent/profile/shard
IDs, parent names, revision and profile name used in paths. Resources use
`planetscale/configuration-profile/<id>` and
`planetscale/configuration-profile-shard/<profile-id>/<shard-id>`; the latter
retains the profile identity independently of the name-addressed request.
Every variable host field enters the plan hash; caller arguments remain empty.
Profile projections match ID/name; shard projections match shard ID and profile
name, not immutable profile/parent identity. Current ownership/name bindings,
revision revalidation, broker transport/custody and non-waking semantics remain
prerequisites. State/default/metal/ready/authoritative flags never grant assignment,
configuration, restart, wake, spend or native authority. No executor, registration,
credential resolution or authority consumption is added.
`test/core-configuration-profile-read-preparation.test.mjs` supplies 18 synthetic
snapshot/hash/refusal/canary contracts. Forty pure preparations remain separate
from runtime integration; coverage stays 134/291 with 157 missing adapters.
The redirect-only default-profile operation remains missing, not implemented by
these detail preparations.

Three organization-security detail seams additionally bind existing OAuth-application,
organization SSO and SSO-domain GETs. Closed host snapshots capture organization
name/immutable ID, revision and application/domain ID where applicable. Empty
arguments cannot supply a target, request, credential or authority. Resource
namespaces `planetscale/oauth-application/<id>`,
`planetscale/organization-sso/<organization-id>` and
`planetscale/organization-sso-domain/<id>` distinguish equal IDs. Every variable
host field enters plan/full hashes. SSO responses match the captured organization
ID; application/domain responses match only their record ID, not parent ownership.
Current ownership/revision revalidation, trusted transport/raw-body custody and
non-waking evidence remain prerequisites. Client/contact/domain/verification data
are omitted; enabled/configured/directory/domain state and verification presence
never establish effective enforcement, membership, native authority or closure.
No executor, registration, credential resolution or authority consumption is added.
`test/core-organization-security-read-preparation.test.mjs` supplies 26 synthetic
snapshot/hash/refusal/canary contracts. Forty-three pure preparations remain
separate from runtime integration; coverage stays 134/291, 157 adapters missing.

All 291 entries remain `incomplete`, `implemented=false`, `reviewed=false`,
`enabled=false`, and entitlement `unknown`. Existing offline read/preview test
paths are linked as source evidence, never as full `ProviderOperation` tests.
An all-`reserved` / `native` envelope avoids silently translating unresolved tiers
into read/write authority. It is deliberately conservative metadata, not approved
per-operation tier classification, a registered executor, or permission from one
decider to bypass conjunctive owner/Operator/Release Manager obligations. The
richer provider map remains authoritative for pending candidates and effects.

Scopes identify required path-parameter categories, not concrete immutable
resources or approved allowlists; discovery scopes do not grant global access.
Actual integration still needs closed per-tool preparation, immutable resource
ID/revision bindings, trusted identity/current ownership and policy, native
conjunctive authority, durable journal/audit, broker-side credential custody,
fixed bounded transport and no redirects, provider fencing and recovery. Reads
still need non-waking proof; SQL retains its separate bounded-window gate.
Regeneration/check covers both artifacts; tests verify complete source mapping
and prevent offline adapters or previews from becoming core-implemented claims.

## Schema-recommendation dismissal plan subset

`src/recommendation-dismissal-plan.ts` adds a pure preview for one open schema
recommendation. Closed immutable snapshots bind database/recommendation IDs,
positive safe sequence number, revision and production classification. The endpoint
addresses the sequence number, not the immutable recommendation ID: independently
revalidate their current mapping and parent ownership before any future use.
The response lacks database identity. Open-only is a broker-narrow restriction,
not a provider precondition or freshness guarantee.

Arguments and POST body are empty; optional dismissal reason, DDL, table names,
URLs and caller authority are not accepted. Dismissal is metadata mutation, not
DDL execution or proof that a recommendation was applied, safe, resolved or
reversible. RM plus independently classified conjunctive security/spend/host
obligations remain unreviewed candidates; suppressing a recommendation must not
silently waive a required security action. No executor, approval consumption,
provider dry-run or response projection is supplied. Native policy/approval,
current-state revalidation and uncertain-outcome recovery remain prerequisites.

There are twelve local plan subsets, separate from 134/291 bounded offline
adapters and 157 missing adapters; zero integrated/reviewed/enabled/adopted.

## Query-report deletion plan subset

`src/query-report-deletion-plan.ts` adds one pure preview, not an API adapter or
executor. Closed immutable snapshots bind database/branch/report IDs, parent names,
revision, production and a broker-narrow completed/failed state. Pending and unknown
states refuse locally; this is not a documented remote precondition. Empty arguments
and a fixed bodyless DELETE by report ID prevent caller URL, download, SQL, force or
report-content selectors. Parent IDs are absent from the official report response
and need independently trusted bindings, not an inference from report state.

The official destructive endpoint lists `read_branch` service-token entitlement.
That entitlement is not read policy, deletion authority or a safety guarantee.
RM and independently classified conjunctive security/spend/host effects remain
unreviewed candidates. Deleting a report never proves underlying query-data deletion,
download revocation or native closure. No executor, provider dry-run, freshness check
or approval consumption is supplied. Native policy/approval binding, independent
current identity/state revalidation and uncertain-outcome recovery remain missing.

At that increment there were eleven local plan subsets, separate from 134/291 bounded offline adapters
and 157 missing adapters. Zero operations are integrated, reviewed, enabled or adopted.

## Individual change-request cancellation plan subset

`src/change-cancel-plan.ts` adds one pure preview, not an API adapter or executor.
Closed immutable broker snapshots bind database/branch/request/target IDs, parent
and target names, revision, production, state and matching documented target and
change types. Null target identity refuses. Only draft/pending plus canDelete=true
are accepted: these are intentionally narrow local refusal rules, not documented
remote preconditions or native authority. The provider may still refuse with 422.
The fixed bodyless DELETE identifies one change request by ID; legacy collection
resize cancellations and redirect aliases are not substituted. Arguments are empty;
there are no configuration values, SKU parameters, force or rollback selectors.

RM and independently classified conjunctive security/spend/host effects remain
unreviewed candidates. A planned security improvement may be cancelled, so the
verb never establishes safety. No executor, native precondition, provider dry-run
or approval consumption exists. Fresh independent parent/target ownership and
state revalidation, native policy/approval binding and uncertain-outcome recovery
remain prerequisites. A snapshot never proves unchanged configuration or closure.

There are ten local plan subsets, separately counted from the unchanged 134/291
bounded offline metadata subsets and 157 missing adapters. Zero operations are
integrated, reviewed, enabled or adopted.

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

Including individual change cancellation, there are ten separately counted local plan subsets. All remain missing API
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

Including configuration and individual change cancellation, there are ten local plan subsets; these operations remain
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

Including deployment-stop, configuration and individual change cancellation, there are ten local plan subsets.
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

## Diagnostic core preparation

`bindLintBranchSchemaPreparation` and `bindCheckDeployRequestStoragePreparation`
add pure Prepared bindings for existing diagnostic GETs. Closed host snapshots
retain immutable organization/database IDs, names and revision. Lint additionally
captures branch ID/name and unique 1–32 keyspace names using the existing scope
parser; its request is fixed to page=1/per_page=10. Storage independently captures
request ID and positive bounded sequence number despite the number-addressed path.
Resources use `planetscale/branch/<id>` and `planetscale/deploy-request/<id>`;
every variable host field enters plan/full hashes. Caller arguments are empty.

Lint confines reported keyspace names, not immutable response-parent identity;
its plan records `keyspace-name-only-parent-not-verified`. Storage has no response
identity and records `absent-request-bound-only`. Existing projections retain
keyspace/subject enum or strict storage flags, never DDL/errors/table/column names,
storage details, actors or times. Lint's nextPage/complete describe that bounded
provider envelope only; later pages cannot be selected through this binding and
no collection completeness or ownership is proved. Flags never grant safe-deploy,
upgrade, spend or execution authority. Current request ID/number/parent binding,
ownership/revision, trusted transport/raw-body custody, collection permission and
independent non-waking evidence remain prerequisites.

`test/core-diagnostic-read-preparation.test.mjs` supplies 20 synthetic contracts
for fixed requests, immutable capture, every-field hashes, host/caller/array
refusals, non-invoked accessors, response redaction and projection semantics.
No executor, registration, credential resolution or authority consumption is
added. Coverage stays 134/291 offline adapters, 157 missing; twelve previews and
60 pure preparations are separate counts. All operations remain runtime-
unintegrated, unreviewed, disabled and unadopted. Earlier counts below are historical.

## Availability core preparation

`bindGetKeyspaceVschemaPreparation` and `bindGetDataTopologyPreparation` capture
closed immutable host organization/database/branch IDs and names, revision and
keyspace ID/name where applicable. They bind existing fixed GETs to empty caller
arguments and every-field plan/full hashes. Resources retain the existing
`planetscale/keyspace/<id>` and `planetscale/branch/<id>` identity; operation IDs
and proposed paths distinguish these reads from other operations on those resources.

Both official responses lack target identity. Plans explicitly report
`responseIdentity: absent-request-bound-only`: projected requestKeyspaceId and
requestBranchId come from the request binding, not authenticated response IDs.
Existing receipts retain only raw-schema/topology/sync-string presence and
not-established provenance, freshness or execution-authority disclaimers where
applicable. Raw schema, topology keys/contents, actors and times are omitted.
Presence never proves validity, topology, freshness, ownership or closure. Current
ownership/revision, trusted transport/raw-body custody, collection permission and
independent non-waking proof remain prerequisites. No executor, registration,
credential resolution or authority consumption is added.

`test/core-availability-read-preparation.test.mjs` supplies 19 synthetic contracts
for fixed requests, deep immutable capture, every-field hashes, host/caller and
nested-accessor refusal, presence semantics, canary omission and request-only
identity. Coverage stays 134/291 offline adapters, 157 missing; twelve previews and
58 pure preparations are separate counts. All operations remain runtime-
unintegrated, unreviewed, disabled and unadopted. Earlier counts below are historical.

## Change/operation-detail core preparation

`bindGetChangeRequestPreparation` and `bindGetVtctldOperationPreparation` capture
closed immutable host organization/database/branch IDs and names, revision and
record identity for existing fixed GETs. Change reads reuse the exact documented
change/target-type pair, nullable target ID and bounded target name from the
existing response-confinement parser. Null stays null, not an immutable target
claim; unlike cancellation previews, reads do not restrict reported state or
require canDelete=true. Resources use `planetscale/change-request/<id>` and
`planetscale/vtctld-operation/<id>`. Every host field enters plan/full hashes;
empty caller arguments cannot supply a new target, request or authority.

Change projections match record and target binding fields, not parent ownership;
vtctld projections match record ID and documented type only. State/canDelete and
completion-string presence never grant cancellation/execution authority or prove
freshness, topology, safe retry, rollback or closure. Configuration, action,
results, errors, metadata, actors and raw times are omitted. The existing change
receipt still includes bound target ID/type/name; no additional redaction claim
is made. Current ownership/revision, transport/raw-body custody and independent
non-waking proof remain prerequisites. No executor, registration, credential
resolution or authority consumption is added.

`test/core-operation-detail-read-preparation.test.mjs` supplies 22 synthetic
contracts for fixed requests, deep captures, every-field hashes, host/caller and
nested-accessor refusals, exact type/target matching, null identity, canary
omission and separate namespaces. Coverage stays 134/291 offline adapters, 157
missing; twelve previews and 56 pure preparations are separate counts. All
operations remain runtime-unintegrated, unreviewed, disabled and unadopted.
Earlier increments below retain their historical counts.

## Query-detail core preparation

`bindGetBranchQueryPreparation` and `bindGetBranchQueryTagPreparation` capture
closed immutable host organization/database/branch identities, revision and query
ID or tag ID/name pair for existing detail GETs. Caller arguments must be empty;
every host field enters plan/full hashes. The query projection matches record ID;
the name-addressed tag projection matches both bound ID and name. Neither verifies
immutable parent ownership. The static `summaries` route refuses rather than
being treated as a tag. Query IDs are not summary IDs. Plans retain the required
tag name for routing, but receipts omit names/values, SQL, passwords, fingerprints,
users, addresses, tables, metrics, actors and times. Explainable/truncated flags
and source enums never grant EXPLAIN, execution or native authority.

`test/core-query-detail-read-preparation.test.mjs` supplies 19 synthetic contracts
for fixed requests, deep captures, every-field hashes, host/caller/accessor
refusals, canary omission, rebound ID/name rejection and separate namespaces.
Current ownership/revision, trusted transport/raw-body custody and independent
non-waking proof remain prerequisites. No executor, registration, credential
resolution or authority consumption is added. Coverage stays 134/291 offline
adapters, 157 missing; twelve previews and 54 pure preparations are separate
counts. All operations remain runtime-unintegrated, unreviewed, disabled and
unadopted. Earlier increments below retain their historical counts.

## Network/throttler core preparation

`bindGetDatabasePostgresCidrPreparation`, `bindGetDatabaseThrottlerPreparation`
and `bindGetDeployRequestThrottlerPreparation` capture closed immutable host
organization/database IDs and names, revision and CIDR/configurable identities.
Throttler captures reuse the existing unique 1–32 keyspace-name schema; deploy
throttler also retains independently resolved request ID and positive sequence
number. Empty caller arguments and every-field plan/full hashes bind the fixed
GETs. Request ID is not present in the number-addressed path or response, so its
current ID/number/parent binding remains an independent host prerequisite.
Configurable IDs and allowed keyspace names confine the existing projections;
they do not authenticate parent ownership, immutable keyspace IDs or effective
throttling. CIDR projections return only the bound entry ID, not CIDRs, schema or
role selectors. Throttler receipts retain bound keyspace names and configuration
presence, not ratios. Neither receipt grants enforcement/configuration authority.

`test/core-network-read-preparation.test.mjs` supplies 30 synthetic contracts for
fixed requests, immutable nested captures, every-field hashes, host/caller and
nested-array accessor refusal, bounded unique names, canary omission and whole-
response rejection of foreign keyspaces. Current ownership/revision, trusted
transport/raw-body custody and independent non-waking proof remain required.
No executor, registration, credential resolution or authority consumption is
added. Coverage stays 134/291 offline adapters, 157 missing; twelve previews and
52 pure preparations remain separate counts. All operations remain runtime-
unintegrated, unreviewed, disabled and unadopted. Earlier increments below retain
their historical counts.

## Insight-detail core preparation

`bindGetBranchAnomalyPreparation`, `bindGetTrafficBudgetPreparation` and
`bindGetQueryPatternsReportStatusPreparation` capture closed immutable organization,
database, branch and record identities plus revision for the existing fixed GETs.
Caller arguments must be empty; every host field enters the plan/full hash. The
existing projections match record ID, not immutable parent ownership. SQL,
correlations, fingerprints, rules/tags/thresholds, report contents/URLs, actors and
times never enter receipts. Active flags, budget mode and report state never grant
remediation, effective enforcement, download, retry or native closure authority.

`test/core-insight-read-preparation.test.mjs` supplies 25 synthetic contracts for
fixed requests, immutable captures, every-field hashes, caller/host refusal,
projection canaries, rebound identity and separate resource namespaces. Current
ownership/revision, trusted transport/raw-body custody and independent non-waking
proof remain required. No executor, runtime registration, credential resolution
or authority consumption is added. Coverage stays 134/291 offline adapters, 157
missing; twelve previews and 49 pure preparations remain separate counts. All
operations remain runtime-unintegrated, unreviewed, disabled and unadopted.

## Billing-detail core preparation

`bindGetInvoicePreparation`, `bindGetOrganizationBillingPaymentMethodPreparation`
and `bindGetPaymentMethodSetupPreparation` capture closed immutable organization
name/ID, record ID and revision snapshots for the existing fixed detail GETs.
Caller arguments must be empty; all host fields enter the plan/full hash. The
payment-method endpoint is a singleton path without a record ID, so its expected
ID is independently captured and retained in the resource and plan. Existing
projections match record ID, not organization ownership. Amounts, payment details,
checkout URLs, client secrets, actors and contact data never enter receipts;
`spendingAuthority: not-established` grants no billing or setup action authority.

`test/core-billing-read-preparation.test.mjs` supplies 26 synthetic contracts.
The setup-status GET retains its documented `write_payment_method` entitlement
prerequisite; GET does not imply read-only credential scope or grant expansion.
Current ownership/revision, trusted transport/raw-body custody and independent
non-waking proof remain required. These are pure Prepared shapes, not executors,
runtime registration or authority enforcement. Adapter coverage remains 134/291
with 157 missing; twelve previews and 46 pure preparations are separate counts.
All operations remain runtime-unintegrated, unreviewed, disabled and unadopted.

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
