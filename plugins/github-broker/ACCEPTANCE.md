# GitHub read broker acceptance record

**NOT ACCEPTED / NOT INSTALLED.** Source and offline fixtures are a review candidate, not evidence of a live service. No credentials have been resolved or created for this implementation.

## Version envelope

- Plugin 0.1.0; core 0.1.0; extracted GitHub helpers 0.1.0.
- Exact SDK dependency: `@paperclipai/plugin-sdk@2026.1023.0` and lockfile integrity.
- Native host baseline: 2026.1023.0; Node 24.11+; GitHub REST 2022-11-28.
- Tools and per-tool endpoints/permission/refusal matrix: [README](README.md), [threat model](THREAT-MODEL.md), and `test/broker.test.mjs` through actual `register()` handlers.
- Intended credential ceiling: narrow App with contents, pull requests, issues, checks, statuses and Actions read plus metadata read (the sole explicit permission for ruleset GETs). Administration, all write permissions and the `workflows` permission are excluded from minting; workflow-run metadata reads use `actions: read`. Only the separately approved narrow App may be bound; there is no broad interim-key fallback.

## Verification ledger

| Evidence | State |
| --- | --- |
| Dependency provisioning: `npm install --ignore-scripts --no-audit --no-fund` | Completed; six locked dependency/workspace packages added; not test evidence |
| Local full suite / typecheck / CI mirror | **Not run**, deliberately; GitHub Actions is CI of record |
| Focused local reproduction | After Actions exposed a root-script regression, `node --test --test-timeout=30000 --test-name-pattern='root build and typecheck reject invalid plugin source' test/workflows.test.mjs` passed: 1 test, 0 failures, 467 ms. Diagnostic only, not full CI evidence. |
| GitHub Actions initial head `b154626631662c7a5f1192309e65d85181cf6f0f` | [CI run](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42275888988): lint/typecheck and native-policy passed; test failed in the existing root script-contract fixture before broker fixtures ran. Root build was restored to its single compiler command; workspace packaging now runs from the test pipeline. Corrected-head full-suite evidence remains pending. |
| GitHub Actions second head `bc889e49de0b606ed71cdebae4f9b3a4bac920d7` | [CI run](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276368002): 174 core/root and 122 work-supply tests passed; broker fixtures had 20 passes / 23 failures. Successful-call fixtures incorrectly compared core's deliberately null-prototype secret binding against a plain object. The fixture now asserts the null prototype and compares only its own fields; production validation is unchanged. Corrected-head verification is pending. PR lint, PR standards and gitleaks passed at this head. |
| GitHub Actions head `f455a5356e22b1084b5088801afcfa49c23d2484` | [CI run](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276733082) passed: [lint/typecheck](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276733082/job/128094896056), [test](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276733082/job/128094896214), [native-policy](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276733082/job/128094896395) and ci-ok. [CodeQL analyses](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276722516), [PR standards](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276732480) and [gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42276732580) passed. Identity-lane changes require fresh exact-head evidence. The separate PR-size workflow reports a workflow failure; it is not represented as a pass. |
| App-only head `06a3fecdde608c8a67de831599176f3c2f8f4e5a` | [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42278637233) passed lint/typecheck, native-policy, tests and ci-ok: 174 core/root + 122 work-supply + 44 broker tests. [Security source review](https://github.com/TogetherWeOwn/agent-toolkit/pull/6#pullrequestreview-5805747971) accepted this prior head only; [cryptography review](https://github.com/TogetherWeOwn/agent-toolkit/pull/6#pullrequestreview-5805749272) requested metadata-only ruleset mints. No installation approval was given. |
| Review-fix head `f6d62975903207561b27f9d6f9a237d4e17288a5` | [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281314490) passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281314490/job/128110766325), lint/typecheck, native-policy and ci-ok (58 broker tests). [CodeQL](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281044707) and gitleaks passed. PR standards failed on two newly posted unanswered findings; those are not waived. Follow-up adds verified Advanced Security App 57789 for CodeQL, effective retry hints, provider-failure audit preservation and MCP root object schemas. Latest-head Actions and delta reviews remain pending. |
| Producer-qualified head `640aa16fe74ffddad5ae219bdc90576b8edcbeb5` | [Actions CI](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854887) passed [tests](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854887/job/128112633040), [lint/typecheck](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854887/job/128112632970), [native-policy](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854887/job/128112632980) and [ci-ok](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854887/job/128112783696): 174 core/root + 122 work-supply + 60 broker = 356 tests. [CodeQL](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281847814), [gitleaks](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854388), PR lint and [PR standards rerun](https://github.com/TogetherWeOwn/agent-toolkit/actions/runs/42281854373/job/128114455080) passed. Devin completed successfully; cubic finished and added five findings, addressed in the next batch. |
| Current follow-up batch | Bounds detached native IPC until actual settlement, suppresses ambiguous/incomplete check-run successes, and clarifies workflow reads versus writes. Regression fixtures added before fixes; **not run locally**. This batch needs its own exact-head Actions and independent delta reviews; the successful prior head above is not substituted. |
| Required Devin Review and finding dispositions | Completed on `640aa16`; follow-up head must settle independently with every finding answered |
| Security Engineer exact-source/artifact/config-envelope acceptance | [Source accepted at `640aa16`](https://github.com/TogetherWeOwn/agent-toolkit/pull/6#pullrequestreview-5806029123); follow-up source delta and exact-artifact/config/host acceptance remain pending |
| Independent applied cryptography review of signing/mint/secret path | [Source accepted at `640aa16`](https://github.com/TogetherWeOwn/agent-toolkit/pull/6#pullrequestreview-5806024026); follow-up delta and installed-envelope acceptance remain pending |
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
