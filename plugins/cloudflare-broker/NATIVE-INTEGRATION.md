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

## Source tests versus native acceptance

`test/cloudflare-native-journal.test.mjs` executes the candidate statements on
isolated SQLite files through an SDK-shaped test port. It covers separate
connections/processes, reopen, changed-target replay, event ownership, terminal
monotonicity, invalid inputs/results, and actual-core credential/network exclusion
and lost-write-acknowledgment/audit-outage behavior. SQLite success is **not**
PostgreSQL execution, host restricted-SQL admission or production durability.
No production data, credentials or provider requests are used.

Before this candidate can satisfy the native seam, verify the exact installed
host's allowed SQL statements and schema binding, PostgreSQL unique-insert and
conditional-update semantics across workers/restarts, durable acknowledgments and
lost-response recovery, plugin namespace isolation/capability revocation, retained
tombstone access control, and complete authenticated journal/audit/evidence
retrieval. Security, Crypto and QA acceptance remain required. Migration,
installation and enablement remain separately gated; no accepted consumer subset
or production-ready journal is claimed by this source record.
