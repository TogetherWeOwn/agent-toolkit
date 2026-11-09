# Bounded Pages inventory traversal — source contract only

`src/pages-traversal.ts` adds one session-local state machine and a broker runner over
`pages-project-get-projects` and `pages-deployment-get-deployments`. It reuses the
existing descriptors, `createCloudflareReadBroker`, capture sink, inventory coverage
and recorded-coverage joins. It adds no provider operation, HTTP transport, native
adapter, credentials, scheduler, replay/recovery service or enabled tool.

## Trusted inputs and finite limits

`PagesTraversalSession` is a **new source interface**, not an already-installed host
session API. The caller must supply deserialized trusted inputs and fresh trusted
`PagesSessionContext` checkpoints, not model assertions. Context pins principal hash,
company, account, policy, resource and ownership revisions. The immutable session
also pins a host-selected unique session ID, explicit collection start, page size and
budgets. The reader scope is copied before construction; discovered IDs/names never
enlarge its independently trusted project mapping or inventory/page grants.

| Limit | Validated session range / behavior | Retained ceiling |
| --- | --- | --- |
| page size | 1–100, fixed throughout | reader 1–100 |
| page argument | generated 1, 2, … only under consistent known totals | reader 1–1000 |
| reported total pages | 0–1000 for accepted coverage; larger reader-valid totals stop incomplete | coverage helper 0–1000 |
| total requests | 1–100 across both operations and all collections | coverage helper at most 100 observations per collection; global cap is stricter |
| projected rows | 1–1000 across the session; reserve a full requested page before each call | each request at most 100 and no more than requested size |
| cumulative serialized values | 1–1048576 UTF-8 bytes; reserve 32768 before each call | coverage helper 1048576 per collection; global cap is stricter |
| serialized manifest | 8192–1048576 UTF-8 bytes; reserve denominator/summary space before each call and check final bytes | new explicit output cap, no prior manifest API claimed |
| elapsed interval | 1–600000 ms; refuse acceptance/next call once elapsed; clocks must not regress | each existing request has a 10000 ms execution timeout |

A reservation can stop early even if the next provider page would be empty or
smaller than the reserved maximum. In particular, a value budget below 32768 cannot
start a request, and a manifest budget of 8192 produces only an incomplete envelope.
The manifest reservation is 8192 + 1024 per observed-or-potential project + 1024 per
issued-or-potential page. Identity lengths and number of pages are independently
bounded. No already-discovered project is removed to satisfy a manifest budget.

The raw response still has its existing 131072-byte cap, each projected value including
capture its 32768-byte cap, and each scope array its 100-entry cap. No ceiling is
raised. A session may discover more than 100 projects, but cannot acquire permission
for them through discovery. Unmapped or unapproved deployment collections are gaps.
The thousand-project fixture uses 10-row pages and stops at the manifest reservation
before page 93, retaining all 920 accepted discoveries as denied denominator members
and labeling project discovery partial; it does not promise that 1000 projects fit.

Capture hashing also retains the core canonical JSON validation limits: 256 nodes,
depth 8, at most 65 own keys per object/array, strings at most 4096 characters, and
16384 serialized bytes. These constraints are independent of the reader's larger
row/value caps. A schema-valid 100-row project page can exceed them and must stop
incomplete, not bypass the hash validator, shrink the fixed page size or retry. The
broker fixture exercises this refusal without accepting rows or exporting a receipt.
Rich projections may hit these bounds at still smaller page sizes.

Elapsed and cancellation checks are **session admission/acceptance checks**, not a
new native wall-clock supervisor. The existing broker owns the bounded in-flight GET
and cleanup. Cancellation during a call is observed after it settles and discards its
output from accepted session coverage; there is no fire-and-forget race or retry.
The runner samples its clock after each awaited trusted-context refresh, so refresh
latency counts against both dispatch admission and returned-page acceptance.
Trusted host/context/storage callbacks still need their own qualified bounded latency
and cleanup. No source test establishes those native properties.

## State and terminal rules

1. Start account project inventory at explicit page 1. A single opaque request token
   may be in flight per state machine; another session's token, a copied token or a
   replayed token cannot advance it. The runner's core journal key binds session hash
   and ordinal, is never exported as a receipt, and is never automatically retried.
