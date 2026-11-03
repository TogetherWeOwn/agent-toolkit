# Evidence matrix — synthetic reference, not provider acceptance

**Not accepted for installation.** This package has no manifest, tool registration, provider HTTP client or operational service. Security review of a source PR does not constitute production installation acceptance. Native plugin governance on the target host has not been verified. No destructive tool may be installed from this package.

Run the actual dispatcher via `DemoHandler.invoke` for the implemented synthetic surface. Tests under `test/` are repository-relative below. Generated test cases cover equivalence classes/boundaries, not exhaustive arbitrary inputs.

| Policy / forbidden capability | Named evidence |
| --- | --- |
| Unknown tool, provider operation, shell/HTTP fallback, inherited names | `test/policy.test.mjs`: `unknown dispatch …` |
| Unknown keys/objects/nested values, prototype pollution, forged identity/header/secret/approval arguments | `test/policy.test.mjs`: `closed top-level schema …`, `nested unknown key …` |
| Numeric/Unicode/name/path/size/type boundaries | `test/policy.test.mjs`: `ASCII name …`, `numeric TTL schema …`, `currency schema …`, `JSON descriptor, symbol, cyclic, sparse, depth, size and generated malformed boundaries` |
| Prefix without authority; foreign tenant/agent/project/task handle | `test/policy.test.mjs`: `prefix guard …`, `trusted identity mismatch …`, `ledger binding mismatch despite valid prefix …` |
| Missing/revoked assignment, non-active lease, expiry, immediate revalidation | `test/policy.test.mjs`: `non-active ledger …`, `missing, stale assignment and expired lease fail before credentials`, `immutable parsed snapshot and last-moment scope revalidation`, `expiry during multi-read inspection stops next call` |
| Explicit finite TTL/currency/count caps, no renewal, zero cost explicit | `test/policy.test.mjs`: `finite caps …`; `test/lifecycle.test.mjs`: `provision boundary TTL …`, `invalid limits …`, `count and spend enforce independent caps; zero cost is explicit` |
| Atomic cross-process reservations; single-use approvals after reopen | `test/lifecycle.test.mjs`: `atomic budget and count caps across processes`, `one approval is consumed once under concurrent processes and survives reopen` |
| Missing/forged/revoked/expired/future/replayed grants, binding/resource/version/policy/argument/artifact drift and authority outage | `test/lifecycle.test.mjs`: `approval refusal …`, `approval evaluator outage is closed` |
| Secret reflection in successful/error/malformed/redirected bodies and exception causes; no raw provider output | `test/failures.test.mjs`: `safe success/error projection discards broad and internal-derived reflections`, `boundary cannot emit arbitrary upstream result or exception`; canary checks also run throughout lifecycle/preflight tests |
| Audit intent/outcome correlation, pre/post-effect and permanent sink failures, invalid clock | `test/failures.test.mjs`: `audit outage at write …`, `permanent audit outage and invalid clock fail closed` |
| State lookup/reservation unavailable | `test/failures.test.mjs`: `state lookup/reservation outages prevent secret resolution and provider calls` |
| Strict origin/method/path/request/credential matching; no live fallback; incomplete/unexpected calls fail | `test/failures.test.mjs`: `strict CF/GitHub/generic API fixtures never fall back to live network` |
| Partial creation, lost response, unavailable secret, retained budget and disk reopen | `test/lifecycle.test.mjs`: `partial provisioning retains intent and budget for restart: …` |
| Both child removals negatively verified, approval consumed first | `test/lifecycle.test.mjs`: `approved destruction verifies both children and closes only afterwards` |
| Manually driven expiry/completion/cancellation/orphan recovery; repeated teardown | `test/lifecycle.test.mjs`: `manually driven recovery contract …`, `expiry never cleans unexpired active leases; orphan never sweeps by prefix` |
| Child deletion failure, partial/paginated/positive relist cannot release budget | `test/lifecycle.test.mjs`: `cleanup incomplete/partial verification …`, `one child deletion fails but the other is attempted; new work stops`, `cleanup with unavailable secret or foreign ledger cannot claim removal` |

Additional review regressions in `test/revalidation.test.mjs` cover current approval time after awaited lookup, independently approved artifact drift from the persisted intent, identity revocation during ledger lookup/DELETE, paginated negative-presence evidence, late creation responses at expiry, per-lease recovery failure isolation, and method-based host clocks. All eight tests were observed failing before their fixes; they do not establish production fencing or scheduler coverage.

All preflight assertion helpers check zero secret resolution, zero outbound calls, unchanged resource state and a safe refusal audit record. Audit-outage tests cannot assert an unavailable sink contains a record. Reserve-time capacity denial occurs after safe audit intent but before credentials or provider calls. Tests measure the SQLite fixture, not a future adapter.

## Required production acceptance record (intentionally open)

- Exact source revision, built artifact digest, supported tool/API/SDK versions and configuration envelope: **no production artifact**.
- Security Engineer acceptance of the exact artifact/permission inventory: **not obtained**.
- Verified native governance evaluator and call-event path on the target host/version; least-privilege agent/project/task MCP profile, destructive `require_approval`: **not verified; install forbidden**.
- Real durable scheduler/fencing, budget worst-case calculation, provider scopes, idempotency, complete pagination and audit outbox: **not implemented here**.
- Operator install/configuration/secret binding/revocation runbook: use a service-specific accepted package; this reference is not installable. No credential creation/rotation or security exception is authorized.

The root README records observed local commands. CI/reviewer status must be read from the actual PR, never inferred from this matrix. Add real service packages only after their own threat model, contract implementation and refusal matrix are complete.
