# PlanetScale acceptance ledger

Status: **incomplete; no Security/Crypto/QA acceptance, install or enablement**.
This staged source PR does not deliver the complete package. The operation map's
missing rows are actual missing implementation, not a promise of dormant access.

## Exact prerequisites and accountable roles

| Missing evidence/implementation | Accountable role | Release condition |
| --- | --- | --- |
| Current credential kind/scope/entitlement receipt | Operator | Non-secret, dated metadata naming existing binding identity, provider/resource classification, service-token grants or OAuth scopes, expiry/restrictions; unknowns retained |
| Reviewed compatible versioned provider interface | Common-core maintainer | Pinned reviewed core with native identity/policy/approval/audit and contract fixtures; no mock authority in production |
| 181 adapters, remaining optional capabilities and per-operation tier classification | PlanetScale package builder | Every entitled operation implemented with closed schemas, resource boundaries, projections/placement, tests and validated plan/diff semantics; explicit unsupported areas retain prerequisites |
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
