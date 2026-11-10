# PlanetScale acceptance ledger

Status: **incomplete; no Security/Crypto/QA acceptance, install or enablement**.
This staged source PR does not deliver the complete package. The operation map's
missing rows are actual missing implementation, not a promise of dormant access.

## Query-fingerprint preparation source increment

Two pure Prepared bindings cover existing query-statistics first-page and
fingerprint-summary GETs. Closed immutable host parents/keyspace ID/name/revision,
fingerprint and separate query IDs or summary ID bind fixed requests and empty
arguments. Every field enters plan/full hashes, including response-only IDs absent
from requests. Existing bounded unique query-ID parser exported/reused without
behavior changes. No executor, registration, credentials or authority consumption.

`test/core-query-fingerprint-read-preparation.test.mjs` supplies **21 synthetic
contracts** for fixed requests, every-field hashes, immutable captures, closed/
bounded inputs, accessor/injection/envelope/whole-page refusal and redacted output.
Query and summary IDs remain separate. Fingerprint/keyspace-name matching does not
prove immutable keyspace identity, parent ownership or trusted provenance. SQL,
password objects, fingerprints/keyspace text, errors, metrics, actors and raw times
are omitted. Flags never grant EXPLAIN or execution authority. Statistics retain
fixed first-page-only coverage, not later pages/optional filters. Collection
permission, current identity/name/revision bindings, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **118 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions.

Prior exact `3a87b751df1a78ff22797c41cdb80cc536802eb1`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42821547261)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42821547261/job/129848105131)
passed, as did [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42821547084)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42821538608).
No numeric totals extracted. Earlier recurring unchanged SDK recovery uncertainty
remains unresolved. All specialist/scanner-scope delta/exact-head/live-use gates remain.

## Query-summary first-page preparation source increment

Two pure Prepared bindings cover existing query-summary/error-summary list GETs.
Closed immutable host parents/revision and reused bounded unique summary IDs or
error ID/fingerprint pairs bind fixed first-page requests and empty arguments.
Every field enters plan/full hashes, including response-only bindings absent from
paths. Existing parsers exported/reused without behavior changes. No executor,
registration, credential resolution or authority consumption.

`test/core-query-summary-read-preparation.test.mjs` supplies **21 synthetic contracts**
for fixed requests, every-field hashes, immutable captures, closed/bounded inputs,
accessor/envelope/whole-page refusal and redacted projections. Summary IDs are not
individual-query IDs; error fingerprints bind records but do not establish query
provenance or parent ownership. Receipts omit SQL/password objects, fingerprints,
error text, metrics, actors and raw times. Flags never grant execution authority.
Distinct official first-page envelopes and first-page-only coverage remain; later
pages/filters are unsupported. Child confinement is not collection authorization.
Current ownership/revision/bindings, trusted transport/raw-body custody and
independent non-waking proof remain prerequisites. Coverage stays **134/291 offline
adapters; 157 missing**, twelve previews and **116 pure preparations**, zero runtime-
integrated/reviewed/enabled/adopted. New contracts require exact-head Actions.

Prior exact `0400f5f0ff08911380bda06d7bbdfb9b0f956d1f`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42818783412)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42818783412/job/129838677940)
passed, as did [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42818782852)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42818776385).
Earlier pending observations are superseded; no numeric totals extracted. Earlier
unchanged GitHub SDK recovery uncertainty remains unresolved, not repaired.
All specialist, scanner-scope delta, exact-head and live-use gates remain.

## Unified/replica change collection preparation source increment

Two pure Prepared bindings cover existing unified change-request and dedicated-
replica change-request list GETs. Closed immutable host parents/revision, reused
unique bounded child/target bindings and host pagination bind fixed requests and
empty caller arguments. Every field enters plan/full hashes, including IDs absent
from paths. Existing binding parsers exported/reused without behavior changes.
No executor, registration, credential resolution or authority consumption.

`test/core-unified-change-collection-read-preparation.test.mjs` supplies **21 synthetic
contracts** for exact requests, every-field hashes, immutable captures, closed and
bounded inputs, accessor/page/whole-response refusals and redacted projections.
Unified collections preserve all exact type/target pairs and nullable target IDs;
replica collections retain multiple replica ID/name pairs. Informational states
and canDelete are not cancellation restrictions or native authority. Receipts
match child/target bindings, not immutable parent ownership. Child confinement is
not upstream collection permission. Configuration/storage/errors/actors/raw times
are omitted; state never proves unchanged settings, rollback or closure. Current
ownership/revision/bindings, collection permission, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **114 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions, not this declaration.

Prior exact `e7e98d1eb9ab0f8db0ba99be4316d8989c51364b`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42815978900)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42815978900/job/129829125288)
passed, as did [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42815978297)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42815970086).
Earlier pending observations superseded; no numeric totals extracted. Earlier
recurring unchanged SDK recovery uncertainty remains unresolved, not repaired.
No inline findings/submitted reviews returned. Older counts are historical.

## Deployment collection preparation source increment

Four pure Prepared bindings cover existing deploy queue, deploy-operation,
deploy-review and schema-recommendation collection GETs. Closed immutable host
parents/revision, unique bounded child bindings, applicable request ID/number/source
snapshot and host pagination bind fixed requests and empty caller arguments.
Existing binding parsers exported/reused without behavior changes; every field
enters plan/full hashes, including independent IDs absent from paths. No executor,
registration, credential resolution or authority consumption.

`test/core-deployment-collection-read-preparation.test.mjs` supplies **39 synthetic
contracts** for exact requests, every-field hashes, deep immutable capture,
closed/bounded input, accessor/page/whole-response refusals, operation separation
and canary omission. Queue receipts match ID/number/destination name, not immutable
destination/parent ownership. Recommendations match ID/number; operations/reviews
match child ID, not request association. Child confinement is not upstream
collection permission. Provider approval is not native approval; state/flags do
not prove safety, DDL execution, rollback or closure. SQL/DDL/errors/actors/raw times
are omitted. Current ownership/revision/bindings, collection permission, trusted
transport/raw-body custody and independent non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**112 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
New contracts require exact-head Actions, not this declaration.

Prior exact `8a36f3bfb1a5b0b6c60386151de347b035aa7ecf`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42813163486)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42813163486/job/129819511697)
passed, as did [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42813162719)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42813156171).
Earlier pending scanner observation is superseded; no numeric totals extracted.
Earlier recurring unchanged SDK recovery uncertainty remains unresolved, not
repaired. No inline findings/submitted reviews returned. Older counts are historical.

## Audit-log preparation source increment

One pure Prepared binding covers the existing organization audit-log first-page
GET. Closed immutable host organization ID/name, revision and unique bounded event
IDs bind the fixed limit=10 request and empty caller arguments. The existing ID
parser is exported/reused without behavior changes. Every field enters plan/full
hashes, including independent organization/event IDs absent from paths. No executor,
registration, credential resolution or authority consumption.

`test/core-audit-read-preparation.test.mjs` supplies **twelve synthetic contracts**
for exact requests, every-field hashes, immutable captures, closed/bounded input,
accessor and whole-response/cursor refusals, operation separation and canary omission.
Receipts match event IDs, not organization ownership. Event confinement is not
organization-wide collection permission or the distinct read_audit_logs entitlement.
Action presence never proves integrity, completeness, native authority or closure.
Action text, actors/targets, network/location, metadata and raw times are omitted.
Current ownership/revision, collection permission, trusted transport/raw-body custody
and independent non-waking proof remain prerequisites. Coverage stays **134/291
offline adapters; 157 missing**, twelve previews and **108 pure preparations**;
zero runtime-integrated/reviewed/enabled/adopted. New contracts require exact-head
Actions, not this declaration.

Prior exact `8bc76420b905249e6e26c0d76e9e7878bd14c38c`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42810481563)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42810481563/job/129810401410)
passed, as did [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42810480917)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42810474360).
No numeric totals extracted. Earlier recurring unchanged SDK recovery uncertainty
remains unresolved; no repair claim. No inline findings/submitted reviews returned.
Older counts below are historical.

## Insight collection preparation source increment

Three pure Prepared bindings cover existing branch-anomaly, traffic-budget and
generated-query-report collection GETs. Closed immutable host parents/revision,
unique bounded child IDs and applicable host pagination bind fixed requests and
empty caller arguments. Reports retain fixed first-page limit=10 and their cursor
envelope, not invented generic pagination. Existing ID parsers are exported/reused
without behavior changes. Every field enters plan/full hashes, including IDs absent
from paths. No executor, registration, credential resolution or authority consumption.

`test/core-insight-collection-read-preparation.test.mjs` supplies **28 synthetic
contracts** for exact requests, every-field hashes, deep snapshots, closed/bounded
input and accessor refusals, whole-response refusal, operation separation and
canary omission. Receipts match child IDs, not immutable parent ownership. Child
confinement does not authorize upstream collections. Active/mode/state metadata
never proves remediation, effective enforcement, download permission, safe retry,
closure or native authority. SQL/correlations/fingerprints, rules/tags/thresholds,
metrics, report contents/URLs, actors and raw times are omitted. Current
ownership/revision, collection permission, trusted transport/raw-body custody and
independent non-waking proof remain prerequisites. Coverage stays **134/291 offline
adapters; 157 missing**, twelve previews and **107 pure preparations**; zero
runtime-integrated/reviewed/enabled/adopted. New contracts require exact-head
Actions, not this declaration.

Prior exact `14404bca2709fdc8b716da6425d42635d69fadd1`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42807747110)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42807747110/job/129801222313)
passed, as did [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42807746221)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42807737019).
No numeric totals extracted. Earlier recurring unchanged SDK recovery failure
remains unresolved; no repair claim. No inline findings/submitted reviews returned.
Older counts below are historical.

## Billing collection preparation source increment

Two pure Prepared bindings cover existing invoice and invoice-line-item collection
GETs. Closed immutable host organization/revision, applicable invoice ID, unique
bounded child IDs and host pagination bind fixed requests and empty caller
arguments. The existing billing ID parser is exported/reused without behavior
changes. Every field enters plan/full hashes, including IDs absent from paths.
No executor, registration, credential resolution or authority consumption.

`test/core-billing-collection-read-preparation.test.mjs` supplies **19 synthetic
contracts** for exact requests, every-field hashes, deep snapshots, closed/bounded
input and accessor refusals, whole-page refusal, operation separation and canary
omission. Receipts match child IDs, not organization ownership or line-item invoice
association. Child confinement does not authorize upstream collections. Paid,
overdue and billed flags never establish spending or native authority. Amounts,
payment/contact/checkout material, descriptions, actors and raw times are omitted.
Current ownership/revision, collection permission, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **104 pure
preparations**; zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions, not this declaration.

Prior exact `e2e4b011e1d582e588110cda225de46108534663`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42805070249)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42805070249/job/129792051293)
passed, as did Gitleaks and all three CodeQL analyses. No numeric totals extracted.
Earlier recurring unchanged SDK recovery failure remains unresolved; no repair
claim. No inline findings/submitted reviews returned. Older counts below are historical.

## Organization-security collection preparation source increment

Three pure Prepared bindings cover existing OAuth-application, SSO-domain and
invitation collection GETs. Closed immutable host organization/revision, reused
unique bounded child IDs and host pagination bind fixed requests and empty caller
arguments. SSO domains remain plain arrays, not invented paginated collections.
Every field enters plan/full hashes, including IDs absent from paths. No executor,
registration, credential resolution or authority consumption.

`test/core-organization-security-collection-read-preparation.test.mjs` supplies
**27 synthetic contracts** for exact requests, every-field hashes, deep snapshots,
closed bounded input/accessor refusal, whole-response refusal and canary omission.
Receipts match child IDs, not organization ownership. Child confinement is not
upstream collection permission. Flags/verification presence/roles never grant
SSO configuration, invitation acceptance, effective enforcement or native authority.
Contact/domain/client/scope/verification material, actors and raw times are omitted.
Current ownership/revision, collection permission, trusted transport/raw-body
custody and independent non-waking proof remain prerequisites. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **102 pure
preparations**; zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions, not this declaration.

Prior exact `53c1828813c377e4a833d58beed09adecee85bae`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42802437488)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42802437488/job/129783164675)
passed, as did Gitleaks and all three CodeQL analyses. No numeric totals extracted.
Earlier recurring unchanged SDK recovery failure remains unresolved; no repair
claim. No inline findings/submitted reviews returned. Older counts below are historical.

## Profile collection preparation source increment

Two pure Prepared bindings cover existing configuration-profile and profile-shard
list GETs. Closed immutable host parents/revision, unique bounded child bindings,
optional profile ID/name and host pagination bind fixed GETs and empty arguments.
Existing profile parsers exported/reused without behavior changes. Profile lists
are plain arrays, not invented paginated collections. Every field enters plan/full
hashes, including IDs absent from paths. No executor, registration, credential
resolution or authority consumption.

`test/core-profile-collection-read-preparation.test.mjs` supplies **18 synthetic
contracts** for exact requests, every-field hashes, deep snapshots, bounded unique
bindings, host/caller/accessor refusals, whole-response refusal and canary omission.
Profile receipts match ID/name; shards match ID and profile name, not immutable
profile/parent ownership. Child confinement is not upstream collection permission.
State/default/metal/ready/authoritative flags never grant configuration, assignment,
spend, wake or native authority. Configuration/SKU/cost/versions/actors/raw times
are omitted. Current ownership/revision/bindings, collection permission, trusted
transport/raw-body custody and independent non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and **99
pure preparations**; zero runtime-integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions, not this declaration.

Prior exact `fa11e18c3c0e67a993edb6f304cc614fa4862b63`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42799728687/job/129773919378)
passed **1899/1899 PlanetScale**, root 317/317, helpers 122/122 and Neon 37/37;
GitHub broker passed 218/219. Aggregate failed on the recurring unchanged SDK
recovery assertion at `plugins/github-broker/test/sdk-http.test.mjs:159`, receiving
`mint.revoke_failed` instead of success. Lint/typecheck/native-policy, Gitleaks and
all three CodeQL analyses passed. No repair, retry or causal attribution claimed.
No inline findings/submitted reviews returned. Older counts below are historical.

## Compute collection preparation source increment

Five pure Prepared bindings cover existing bouncer, branch-wide/bouncer-specific
bouncer-resize, branch-resize and keyspace-resize list GETs. Closed immutable host
parents/revision, bounded unique child IDs/name/target pairs, optional bouncer or
keyspace ID/name and host pagination bind fixed GETs and empty caller arguments.
Existing resize parsers exported/reused without behavior changes. Bouncer-specific
lists confine every captured target pair; branch-wide lists retain multiple targets.
Every field enters plan/full hashes, even IDs absent from paths. No executor,
registration, credential resolution or authority consumption.

`test/core-compute-collection-read-preparation.test.mjs` supplies **43 synthetic
contracts** for requests, every-field hashes, deep snapshots, bounded unique
bindings, host/caller/accessor refusals, whole-page refusal, bouncer target-pair
confinement, cross-operation separation and canary omission. Bouncer receipts match
branch ID/name, resize receipts record ID and optional bouncer pair, not immutable
organization/database ownership or keyspace association. Child confinement does
not authorize the upstream collection. State/target never grants resize, cancel,
spend, wake or native authority, or proves rollback/closure. Configuration/SKU/cost/
errors/actors/raw times are omitted. Current ownership/revision/bindings, upstream
collection permission, transport/raw-body custody and independent non-waking proof
remain prerequisites. Coverage stays **134/291 offline adapters; 157 missing**,
twelve previews and **97 pure preparations**; zero runtime-integrated/reviewed/
enabled/adopted. New contracts require exact-head Actions, not this declaration.