2. Join the **successful returned result** to its exact arguments, expected prepared
   plan hash, target, resource revision, policy and principal. Verify capture binding,
   local window, ALLOW intent/outcome and completed same-event journal using both
   existing inventory helpers. Capture/event/target IDs are unique across collections;
   deployment UUIDs are unique across the session. These are supplied-record checks.
3. Accept only the next exact requested page. Advance by page + 1 only while it is
   below the consistent provider-reported total. All integer pages through
   `max(1,totalPages)` must have been observed. Zero requires an explicitly observed
   empty page 1. Empty/short pages do not terminate a collection.
4. Missing page/size/total evidence stops incomplete, as do malformed, contradictory,
   skipped, repeated, regressing, duplicate, foreign or filtered-mode records. A total
   missing on one page is never filled from another. Reader-valid totals above 1000
   are not enumerable by this helper.
5. Record discovered project ID/name pairs without enrolling them. Freeze the project
   denominator only after accepted terminal project coverage. Then traverse approved
   deployment inventories in stable project-ID order. Each starts at page 1 with the
   independently trusted exact project ID/name, including empty deployment pages.
   Partial discovery is explicitly labeled; its observed projects still remain in the
   denominator. Project denial, absent mapping or grant is never an omission.
6. A provider refusal, uncertain outcome, failed record retrieval, changed context,
   elapsed/byte/row/request reservation or cancellation ends the session incomplete.
   Unvisited approved collections remain named gaps. No policy refresh, authority
   retry, cross-session chaining, automatic continuation or resume is provided.

Returned metadata is not an instruction, authorization grant or new egress target.
The unchanged readers strip source/build payloads, environment values and unrelated
fields. The final manifest contains only pinned context, limits/usage, collection
identities, coverage summaries/hashes, denominator, interval and gaps—not raw rows,
credentials, request keys or raw diagnostics. Consumers needing projected row data
must use the qualified event-bound evidence store; the manifest is not that store.

## Evidence grades and non-claims

- `sourceTraversal`: all reported pages observed, or incomplete, for this session's
  unfiltered source traversal. It does not claim provider enumeration completeness.
- `suppliedRecords`: consistency of **accepted** supplied records only. Both helpers
  check records the caller supplies; they do not fetch or authenticate durable data.
  Even entirely fabricated self-consistent records cannot raise the evidence grade.
- `authenticatedDurableCoverage`: always `not-established`. No callback return value,
  journal snapshot or capture sink acknowledgement changes that grade. The sink may
  persist a receipt before the outcome audit fails; the unsuccessful core result is
  never accepted, even if the receipt exists.
- `consumerAcceptance`: always `not-established`. Native and consumer qualification
  remain separate. No source-only manifest claims to satisfy them.

Every manifest preserves `complete:false` and enumeration, snapshotConsistency,
hostingAbsence and nativeAcceptance `not-established`, including terminal empty
accounts. Interval observations are not atomic snapshots. Configured production
branches, deployment metadata and successful builds do not establish serving identity,
Pages hosting absence or estate-wide absence across Workers/external hosting.

## Verification and integration

`test/cloudflare-pages-traversal.test.mjs` supplies deterministic reducer fixtures and
actual-core broker fixtures over synthetic HTTP. It covers both multi-page loops,
zero/empty/missing/malformed/contradictory totals, ordering/duplicates, foreign/filtered
records, denied/revoked grants, context drift, every budget and cancellation, invalid
capture/target/plan/audit/journal, persistence-before-outcome uncertainty, concurrent
session token/replay isolation and redaction. Broker tests mock Date and use no live
provider. Random broker event/correlation identifiers are checked, never treated as
stable fixture values or authenticated evidence.

GitHub Actions is the CI of record. The Cloudflare provider workflow explicitly runs
the finite traversal file and the existing provider regression suite. No local full
suite, installation, live provider probe, production deployment or native acceptance
is part of this artifact. Security, applicable cryptography, final QA, exact-head
Actions/Devin/rulesets and production/install authority remain required on the final
provider package.

REA angle: reuse the pinned official schema and shipped reader/capture/join/broker
implementations instead of introducing a replacement collector or host bridge.
