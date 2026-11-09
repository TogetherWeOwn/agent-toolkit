# Native integration candidates — not qualification or installation

The reviewed provider core defines ports, not a production host. More descriptor
coverage cannot supply authenticated identity, durable state or approval authority.
This record narrows the actual native SDK integration work without claiming that
an installed host satisfies it. No native tool is registered or enabled.

## Pinned SDK evidence

Static inspection uses the repository's existing locked
`@paperclipai/plugin-sdk@2026.1023.0` artifact:

- URL: `https://registry.npmjs.org/@paperclipai/plugin-sdk/-/plugin-sdk-2026.1023.0.tgz`
- Lockfile SHA-512 verified before reading archive members.
- Archive SHA-256: `972c5b99dd48e8e033c81a1b14118fac9f38f3ecf48cd448da5922f93232c908`.
- Evidence locations below refer to `package/dist/types.d.ts` within that artifact.
  Reading declarations neither executes the package nor verifies the installed
  server implementation/version, native capability grants or SQL admission.

| Core obligation | SDK surface | Source conclusion and remaining qualification |
| --- | --- | --- |
| Authenticated company/agent/project/task/run | `ToolRunContext`, lines 99–108; issue orchestration run summaries, lines 1001–1012 | Tool context has company/agent/project/run, **no task**. Never fill task from model arguments or configuration guesses. Qualify an authenticated host run-to-current-task join and current assignment/resource revision checks. |
| Current per-agent AND operation/resource policy | `config.get`, lines 255–262; authorization policy API, lines 1578–1625 | Company-scoped config/policy reads exist. Assignment preview is not provider-operation authorization. Define/review the exact current policy mapping and revision semantics; no policy writes are commissioned here. |
| Exact reserved source authority | approval API, lines 1298–1331 | Approval reads/decisions do not by themselves provide target-bound verification plus atomic single consumption. No self-issued grant or board-user impersonation; source stays reserved and unavailable until its native authority seam qualifies. |
| Atomic replay journal | `state`, lines 573–603; `db`, lines 425–434 | State get/set is replacement/upsert, **not** claim-if-absent. Restricted DB execute is a candidate for single-statement unique insert/conditional update. Actual host grammar, table migration and durable commit semantics remain unverified. |
| Credential lease and output protection | `secrets.resolve`, lines 467–484 | Call-time bound secret-reference resolution exists. It does not establish Cloudflare connection compatibility, authorized custody, short-lived minting or safe native transport. No credential resolution/minting is performed. |
| Durable audit/evidence and retrieval | `activity.log`, lines 490–519; authorization audit search, lines 1612–1624 | Logging/search surfaces exist; no immutable append acknowledgment, retention/integrity, complete authenticated replay retrieval or capture/outcome join is established by declarations. |
| Native transport and provider media | `http.fetch`, lines 436–455 | A `RequestInit` signature does not prove streaming bounds, cancellation or redirect semantics across RPC. Existing Github transport relies on a separately verified host contract, not automatic Cloudflare compatibility. Qualify actual metadata/content media and safe request correlation separately. |

REA angle: reuse the shipped SDK's restricted database namespace and the existing
provider executor, rather than treating key-value get/set or a process-local map
as an atomic native journal. Native qualification still needs exact-host evidence.

## Candidate replay journal

`src/native-journal.ts` implements only the `ProviderDependencies.journal` port
against the existing SDK DB shape. It is not connected to `read-broker.ts`, a
worker, a manifest or a secret resolver. Construction requires a host-supplied
namespace and executor; neither is accepted from a tool argument. The bounded
lowercase SQL identifier subset is quoted, the table name is fixed, and call data
uses positional parameters. The executor and namespace are captured once.

The separately provisioned table is `cloudflare_provider_calls`, with columns:

- `key`: primary/unique, non-null 64-character lowercase hex request-key hash.
- `target`: non-null 64-character lowercase hex authorization-target hash.
- `event`: non-null bounded core-generated event identifier.
- `outcome`: non-null `pending`, `complete`, `refused` or `uncertain`.

The adapter issues **no DDL or schema changes**. Host schema migration, SQL
allowlisting/capabilities and constraints must be reviewed and provisioned through
the applicable release/operator gates before use. It must use a plugin-owned
namespace; accepting a syntactically valid namespace is not authorization to a
core/shared namespace. No raw database connection, generic SQL tool or fallback
storage is supplied.