Prior exact `aee086793f96c2bc17173b14f5668720794a0cea`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42796604499)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42796604499/job/129763335358)
passed; [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42796604078)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42796598726)
passed. No numeric totals extracted, inline findings or submitted reviews returned.
Earlier unchanged SDK recovery uncertainty remains unresolved. Prior evidence does
not cover new compute-collection contracts; older counts below are historical.

## Change collection preparation source increment

Three pure Prepared bindings cover existing branch-change and branch/keyspace
configuration-change list GETs. Closed immutable host parents/revision, bounded
unique child IDs/type/keyspace pairs, optional keyspace ID/name and host pagination
bind fixed GETs and empty caller arguments. Existing change parsers exported/reused
without behavior changes. Branch-config collections retain mixed types, unlike
branch details; keyspace collections preserve exact type/keyspace confinement.
Every field enters plan/full hashes, even child/keyspace IDs absent from the path.
No executor, registration, credential resolution or authority consumption.

`test/core-change-collection-read-preparation.test.mjs` supplies **30 synthetic
contracts** for requests, hashes, deep snapshots, bounded unique bindings,
host/caller/accessor refusals, whole-page refusal, mixed/nullable types and canary
omission. Child confinement is not upstream collection permission. Receipts do
not authenticate immutable parent/keyspace ownership. State does not grant config,
cancellation, spend, wake or native authority, or prove rollback/closure. Config
values/errors/actors/raw times are omitted. Current ownership/revision/bindings,
collection permission, transport/raw-body custody and independent non-waking proof
remain prerequisites. Coverage stays **134/291 offline adapters; 157 missing**,
twelve previews and **92 pure preparations**; zero runtime-integrated/reviewed/
enabled/adopted. New execution requires exact-head Actions, not this declaration.

Prior exact `b278679473091231e207d006d2478ed56272a044`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42793937341)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42793937341/job/129754180109)
passed; [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42793936948)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42793930467)
passed. No inline findings/submitted reviews returned. No numeric totals extracted.
Earlier unchanged SDK recovery uncertainty remains unresolved. Prior evidence does
not cover these new change-collection contracts; older counts below are historical.

## Routing collection preparation source increment

Three pure Prepared bindings cover existing router/dedicated-read-replica/
switchover list GETs. Closed immutable host parents/revision, unique bounded
child ID/name pairs or switchover IDs, fixed requests and empty caller arguments.
Existing routing parsers exported/reused without behavior changes. Router/replica
collections stay plain arrays, refusing invented host pagination; switchovers
capture bounded host pagination. Every field enters plan/full hashes, including
children whose rebinding does not change the upstream request. No executor,
registration, credential resolution or authority consumption.

`test/core-routing-collection-read-preparation.test.mjs` supplies **27 synthetic
contracts** for fixed requests, every-field hashes, captured snapshots, unique
bounded bindings, host/caller/accessor refusals, whole-response refusal, exact
shapes and canary omission. Child matching does not authenticate parents or grant
upstream collection permission. State/flags do not grant topology/scaling/spend/
wake/native authority; failed switchovers/completion presence do not prove unchanged
primary, rollback or closure. Config/connections/SKU/cost/errors/actors/raw times
are omitted. Current ownership/revision, collection permission, trusted transport/
raw-body custody and independent non-waking proof remain prerequisites. Coverage
stays **134/291 offline adapters; 157 missing**, twelve previews and **89 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. New execution
requires exact-head Actions, not this source declaration.

Prior exact `f3862d4d58f7ece07fe340245ce32100e0e8f27d`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42791178632)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42791178632/job/129744790850)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42791178042)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42791172419)
passed. No inline findings/submitted reviews returned. Earlier unchanged SDK
recovery uncertainty remains unresolved; prior evidence does not cover new routing
collection contracts. Older counts below are historical.

## Security-record collection preparation source increment

Three pure Prepared bindings cover existing service-token/OAuth-token/webhook
list GETs. Closed immutable host organization/database/application/revision
captures, bounded unique record IDs and host pagination bind fixed requests and
empty caller arguments. Existing ID parser exported/reused without behavior
change. All fields enter plan/full hashes; child rebinding can leave the collection
request unchanged. OAuth resources retain the application. No executor,
registration, credential resolution or authority consumption.

`test/core-security-record-collection-read-preparation.test.mjs` supplies **30
synthetic contracts** for requests, every-field hashes, deep snapshots, bounded
unique IDs, host/caller/accessor refusals, whole-page refusal and canary omission.
Response record IDs do not authenticate parents/application ownership. Token
timestamp presence never establishes validity/effective rights; webhook flags
never grant execution/delivery authority. Tokens, refresh tokens, endpoint URLs,
raw authorization headers, access/scope bodies, actors and raw times are omitted.
Upstream collection permission, trusted current ownership/revision, raw secret-
bearing response custody and independent non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**86 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New
execution requires exact-head Actions; this source declaration is not a pass.
Older counts below are historical.

Prior exact `997d677d2bbad8ed901865502193bf146bbb0a2d`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42788444603)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42788444603/job/129735527289)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42788443608)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42788437463)
passed. No inline findings/submitted reviews returned. Earlier unchanged SDK
recovery uncertainty remains unresolved. Prior-head evidence does not cover the
new security-record collection contracts.

## Organization collection preparation source increment

Three pure Prepared bindings cover existing organization member/team/team-member
list GETs. Closed immutable host organization ID/slug/revision, team ID/slug where
applicable, bounded unique child bindings and host pagination bind fixed requests
and empty caller arguments. Reuse existing membership/user ID and team ID/slug
parsers without changing offline behavior. All fields enter plan/full hashes.
Child confinement does not authorize upstream organization/team-wide collection
or authenticate parent ownership. Team ID remains bound even though the path uses
its slug. Roles/managed flags never grant effective rights or native authority.
No executor, registration, credential resolution or authority consumption.

`test/core-organization-collection-read-preparation.test.mjs` supplies **30 synthetic
contracts** for exact requests, every-field hashes, deep snapshots, bounded unique
bindings, host/caller/accessor refusals, whole-page refusal, tuple matching and
canary omission. Current ownership/revision, collection permission, trusted
transport/raw-body custody and independent non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**83 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. New
execution requires exact-head Actions; this source declaration is not a pass.
Older counts below are historical.

Prior exact `798016f02dbba37e1a51ff5a21d9557176ed69b4`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42785786105)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42785786105/job/129726570388)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42785785817)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42785778953)
passed. No inline findings/submitted reviews returned. Earlier unchanged SDK
recovery uncertainty remains unresolved. Prior-head evidence does not cover the
new organization collection contracts.

## Topology collection preparation source increment

Three pure Prepared bindings cover existing keyspace/shard/maintenance-event list
GETs. Closed immutable host parent IDs/names/revision, bounded unique child IDs and
host pagination bind fixed requests and empty caller arguments. Reuse existing
topology parsers, additionally retaining keyspace names and maintenance branch
ID/name tuples. Every field enters plan/full hashes. Child confinement does not
authorize upstream collections or authenticate immutable parent ownership.
Ready/authoritative/urgent/state metadata never grants execution, scheduling,
wake, spend or native authority. Current ownership/bindings/revision, collection
permission, transport/raw-body custody and independent non-waking proof remain
prerequisites. No executor, registration, credential resolution or authority
consumption. Parser exports preserve existing offline behavior.

`test/core-topology-collection-read-preparation.test.mjs` supplies **30 synthetic
contracts** for exact requests, hashes/rebinding, deep snapshots, closed/accessor/
injection refusals, caps, whole-page refusal, tuple matching and canary omission.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**80 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
New execution requires exact-head Actions; this source declaration is not a pass.
Older counts below are historical.

Prior exact `02aa97058e980e5c904c15372f61132e4612115a`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42783201829)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42783201829/job/129718002963)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42783201391)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42783194957)
passed. The deploy-list refusal assertion repair is verified; source 0173980's
1708/1709 failure remains recorded below. Earlier unchanged SDK recovery uncertainty
remains unresolved. Prior-head evidence does not cover the new topology contracts.

## Lifecycle collection preparation source increment

Three pure Prepared bindings cover existing backup/backup-policy/deploy-request
list reads. Closed immutable host parent IDs/names/revision, bounded unique child
IDs and host pagination bind fixed GETs and empty caller arguments. Deploy-request
children also capture number, source branch ID/name and destination name. Reuse
existing lifecycle parsers; every field enters plan/full hashes. Child confinement
is not upstream collection authorization. No executor, credential resolution,
registration or authority consumption. Current parent ownership/bindings/revision,
collection permission, transport/raw-body custody and independent non-waking proof
remain prerequisites. Deploy projections do not authenticate immutable destination
identity or native approval; backup/policy flags never grant mutation authority.

`test/core-lifecycle-collection-read-preparation.test.mjs` supplies **30 synthetic
contracts** for fixed requests, every-field hashes/rebinding, deep snapshots,
closed/accessor/injection refusals, caps, whole-page refusal and redaction.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**77 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
New-contract execution requires exact-head Actions; this source declaration is
not a test pass. Older counts below are historical.

Prior exact `eb093fdf5056d6fdccac92627f6f8af37242e0d9`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42778312079/job/129702004397)
passed **1679/1679 PlanetScale**, root 317/317, helpers 122/122 and Neon 37/37;
GitHub broker passed 218/219. The unchanged pinned SDK recovery assertion at
`plugins/github-broker/test/sdk-http.test.mjs:159` received `mint.revoke_failed`
instead of success. Aggregate correctly failed. No retry, repair or all-green
claim: earlier same-SHA passes do not establish its cause. Lint/typecheck,
native-policy, [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42778311529)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42778306022)
passed. Prior-head evidence does not cover the new lifecycle collection contracts.

## Discovery collection preparation source increment

Five pure Prepared bindings capture existing database/branch and database,
organization and public-region collection reads. Closed immutable host parent IDs,
names/revision, 1–32 unique child ID/name bindings and bounded host pagination
(page 1–100, perPage 1–10) bind fixed GETs and empty caller arguments. Reuse the
existing discovery resource-binding parser. Public region catalog has a fixed
local resource namespace, not provider identity. Every host field/child/page
enters plan/full hashes. No executor, registration, credential resolution or
authority consumption is added; parent collection permission remains independent.

`test/core-discovery-read-preparation.test.mjs` supplies **47 synthetic contracts**
for exact requests, hashes/rebinding, deep snapshots, host/caller/accessor/injection
refusals, limits, projection redaction, whole-page refusal and cross-operation
separation. Projections retain bound child names and strict metadata flags, never
password/connection/config/actor/time fields or unverified parent claims. Child
matching does not authenticate immutable parents, freshness, effective authority
or non-waking behavior. The reported cursor is not trusted exhaustive inventory.
Current ownership/revision, upstream collection permission, transport/raw-body
custody and non-waking proof remain prerequisites. Coverage stays **134/291 offline
adapters; 157 missing**, twelve previews and **74 pure preparations**, zero runtime-
integrated/reviewed/enabled/adopted. New-contract execution requires exact-head
Actions; this source declaration is not a pass. Older counts below are historical.

Prior exact `63dd7f0749179e931ffa749bb0a9b2b8bbc0db09`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42774678886)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42774678886/job/129690347715)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42774678271)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42774670634)
passed. Earlier unchanged SDK recovery uncertainty remains unresolved. Prior-head
evidence does not cover the new discovery preparation contracts.

## Maintenance schedule preparation source increment

Two pure Prepared bindings capture existing database maintenance-schedule and
branch maintenance-window GETs. Closed immutable host parent/schedule/revision
snapshots bind fixed requests and empty caller arguments. The branch singleton
independently binds schedule ID absent from its path; projections match schedule
ID only, not parent ownership or branch association. Both share a schedule resource
with distinct operation/request/target hashes. No executor, registration, credential
resolution or authority consumption is added.

`test/core-maintenance-read-preparation.test.mjs` supplies 18 synthetic contracts
for fixed GETs, every-field hashes, immutable capture, host/caller/accessor refusals,
schedule rebinding, canary omission and cross-operation separation. Receipts retain
strict flags and frequency enum only. Provider scheduling metadata is not an
authorized execution/use window or scheduling/wake/spend authority. Current
bindings/revision, transport/custody and non-waking proof remain prerequisites.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**68 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
Exact-head Actions must execute these contracts; no current-head pass is implied.
Older counts below are historical.

Prior exact `e6aa6d8efe2050fbf13872772c1f7005d3c39600`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42770435082)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42770435082/job/129676739238)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42770434670)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42770429173)
passed. Earlier unchanged SDK recovery uncertainty remains unresolved. This
prior-head evidence does not cover the new maintenance preparation contracts.

## Metric preparation source increment

Six pure Prepared bindings capture the existing instant branch/tablet and historical
branch/tablet/query/tag metric GETs. Closed immutable host parent/branch/revision
snapshots bind one allowlisted metric and, for historical reads, a canonical UTC
window of 1–900 seconds with fixed steps=16. The existing timestamp schema and
window validation are reused. Empty caller arguments cannot retarget requests or
supply authority. All six share a branch resource but retain distinct plan hashes.
Instant response projections match branch ID/name, not parents; historical
responses have no branch identity. Query/tag reads remain whole-branch collections,
not per-query/tag isolation. No executor, registration, credential resolution or
authority consumption is added.

`test/core-metric-read-preparation.test.mjs` supplies 55 synthetic contracts for
fixed GETs, captured immutable snapshots, every-field hashes, exact selector
allowlists, canonical bounded windows, host/caller/accessor refusals, redaction and
cross-operation separation. Existing projections omit samples, labels, raw times
and unknown parent claims. Presence never proves health, freshness, integrity,
provenance or authority. Current ownership/revision, trusted transport/raw-body
custody, collection permission and independent non-waking proof remain required.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**66 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted.
Exact-head Actions must execute the new contracts; no new-head pass is implied.
Older counts below are historical.

Prior exact `c4fadd8a432702c85c7f411c5241f415b65c5f2d`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42768050748)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42768050748/job/129669154394)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42768050267)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42768045496)
passed. Earlier unchanged SDK recovery uncertainty remains unresolved. This
prior-head evidence does not cover the new metric preparation contracts.

## Diagnostic preparation source increment

Two pure Prepared bindings capture existing branch schema-lint and deploy-request
storage-check GETs. Closed immutable host parents/revision bind branch ID/name
and unique bounded keyspace names for lint, or independent request ID/number for
storage. Empty caller arguments and every-field plan/full hashes retain fixed
requests; lint fixes page=1/per_page=10. Name confinement does not authenticate
immutable response parents, and storage has no response identity. Explicit plan
identity markers retain both limitations. No executor, registration, credential
resolution or authority consumption is added.

`test/core-diagnostic-read-preparation.test.mjs` supplies 20 synthetic contracts
for requests, snapshots, hashes, host/caller/array refusals, non-invoked accessors,
canary omission, first-page semantics and independent request ID/number binding.
Receipts retain keyspace/subject enums or strict storage flags, not DDL/error/
table/column/storage/actor/time details. Flags and pagination never prove safe
deployment, upgrade permission, ownership, collection completeness or authority.
Current bindings/revision, transport/custody, collection permission and non-waking
proof remain prerequisites. Coverage stays **134/291 offline adapters; 157
missing**, twelve previews and **60 pure preparations**, zero runtime-integrated/
reviewed/enabled/adopted. Exact-head Actions must execute the new contracts;
no new-head success is implied. Older counts below are historical.

