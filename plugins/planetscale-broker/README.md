# PlanetScale provider package

**Partial source build. Not installable, reviewed, enabled, or feature-complete.**
Maintainer role: toolkit engineering. Package version: 0.1.0. No runtime plugin
manifest, network executor, credential resolver, or tool registration is supplied.
The seventy-one adapters are pure request builders and bounded output projections,
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
| Offline metadata adapters | 71 | Narrow projections; not full operation coverage |
| Missing source adapters | 220 | Explicitly incomplete, never denied placeholders |
| Runtime-integrated operations | 0 | Reviewed compatible common core required |
| Security/Crypto/QA accepted | 0 | Exact-version reviews pending |
| Enabled / adopted | 0 / 0 | Separate live authorization and install gates |

Seventy-one adapter rows have a provisional read tier; sixteen protected-operation
rows have explicit **unreviewed reserved-tier candidates**. The remaining 204
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
adapters**, do not consume authority and do not increase the 71-adapter count.
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
other 204 tier classifications are unresolved, not automatically harmless reads or
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
