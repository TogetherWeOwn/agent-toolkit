# GitHub read broker acceptance record

**NOT ACCEPTED / NOT INSTALLED.** Source and offline fixtures are a review candidate, not evidence of a live service. No credentials have been resolved or created for this implementation.

## Version envelope

- Plugin 0.1.0; core 0.1.0; extracted GitHub helpers 0.1.0.
- Exact SDK dependency: `@paperclipai/plugin-sdk@2026.1023.0` and lockfile integrity.
- Native host baseline: 2026.1023.0; Node 24.11+; GitHub REST 2022-11-28.
- Tools and per-tool endpoints/permission/refusal matrix: [README](README.md), [threat model](THREAT-MODEL.md), and `test/broker.test.mjs` through actual `register()` handlers.
- Intended credential ceiling: narrow App with the seven requested read permissions plus implicit metadata read. A broader interim key is a separately reviewed configuration envelope, not approved here.

## Verification ledger

| Evidence | State |
| --- | --- |
| Dependency provisioning: `npm install --ignore-scripts --no-audit --no-fund` | Completed; six locked dependency/workspace packages added; not test evidence |
| Local full suite / typecheck / CI mirror | **Not run**, deliberately; GitHub Actions is CI of record |
| Focused local reproduction | Not run; no failing Actions test identified yet |
| Exact-head GitHub Actions full suite / lint / native-policy / gitleaks | Pending; record run/job links and exact head SHA in the PR/tracker |
| Required Devin Review and finding dispositions | Pending |
| Security Engineer exact-source/artifact/config-envelope acceptance | Pending |
| Independent applied cryptography review of signing/mint/secret path | Pending |
| Native governance / honest isError / durable audit evidence on exact installed host | Pending sandbox verification |
| Operator install, secret binding, approved configuration | Not performed; gated |
| QA sandbox calls and eight-tool inventory visibility | Pending after authorized installation |
| Reviewed package SHA-256 and independent installability | Pending reviewed Actions artifact |

Source inspection establishes that the baseline native HTTP host performs a single DNS-pinned HTTPS request without following redirects and enforces DNS/request timeouts; the SDK drops caller `redirect` and `signal`. Host buffering is 200 MiB before the broker's 1-MiB bound. Source inspection is not a sandbox execution result or an approval of host telemetry/credential isolation.

## Review controls to record explicitly

1. Refused calls resolve no secret and issue no HTTP requests; immutable repo ID is checked after mint and before data access.
2. Mint cannot omit explicit repository IDs or permissions, cannot request writes/workflows, and verifies returned scope and expiry.
3. Generated key/token/JWT canaries remain absent from result/error/log/audit/cache-visible data, including reflected content and decoded files.
4. Activity sink durability/retention/integrity, gateway provenance/failure mapping and native access governance cover the exact plugin path.
5. Read-only lifecycle exception is understood: per-call revoke plus provider-enforced expiry, no persisted credential; ambiguous mint/crash can leave an expiring token. Process-local cleanup pause/rate limits reset on restart.
6. Host same-user access to unrelated credentials is outside this plugin's enforcement and must not be represented as remediated.
7. Operator follows the [runbook](README.md#install-and-rollback-runbook); no install is allowed on the basis of this pending document.

Acceptance must name the reviewed commit, package digest, trusted config hash/revision and App permission ceiling. Expanding these requires another review. No signature or acceptance is fabricated by filling this template.