Prior exact `72b0d70116c5788c4d880227730941be1b85f0b0`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42765799810)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42765799810/job/129661922759)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42765799218)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42765795300)
passed. Earlier unchanged SDK recovery uncertainty remains unresolved. This
prior-head evidence does not cover the new diagnostic preparation contracts.

## Availability preparation source increment

Two pure Prepared bindings capture existing keyspace VSchema and branch data-
topology GETs. Closed immutable host parent/resource/revision snapshots, empty
caller arguments and every-field plan/full hashes bind fixed requests, not
permission. Both official responses lack target identity: the explicit
absent-request-bound-only plan marker and request-prefixed receipt IDs avoid
claiming authenticated response identity. No executor, registration, credential
resolution or authority consumption is added.

`test/core-availability-read-preparation.test.mjs` supplies 19 synthetic contracts
for requests, immutable capture, hashes, nested/host/caller refusals, canary omission
and presence-only semantics. Raw schema/topology contents/keys/actors/times remain
omitted. Empty values mean no reported presence; arbitrary bounded sync strings
are not timestamps or freshness proof. Current ownership/revision, trusted
transport/raw-body custody, collection permission and independent non-waking
proof remain prerequisites. Coverage stays **134/291 offline adapters; 157
missing**, twelve previews and **58 pure preparations**, zero runtime-integrated/
reviewed/enabled/adopted. Exact-head Actions must execute the new contracts;
no new-head success is implied. Older counts below are historical.

Prior exact `2f736a8a8284667044acc6697aa38a4ea481989a`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42763724138)
and [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42763724138/job/129655250833)
passed, including lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42763723556)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42763718842)
passed. No numeric totals extracted this run; earlier unchanged SDK recovery
uncertainty remains unresolved. This evidence covers the prior change/operation
contracts, not the new availability contracts.

## Change/operation-detail preparation source increment

Two pure Prepared bindings capture existing unified change-request and vtctld
operation GETs. Closed host snapshots retain immutable parent/resource IDs,
names, revision and the change target/type binding including nullable target ID.
The existing matching-type parser is reused; read preparation does not inherit
cancellation-only state/canDelete restrictions. Empty arguments, fixed requests
and every-field plan/full hashes bind snapshots, not authority or freshness.
Change projections match record/target bindings, not parents; vtctld projections
match record ID/type only. Null target identity remains null. State/canDelete and
completion-string presence never prove topology, rollback, closure or permission.

`test/core-operation-detail-read-preparation.test.mjs` supplies 22 synthetic
snapshot/hash/refusal/projection contracts including nested accessor refusal,
null identity, exact type/target pair matching and cross-kind separation.
Configuration/actions/results/errors/metadata/actors/raw times are omitted;
existing bound change target ID/type/name output is retained. Current ownership,
revision, trusted transport/raw-body custody and independent non-waking proof
remain prerequisites. No executor, registration, credential resolution or
authority consumption. Exact-head Actions must execute these contracts; no
new-head success is implied. Coverage stays **134/291 offline adapters; 157
missing**, twelve previews and **56 pure preparations**, zero runtime-integrated/
reviewed/enabled/adopted. Older counts below are historical.

Prior exact `1133ee7840c96f57d6c6b5151f14a8327e3ca0be`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42761777423)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42761777423/job/129648951008):
1488/1488 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219, Neon 37/37;
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok and Neon
candidate contract passed. [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42761777090)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42761773573)
passed. Historical evidence does not cover this increment; earlier unchanged SDK
recovery uncertainty remains unresolved.

## Query-detail preparation source increment

Two pure Prepared bindings capture existing individual-query and query-tag detail
GETs. Closed immutable host organization/database/branch IDs and names, revision
and query ID or tag ID/name pair bind fixed requests and empty caller arguments.
All host fields enter plan/full hashes. Query projections match record ID; tag
projections match ID and name, not immutable parent ownership. The static summaries
route refuses. Query IDs are distinct from summary IDs. Plans retain bound tag
names for routing; receipts omit tag names/values, SQL/password objects,
fingerprints, users/addresses/tables, metrics, actors and times. Flags/source
never grant EXPLAIN, execution or native authority.

`test/core-query-detail-read-preparation.test.mjs` supplies 19 synthetic contracts
for fixed GETs, closed deep snapshots/freeze, every-field hashes, host/caller and
nested-accessor refusal, rebound ID/name rejection, canary omission and resource
namespace separation. Current ownership/revision, broker transport/raw-body
custody and independent non-waking proof remain prerequisites. No executor,
registration, credential resolution or authority consumption. Exact-head Actions
must execute the new contracts; no new-head success is implied. Coverage stays
**134/291 offline adapters; 157 missing**, twelve previews and **54 pure
preparations**, zero runtime-integrated/reviewed/enabled/adopted. Older counts
below are historical.

Prior exact `93ad6a6aaf0246705a6dda80a22b37b454b71788`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42759702195)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42759702195/job/129642297929):
1469/1469 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219, Neon 37/37;
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok and Neon
candidate contract passed. [Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42759701508)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42759697728)
passed. Historical evidence does not cover this increment; unchanged SDK recovery
uncertainty is unresolved, not repaired here.

## Network projection assertion repair

Source head `4751ff43551cab478d72b4837c33ccfdd6f933d9`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42758090623/job/129637100017)
passed 1467/1469 PlanetScale contracts. Both failing throttler assertions searched
for the substring `ratio`, which also occurs in the required
`configurationAuthority` key. Exact expected receipt equality passed; no leaked
ratio was demonstrated. The repair checks exact own-property absence on the
receipt and every keyspace row, retaining full projection equality, canary
omission, frozen output and the authority disclaimer. Runtime behavior is
unchanged; the same 30 network preparation contracts require fresh Actions
verification, with no additional test-count credit or repair-head pass implied.

Root 317/317, helpers 122/122, GitHub broker 219/219 and Neon 37/37 passed on
that source head. Lint/typecheck/native-policy, Gitleaks and all three CodeQL
analyses passed; aggregate ci-ok correctly failed. Earlier SDK recovery uncertainty
is not repaired here. Coverage, missing adapters, previews/preparations and all
review/runtime gates below are unchanged. No local suite, build, typecheck or
CI mirror is substitute evidence.

## Network/throttler preparation source increment

Three pure Prepared bindings capture existing CIDR/database-throttler/deploy-
request-throttler GETs. Closed host snapshots retain organization/database names
and IDs, revision and CIDR/configurable IDs, plus unique bounded keyspace names
for throttlers and independent request ID/number for deploy throttler. Empty
caller arguments, fixed requests, every-field plan/full hashes and separate
resource namespaces bind the local plans, not permission or current ownership.

`test/core-network-read-preparation.test.mjs` supplies 30 synthetic contracts for
fixed GETs, nested capture/freeze, every-field hashes, missing/extra/unsafe/accessor
host/caller refusals, bounded unique keyspace names, projection canaries, rebound
IDs and whole-response refusal of foreign keyspaces. Existing projections match
CIDR/configurable ID and allowlisted keyspace names, not immutable parent or
request identity. Independent current request ID/number/parent binding remains
required; host snapshots do not prove it. CIDRs, schema/role selectors, ratios,
actors and times are omitted; bound keyspace names/configuration presence remain.
Provider configuration never proves effective enforcement or native authority.
Current ownership/revision, broker transport/raw-body custody and independent
non-waking proof remain prerequisites. No executor, registration, credential
resolution or authority consumption. Exact-head Actions must execute these new
contracts; no new-head success is implied. Coverage stays **134/291 offline
adapters; 157 missing**, twelve previews and **52 pure preparations**, zero
runtime-integrated/reviewed/enabled/adopted. Older increments are historical.

Prior exact `d61b7c06100eb35dca10a35cd1844c92655973a6`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42756166464)
passed [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42756166464/job/129631010958),
lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42756165761)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42756162427)
passed. No numeric totals extracted; prior evidence does not cover this increment.

## Insight-detail preparation source increment

Three pure Prepared bindings capture existing branch-anomaly, traffic-budget and
query-pattern report-status detail GETs. Closed host snapshots retain organization,
database, branch and record identities plus revision. Empty caller arguments,
fixed GETs and every-field plan/full hashes prevent target/request/authority
injection. Separate resource namespaces distinguish equal record IDs. Existing
projections match record ID without authenticating immutable parent ownership.

`test/core-insight-read-preparation.test.mjs` supplies 25 synthetic contracts for
fixed requests, immutable captures, every-field hashes, missing/extra/unsafe/
accessor refusal, projection canaries, rebound identity and malformed selected
fields. SQL/correlations/fingerprints, rules/tags/thresholds, report contents/URLs,
actors and times are omitted. Active flags/mode/state never establish remediation,
effective enforcement, download/retry authority or closure. Current ownership/
revision, trusted transport/raw-body custody and independent non-waking proof
remain required. No executor, registration, credential resolution or authority
consumption is added. Exact-head Actions must execute these new contracts; no
passing result is implied here. Coverage stays **134/291 offline adapters; 157
missing**, twelve previews and **49 pure preparations**, zero runtime-integrated/
reviewed/enabled/adopted. Older increments below are historical.

Prior exact `cd187b96111b0fa752d0d05bbd5ebd5ec17d7d4c`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42753343722)
passed [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42753343722/job/129621923800),
lint/typecheck/native-policy/ci-ok and Neon candidate contract.
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42753343252)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42753337303)
passed. No numeric totals extracted this run; this is prior-head evidence, not
execution of the 25 new contracts or independent review/runtime acceptance.

## Organization-security detail preparation source increment

Three pure Prepared bindings capture existing OAuth-application, organization SSO
and SSO-domain detail GETs. Closed host snapshots retain organization name/immutable
ID, revision and application/domain ID where applicable. Empty caller arguments,
fixed GETs and every-field plan/full hashes prevent target/request/authority
injection. Separate resource namespaces distinguish equal organization/record IDs.
SSO projections match the expected organization ID; application/domain projections
match record IDs without authenticating immutable parent ownership.

`test/core-organization-security-read-preparation.test.mjs` supplies 26 synthetic
fixed-request, capture/freeze, every-field hash, missing/extra/unsafe/accessor,
projection-canary, rebound-ID and malformed-selected-field contracts. It separately
checks SSO organization-ID binding when the name-addressed request is unchanged.
Client/contact/domain/verification data are omitted. Provider flags/state and
verification presence never prove effective enforcement, membership, native
authority or closure. Current ownership/revision revalidation, broker transport/
raw-body custody and independent non-waking proof remain prerequisites. No executor,
registration, credential resolution, authority consumption or live use is added.
Exact-head Actions must execute these contracts; no passing result is implied here.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
**43 pure preparations**, zero runtime-integrated/reviewed/enabled/adopted. Older
increments below are historical.

Prior exact `600a5afd4d06b83027fdf77154891491dfbd4ee6`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42749358102)
passed [1362/1362 PlanetScale tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42749358102/job/129609072902),
root 317/317, helpers 122/122, GitHub 219/219 and Neon 37/37 with zero failures,
skips or cancellations. Lint/typecheck/native-policy/ci-ok, Gitleaks and all three
CodeQL analyses passed. This is prior-head evidence, not execution of these new
contracts, independent review or runtime acceptance.

## Configuration-profile detail preparation source increment

Two pure Prepared bindings capture existing profile and profile-shard detail GETs.
Closed host snapshots retain immutable parent/profile/shard IDs, parent names,
revision and profile name. Empty arguments cannot inject targets, requests,
configuration, credentials or authority. Every variable field enters plan/full
hashes; the profile-shard resource includes the independently captured profile ID,
not just its name-addressed route. Profile and ordinary shard namespaces remain
separate. The redirect-only default-profile operation remains missing.

`test/core-configuration-profile-read-preparation.test.mjs` supplies 18 synthetic
fixed-request, capture/freeze, every-field hash, missing/extra/unsafe/accessor,
projection-canary, rebound-ID/name and malformed-selected-field contracts.
Profile responses match ID/name; shard responses match shard ID and profile name,
not immutable profile/parent identity. Non-waking semantics remain unverified.
State/default/metal/ready/authoritative flags never establish configuration,
assignment, restart, wake, spend or native authority. Trusted current ownership,
revision/name revalidation and broker transport/custody remain prerequisites.
No executor, registration, credential resolution, authority consumption or live
use is added. Exact-head Actions must execute these source contracts; no passing
result is implied here. Coverage stays **134/291 offline adapters; 157 missing**,
twelve previews and **40 pure preparations**, zero runtime-integrated/reviewed/
enabled/adopted. Older increments below are historical.

## Routing-detail preparation source increment

Three pure Prepared bindings capture existing router, dedicated-read-replica and
switchover detail GETs. Closed host snapshots retain immutable parent/child IDs,
parent names, revision and router/replica names used in paths. Empty arguments
cannot inject targets, requests, configuration, credentials or authority. Fixed
GETs and every variable snapshot field enter plan/full hashes; distinct resource
namespaces separate record kinds with identical IDs.

`test/core-routing-read-preparation.test.mjs` supplies 25 synthetic contracts for
fixed requests, capture/freeze, every-field hash sensitivity, missing/extra/unsafe/
accessor refusals, canary omission, child ID/name rebound and unknown states.
Response projections do not authenticate immutable parents or current name mappings;
non-waking semantics remain unverified. State/ready/autoscaling/timestamp-presence
never establishes native authority, unchanged primary, rollback or closure.
Trusted ownership, current revision/name revalidation and broker transport/custody
remain prerequisites. No executor, registration, credential resolution, authority
consumption or live use is added. Exact-head Actions must execute these source
contracts; no passing result is implied here. Coverage stays **134/291 offline
adapters; 157 missing**, twelve previews and **38 pure preparations**, zero
runtime-integrated/reviewed/enabled/adopted. Older increments below are historical.

## Change-detail preparation source increment

Three pure Prepared bindings capture existing branch-change and branch/keyspace
config-change detail GETs, reusing the existing config binding parser. Closed host
snapshots retain immutable parent/change/keyspace IDs, names, revision and exact
config type/nullable-keyspace pairs. Empty caller arguments cannot retarget the
fixed requests or inject configuration/authority. Branch config requires vtgate/null;
keyspace config requires mysqld/vttablet and a matching keyspace name. Distinct
resource namespaces preserve record-kind separation; full plan hashes bind every
variable field, including independently supplied IDs absent from the response.

`test/core-change-read-preparation.test.mjs` adds 28 synthetic contracts covering
fixed requests, deep capture, hash sensitivity, missing/extra/accessor/unsafe-input
refusals, canary omission, response record/type/keyspace rebound and scope mismatch.
Parent/keyspace immutable response identity and non-waking semantics remain
unverified. State/type never grants configuration, cancellation, resize, spend or
native approval authority. These are source contracts requiring exact-head Actions,
not an executed result, transport, executor, registration or live-use grant.
Coverage stays **134/291 offline adapters; 157 missing**, twelve previews and
32 pure preparations, zero runtime-integrated/reviewed/enabled/adopted.

## Exact prerequisites and accountable roles

