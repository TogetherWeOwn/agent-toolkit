# PlanetScale provider package

**Partial source build. Not installable, reviewed, enabled, or feature-complete.**
Maintainer role: toolkit engineering. Package version: 0.1.0. No runtime plugin
manifest, network executor, credential resolver, or tool registration is supplied.
The fourteen adapters are pure request builders and bounded output projections,
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
| Offline metadata adapters | 14 | Narrow projections; not full operation coverage |
| Missing source adapters | 277 | Explicitly incomplete, never denied placeholders |
| Runtime-integrated operations | 0 | Reviewed compatible common core required |
| Security/Crypto/QA accepted | 0 | Exact-version reviews pending |
| Enabled / adopted | 0 / 0 | Separate live authorization and install gates |

Fourteen adapter rows have a provisional read tier; sixteen protected-operation
rows have explicit **unreviewed reserved-tier candidates**. The remaining 261
rows stay `unresolved`. None of these classifications is runtime policy or
approved authority. The intended tools are not registered. GET alone is not proof
of harmless, non-waking or non-billable behavior. Billing/admin, token/role/password, SSO/OIDC, query/metrics/log exports,
backups/restore, schema/deploy, topology, maintenance and every other official
area remain in the map even when access or implementation is missing.

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
adapters**, do not consume authority and do not increase the 14-adapter count.
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

The operation map separately records sixteen unreviewed policy candidates: the
three above, SSO/directory enforcement removal, billing payment-method changes,
and nine credential creation/refresh/renewal/reset operations (including signed
log access). These require their actual decider; provider permissions do not
substitute. Conditional production/data/schema/deploy, new-spend, security-weakening
and approved host/secret-placement obligations are conjunctive, never alternatives.
The candidates only document requirements; native routing, expiry, exact-target
binding, atomic consumption, replay/concurrent-use refusal and approved placement
are **not implemented or tested as authority enforcement here**. Credential routes
remain incomplete until a broker-only sink and reconciliation are accepted. The
other 261 tier classifications are unresolved, not automatically harmless reads or
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