A claim is one `INSERT ... ON CONFLICT (key) DO NOTHING`. Only an exact affected-row
count of one wins; zero is replay regardless of changed target/event or prior
outcome. No read-before-write or in-process lock is relied on. Completion is one
conditional update matching key **and original event**. Pending may reach a terminal
outcome, repeated identical terminal writes are idempotent, and complete may
become uncertain after a later failed outcome audit. Uncertain is absorbing;
refused cannot become complete. Tombstones are never deleted, expired or taken
over. A lost claim acknowledgment can leave pending indefinitely: this safely
denies replay and needs reconciliation, not automatic retry under a new key.

Database exceptions, unexpected row counts and invalid arguments produce only
`cloudflare.journal.unavailable`, without a cause or raw SQL/provider diagnostic.
Core then emits its fixed refusal/uncertain result. An acknowledgment failure does
not prove that the database write failed; retained rows remain authoritative for
exclusion. A completed row alone is not a successful call: a matching durable
ALLOW outcome and capture receipt must also be accepted independently.

## Candidate exact-record retrieval

The separate `createCloudflareNativeJournalReader` factory captures only the
host-derived namespace and SDK `db.query` method (declaration lines 425–429),
not the writer. Its internal `read` requires a request-key hash, independently
expected target hash and original event. One parameterized fixed-table SELECT
by key returns at most two rows so duplicate records refuse even if the host's
unique constraint is broken. No scan, pagination, arbitrary selector or mutation
is exposed. Missing rows return null; wrong target/event, malformed columns,
invalid outcome, duplicate rows and query exceptions produce the same fixed
`cloudflare.journal.unavailable` diagnostic without raw values or causes.
Only a frozen targetHash/event/outcome snapshot returns; request keys and any
unexpected columns never return. The factory is not connected to a tool, broker,
coverage join or native handler.

This narrows retrieval source work, **not authenticated native evidence
acceptance**. The host must authorize the reader and supply the expected key,
target and event from accepted correlation, never from untrusted model input.
A missing row is not proof that no call executed. Pending/refused/uncertain are
never promoted to success, and complete alone is not success either: core can
write complete before outcome audit, then downgrade it to uncertain. A snapshot
can become stale immediately. Native acceptance still needs independently
accepted durable ALLOW audit/capture records, complete authenticated retrieval
and a qualified consistency boundary; this reader provides no transaction,
current-policy authority, successful-call attestation, reconciliation or retry.
No native SELECT admission, capability or production database access is inferred
from SDK declarations or isolated SQL fixtures.

## Candidate append-only capture persistence

`src/native-evidence.ts` supplies separate internal sink and exact-record reader
factories for the existing `CaptureEvidenceSink` contract. Neither is wired into
a tool, broker, manifest or native handler. They capture the host-derived namespace
and only their respective SDK `db.execute` / `db.query` method. The separately
provisioned fixed table is `cloudflare_capture_evidence`:

- `event`: primary/unique, non-null bounded core event identifier.
- `contract`: non-null literal `toolkit.cloudflare-capture/v1`.
- `subject`: non-null literal `credential-filtered-current-content-projection` or
  `credential-filtered-pages-list-projection`.
- `target_hash`, `value_hash`: non-null 64-character lowercase hex hashes of the
  exact core target and credential-filtered projection respectively.

Only closed bounded records enter parameterized SQL. Append is one plain INSERT;
a duplicate event refuses even when identical, never overwrites the observation,
and never retries a lost acknowledgment. Exactly one affected row is required.
No DDL, update/delete, scan, TTL, automatic reconciliation or fallback is supplied.
The reader takes an independently expected full record, performs one SELECT by
exact event with LIMIT 2, refuses duplicates/extra/corrupt/foreign fields and
returns only a frozen matching record or null. Database/validation failures expose
only `cloudflare.evidence.unavailable`, without causes or raw diagnostics. No raw
source, projection body, credential or target arguments are stored by these ports.

A committed capture is an **observation, not successful-call acceptance**. A lost
acknowledgment can retain a capture while suppressing output; a later failed ALLOW
outcome audit leaves the capture with an uncertain journal. Null is not proof of
no execution. The reader does not authorize its caller, validate current policy,
prove authenticity/durability or provide a transactionally consistent audit/journal
join. Host SQL admission, plugin-owned namespace isolation, schema constraints,
PostgreSQL commit/restart semantics, retained authenticated retrieval and the exact
capture/audit/journal consistency boundary remain unqualified. Installation and
schema provisioning require their existing independent review/release gates.

`test/cloudflare-native-evidence.test.mjs` uses isolated SQLite and synthetic core
ports for immutable/reopened records, duplicate/foreign/corrupt refusals, strict
validation, redacted failures, lost acknowledgment and actual-core content/Pages
capture-success, delayed acknowledgment, outage, audit-failure and replay cases.
These are source contracts, not native PostgreSQL, host or provider qualification.

## Candidate append-only provider audit