| Missing evidence/implementation | Accountable role | Release condition |
| --- | --- | --- |
| Current credential kind/scope/entitlement receipt | Operator | Non-secret, dated metadata naming existing binding identity, provider/resource classification, service-token grants or OAuth scopes, expiry/restrictions; unknowns retained |
| Reviewed compatible versioned provider interface | Common-core maintainer | Pinned reviewed core with native identity/policy/approval/audit and contract fixtures; no mock authority in production |
| 157 adapters, remaining optional capabilities and per-operation tier classification | PlanetScale package builder | Every entitled operation implemented with closed schemas, resource boundaries, projections/placement, tests and validated plan/diff semantics; explicit unsupported areas retain prerequisites |
| Reserved-operation authority and replay/TOCTOU tests | Common-core maintainer + package builder | Actual target-native authority path demonstrated for each applicable tier, not a boolean or self-issued grant |
| Non-waking metadata semantics | Package builder + Operator | Operation-specific provider evidence; GET method alone is insufficient |
| Fixed catalog/ACL metadata | Package builder + Operator | Nine offline PostgreSQL catalog artifacts exist, not an executor or effective-ACL implementation; native credential-hidden connector, exact staging allowlist/window, caps and closure evidence remain missing |
| Exact-head full-suite and required checks | Package builder | GitHub Actions run/job links, Devin and rulesets satisfied; no local substitute |
| Independent complete-package/tier reviews | Security, Crypto, final QA | Exact source/core/API pin and configuration envelope accepted, findings dispositioned |
| Runtime install/enablement and production actions | Operator + Release Manager as applicable | Exact-artifact native authorizations and qualification receipts; no implied authority from source merge |

No new credential is requested. Existing scope is a ceiling, not permission to
expand it. Discovery yielded no matching PlanetScale connection; unrelated
connections are not a supported route. Do not bypass discovery by reading raw
keys, creating a replacement connector or making an unauthenticated assumption.

## Catalog coverage: fixed outputs, no SQL escape hatch

| Required capability | Current state | Required implementation/evidence |
| --- | --- | --- |
| Relation existence | Offline control-plane projection only | API semantics/non-waking validation; namespace/keyspace disambiguation and reviewed core policy |
| Schema/namespace existence | Offline PostgreSQL namespace rows only; completeness unverified | Actual supported connector, fixed existence/visibility semantics and reviewed bounded staging policy |
| Role metadata | Offline API metadata and fixed PostgreSQL attribute/membership artifacts | Actual entitlement and reviewed authorization; no passwords, hashes, DSNs or addresses |
| Effective direct/transitive ACL | Missing evaluator; offline direct/default/function/database/column ACL artifacts only | PUBLIC/type-default/ownership expansion, role closure/cycle/SET/ADMIN handling and direct/effective distinctions; portable receipts and engine-specific tests |
| Non-secret binding identity | Configured API resource target and offline SQL current/session identity artifact only | Operator-verified immutable branch/database/principal/reference receipt and native current caller/resource resolution |

A main credential's control-plane permissions do not establish SQL data-plane
access. Metadata SQL can wake compute and is never labeled non-waking. SQL needs
an exact staging resource allowlist and approved bounded window, server-enforced
read-only transactions, statement/lock/row/byte/page/time caps and native closure
evidence. No customer rows, password/hash values, DSNs or caller SQL; no silent
API-to-SQL fallback. A production-classified branch remains production regardless
of a database's staging-like name, and uses its own Release Manager gate.

## Shared-core map-format source increment

`api/core-operation-map.json` projects all 291 official operations into the
inspected `toolkit.provider-broker/v1` OperationMap format, pinned to core commit
`a838436aa4492c77dc7fb995bc776ec7c7d922e7` and coverage source SHA-256
`6e96d7ab98ceb630af33007134bff79c996963c9a0deab23cee21db3f1110e68`.
Source-format contracts cover exact inventory/closed fields/reference,
source pin/pending runtime integration, tool/scope/effects, offline test tuples,
incomplete/unknown/unreviewed/disabled state, retained prerequisites and the
read-entitled destructive-report control. Additional contracts now import the
actual compiled shared validator, verify the pinned source hash and require all
291 rows to remain incomplete. Malformed inventory, extra fields, enabled/reviewed
claim inflation and destructive-tier downgrades must refuse. Exact-head Actions
must execute these contracts; source alone is not a passing result.

All entries use a conservative reserved/native metadata envelope, not accepted
tier classifications or a runtime registry. None is claimed implemented or
prohibited to satisfy completeness. Path-parameter scopes are not immutable
resource bindings. The detailed provider map retains actual candidate routes and
conjunctive obligations; 134 provisional read / 25 unreviewed reserved / 132
unresolved is unchanged. Twelve pure previews stay separate from 134/291 bounded
offline adapters and 157 missing adapters. Zero integrated/reviewed/enabled/adopted.
No host, credential, authority, journal, audit, transport or executor was added.
Two additional pure Prepared bindings capture bounded backup creation and
migration-safety removal, completing preparation seams for the twelve existing
previews only. The shared closed branch parser captures target/revision without
a dummy request or deletion-only restrictions. Backup arguments retain name and
1–24 integer retention hours with a fixed non-emergency request; safety removal
requires safeMigrations=true and empty arguments. RM + owner-money and RM +
owner-security obligations remain conjunctive and unconsumed, including development
branches. Seventeen synthetic contracts in `test/core-branch-effect-preparation.test.mjs`
cover deep host/caller snapshots, complete previews, fixed requests, closed
injection/accessor refusal, required identities/revisions, target/argument hash
sensitivity, retention bounds, state refusal and shared-resource cross-operation
hash separation. This is not a cost estimate, approval, provider precondition,
executor or runtime integration; exact-head Actions execution remains required.
Two additional pure configuration-cancellation bindings retain closed captured
change/revision snapshots in distinct branch/keyspace resource namespaces and the
complete fixed bodyless DELETE preview. Sixteen synthetic contracts in
`test/core-configuration-cancel-preparation.test.mjs` cover retained RM obligations,
deep immutability, caller/host injection and accessor refusal, complete identity,
hash sensitivity, determinism, type separation and unsupported-state refusal.
Only draft/pending and the existing vtgate versus mysqld/vttablet restrictions bind.
Independent conjunctive effect classification, current identity/state and provider
preconditions remain unresolved; no executor, approval consumption, rollback or
unchanged-settings guarantee. Execution evidence requires exact-head Actions.
One pure branch-delete preparation now binds a closed trusted branch ID/revision
snapshot into `Prepared`, retaining the full fixed preview and RM obligation.
Six contracts cover fixed request, deep immutability, caller injection/accessors,
protection/invalid targets, core hash sensitivity and determinism. This has no
execute/project hook, registry, approval consumption or freshness guarantee and
does not increase adapter coverage. Two additional pure preparation bindings now cover the existing backup and
backup-policy deletion previews. Their distinct immutable-ID resource namespaces
and revision bind the complete preview, including parent IDs/names and production
classification. All RM and owner-security obligations remain conjunctive and
unconsumed. Binding refuses required policies and protected/required/non-success
backups; caller arguments remain empty. `test/core-backup-preparation.test.mjs`
adds fifteen synthetic contracts for exact previews, deep immutable snapshots,
caller injection, complete host identity/revision, non-invoked accessors, core
hash sensitivity, determinism, production obligations and cross-operation
collision/refusal. Existing branch preparation uses the same JSON-checked wrapper
without changing its contract; backup preview return types retain specific target
identity types without runtime changes. These are source contracts, not an
executed test result until exact-head Actions qualifies them. They add no executor,
registration, credential, approval consumption or adapter coverage. Additional
per-operation preparation and accepted host/provider revalidation remain
incomplete. Complete-package and live gates remain above.

Two more pure bindings retain existing deploy-request close/cancel previews in
`Prepared`. Both use the same immutable deploy-request ID resource namespace;
full-preview hashes distinguish operations, number-addressed paths, verbs/bodies,
source/destination IDs/names, revision, production classification and permitted
state snapshots. Close binds only pending/ready/no_changes; cancel binds only
queued. Deleted/ambiguous branches and closed/started/terminal requests refuse.
`test/core-deployment-stop-preparation.test.mjs` adds sixteen synthetic contracts
for complete preview/RM obligations, deep snapshots (including the close body),
closed arguments/host identity, non-invoked accessors, hash sensitivity,
determinism, cross-state refusal and operation distinction on the same resource.
There is no executor, approval consumption, provider dry-run, registry or adapter
coverage increase. Hashes do not authenticate current ownership, request
ID/number mapping, independent destination binding, freshness, remote
preconditions, rollback or closure. Exact-head Actions evidence remains required.

Three more pure bindings retain individual change cancellation, query-report
deletion and schema-recommendation dismissal previews. Resource namespaces use
immutable change/report/recommendation IDs; full hashes also bind parent and
target identity, revision/classification, operation and fixed request. Recommendation
paths address a sequence number, not that immutable ID; both remain bound without
claiming the mapping is current. The 25 synthetic contracts in
`test/core-record-mutation-preparation.test.mjs` cover deep snapshots, empty
arguments, host/caller injection and accessor refusal, hash sensitivity, documented
type pairs, local state restrictions, ID/number separation and cross-kind refusal.
RM obligations remain unconsumed. Destructive report deletion stays reserved despite
its documented read entitlement. No executor, provider precondition, approval
consumption, registry, source-adapter coverage or runtime integration is added.
Exact-head Actions must execute these contracts before any passing result is claimed.

The actual PR merge conflict required consuming current main, including the
already-merged provider core and Neon package. The lock resolution retains both
Neon and PlanetScale workspace records; no external version, integrity, install
script policy or dependency was changed and no local install/build/suite ran.
Exact-head Actions must qualify the reconciled source; earlier results do not
qualify the merge or new contracts.

## Schema-recommendation dismissal preview source increment

`src/recommendation-dismissal-plan.ts` adds one preview-only subset and ten
synthetic contracts. Closed immutable database/recommendation IDs, sequence,
revision and production snapshot; open-only local refusal, empty arguments and
fixed number-addressed POST with an empty body. Optional reason/DDL/free text,
executor, response projection, authority consumption and provider dry-run are
absent. The provider response lacks database identity: independent trusted
parent and current ID/number mapping remain required. Open state does not prove
freshness or remote preconditions; dismissal is not DDL execution, resolution,
rollback or authority to waive a security obligation.

RM plus independently classified security/spend/host obligations remain unreviewed
candidates. Twelve plan-only subsets stay separate from **134/291 bounded offline
adapters; 157 missing** (15 GETs, 142 mutations). Tiers: 134 provisional read /
25 unreviewed reserved / 132 unresolved; zero integrated/reviewed/enabled/adopted.
Tests cover closed inputs/accessors/canaries, identity and safe-integer sequence,
immutable snapshots, production obligations, official endpoint/optional-body
agreement and missing/disabled/unreviewed map status. Exact-head Actions must
execute these contracts; no local suite/build/typecheck/CI mirror ran.

Prior exact `8d8c68a438263c59446434a1cb6b92cc7895a252`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42484447480)
passed test/lint/typecheck/native-policy/ci-ok, including
[1011/1011 PlanetScale tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42484447480/job/128743195825),
root 181/181, helpers 122/122 and GitHub broker 219/219, zero failures/skips.
All three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42484421873)
passed. This is historical evidence, not a new-head result or live acceptance.

## Query-report deletion preview source increment

`src/query-report-deletion-plan.ts` adds one preview-only subset and ten synthetic
contracts. Closed immutable database/branch/report identity and revision snapshots,
empty arguments and fixed bodyless DELETE by report ID; completed/failed only.
Pending/unknown states refuse as broker-narrow rules, not official guarantees of
remote preconditions. Parent IDs are not in the report response; independent trusted
bindings remain required. No URL/download, SQL/report data, executor, authority
consumption or provider dry-run is supplied.

The official endpoint lists `read_branch` entitlement despite destructive behavior.
A dedicated contract preserves reserved classification and RM plus conjunctive
security/spend/host obligations, never read authority. Report removal does not prove
query-data deletion, download revocation or closure. Native policy/approval binding,
current independent identity/state revalidation and uncertain-outcome recovery remain
missing. Eleven local plans stay separate from **134/291 bounded offline adapters;
157 missing** (15 GETs, 142 mutations). Tiers: 134 provisional read / 24 unreviewed
reserved / 133 unresolved; zero integrated/reviewed/enabled/adopted. New contracts
require exact-head Actions; no local suite/build/typecheck/CI mirror ran.

Prior exact `ee759faf807d550d6d906c4ae6a6336b8dfd602e`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42482850289)
passed test/lint/typecheck/native-policy/ci-ok, including
[1001/1001 PlanetScale tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42482850289/job/128738394476),
root 181/181, helpers 122/122 and GitHub broker 219/219, zero failures/skips.
All three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42482809734)
passed. Historical evidence is not the new-head result. No earlier SDK/download
repair claim, native approval or runtime enablement is inferred.

## Individual change-request cancellation preview source increment

`src/change-cancel-plan.ts` adds one preview-only subset and ten synthetic
contracts. Closed immutable snapshots bind database/branch/request/target IDs,
parent and target names, revision, production, state and matching documented
request/target type pairs. Null target IDs refuse. Only draft/pending snapshots
with canDelete=true are accepted: these are broker-narrow refusal rules, not an
official guarantee of cancellability or native authority. Applying, terminal,
unknown/mismatched types, extra fields, accessors and all caller selectors refuse.
The proposed DELETE is bodyless and identifies one request by ID, never a legacy
collection resize cancellation. No parameters, SKU/configuration values, force,
executor, approval consumption or provider dry-run is supplied.

RM remains an unreviewed candidate plus independently classified conjunctive
security/spend/host effects. Cancelling a planned security improvement is not
inherently safe. Current independent parent/target ownership and state bindings,
native policy/approval binding and uncertain-outcome recovery remain missing;
a revision does not establish freshness, unchanged configuration, rollback or
closure. Ten local plans are separate from 134/291 bounded offline metadata
subsets; 157 adapters remain missing (15 GETs, 142 mutations). Tiers are now 134
provisional read / 23 unreviewed reserved / 134 unresolved; zero integrated,
reviewed, enabled or adopted. New contracts require exact-head Actions. No local
suite/build/typecheck/CI mirror ran.

Prior configuration head `dd8def6a2c379f6cd6f92105fddd4e5adfd82457`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42481386868)
passed test/lint/typecheck/native-policy/ci-ok, including
[991/991 PlanetScale tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42481386868/job/128733903431),
root 181/181, helpers 122/122 and GitHub broker 219/219, zero failures/skips.
All three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42481357293)
passed. This is prior-head evidence, not verification of the new increment;
final fresh-context/Devin/native specialist/merge gates remain.

## Configuration-cancellation preview source increment

`src/configuration-cancel-plans.ts` adds two preview-only subsets and 18 synthetic
contracts. Closed immutable snapshots bind database/branch/change IDs, parent
names, revision, state and production; keyspace cancellation independently binds
keyspace ID/name. Branch supports vtgate only and keyspace supports mysqld/vttablet
only. Official summaries allow draft/pending only; queued/applying/terminal states,
malformed IDs/flags/revision, accessors, extra fields and all caller selectors
refuse. Fixed bodyless DELETE paths have no force, config values or rollback path.
Parent/keyspace IDs require trusted independent binding, absent from the official
change-request response. No executor, approval consumption or provider dry-run.

Both retain unreviewed RM candidates plus independently classified conjunctive
security/spend/host effects. Cancelling a planned security improvement is not
inherently safe. Fresh identities/state, native policy/approval binding and
uncertain-outcome recovery remain prerequisites; snapshots never prove unchanged
configuration, rollback or closure. All-plan invariants preserve missing adapter
status and disabled/unreviewed state. Coverage remains 134/291 bounded metadata
subsets, 157 missing (15 GETs, 142 mutations); nine plans are separate. Tiers are
134 provisional read / 22 unreviewed reserved / 135 unresolved; zero integrated,
reviewed, enabled or adopted. New contracts require exact-head Actions; no local
suite/build/typecheck/CI mirror ran.

