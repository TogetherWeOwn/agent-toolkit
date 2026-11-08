# PlanetScale acceptance ledger

Status: **incomplete; no Security/Crypto/QA acceptance, install or enablement**.
This staged source PR does not deliver the complete package. The operation map's
missing rows are actual missing implementation, not a promise of dormant access.

## Exact prerequisites and accountable roles

| Missing evidence/implementation | Accountable role | Release condition |
| --- | --- | --- |
| Current credential kind/scope/entitlement receipt | Operator | Non-secret, dated metadata naming existing binding identity, provider/resource classification, service-token grants or OAuth scopes, expiry/restrictions; unknowns retained |
| Reviewed compatible versioned provider interface | Common-core maintainer | Pinned reviewed core with native identity/policy/approval/audit and contract fixtures; no mock authority in production |
| 259 adapters, remaining optional capabilities and per-operation tier classification | PlanetScale package builder | Every entitled operation implemented with closed schemas, resource boundaries, projections/placement, tests and validated plan/diff semantics; explicit unsupported areas retain prerequisites |
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