`src/native-audit.ts` supplies separate internal sink and exact event/phase reader
factories for the reviewed core's audit port, using only captured SDK DB methods
and a fixed `cloudflare_provider_audit` table. No worker, manifest, broker or tool
connects these candidates. The separately provisioned schema requires:

- `event` and `phase`: non-null composite primary/unique key, bounded core event
  identifier and `refused`, `intent` or `outcome` respectively.
- `time`: non-null exact nonnegative safe-integer local clock observation; the DB
  reader must preserve its numeric type/value. No timestamp string coercion.
- `decision`: non-null `ALLOW` or one of the reviewed core's fixed refusal codes.
- `contract`, `provider`: non-null exact `toolkit.provider-broker/v1`, `cloudflare`.
- `tool`: nullable bounded Cloudflare operation label.
- `principal_hash`, `target_hash`: nullable 64-character lowercase hex hashes.

Closed records are validated before SQL. Intent requires ALLOW and non-null tool,
principal and target; outcome requires those non-null bindings, while refused
cannot be ALLOW. Early refusals may lack identity/target/tool. These are structural
checks, not proof that the supplied record came from an authenticated executor.
The sink performs one parameterized INSERT requiring exactly one affected row.
Duplicate event/phase appends always refuse; no upsert, retry, update/delete, DDL,
scan or fallback. The reader requires an independently expected full audit record,
selects by event/phase with LIMIT 2, rejects duplicates/corruption/extra fields or
any expected-value mismatch, and returns a frozen matching record or null. Errors
expose only `cloudflare.audit.unavailable`, without causes or DB diagnostics.
No raw arguments, principal identifiers, credential or projection bodies enter
this table. Existing namespace authorization/provisioning gates still apply.

Persisted ALLOW is **not call success**: the core can receive a lost outcome
acknowledgment after commit, suppress output and mark the journal uncertain. Its
subsequent refusal append cannot overwrite the retained ALLOW phase. Similarly,
lost intent acknowledgment can retain an intent followed by a refused record
without any credential/network access or journal claim. Separate phase records
provide no authenticated insertion order, monotonic clock or transactionally
consistent journal/capture join. The port is not a reconciliation or acceptance
engine; null is not proof of no execution. Host SQL admission, PostgreSQL schema
and numeric decoding, unique constraints, commit/restart retention, namespace
isolation, complete authenticated retrieval and an accepted consistency boundary
remain unqualified, along with current policy/authority and provider media.

`test/cloudflare-native-audit.test.mjs` covers isolated SQLite reopen/immutable
phase records, fixed SQL/strict pre-SQL validation, exact expected-record reads,
corruption/redaction/lost acknowledgment and actual-core Pages capture, intent
outage, outcome outage, delayed acknowledgment and uncertain replay behavior.
These source contracts do not qualify a native host or enable a consumer tool.

## Published SDK wire contracts

`test/cloudflare-native-sdk.test.mjs` constructs all six candidate writer/reader
ports from the real locked SDK's `startWorkerRpcHost` setup context. Static
inspection of that same integrity-verified artifact shows that initialize supplies
`databaseNamespace` before setup (`worker-rpc-host.js`, lines 1354–1358), the
namespace getter exposes that value, and query/execute forward `{sql, params}`
through JSON-RPC (lines 362–371). The test uses the SDK implementation, not a
replacement context or RPC decoder. Only the host is a synthetic SQLite fixture.
No Cloudflare tool is registered, credential resolved or provider contacted.

The contracts check missing/malformed namespace bootstrap refusal, exact fixed
SQL/positional parameters, concurrent claim-response correlation, absorbing
uncertainty, safe-integer/null audit round trips, rejection of a host-supplied
string-valued timestamp, and redaction/no retry after explicit host errors or a
committed write's lost acknowledgment. They establish only the published worker's
wire behavior for the supplied synthetic responses. They do not identify the
installed host version, qualify its SQL parser or PostgreSQL decoder, prove caller
or namespace authorization, exercise durable restart/retention, or accept an
atomic audit/journal/capture join. The host-client factory declares separate
`database.namespace.read` and `database.namespace.write` capabilities (lines
103–105); tests of the worker do not establish that those grants exist or that the
installed host enforces them. Actual Actions results must be recorded separately.

## Published SDK HTTP is not the bounded Cloudflare transport

Static inspection of the same locked `worker-rpc-host.js`, lines 376–411,
shows that `ctx.http.fetch` serializes only method, headers and body. It drops
`redirect`, `signal`, `credentials`, `cache` and `referrerPolicy`, then reconstructs
a new `Response` from one complete host result. Its reconstructed URL is empty
and `redirected` is false; host-provided fields with those names are not copied.
Consequently, those local response fields cannot attest that the host did not
follow a redirect. A local abort does not send host cancellation through this
SDK method, even when the signal was already aborted before dispatch.