Prior deployment-stop head `880a061e11cc437da0afb3332c88b9a883f24811`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42479850171)
passed test/lint/typecheck/native-policy/ci-ok, including
[973/973 PlanetScale tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42479850171/job/128729240129),
root 181/181, helpers 122/122 and GitHub broker 219/219, zero failures/skips.
All three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42479836248)
passed. Historical evidence does not verify this new increment. Final
fresh-context/Devin/native specialist/merge gates remain.

## Deployment-stop preview source increment

`src/deployment-stop-plans.ts` adds two preview-only subsets and 18 synthetic
contracts. Immutable database/request/source/destination identities, number,
revision and exact state are broker-bound; arguments are empty. Close is limited
to open pending/ready/no_changes requests and fixed PATCH state=closed; cancel
to open queued requests and bodyless POST cancel. Deleted sources, equal branch
IDs/names, unknown fields, malformed identities/flags, closed requests and all
other deployment states refuse. No force/cutover/revert/executor/authority
consumption or provider dry-run. Destination ID is independently broker-bound,
not supplied by the official response; fresh binding/state and uncertain-outcome
recovery remain prerequisites. Reported queued state never proves deployment has
not begun, safe rollback, schema integrity or native closure.

Both retain unreviewed RM obligations, plus independently classified conjunctive
effects. Updated all-plan inventory contracts retain strict source/test mapping,
missing adapter status and disabled/unreviewed state. Coverage stays 134/291
bounded metadata subsets, 157 missing (15 GETs, 142 mutations); seven plans are
separate. Tiers are 134 provisional read / 20 unreviewed reserved / 137 unresolved;
zero integrated/reviewed/enabled/adopted. New contracts require fresh exact-head
Actions; no local suite/build/typecheck/CI mirror ran.

The prior snapshot repair head `2d99797f6346e18ee57ee23010b1fc8c7dbd1dd2`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42478257901)
passed test/lint/typecheck/native-policy/ci-ok, including
[955/955 PlanetScale tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42478257901/job/128724363514),
root 181/181, helpers 122/122 and GitHub broker 219/219, zero failures/skips.
All three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42478231400)
passed. This verifies the six snapshot assertion repairs, not live authority,
full-package completeness or an earlier download/SDK recovery fix. Final
fresh-context/Devin/native specialist/merge gates remain.

## Backup-deletion snapshot assertion repair

Source head `a49cc311dc46170e122f3a42d3cfca1e373b3aab`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42477111495/job/128720836108)
passed 949/955 PlanetScale tests and failed six new preview assertions. All six
compared a closed-schema null-prototype target snapshot with an ordinary fixture
object. The tests now explicitly require a null prototype and compare all own
snapshot values, preserving immutable target, production obligations and all
refusal assertions. No runtime/schema/tier or coverage change: 134/291 bounded
subsets, 157 missing, five plan-only subsets; zero enabled/adopted.

Root 181/181, helpers 122/122 and GitHub broker 219/219 passed at the source head;
lint/typecheck/native-policy and all three CodeQL analyses passed. Aggregate
correctly failed. Fresh repair-head Actions remains required; no local suite,
build, typecheck or CI mirror ran. Independent review and live-use gates remain.

## Backup-deletion preview source increment

`src/backup-deletion-plans.ts` adds two preview-only plans with 16 new synthetic
contracts in `test/backup-deletion-plans.test.mjs`. Exact broker-owned
parent/database/branch/backup/policy IDs and revision snapshots, empty arguments,
strict flags and fixed bodyless DELETE paths; refuse protected/required or
non-success backups and required policies. No force or unprotect path. Backup
removal retains RM, policy removal retains RM plus owner-security. These are
unreviewed candidate obligations, not issuance/consumption of native authority.
All plans explicitly retain execution not-implemented, remote preconditions
not-verified and provider dry-run not-performed. Tests cover input/refusal,
immutability, canary/accessor non-reflection, production non-downgrade, pinned
schema and missing/disabled inventory status. Existing plan invariants now cover
all five local plan subsets and preserve separate source/test mapping.

Coverage is unchanged: **134/291 offline bounded metadata subsets; 157 missing**
(15 GETs, 142 mutations). There are five plan-only subsets, separately counted,
18 unreviewed reserved-tier candidates and 139 unresolved tiers; zero integrated,
reviewed, enabled or adopted operations. New plans remain missing API adapters.
Table/keyspace-table metric endpoints have no documented successful response
schema and remain missing rather than borrowing another endpoint's contract.

Prior exact `61b0cd8de60898823644d1cdbc2a62da2029ce4c`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42475590553)
passed test/lint/typecheck/native-policy/ci-ok, including
[939/939 PlanetScale contracts](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42475590553/job/128716139264),
root 181/181, helpers 122/122 and GitHub broker 219/219. All three CodeQL analyses
passed. New contracts require fresh exact-head Actions; no local suite/build,
typecheck, CI mirror, authority enforcement or live provider operation ran.
Complete-package/tier specialist, fresh-context, Devin and merge gates remain.

## MoveTables map-contract regression repair

Source head `b41e164406d75eae2e47c948510bad3e3955d759`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42474363829/job/128712278835)
passed 938/939 PlanetScale tests, including all 16 new status contracts. The
schema-diagnostics map test still expected status to be missing alongside opaque
list/detail. It now distinguishes the exact bounded offline status adapter/test
and read tier from missing/unresolved list/detail, while requiring all three to
remain unreviewed/disabled with scope, core, review and workflow-contract
prerequisites. No operation implementation, tier, runtime policy or coverage
changed: 134/291 bounded subsets, 157 missing; zero enabled/adopted.

Root 181/181, helpers 122/122 and GitHub broker 219/219 passed at the source head;
lint/typecheck/native-policy and all three CodeQL analyses passed. Aggregate
correctly failed on the stale test. Repair-head Actions remains required; no
local suite/build/typecheck or CI mirror ran. Earlier download/SDK recovery
uncertainty and all independent review/live-use gates remain.

## MoveTables status availability source increment

`test/move-tables-status.test.mjs` adds 16 synthetic contracts for one fixed
offline status GET with required target_keyspace query. Closed arguments and
snapshotted branch/keyspace IDs plus workflow/target names; optional traffic
string and object-valued table/stream maps; safe integer/finite numeric copy
fields, caps, whole-response refusal, canaries, hostile scopes and pinned schema.
Only request-bound IDs and nonempty field-presence booleans survive; no names,
traffic text, progress or stream contents. Provenance and execution authority
remain not-established. The schema supplies no response identity, so current
ownership/name bindings, trusted request/response transport, raw-body custody,
collection authorization and non-waking proof remain prerequisites. Workflow
list/detail and full status capability remain incomplete.

Coverage: **134/291 bounded metadata subsets; 157 missing** (15 GETs, 142
mutations). Tiers 134 provisional read / 16 unreviewed reserved / 141 unresolved;
zero integrated/reviewed/enabled/adopted. New contracts require exact-head
Actions; no local suite/build/typecheck or CI mirror ran.

Prior exact `0a4d74e6bd036dc12d666ac00068a3ca364d66da`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42472979280/job/128707912361)
passed 923/923 PlanetScale, root 181/181, helpers 122/122 and GitHub broker
219/219; zero failures/cancellations/skips. All three
[CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42472968694)
passed. Aggregate attempt 1 failed before actionlint execution on download
timeouts/connection failure; the same-head failed-job rerun (attempt 2) passed
lint/typecheck/native-policy/ci-ok without source changes. This does not prove
the download failure repaired. Earlier SDK recovery cause remains unresolved. No inline findings
or submitted reviews returned; final fresh-context/Devin/native specialist
review and merge gates remain.

## Query/tag historical-metric availability source increment

Two fixed offline query/tag metric reads reuse the historical metric scope and
validator; no new parser, executor or authority path. The shared
`test/historical-metrics.test.mjs` adds 24 synthetic contracts for fixed paths,
closed arguments/scopes, immutable branch/window binding, canonical dates,
finite chronological samples, whole-response refusal, bounds, canaries and the
pinned official schema. The query/tag endpoints have optional selectors; this
subset deliberately supplies none. Branch-wide collection permission is required;
no query/tag isolation, response identity or provenance is established. Only
requestBranchId, selected metric, presence booleans and explicit not-established
health/provenance survive. No labels, samples, SQL, fingerprints, tag sets or times.
Optional filters and full capabilities remain incomplete.

Coverage: **133/291 bounded metadata subsets; 158 missing** (16 GETs, 142
mutations). Tiers 133 provisional read / 16 unreviewed reserved / 142 unresolved;
zero integrated/reviewed/enabled/adopted. New contracts require fresh exact-head
Actions; no local suite/build/typecheck or CI mirror ran.

Prior repair head `3a143d9098bfae86fccdd8e494797931775ee41e`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42471717435)
passed lint/typecheck/native-policy/ci-ok, including
[899/899 package tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42471717435/job/128703840310),
root 181/181, helpers 122/122 and GitHub broker 219/219; zero failures/skips.
Source head b844a1f had one omitted exact-map fixture group, repaired at 3a143d9;
all 13 new topology contracts had passed. Repair-head CodeQL actions/Python
passed, but JS/TS failed before analysis on bundle download HTTP 504. One
failed-job retry request was refused: workflow cannot be retried. No source
CodeQL finding, pass or waiver inferred; fresh new-head analysis remains required.
No inline findings/reviews returned. Final fresh-context/Devin/native specialist
review and merge gates remain; earlier SDK recovery cause is unresolved.

## Data-topology availability source increment

`test/data-topology.test.mjs` adds 13 synthetic contracts for one fixed offline
read. Closed arguments, snapshotted branch ID/name scope, 32 top-level opaque
object entries, 80-character nullable sync string and shared 64 KiB wire cap.
Only nonempty object/string presence and request-bound branch ID survive;
no topology keys/contents/timestamps, freshness, verified provenance or authority.
Opaque nested values are not interpreted as typed topology. Required object/sync
shapes, caps, decoding, hostile scopes/arguments and mutation are covered.
Current ownership, collection permission, trusted transport/request binding,
raw-body custody and non-waking semantics remain prerequisites. Full topology
inspection/validation/mutation is incomplete.

Coverage: **131/291 bounded metadata subsets; 160 missing** (18 GETs, 142
mutations). Tiers 131 provisional read / 16 unreviewed reserved / 144 unresolved;
zero integrated/reviewed/enabled/adopted. Fresh exact-head Actions execution is
required for the new contracts; no local suite/build/typecheck or CI mirror ran.

Prior exact `c5ee43e35a93143c2c2d0c4bd84595b9ffa7575a`
[Actions CI attempt 2](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42470261766/attempts/2)
passed test/lint/typecheck/native-policy/ci-ok; all three CodeQL analyses passed.
The original [test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42470261766/job/128699171930)
passed 886/886 PlanetScale, root 181/181, helpers 122/122, GitHub broker 219/219,
zero failures/cancellations/skips. Attempt 1 failed before lint after four bounded
actionlint download HTTP 504s; retry success is not a source repair or future
availability guarantee. No inline findings or submitted reviews returned;
final fresh-context/Devin/native Security/Crypto/QA and merge gates remain.

## Keyspace VSchema availability source increment

`test/keyspace-vschema.test.mjs` adds 12 synthetic contracts for one fixed
keyspace VSchema read. Reuses snapshotted keyspace ID/name scope, closed empty
arguments and shared 64 KiB wire cap. Required raw text is bounded at 32,768
UTF-16 code units; only nonempty presence and requestKeyspaceId survive, with
provenance/executionAuthority not-established. No raw schema/table/vindex text,
validation/execution, routing health, completeness or authority claim. Invalid
nonempty text remains presence only. No response identity is documented, so
trusted response/request transport binding and fresh parent/keyspace ownership
remain prerequisites, along with raw-body custody and non-waking proof. Full
VSchema content/validation/mutation capability remains incomplete.

Coverage: **130/291 bounded metadata subsets; 161 missing** (19 GETs, 142
mutations). Tiers 130 provisional read / 16 unreviewed reserved / 145 unresolved;
zero integrated/reviewed/enabled/adopted. New contracts require fresh exact-head
Actions; no local suite/build/typecheck or CI mirror ran.

Prior exact `0f81ae152b476d05156106582e2d5ddb57c08cd3`
[Actions CI attempt 2](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42468883755/attempts/2)
passed test/lint/typecheck/native-policy/ci-ok. The previous
[test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42468883755/job/128694751123)
passed 874/874 package tests, root 181/181, helpers 122/122 and GitHub broker
219/219, zero failures/skips. Exact-head CodeQL actions/JS/TS/Python passed.
Attempt 1's four bounded actionlint download HTTP 504 failures remain history;
retry success is not a new source repair or proof of all future downloads.
No inline review findings returned; final fresh-context/Devin/native specialist
review and merge gates remain outstanding. Earlier SDK recovery cause unresolved.

## Historical-metric availability source increment

`test/historical-metrics.test.mjs` adds 22 synthetic contracts for two fixed
branch/tablet historical reads. Broker-bound metric subsets (queries/query_errors
or replication_lag/primary_cpu_usage), canonical UTC from/to, positive <=15 minute
window and fixed steps=16. Whole-response refusal on mismatched times/metric,
malformed type/interval/series or nonfinite, out-of-window, duplicate/unordered
point timestamps. Caps: eight series, sixteen points each, 64 KiB wire. Only
requestBranchId/metric and series/sample-presence flags survive, with explicit
health/provenance not-established. Values, labels, pod/role/query details and
timestamps are omitted; no native authority, completeness or operational health.

MetricSeries has no branch identity. The request ID is never represented as a
verified response identity. Trusted response/request transport provenance, fresh
branch ownership, branch-wide collection permission, raw-body custody and
non-waking semantics remain implementation/acceptance prerequisites. Other
metrics/filters/windows, query/tag metrics and full capability stay incomplete.
Coverage: 129/291 bounded metadata subsets, 162 missing (20 GETs, 142 mutations);
tiers 129 provisional read / 16 unreviewed reserved / 146 unresolved. Zero
integrated/reviewed/enabled/adopted.

Previous exact repair head `13bb83ceeb8e52ed5c044de38d0af38dc01d8e77`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42467427310)
passed test/lint/typecheck/native-policy/ci-ok: root 181/181, helpers 122/122,
GitHub broker 219/219, PlanetScale 852/852, zero failures/skips. CodeQL actions
and JS/TS passed, but [Python initialization](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42467408383/job/128690035715)
failed downloading its bundle with repeated HTTP 504, before analysis. GitHub
refused the one failed-job rerun request: this run cannot be retried. No analysis
pass, security waiver or repair is claimed. New-head Actions evidence remains
required for these new fixtures and full checks; no local suite/build/typecheck
or CI mirror ran. Earlier SDK recovery cause remains unresolved.

Initial historical head `f7f0617e280f10bf1ff60160ee0212da02249d98`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42468792605/job/128694459028)
passed 872/874 package tests but failed two stale mutation-plan map assertions:
`get_branch_metrics` was still hardcoded as unresolved/missing after receiving
its adapter. Replaced both brittle single-operation controls with nonempty,
all-missing-GET / all-unresolved-GET invariants; preserved the all-read
unreviewed/disabled invariant and protected-operation obligations. No authority
or runtime policy changed. Lint/typecheck and native-policy passed; aggregate
failed as required. Fresh repair-head Actions evidence is still required.

## CI download resilience repair

