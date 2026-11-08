# PlanetScale provider threat model — partial source

Version 0.1.0; not accepted. Applies to pure metadata adapters and the pinned API
map only. There is no installable plugin, native handler, runtime transport,
credential resolver, authority adapter or side-effecting executor in this stage.

## Assets, principals and boundaries

The upstream main credential may expose organization/database administration,
roles/passwords/tokens, schema/deploy/restore, billing and other surfaces enumerated
in the 291-operation map. Its actual kind, grants, resource ceiling, expiration and
entitlements are unknown. Service-token and OAuth permissions are not interchangeable.
No credential value is needed to inventory these facts. Credential escalation or
creation is not authorized by complete-source scope.

Future principals are the native authenticated caller, common policy core,
trusted resource resolver, approval authority, secret store/placement system,
durable audit/state and fixed-origin provider transport. Model input is not a
trusted assertion of any of those. Source `prepare(scope,args)` calls accept a
separate typed target solely for offline construction; this is not authentication
or proof of resource ownership. Do not expose them directly as callable tools.

Main credentials stay broker-side. Neither shared UID nor a worker process is a
sandbox. No supported per-call attenuation has been demonstrated; do not mint
short-lived credentials without both provider support and creation authorization.
Residual broker/process compromise can expose the configured upstream ceiling.

## Current tools and exact output boundary

- `get_organization`: matching configured organization name and SSO boolean.
  Billing email/features/payment information is dropped.
- `get_database`: matching database name, documented engine enum, readiness and
  deletion-protection booleans. URLs, settings/free text and region payload dropped.
- `get_branch`: matching branch name and fixed booleans. Provider connection
  addresses, actor, restored-from records and DDL are dropped. Production is a
  returned observation, not a replacement for trusted pre-call classification.
- `list_roles` / `get_role`: fixed ID/name, booleans and documented inherited-role
  enums only. Password, connection hosts/DSNs, username and nested settings dropped.
  Inheritance is not an effective direct/transitive ACL graph. List resource scope
  must be authorized for the whole branch; per-role-only grants cannot list it.
- `list_passwords` / `get_password`: metadata record ID/name, role enum and expired
  boolean only. Credential/hash/plain-text/connection values and nested bodies dropped.
- `relation_exists`: an exact validated relation name and existence boolean only;
  raw DDL/HTML never escapes. It currently covers only unambiguous names in the
  provider's returned branch-default schema, not namespace/keyspace enumeration.

Inputs reject unknown properties, object-prototype keys, non-ASCII resource/path
segments, path separators/encoding, type coercions and unbounded values. Arguments
cannot choose provider origin, headers, secret reference, identity, approval or SQL.
Outputs are fixed projections with enum/boolean/bounded-identifier validation.
The eventual common-core secret guard must also reject reflected credential values
in selected fields; dropping known secret fields alone cannot prove no disclosure.

## Organization audit-event metadata — offline only

`list_audit_logs` fixes the organization audit-log path and first-page `limit=10`;
empty arguments cannot select a cursor, target, URL, credential or authority.
The closed broker scope snapshots 1–32 unique event IDs. The whole result refuses
unknown/malformed/duplicate IDs, over-cap data, non-string or oversized selected
action fields, inconsistent cursor boundaries, previous-page flags and impossible
empty pages claiming more data. Output contains only bound ID, bounded-string
action presence and `integrity: not-established`; all actor/target IDs and types,
action text, names, network/location data, change metadata and timestamps are
omitted. No cursor is returned or followed. First-page-only output never proves
complete history, event integrity, correct authorization, enforcement or closure.

Audit access needs its separate documented `read_audit_logs` entitlement, trusted
current organization ownership and whole-collection policy before any request;
known event IDs only confine output. Raw audit bodies can contain sensitive change
and credential material, so broker-side no-log/error/custody and reflected-secret
guards remain required. No credential, network, audit-store write or runtime
registration exists here. Resource creation TTL/spend/teardown is inapplicable to
this pure builder, but future transport/rate/time/byte limits and non-waking proof
remain prerequisites. `test/audit-events.test.mjs` covers fixed scope/path, cursor,
immutability, bounds, malformed data, unknown identities and omitted canaries;
native authorization/replay/custody tests remain incomplete.

## Maintenance schedule/window metadata — offline only

- `get_maintenance_schedule`: fixed database schedule path and broker-bound ID;
  returns only ID, enabled/required flags and frequency-unit enum.
- `list_maintenance_schedules`: fixed database collection, explicit bounded page
  arguments and 1–32 unique broker-owned schedule IDs; same output projection.
  Unknown IDs refuse the whole page, not a partial sanitized result.
- `get_branch_maintenance_window`: fixed branch path; the official response is a
  schedule, not a window. Require its exact broker-bound schedule ID and return
  the same schedule projection. Never infer a branch ownership proof from it.
- `list_maintenance_windows`: fixed schedule child path, explicit bounded pages
  and 1–32 unique window IDs; return ID and validated timestamp presence only.
  Presence never establishes successful maintenance or native session closure.