Three additional real-SDK/synthetic-host contracts in
`test/cloudflare-native-sdk.test.mjs` characterize the dropped request controls,
in-flight abort followed by an accepted late reply, UTF-8 reconstruction of a
host-supplied text body and the pinned empty-204 `Response` construction failure.
The fixture sends no provider request and makes no claim that the installed host
follows redirects or corrupts bytes. A synthetic host string does not establish
original provider-byte fidelity; it only establishes what the worker reconstructs.
Exact Actions results must be recorded separately.

Do **not** pass `ctx.http.fetch` directly as the fetcher to
`metadata-transport.ts`. The transport's streamed 128 KiB cap and 10-second
maximum timeout cannot retrospectively bound the host's download or buffering,
and cancelling a reconstructed local body cannot establish native settlement.
Strict UTF-8 decoding and CURRENT response/part-byte digests require qualified
byte fidelity before any text decoding, not a re-encoding of an unqualified host
string. The reviewed GitHub adapter already documents separate host guarantees
and quarantines uncertain host calls; its larger response cap and deadlines are
not the Cloudflare transport contract and are not inherited here.

SE1's native transport prerequisite is an exact-host, reviewed byte-preserving
and resource-bounded path: fixed Cloudflare origin/no redirects, broker-only
credential handling, bounded native response bytes/time/concurrency, proven
cancellation or bounded detached-work accounting, and actual media/correlation
qualification. Any buffered alternative needs an explicitly reviewed equivalent
contract rather than a cast or wrapper around the SDK signature. No host change,
SDK upgrade, direct-network escape hatch, native wiring or runtime grant is
supplied by these characterization tests. Current metadata and reserved content
ports remain unconnected and unqualified; the other native seams remain open.

## Source tests versus native acceptance

`test/cloudflare-native-journal.test.mjs` executes the candidate statements on
isolated SQLite files through an SDK-shaped test port. It covers separate
connections/processes, reopen, changed-target replay, event ownership, terminal
monotonicity, invalid inputs/results, and actual-core credential/network exclusion
and lost-write-acknowledgment/audit-outage behavior. SQLite success is **not**
PostgreSQL execution, host restricted-SQL admission or production durability.
No production data, credentials or provider requests are used.

## Isolated PostgreSQL dialect contracts

The dedicated `cloudflare-postgres-contracts` Actions job runs
`testing/postgres-contracts.mjs` against digest-pinned PostgreSQL 17.7. Its
randomized schemas/tables are disposable test setup, not a shipping migration.
No runtime driver or workspace dependency is added: the runner's `psql` client
prepares the candidate's positional-parameter statements on the server and uses
synthetic EXECUTE literals. Each call starts a separate connection; concurrent
claims therefore exercise PostgreSQL uniqueness rather than a shared JS lock.
The client inherits only PATH and fixed ephemeral test connection settings, not
provider credentials or a supplied database URL. The test file fails if its
explicit CI opt-in or mapped service port is absent; it is not silently skipped
in the ordinary unit suite. The Actions service is torn down with the job, and
test cleanup drops only its randomized schemas.

The contracts cover claim contention/reopened ports, original-event conditional
updates/absorbing uncertain and refused outcomes, capture/audit append uniqueness,
exact reader mismatch refusal, distinct schemas and BIGINT JSON round trips from
zero through the maximum safe integer. A simulated string-valued BIGINT decoder
still refuses. Actual core composition uses all three PostgreSQL-backed candidate
ports for successful Pages capture and for lost intent/outcome acknowledgments;
retained ALLOW plus uncertain replay must never become successful output.

These tests narrow **SQL-dialect and fixture-decoding** uncertainty, not native
qualification. The psql/JSON bridge is not the SDK's restricted-SQL parser,
parameter protocol or RPC decoder. A reopened connection is not a database/server
restart or retention drill. The test superuser can access either schema, so
separate records are not proof of caller/namespace authorization. No native
handler, credential resolver, provider request, production schema provisioning,
accepted audit/evidence consistency boundary or enabled tool is supplied. Exact
Actions results must be recorded separately; test source alone is not a pass.

Before this candidate can satisfy the native seam, verify the exact installed
host's allowed SQL statements and schema binding, PostgreSQL unique-insert and
conditional-update semantics across workers/restarts, durable acknowledgments and
lost-response recovery, plugin namespace isolation/capability revocation, retained
tombstone access control, and complete authenticated journal/audit/evidence
retrieval. Security, Crypto and QA acceptance remain required. Migration,
installation and enablement remain separately gated; no accepted consumer subset
or production-ready journal is claimed by this source record.