Exact source `69e169665ad5ef98e4ccdd1457dd4b801860a847`
[Actions attempt 2](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42466252743/attempts/2)
failed again before actionlint execution: its pinned release download returned
HTTP 504. The test job passed 852/852 package tests, root 180/180, helpers
122/122 and GitHub broker 219/219; CodeQL passed. Aggregate CI was not green.

The workflow now permits three curl retries for transient download errors, with
90-second retry budget, 10-second connection and 30-second per-transfer limits.
The exact release and SHA256 verification before extraction/execution remain
unchanged, as do fail-closed shell behavior, lint execution and aggregate gates.
A root workflow regression contract checks those bounds and the preserved pin,
checksum order and lint execution. No dependency version or authority changed.
The repair and new contract require fresh exact-head Actions evidence; no local
suite/build/typecheck/CI mirror ran. Coverage remains 127/291 bounded metadata
subsets, 164 missing, zero integrated/reviewed/enabled/adopted.

## Instant-metric availability metadata source increment

`test/instant-metrics.test.mjs` adds 18 synthetic contracts for two fixed
instant branch/tablet reads. A single broker-bound documented metric enum is
sent with immutable branch ID/name bindings; no caller filter or metric override.
The whole response refuses on rebound identity, unexpected/duplicate metrics,
malformed samples or caps (one metric, 32 samples, 64 KiB wire). Output is only
bound branch ID, metric enum and samples-present boolean, plus
`health: not-established`. Values/pods/roles/labels/times are never returned;
sample presence proves neither freshness, health, restore completion nor closure.
Missing metric rows and empty samples remain distinct, neither is an error state.
Full metrics capability, optional filters and historical metrics stay incomplete.
Current ownership, raw-body custody, collection authority and non-waking evidence
remain prerequisites; no resource-level filter isolation is claimed.

Coverage: 127/291 bounded metadata subsets, 164 missing (22 GETs, 142 mutations);
tiers 127 provisional read / 16 unreviewed reserved / 148 unresolved. Zero
integrated/reviewed/enabled/adopted. Previous query-budget head `a9617f5`
[Actions test job](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42464869419/job/128681955303)
passed. Aggregate attempt 1 failed because pinned actionlint download returned
HTTP 504 before lint execution. The one same-head failed-job retry
[passed](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42464869419/attempts/2),
including lint/typecheck, native-policy and ci-ok; test evidence is 834/834 package
tests, root 180/180, helpers 122/122 and GitHub broker 219/219, zero failures/skips.
No source repair is claimed. These new fixtures still require exact-head Actions
execution. No local suite/build/typecheck/CI mirror ran.

## Query-specific traffic-budget metadata source increment

`test/query-traffic-budgets.test.mjs` adds 12 synthetic contracts for the fixed
query-specific budget list. Required broker-bound fingerprint/keyspace context,
immutable unique budget IDs, closed arguments, bounded pages and whole-page
identity/duplicate refusal reuse the existing traffic-budget projection. Output
contains only bound ID, strict mode and `effectiveEnforcement: not-established`.
SQL/rules/tags/limits/actors/times and query context are omitted. Rules are not
interpreted; response provenance, current context/budget ownership, collection
permission and raw-body custody remain required. A reported mode establishes
neither effective enforcement nor applicability. Unfiltered query-wide selection,
other selector formats and full capability remain incomplete.

Coverage: 125/291 bounded metadata subsets, 166 missing (24 GETs, 142 mutations);
tiers 125 provisional read / 16 unreviewed reserved / 150 unresolved. Zero
integrated/reviewed/enabled/adopted. Prior query-tag head
`ede7454a6e08bd0ce7584ac97fab9b05d1a72d19` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42463506080),
including [822/822 package tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42463506080/job/128677699476),
lint/typecheck, native-policy and ci-ok. That is not execution evidence for these
new fixtures; exact-head Actions must execute them. No local suite/build/typecheck
ran. No runtime, non-waking or live-use gate changed.

## Query-tag metadata source increment

`test/query-tags.test.mjs` adds 17 synthetic contracts for fixed tag list/detail
metadata. Broker-owned ID/name pairs are immutable and independently checked;
the detail path uses the name, never the ID, and refuses the reserved static
`summaries` route. Output is only the bound ID and strict `sql`/`system` source,
plus `executionAuthority: not-established`. Tag names/values, dimensions,
counts, actors and times are omitted. Whole-page identity/duplicate refusal,
wire/page caps, closed arguments/scopes, accessor/injection rejection and pinned
official schema/path agreement are covered. The first page reuses the documented
nullable/optional envelope validator; no URL following or completeness claim.
Other selector formats, filters/later pages and full capability remain incomplete.

Grouped tag summaries remain missing/unresolved: official rows have untyped
`dimensions` and no stable ID. The package builder owns a reviewed bounded
dimensions identity/safe-projection and raw-value custody/refusal contract before
implementation; the precise prerequisite is in the operation map. No adapter or
coverage is invented. Parent ownership/collection permission, raw-body custody,
non-waking evidence and every native live-use gate remain prerequisites.

Coverage: 124/291 bounded metadata subsets, 167 missing; tiers 124 provisional
read / 16 unreviewed reserved / 151 unresolved. Zero integrated/reviewed/enabled/
adopted. Prior fingerprint head `b747003fb6c2c1147ff221995c2533f29176b3a8`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42462000406)
passed [805/805 package tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42462000406/job/128673127480),
lint/typecheck, native-policy and ci-ok. That is not execution evidence for these
new fixtures; exact-head Actions must execute them. No local suite/build/typecheck
ran. No runtime or live-use gate changed.

## Query-fingerprint statistics metadata source increment

`test/query-statistics.test.mjs` adds 17 synthetic contracts for fixed query
statistics first-page and fingerprint-summary reads. Both require broker-bound
fingerprint and keyspace, match them on every response row, and independently
bind summary/query IDs. Only bound IDs and strict metadata flags survive; SQL,
password objects, fingerprints, keyspace text, metrics and times are omitted.
Closed arguments reject filters, pagination and authority overrides. Immutable
scopes, whole-page identity/duplicate refusal, wire/page caps and pinned official
required-selector/schema agreement are covered. The statistics page reuses the
existing `PaginatedQuery` first-page validator; no provider URL is followed.
Metadata flags never grant EXPLAIN, replay or execution authority. Other selector
formats, optional filters/later pages and full insights capability remain
incomplete. Parent ownership, independent collection permission, broker-side
raw-body custody and operation-specific non-waking evidence remain prerequisites.

Coverage: 122/291 bounded metadata subsets, 169 missing; tiers 122 provisional
read / 16 unreviewed reserved / 153 unresolved. Zero integrated/reviewed/enabled/
adopted. Prior query-error head `bd4d096a5f4ebb84bc32c890006495e343fd9318`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42461479925)
passed [788/788 package tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42461479925/job/128671528254),
lint/typecheck, native-policy and ci-ok; that is not execution evidence for these
new fixtures. Exact-head Actions must execute them. No local suite, build or
typecheck ran, and no runtime or live-use gate changed.

## Query-error metadata source increment

`test/query-errors.test.mjs` adds 17 synthetic contracts for fixed first-page
error-summary and error-fingerprint query reads. Immutable summary ID/fingerprint
pairs and separately bound query IDs, strict flags, closed arguments/scopes,
whole-page refusal, pagination/wire caps and official schema/path agreement are
covered. Error text, SQL, password objects, fingerprints and operational details
are omitted. Query fingerprints differ from error fingerprints; no error
provenance, collection completeness or native authority is established. Provider
URLs are ignored. Fingerprint grammar is deliberately bounded; other formats,
filters/later pages and full insights capability remain incomplete. Parent
ownership, independently authorized collection, broker custody and non-waking
semantics remain prerequisites. The inventory's unresolved-read control now uses
still-missing `get_branch_metrics`, preserving the all-read disabled invariant.

Coverage: 120/291 bounded metadata subsets, 171 missing; tiers 120 provisional
read / 16 unreviewed reserved / 155 unresolved. Zero integrated/reviewed/enabled/
adopted. Exact-head Actions must execute these fixtures; no local suite, build or
typecheck ran. This does not change any runtime or live-use gate.

## Query-record inventory regression repair

The query-record head `2c310b3e8b7bc94cfbca513257463114bcb420eb`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42459004355/job/128664091478)
failed because the mutation-plan inventory test still expected `get_branch_query`
to be unresolved after its offline adapter was added. The unresolved-read control
was changed to then-missing `get_branch_query_error`. A separate invariant checks
that every provisional read remains an unreviewed, disabled, bounded offline
adapter. Repair head `3185329ff7c48aa3cb1673331f977aad11bd63b2` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42460119812),
including 771/771 package tests. The query-error increment above moves that
negative control to still-missing branch metrics. No runtime policy changed;
no local suite, build or typecheck was run.

## Query-record metadata source increment

`test/query-records.test.mjs` adds 17 synthetic contracts for a fixed first query
summary page and one individual-query read. Separate broker-bound summary/query
IDs, strict flags, immutable snapshots, closed arguments/scopes, whole-page
refusal, wire/row caps and pinned official schema/path agreement are covered.
The summary envelope is `type/next_page/prev_page/data`, not the generic page
helper. SQL/password/fingerprint/tag/address/user/table/metric/time subtrees are
omitted. First-page-only coverage never claims completeness; flags never grant
EXPLAIN, execution, replay, remediation or native approval authority. Current
parent ownership, independent collection permission, broker-side raw-response
custody and non-waking evidence remain integration prerequisites. Later pages,
filters and full insights capability remain incomplete.

Coverage is 118/291 bounded subsets, 173 missing; tiers 118 provisional read /
16 unreviewed reserved / 157 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite/build/typecheck ran. Prior
audit head `f5c5f9fae00993038e3e3a65d59ee627f938f96b` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42457725362),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42457725362/job/128660235935),
lint/typecheck, native-policy and ci-ok. That does not execute these new fixtures.

## Audit-event metadata source increment

`test/audit-events.test.mjs` adds 12 synthetic contracts for the fixed
organization audit-log first page: immutable unique bound IDs, closed scopes
and arguments, whole-page refusal, wire/row caps, cursor-envelope validation,
action-presence projection and pinned official scope/path/schema agreement.
Actor/target/network/action/change/timestamp subtrees are omitted. The explicit
`integrity: not-established` and first-page-only coverage never prove event
integrity, authorization, completeness, enforcement or closure. Distinct
`read_audit_logs` entitlement, organization collection authorization, trusted
parent ownership, raw-response custody and non-waking evidence remain required.
Later pages and full audit-log capability remain incomplete.

Coverage is 116/291 bounded subsets, 175 missing; tiers 116 provisional read /
16 unreviewed reserved / 159 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite/build/typecheck ran. Prior
Vitess head `c62be55a381b4c2b63dedc7db457bfbb423d4672` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42456472966),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42456472966/job/128656478573),
lint/typecheck, native-policy and ci-ok. That does not execute these new fixtures.

## Vitess parameter metadata source increment

`test/vitess-parameters.test.mjs` adds 16 synthetic contracts for one fixed branch
read: immutable broker-owned component/name/keyspace bindings, strict documented
type and override flag, whole-result refusal, duplicate/collection/wire caps,
closed arguments/scopes and pinned official schema agreement. VTGate and keyspace
VTTablet/MySQL components stay separate; the official description specifies the
same parameter format. Values/defaults/options/titles/descriptions are omitted.
Empty scopes/results do not prove completeness. Names are not immutable resource
IDs; `configurationAuthority: not-established` never grants configuration,
restart, effective enforcement, wake or spend authority. Current parent/engine
ownership, independent collection permission, raw-body custody and operation-specific
non-waking evidence remain integration prerequisites. Full capability remains missing.

Coverage is 115/291 bounded subsets, 176 missing; tiers 115 provisional read /
16 unreviewed reserved / 160 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite/build/typecheck ran. Prior
anomaly head `dca230d7f8f0586d9b34109a01e4a92348d5f014` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42455187585),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42455187585/job/128652591516),
lint/typecheck, native-policy and ci-ok. That does not execute these new fixtures.

## Anomaly metadata source increment

`test/anomalies.test.mjs` adds 17 synthetic contracts for branch-anomaly list/get
metadata: bound IDs, strict active flag, whole-page refusal, immutable snapshots,
closed arguments/scopes, wire/page caps and pinned official path/field agreement.
SQL correlations/fingerprints, keyspaces, metrics and timestamps are omitted.
`remediationAuthority: not-established` never grants action authority or proves
recovery, safe retry or native closure. Empty/last pages are not scope-completeness
evidence. Current parent ownership, independent collection permission, raw-body
custody, reflection guards and non-waking evidence remain integration prerequisites.
Optional time/period filters and full anomaly/insights capability remain incomplete.

Coverage is 114/291 bounded subsets, 177 missing; tiers 114 provisional read /
16 unreviewed reserved / 161 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite/build/typecheck ran. Prior
schema-diagnostic head `59bcc959e3e746704946cb1c79869c41fb555afe` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42453932641),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42453932641/job/128648844149),
lint/typecheck, native-policy and ci-ok. That does not execute these new fixtures.

## Schema diagnostic metadata source increment

`test/schema-diagnostics.test.mjs` adds 19 synthetic contracts for two fixed
schema-lint/deploy-storage reads and explicit workflow contract gaps. Lint output
contains only allowlisted keyspace names and documented subject-type enums, with
bounded explicit pagination and whole-page refusal. Repeated subjects remain
separate diagnostics; no error-code enum is invented. Error codes/descriptions,
table/column names, DDL, URLs and other arbitrary strings are omitted. Empty/last
pages are not a safe-schema, effective-rights or scope-completeness receipt.
Storage output contains only strict enough-storage/upgradeable booleans, never
bytes, capacity, per-keyspace/shard details or an invented response identity.
`deploymentAuthority: not-established` never grants deployment, safety weakening,
upgrade, wake or spend authority. Fixed paths and request numbers do not prove
current immutable request/target/branch ownership. Trusted current bindings,
independent collection permission, raw-body custody, reflection guards and
operation-specific non-waking evidence remain integration prerequisites.

Coverage is 112/291 bounded subsets, 179 missing; tiers 112 provisional read /
16 unreviewed reserved / 163 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite/build/typecheck ran. Prior
query-report head `8afee10fd0b3da3edc018eb5e2ac22292b309cea` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42452587241),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42452587241/job/128644795552),
lint/typecheck, native-policy and ci-ok. That does not execute these new fixtures.

Move-tables list/get schema records expose only opaque additional-properties
objects; status exposes free-text traffic state and table/shard-keyed objects.
All three reads were missing at this increment. The later status increment
above adds bounded availability only; opaque list/detail still remain missing,
not generic JSON/count adapters. The package builder retains the reviewed Vitess
workflow identity/state/safe-projection prerequisite for full capabilities. No
live investigation, arbitrary object reflection or parallel implementation chain
is commissioned by this precise source prerequisite.

## Query report metadata source increment

`test/query-reports.test.mjs` adds 19 synthetic contracts for report status and
first-page list metadata. Output is bound report ID/state only; URLs, actor, SQL
and timestamps are omitted. Collections snapshot 1–32 unique IDs and refuse the
whole page on unknown/duplicate/invalid rows. The official cursor envelope is
validated, but only the first page with fixed `limit=10` is supported: no numeric
pagination, cursor/URL following or completeness claim. `hasMore` remains explicit.
Download is officially 302-only and remains missing pending a reviewed redirect/
custody contract. Completed/failed states never establish download authority,
safe retry or native closure. Current parent ownership, independent collection
permission, raw-body custody, reflection guards and non-waking semantics remain
prerequisites. Coverage is 110/291 bounded subsets, 181 missing; tiers 110 provisional
read / 16 unreviewed reserved / 165 unresolved. Zero integrated/reviewed/enabled/
adopted. Fresh exact-head Actions is required; no local suite/build/typecheck ran.
Prior admin/compute head `be4f0a15042be4fcd3f4c87f3d691f36f94a9096` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42450375071),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42450375071/job/128638124504),
lint/typecheck, native-policy and ci-ok. That does not execute these new fixtures.