All four snapshot closed broker-owned scopes before preparation and reject caller
schedule, timing, approval, destination or credential overrides. Names, raw times,
durations, pending versions and arbitrary text are dropped. Response shapes supply
no immutable parent identity; current trusted database/branch/schedule/window
bindings and independent parent-collection permission remain prerequisites. A
provider schedule, enabled flag or required flag cannot authorize a compute wake,
maintenance execution, cancellation or rescheduling. GET non-waking semantics are
unverified. No resources are created, so creator TTL/spend/teardown is inapplicable
to these pure builders; future calls retain transport/rate/time/byte caps and any
authorized use-window/closure requirements. No credential resolution, outbound
calls, logging or state mutation occurs. `test/maintenance-schedules.test.mjs`
covers exact schema paths, scope/identity refusal, immutability, bounds, malformed
fields and ignored canaries; native policy/custody/approval tests remain missing.

## Router, dedicated-replica and switchover records — offline only

Router and dedicated-replica detail reads use a broker-bound name in the fixed
path and require the exact ID/name pair in the response. Their list operations
return plain arrays in the pinned schema, not paginated envelopes. Empty closed
arguments reject invented pagination; arrays over 32 rows or any unknown/rebound
child refuse the whole response. Scopes snapshot 1–32 unique ID/name pairs. No
collection completeness or parent ownership is established by these arrays.
Router output is ID/name, state, default and autoscaling flags; replica output is
ID/name, prose-documented state and ready flag. Parameters, connection hosts,
private service/address/region data, storage/SKUs/costs, counts and actors are
omitted. Trusted parent ownership and parent-wide collection authority remain
separate prerequisites before any future call.

Switchover reads require bound IDs, with existing bounded explicit pagination for
the list. Output includes only ID, state and start/finish timestamp presence.
Method, errors and actors are omitted. A failed switchover can have an unconfirmed
outcome: never infer unchanged primary, safe retry, rollback or native closure.
Provider readiness/default/autoscaling/success never grants restart, failover,
resize, wake or spend authority. No runtime operation or mutation is supplied.
`test/routing-records.test.mjs` covers pure shapes, whole-response refusal,
immutable bindings, caps, selected types and dropped canaries; native policy,
credential custody and non-waking semantics remain unverified.

## Transport, pagination and errors

All current request descriptions fix HTTPS `api.planetscale.com`, GET and endpoint
shape. They have no network behavior. The future reviewed transport must reject
redirects, bound request/response time, concurrency and bytes, validate HTTP status,
avoid credential-bearing diagnostics and never follow provider pagination URLs.
Pure projections parse at most 64 KiB of strict UTF-8 JSON and throw fixed refusal
codes, never provider text or error causes. Page inputs are integers: 1–100 pages,
1–10 items/page. Returned page numbers and lengths must match the request; the
last permitted page cannot silently truncate more results. Partial output says
`complete:false`. No aggregate completeness is implied from one page.

## Confused deputy, authority and side effects

Cross-agent/project/task/resource refusal, stale assignment, approval replay,
revocation, ownership drift and TOCTOU enforcement are missing runtime obligations
of the reviewed common core, not functionality implemented by these types. No
caller approval flag, self-issued grant or local replacement authority is added.
Production/data/schema/deploy decisions require Release Manager; money, credential
creation/rotation and security weakening require owner; host application requires
Operator. Multiple relevant routes are conjunctive. Pin exact operation, resource,
principal, validated arguments/plan/artifact and policy/tool versions.

All future writes need per-agent AND resource allowlists, durable attributable
audit intent before effects, bounded idempotency/replay handling and reconciliation
of ambiguous success. No arbitrary retry after a timeout. No provider dry-run is
claimed: when absent, label a validated local plan/diff as such and bind it to the
authorization. Resource creators also require bounded spend, native expiry and
verified cleanup, including failures/cancellation. Missing controls deny that
operation at integration, but do not make an absent adapter feature-complete.

## Compute wake, data and operational containment

Control-plane GET is not demonstrated non-waking semantics. SQL catalog metadata
can wake compute; no SQL, fallback, customer data query or live call exists here.
Bounded staging windows and exact allowlists/read-only transactions/caps/closure
receipts must precede data-plane metadata. Never infer staging from a resource
name. Production uses a separate native gate. No recurring always-on staging
runtime, keep-alive, scheduled probe or new credential is introduced.

Current rollback removes uninstalled source only. Future runtime revocation needs
Operator-owned disablement/profile removal and exact-artifact rollback with durable
in-flight reconciliation; it cannot be claimed from deleting these files.

## Evidence limits

Mocked contracts check parsing, projection, fixed targets and bounds only. They do
not certify host governance, native immutable audit, network isolation, authorized
secret placement, actual API entitlement, compute behavior, policy/approval replay,
production readiness or adoption. Each missing obligation is retained in
[ACCEPTANCE.md](ACCEPTANCE.md) and the operation map. Security and independent Crypto
review all package tiers at a pinned version before final QA and applicable release
or install authorization. Source completeness is still outstanding.