## Compute catalog source increment

`test/compute-catalog.test.mjs` adds 32 synthetic contracts for fixed admin detail
and admin/router/cluster SKU lists. Admin ID and documented state are bound; SKU
names are snapshotted, bounded and unique, with enabled flags only where the
pinned schema supplies them. Collections are plain arrays capped at 32 rows and
64 KiB, not invented pages; unknown/duplicate/invalid rows refuse the entire
response. Repeat projections do not retain a seen-set across calls. Prices,
capacity, recommendations, provider/architecture and free text are omitted.
Cluster engine is broker-bound and `rates=false` fixed; optional filters and full
capability remain incomplete. Names are not immutable IDs, enabled/state is not
resize, restart, wake or spending authority. Current parent ownership, collection
permission, entitlement, native policy and non-waking evidence remain prerequisites.
Coverage is 108/291 bounded subsets, 183 missing; tiers 108 provisional read / 16
unreviewed reserved / 167 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite, build or authority test ran.
Prior traffic-budget head `0a6d6b92b88b446d1ebc4b695278955b0aded4d3` passed
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42449441865),
including [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42449441865/job/128635318048),
lint/typecheck, native-policy and ci-ok. That is not execution of these new fixtures.

## Tests and observations

`test/metadata.test.mjs` defines mocked contracts for all eight source adapters:
fixed origin/method/path, closed scope/argument shapes, resource mismatch,
pagination completeness/caps, invalid UTF-8/JSON/oversized bodies, secret fields
excluded from output, role enums and existence-only schema projection. The API-map
test checks unique operation/route coverage, source hash, separated permission
schemes, source paths and honest incomplete/review/enablement states.

These are **not** cross-agent or approval-replay tests. No registered native handler
exists yet. Such tests, durable contention/restart behavior, all tier authorization
and refusal cases, final secret-reflection enforcement, transport redirects,
provider errors, audit failure and write ambiguity remain required before delivery.
A synthetic canary in an ignored secret field only proves that projection, not
immunity to secret reflection in every selected field.

`test/catalog-artifacts.test.mjs` adds offline fixtures for all nine catalog
artifacts: fixed query hashes and source/column ceilings, closed arguments, strict
row types, NULL/PUBLIC ACL preservation, independent membership options, byte/row
overflow, malformed input and fixed errors. These fixtures do not execute SQL or
prove provider support, catalog completeness, effective rights or safe sessions.
PostgreSQL 17 compatibility, builtin/operator/cast dependency closure, engine
selection and additional catalog paths remain pre-enable prerequisites. Cap
refusal is explicit; large catalogs are not falsely marked complete.

The initial eight API adapters and nine catalog artifacts passed 60 mocked tests
in exact-head Actions at `14e0a22043c675b2113c7d6f393c989f73e2809a`. Six newer
adapters add `test/discovery.test.mjs`: exact fixed endpoints, parent/child scope
shape, child identity rebinding, whole-page refusal, scope snapshot immutability,
closed arguments, pagination/byte caps and default-role metadata redaction. These
new fixtures require fresh exact-head Actions; no local suite is substituted.
They do not demonstrate upstream collection authorization, non-waking semantics,
credential entitlement or an accepted default-role reuse principal. All fourteen
adapters expose only bounded metadata subsets; remaining optional filters and
full capability coverage remain incomplete. Native Security/Crypto/QA and
fresh-context review of the final diff remain required.

`test/lifecycle.test.mjs` adds synthetic contracts for six backup, backup-policy
and deploy-request list/get adapters. Exact IDs are broker-bound; deploy requests
also match number, source branch ID/name and target name. Fixtures cover mismatched
and duplicate bindings, whole-page refusal, schema/byte/page caps, immutable scope
snapshots, ignored free-text/secret fields and every pinned status enum. Provider
`approved` is not returned or treated as authority. These twenty adapters still
have no executor or native authorization; immutable target-branch identity, optional
filters, full policy schedules/retention and full-operation coverage are missing.
Fresh exact-head Actions execution is required; no local suite is substituted.

`test/deployment-details.test.mjs` adds 33 synthetic contracts for six more
bounded reads: deployment, deploy queue, operations, reviews and recommendation
list/get. They cover exact endpoints, identity and whole-page refusal, immutable
scope snapshots, wire/page caps, malformed/closed inputs, ignored DDL/free text,
duplicate ID/number bindings and pinned status/type enums. Provider review state
is informational and never native approval. Trusted parent-child ownership and
immutable destination revalidation are not supplied by these response schemas.
Coverage is 26/291 bounded API subsets, not full provider operations. Fresh
exact-head Actions is required; no local suite or native authorization is claimed.

`test/security-records.test.mjs` adds 33 synthetic contracts for service-token,
OAuth-token and webhook list/get projections. Tests cover exact pinned endpoints,
closed scope/arguments, whole-page ID refusal, immutable bindings, nullable fields,
wire/page limits and dropped token/refresh-token/webhook-secret/URL/actor/grant
canaries. Expiry/usage flags mean timestamp presence, never validity or effective
authority. No live secret-bearing response is fetched; raw-body custody, parent
ownership, collection authorization and final selected-field secret guarding are
still integration prerequisites. Coverage is now 32/291 bounded metadata subsets,
259 missing adapters, zero integrated/reviewed/enabled operations. Fresh exact-head
Actions is required; no local suite or native authority enforcement is claimed.

`test/topology.test.mjs` and `test/organization-records.test.mjs` add bounded
keyspace/shard/maintenance and membership/team/member contracts respectively. At
`bcc3af2afadb269965159079cb86a632282172b6`, [exact-head Actions](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42432394801/job/128583948834)
passed 265/265 package tests; lint/typecheck, native-policy and ci-ok also passed.
That is historical evidence for 44 adapters, not execution of later source.

`test/resize-records.test.mjs` adds 43 synthetic contracts for eight bouncer and
branch/keyspace resize metadata adapters: pinned GET paths/response enums,
immutable ID/name/parent bindings, whole-page refusal, argument/scope closure,
wire/page caps, ignored parameter/SKU/actor canaries and per-bouncer parent mismatch
refusal. States are informational, never resize/spend/cancel authorization.
Branch/keyspace resize schemas supply no parent identity; trusted current parent
bindings and independent collection authority remain required. Full resize
configuration, optional completion-time filters, price/capacity and mutations are
not implemented. Source coverage is **52/291 bounded metadata subsets, 239 missing**;
zero integrated/reviewed/enabled/adopted operations. Fresh exact-head Actions is
required for this increment; no local suite or native authority test is claimed.

`test/maintenance-schedules.test.mjs` adds 25 synthetic contracts for four
schedule/window metadata reads. Tests cover pinned paths/schema, whole-page ID
refusal, closed scopes/arguments, immutable snapshots, wire/page limits, malformed
selected fields and dropped name/timing/version canaries. Enabled/required and
start/finish presence are informational, never execution authority or native
closure. Trusted parent ownership and independent collection permission remain
required; full scheduling and non-waking semantics are incomplete. Source coverage
is now **62/291 bounded metadata subsets, 229 missing**; zero integrated/reviewed/
enabled/adopted operations. Prior `80ff2ba` [Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42435353232/job/128592914327)
passed 342/342 package tests, not these new fixtures. Fresh exact-head Actions is
required; no local suite or native authority enforcement is claimed.

`test/routing-records.test.mjs` adds 38 synthetic contracts for six router,
dedicated-read-replica and switchover metadata reads. Tests cover pinned GET paths,
plain-array versus paginated response contracts, immutable ID/name bindings,
whole-response refusal, closed arguments/scopes, selected types/enums, wire/row/page
caps and dropped address/configuration/SKU/error/actor canaries. Router and replica
collections have no pagination parameters; they accept only empty arguments and
refuse arrays above 32 rows. Switchover state never proves unchanged primary,
rollback, safe retry or native closure. Parent ownership/collection authority,
non-waking semantics and full optional details/mutations remain incomplete.
Coverage is **68/291 bounded metadata subsets, 223 missing**; zero integrated,
reviewed, enabled or adopted operations. Prior `3f3022b` [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42436736199)
passed, including [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42436736199/job/128597089375),
lint, native-policy and ci-ok; this is not execution of these new fixtures. Fresh
exact-head Actions remains required; no local suite or native authority is claimed.

`test/unified-change-records.test.mjs` adds 21 synthetic contracts for three
unified/replica change-record reads. Exact ID/type/target and replica bindings,
nullable target identity, immutable snapshots and whole-page refusal are covered;
can-delete/state never grants action authority. Four router/neki 308-only aliases
remain missing with no redirect following. At `190f6cabcda1020c2331fc7a0507e4b26e339156`,
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42439602836)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42439602836/job/128605819748),
lint/typecheck, native-policy and ci-ok. This is historical evidence for 71 offline
adapters, not execution of the newer organization-security fixtures.

`test/organization-security.test.mjs` adds 34 synthetic contracts for six OAuth-
application, SSO/domain and invitation reads. They cover fixed paths and official
pagination/array shapes, bound IDs, immutable snapshots, whole-response refusal,
wire/row/page caps, closed inputs, resource types/enums and excluded contact/client/
scope/verification canaries. SSO flags, domain state/verification presence and
invitation roles are informational, not effective enforcement, domain control,
native acceptance or action authority. Parent ownership, collection permission,
full details and non-waking semantics remain prerequisites. Source coverage is
**77/291 bounded metadata subsets, 214 missing**; tiers 77 provisional read / 16
unreviewed reserved / 198 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite or native authority test is
claimed. The missing-adapter prerequisite above is updated to this current count;
earlier per-slice counts remain historical.

At `3c4a80943b596f3d4c3640f1fd13703ba96b6aee`, [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42440998261)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42440998261/job/128610033185),
lint/typecheck, native-policy and ci-ok. That is historical evidence for 77
adapters, not execution of the newer billing fixtures.

`test/billing-records.test.mjs` adds 29 synthetic contracts for five invoice,
line-item and payment-method/setup metadata reads. They cover pinned paths,
pagination and provider permissions, exact child identity and whole-page refusal,
immutable parent/child scope snapshots, closed inputs, wire/page limits, selected
flags/types/enums and excluded amount/payment/checkout/free-text canaries. Payment
replacement refuses rather than rebinding. Paid/overdue/Cloudflare-billed flags
and completed setup state never establish spending authority. Setup-status GET
requires documented `write_payment_method`; no entitlement or grant expansion is
inferred. Parent ownership/collection permission, raw-body custody, full details
and non-waking semantics remain prerequisites. Coverage is **82/291 bounded
metadata subsets, 209 missing**; tiers 82 provisional read / 16 unreviewed reserved
/ 193 unresolved. Zero integrated/reviewed/enabled/adopted. Fresh exact-head Actions
is required; no local suite or native authority test is claimed.

At `d414cbdbc0f0bd6149df53e662641f36868c1b1f`, [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42442355032)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42442355032/job/128614092916),
lint/typecheck, native-policy and ci-ok. That is historical evidence for 82
adapters, not execution of the newer configuration-profile fixtures.

`test/configuration-profiles.test.mjs` adds 25 synthetic contracts for four profile
and profile-shard list/get reads. They cover pinned paths/response shapes, exact
ID/name and profile-parent matching, immutable nested scope snapshots, whole-page/
array refusal, duplicate ID/name bindings, closed inputs, wire/row/page caps,
selected flags/enums and excluded storage/SKU/version/count/free-text canaries.
State/default/metal/ready/authoritative are metadata, never configuration, spend,
assignment or wake authority. The official default-profile GET is 302-only with
no success response schema; it remains missing with a reviewed-alias-contract
prerequisite, never automatic redirect following. Trusted parent ownership and
independent collection authority, optional shard search, full details and non-
waking semantics remain prerequisites. Coverage is **86/291 bounded metadata
subsets, 205 missing**; tiers 86 provisional read / 16 unreviewed reserved / 189
unresolved. Zero integrated/reviewed/enabled/adopted. Fresh exact-head Actions is
required; no local suite or native authority enforcement is claimed.

`test/account-availability.test.mjs` adds 25 synthetic contracts for current-user,
organization-list, read-only-region and Postgres-version discovery. Fixed paths and
official query/response shapes, bound identity, whole-response refusal, nested
region ID/slug matching, duplicate bindings, immutable snapshots, closed inputs,
wire/row/page caps and sensitive canaries are covered in source. Output excludes
contact/profile/billing/address/actor/version text. MFA-configured, SSO, ready,
enabled and default flags do not prove effective enforcement, entitlement or
upgrade/wake/spend authority. User/organization OAuth scopes remain separate from
service-token documentation; absent Postgres-version scope tables remain unknown.
The default-branch identity behind read-only regions, trusted current ownership,
collection authorization, final secret guarding and non-waking semantics need
reviewed integration. Fresh exact-head Actions is required; no local suite or
native authorization is claimed. Coverage is 90/291 bounded subsets, 201 missing;
zero integrated/reviewed/enabled/adopted operations.

At `40951193a6c2ed78796a03a8c1faeb5a802cb8d3`, [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42444948874)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42444948874/job/128621841491),
lint/typecheck, native-policy and ci-ok. This supersedes the earlier pending
account/availability observation; it is not execution evidence for new source.

`test/configuration-definitions.test.mjs` adds 34 synthetic contracts for six
extension/parameter metadata reads. Fixed official array paths, bounded wire/row
caps, closed arguments/scopes, immutable snapshots, name/namespace confinement,
whole-array refusal, engine-specific namespace/type enums and nullable/optional
enabled state are covered in source. Values/defaults/options/URLs/actors/free text
are omitted. Definition names are not immutable provider IDs; trusted current
engine/parent ownership and upstream collection permission remain prerequisites.
Flags never authorize configuration, extension enablement, restart, spend or wake.
Coverage is **96/291 bounded subsets, 195 missing**; tiers 96 provisional read /
16 unreviewed reserved / 179 unresolved. Zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions remains required; no local suite or native authority
execution is claimed.

At `8b4d7531a6bd196aab953624675621530712cfcd`, [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42446353794)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42446353794/job/128626029418),
lint/typecheck, native-policy and ci-ok. This is evidence for 96 source adapters,
not execution of the newer network/throttler fixtures. The earlier unchanged
GitHub SDK recovery-test failure passed on one same-SHA retry; cause remains
unresolved and no repair or weakened assertion is claimed.

`test/network-throttler.test.mjs` adds 27 synthetic contracts for four CIDR-entry
and database/deploy-request throttler reads. They cover pinned paths/schema/access
alternatives, CIDR pagination, immutable ID/name snapshots, whole-response refusal,
closed scopes/arguments, wire/row/page limits, duplicate/foreign bindings, ratio
bounds and dropped network/schema/role/ratio/actor/timestamp canaries. Configurable
resource IDs must match independently of parent slugs and deploy-request numbers;
configuration names must be both broker-allowed and returned eligible keyspaces.
Configuration presence, including ratio zero, is not effective throttling. CIDR
ID existence is not effective enforcement. Current parent ownership, independent
collection permission, final secret guarding, full details/mutations and non-waking
semantics remain prerequisites. Coverage is **100/291 bounded subsets, 191 missing**;
tiers 100 provisional read / 16 unreviewed reserved / 175 unresolved. Zero integrated,
reviewed, enabled or adopted. Fresh exact-head Actions is required; no local suite
or native authority enforcement is claimed.

`test/operation-status.test.mjs` adds synthetic contracts for two fixed offline
rollout/vtctld-operation metadata reads: exact bound identities, snapshotted shard
names, whole-response unknown/duplicate/overflow refusal, closed scope/arguments,
wire bounds and immutable outputs. Free-text rollout states/times reduce to
non-empty string presence; they are not parsed timestamps or completion evidence.
Vtctld returns only a bound ID, documented state and nullable completion-string
presence; action/result/error/metadata and the documented string `completed` are
not projected/coerced. Presence and provider state never prove topology, rollback,
safe retry, native closure or authority. Official configuration-profile change
aliases are 308-only gaps with a reviewed-contract prerequisite, not adapters.
Fresh exact-head Actions execution is required; these fixtures are not live policy,
collection permission, current parent ownership or non-waking evidence.

`test/traffic-budgets.test.mjs` adds 19 synthetic contracts for two fixed offline
traffic-budget list/get reads. Only broker-bound ID and the documented
`enforce`/`warn`/`off` mode survive; `effectiveEnforcement: not-established`
explicitly declines runtime enforcement or change authority. Name, limits, actors,
rules, tags, query fingerprints, keyspaces, SQL and times are omitted wholesale.
Scopes snapshot 1–32 unique IDs; unknown/duplicate/malformed rows refuse the whole
page. Tests cover immutable snapshots, closed inputs, bounded wire/pagination,
non-reflection and official selected-field/path agreement. Parent collection
permission, current ownership/immutable target mapping, raw-body custody,
selected-field reflection guards and non-waking evidence remain prerequisites.
Optional filters and query-specific budget reads remain incomplete. Coverage is
**104/291 bounded metadata subsets; 187 missing**; tiers 104 provisional read /
16 unreviewed reserved / 171 unresolved; zero integrated/reviewed/enabled/adopted.
Fresh exact-head Actions is required; no local suite or live policy is claimed.

Prior exact `7c7a062a79690b435f18f3a9c5f31d4c05175fba`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42448907631)
passed [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42448907631/job/128633734301),
lint/typecheck, native-policy and ci-ok. This verifies the prior 102-adapter head,
not the new traffic-budget fixtures. Earlier unchanged SDK recovery-test retry
cause remains unresolved; no repair claim or weakened assertion.

## Fixed-read core preparation — source increment

`test/core-read-preparation.test.mjs` adds 20 synthetic contracts for three pure
organization/database/branch detail-read preparations. Closed host-owned snapshots
retain immutable IDs, parent names/IDs and revision; the full core hash binds each
field and the existing fixed GET request. Caller arguments are empty. Contracts
cover non-invoked accessors, missing/unsafe/extra fields, deep captured snapshots,
resource-kind separation and read-versus-delete hashes on the same branch resource.
Existing projections match names only, not immutable response IDs; the prepared
plan explicitly retains that limitation and unverified non-waking semantics.
No executor, registration, credential resolution, tier approval or live access is
provided. All three remain existing offline adapters, not new coverage or runtime
integration. Coverage remains 134/291 with 157 missing, twelve mutation previews
and fifteen total pure preparations. New contracts require exact-head Actions;
no local suite/build/typecheck or execution success is claimed by this ledger.

Prior exact `9a4af1623e1a5b31a854c68936ccc6ace1ecebc1`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42500450085)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42500450085/job/128791863930):
1135/1135 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219 and Neon 37/37,
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok,
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42500449907)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42500446403)
passed. This is previous-head evidence, not execution of the new read contracts.
Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Lifecycle detail core preparation — source increment

`test/core-lifecycle-read-preparation.test.mjs` adds 23 synthetic contracts for
backup, backup-policy and deploy-request detail preparations, reusing the fixed
GET builders and common read wrapper. Closed immutable host snapshots bind parent
IDs/names, record IDs, revision, backup branch identity and independently supplied
deploy request ID/number/source/destination bindings. All fields affect plan/full
core hashes; caller arguments are empty. Nested captures, non-invoked accessors,
missing/extra/unsafe input, ID/number refusal and resource-kind namespaces are
covered. Record-ID projections do not authenticate parent IDs; the deploy response
also lacks destination ID. Plans retain those exact response limits and unverified
non-waking semantics. No executor, runtime registration, credential resolution,
authority consumption or new adapter coverage. Coverage stays 134/291, 157 missing;
twelve previews and eighteen pure preparations remain separate from integration.
New contracts require exact-head Actions; no local suite/build/typecheck ran.

Previous exact `189ff147e53ebfbc8dcd4d70521fc9af0cb474c4`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42501956888)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42501956888/job/128796463941):
1155/1155 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219 and Neon 37/37,
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok,
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42501956627)
and [CodeQL](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42501953113)
passed. This is prior-head evidence, not execution of the 23 new contracts.
Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Topology detail core preparation — source increment

`test/core-topology-read-preparation.test.mjs` adds 22 synthetic contracts for
three pure preparations of existing keyspace/shard/maintenance-event detail reads.
Closed immutable snapshots retain organization/database/branch parent identities,
nested child bindings and revision; all fields affect the complete plan/core hashes.
Requests reuse existing fixed GET builders, with keyspaces addressed by name and
shards/events by ID. Caller arguments are empty, accessors refuse without invocation,
and missing/extra/unsafe nested host fields refuse. Cross-kind ID collisions retain
separate resource namespaces. Existing response projections still refuse mismatched
child IDs/names and event branch identity, but do not authenticate every parent ID;
plans explicitly retain those exact limits and unverified non-waking semantics.
No executor, project hook, registration, credential resolution or authority consumption
is supplied. Topology flags and event state never prove native permission or closure.
Coverage stays 134/291 bounded offline adapters, 157 missing, twelve previews and
21 pure preparations; zero runtime-integrated/reviewed/enabled/adopted operations.
These 22 new contracts need exact-head Actions; no local suite/build/typecheck ran.

Previous exact `e8e58260851dbff66ff3fbe0ce608f6d2a87d1f8`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42503561316)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42503561316/job/128801297767):
1178/1178 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219 and Neon 37/37,
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok,
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42503560899)
and [CodeQL](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42503558011)
passed. This verifies the previous 23 lifecycle detail contracts, not the new topology
contracts. Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Organization detail core preparation — source increment

`test/core-organization-read-preparation.test.mjs` adds 23 synthetic contracts for
three pure preparations of existing membership/team/team-member detail reads.
Closed immutable snapshots bind organization ID/name, revision, membership ID/user
ID and team ID/slug as applicable; all fields affect plan and full core hashes.
Requests reuse fixed GET builders; empty caller arguments, missing/unsafe/extra
host fields and accessors refuse. Resource kinds are separate and team-member
resource identity includes its team, even if membership IDs are reused. Existing
projections refuse mismatched child/user/slug bindings and omit synthetic contact,
password and nested-grant canaries, but do not verify organization IDs or team
parent identity in member responses. Plans retain these limits and unverified
non-waking semantics. Role/managed flags never establish effective authority.
No executor, project hook, registration, credential resolution or authority
consumption is supplied. Coverage stays 134/291 offline adapters, 157 missing,
twelve previews and 24 pure preparations; zero runtime-integrated/reviewed/enabled/
adopted operations. These 23 contracts require exact-head Actions; no local suite,
build or typecheck ran.

Previous exact `5e7933e99f88fa67711ea2dc7c8c7246bc25f1fb`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42505093027)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42505093027/job/128805924658):
1200/1200 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219 and Neon 37/37,
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok,
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42505092733)
and [CodeQL](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42505089809)
passed. This verifies the previous 22 topology contracts, not the new organization
contracts. Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Security-record detail core preparation — source increment

`test/core-security-record-read-preparation.test.mjs` adds 26 synthetic contracts
for three pure preparations of existing service-token/OAuth-token/webhook metadata
reads. Closed immutable snapshots bind parent IDs/names, record ID, revision and
OAuth application ID; all fields affect plan and full hashes. Fixed GET builders,
empty caller arguments, complete/unsafe/extra-field refusals and accessor rejection
are preserved. Resource kinds are separate; OAuth resource identity retains the
application when token IDs are reused. Existing projections refuse record mismatch
and omit synthetic raw-token/refresh-token/webhook-secret/URL/actor/grant canaries.
They do not verify response organization/database/application parent identity.
Plans retain this limitation and unverified non-waking semantics. Token presence
flags never prove validity, revocation or effective authority; webhook flags never
prove endpoint trust, delivery or authorization. Accepted broker-only raw-body
transport/redaction/custody remains a prerequisite. No executor, project hook,
registration, credential resolution, grant or authority consumption is supplied.
Coverage stays 134/291 offline adapters, 157 missing, twelve previews and 27 pure
preparations; zero runtime-integrated/reviewed/enabled/adopted operations. These 26
contracts require exact-head Actions; no local suite, build or typecheck ran.

Previous exact `3fc37b22f7a713c5b1c3aee882dee7e461095918`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42506669328)
passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42506669328/job/128810709776):
1223/1223 PlanetScale, root 317/317, helpers 122/122, GitHub 219/219 and Neon 37/37,
zero failures/skips/cancellations. Lint/typecheck/native-policy/ci-ok,
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42506669257)
and [CodeQL](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42506664914)
passed. This verifies the previous 23 organization contracts, not the new security
record contracts. Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Deployment-detail core preparation — source increment

`test/core-deployment-detail-read-preparation.test.mjs` adds 17 synthetic contracts
for two pure preparations of existing deployment/schema-recommendation detail
reads. Closed immutable parent/record/sequence/revision snapshots, independent
deployment destination branch ID, empty caller arguments and fixed number-addressed
GETs are bound into full/plan hashes. Deep snapshots, every-field sensitivity,
missing/extra/unsafe/accessor refusals, response record/number mismatch and DDL/actor
canary omission are covered. Existing projections do not verify immutable response
parent/destination identity; plans retain the exact limitation and unverified
non-waking semantics. Trusted current ID/number/parent mappings remain prerequisites.
State/flags grant no deployment/dismissal/DDL/spend/native approval authority.
No executor, registration, credential resolution or authority consumption is added.
Coverage stays 134/291 offline adapters, 157 missing, twelve separate previews and
29 pure preparations; zero runtime-integrated/reviewed/enabled/adopted operations.
New contracts await exact-head Actions; no local suite/build/typecheck ran.

Previous exact `33338cf82c29d08ccac6ec55cd5ffc23119c5d2a`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42508225273)
passed [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42508225273/job/128815439057),
lint/typecheck/native-policy/ci-ok;
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42508225058)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42508222863)
passed. This is prior-head evidence, not execution of the 17 new contracts.
Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Compute-detail core preparation contracts

`test/core-compute-read-preparation.test.mjs` adds 25 synthetic contracts for pure
bouncer and branch/keyspace resize detail Prepared bindings. Closed immutable
parent/child/revision snapshots retain fixed GETs and empty caller arguments;
nested ID/name captures, every-field plan/full hashes, accessor/missing/extra/unsafe
field refusals, output canaries, response identity refusal and resource namespace
separation are covered. Bouncers route by name and match response ID/name and
branch ID/name, not organization/database identity. Resize projections match
record ID only, not immutable parent/keyspace identity. Plans retain these exact
limits and nonWaking=not-verified. State/target metadata grants no resize, restart,
cancellation, wake, spend or native approval authority. Current trusted ownership,
ID/name mappings, revision revalidation and broker transport/custody remain required.
No executor, registration, credential resolution or authority consumption is added.
Coverage stays 134/291 offline adapters, 157 missing, twelve separate previews and
35 pure preparations; zero runtime-integrated/reviewed/enabled/adopted operations.
New contracts await exact-head Actions; no local suite/build/typecheck ran.

Previous exact `0e15fcbf69ad2dedb183d0624290915d95d9e8a3`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42741465124)
passed [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42741465124/job/129583335640),
lint/typecheck/native-policy/ci-ok;
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42741464185)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42741455816)
passed. This is prior-head evidence, not execution of the 25 new contracts.
Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Billing-detail core preparation contracts

`test/core-billing-read-preparation.test.mjs` adds 26 synthetic contracts for
invoice, billing payment-method and payment-setup detail Prepared bindings.
Closed immutable organization/record/revision captures, fixed GETs and empty
caller arguments retain every-field hashes, snapshot/accessor/missing/extra/unsafe
refusals, output canaries and separate resource-kind namespaces. The singleton
payment-method path contains no record ID; its independent expected-ID binding
changes resource identity/full hash and refuses replacement response records.
Existing projections match record ID only, not parent ownership. Payment flags
and setup state never grant spending, setup, credential or native authority.
The setup-status GET's documented write_payment_method scope remains a separate
entitlement prerequisite, not permission to broaden credentials. Trusted current
ownership/revision, transport/raw-body custody and non-waking proof remain required.
No executor, runtime registration, credential resolution or authority consumption.
Coverage remains 134/291 offline adapters, 157 missing, twelve previews and 46 pure
preparations; zero runtime-integrated/reviewed/enabled/adopted operations. New
contracts await exact-head Actions; no local suite/build/typecheck ran.

Prior exact `b4a4365da2636fe57ce920911088206593ac8c3e`
[Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42751426411)
passed [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42751426411/job/129615758022),
lint/typecheck/native-policy/ci-ok;
[Gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42751426795)
and all three [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42751421876)
passed. This is prior-head evidence, not execution of the 26 billing contracts.
Earlier unchanged SDK recovery-test uncertainty remains unresolved.

## Metrics preregistration — required before enablement

Baseline and matched post-window measurements are **not yet collected or approved**.
No prior handoff counts are rerun or treated as current downstream blockers.
Before enablement, save exact UTC windows, affected agent/resource cohort, source
trace query/version, handoff and genuine access-failure numerator/denominator,
full-surface policy coverage by tier, and numeric improvement thresholds. Match
windows/cohorts, report missing scopes separately and retain raw counts.

Guardrails: zero leaked secrets/customer rows, zero unapproved wakes or reserved
actions, zero broadened grants, zero replay/cross-agent/resource successes, no
recurring always-on staging cost and no skipped qualification. A source-map count
or mocked test result is not an adoption/productivity outcome. Missing baseline,
threshold or live-authority evidence holds enablement, not independent source work.

## Lifecycle collection refusal assertion repair

Source `017398068deda4211bd7c074b611b69b4067723a`
[Actions test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42780948813/job/129710641441)
passed 1708/1709 PlanetScale contracts. One deploy-list malformed-state assertion
expected `upstream`; the existing `oneOf` enum parser correctly returned `schema`.
The test now expects that exact code for the deploy case while retaining
`upstream` for malformed backup/policy flags and pagination, and `scope` for
unknown children. No runtime behavior, parser, tier or authority changed; no new
test-count credit. Repair-head Actions verification is pending.

Source-head root 317/317, helpers 122/122, GitHub broker 219/219 and Neon 37/37
passed; lint/typecheck/native-policy, Gitleaks and all three CodeQL analyses passed.
Aggregate correctly failed. Earlier recurring GitHub SDK recovery uncertainty is
not resolved by this passing source-head GitHub run. Coverage remains 134/291
offline adapters, 157 missing, twelve separate previews and 77 pure preparations;
zero runtime-integrated/reviewed/enabled/adopted operations.
