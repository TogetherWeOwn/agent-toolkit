# agent-toolkit

Reusable, deny-by-default policy helpers and synthetic test fixtures for narrow credential-broker tools. **No operational provider plugin is shipped or installed by this repository.**

A real tool keeps broad and internal-derived credentials in its trusted broker process and exposes only explicit, runtime-validated operations. Neither prompt instructions nor a model-generated schema is an authorization boundary. Prefer provider-native resource scoping or an existing broker when sufficient.

## Workspace

- `packages/policy`: bounded closed JSON schemas, ASCII scope guards, binding/lease/cap checks, exact dispatch, fixed-field audit and result/error boundary, durable adapter interfaces.
- `packages/test-support`: fake host clock/secrets, strict no-network transport, Cloudflare/GitHub fixture builders, disk-backed transactional SQLite state/approval/audit fixture and a synthetic-only reference handler.
- `packages/service-template`: **inert documentation outline**, not an installable tool.
- [STANDARD.md](STANDARD.md): full proposed per-tool security and acceptance standard, including OWASP/MCP rationale.
- [CATALOG.md](CATALOG.md): existing brokers, exposure models and evidence-based candidate demand.
- [ADAPTER-CONTRACTS.md](ADAPTER-CONTRACTS.md): what production state, approval, audit, secrets and cleanup adapters must actually guarantee.
- [Reference threat model](packages/test-support/THREAT-MODEL.md) and [refusal/evidence matrix](packages/test-support/ACCEPTANCE.md).

Use one package per cohesive service/tool; do not combine unrelated credentials or move existing plugins merely to fit this layout. Packages are private and no npm publishing workflow is configured.

## Local verification

Requires Node 24 (the test-only SQLite API is experimental), npm and Python 3 (stdlib-only workflow-guard tests). Bootstrap from the pinned lockfile:

```sh
npm ci --ignore-scripts
npm run check
```

After dependencies are installed, `npm run check`, `npm test`, `npm run typecheck` and `npm run build` require no network or provider credential. Tests use strict injected synthetic messages—there is no fetch/network fallback. Independent subprocesses contend on the same temporary SQLite database for reservation/approval tests; reopen tests exercise persisted intent and recovery transitions. Runtime-generated canaries are checked against results, audit/call records and database bytes, then temporary databases are removed.

These tests **do not** prove a provider integration, a production store, native plugin governance or autonomous restart-safe teardown. The reference's manually driven recovery function is not a scheduler. See the explicit gaps in the evidence matrix. Never install a destructive tool until the exact artifact/configuration/permission set has Security acceptance and a verified approval/governance path, followed by operator installation and trusted secret binding.

### Observed bootstrap verification

On 2026-11-03, Node 24.21.0 / npm 11.19.0: `npm ci --ignore-scripts --no-audit --no-fund` succeeded, followed by `npm run check` (type-check, build and 157 passing tests, no skipped tests). Actionlint 1.7.7 passed for all four workflow files. Gitleaks 8.30.1 reported no leaks in the baseline git history and a separate snapshot of all proposed source files. These are local observations, not a statement that PR checks or Security acceptance have passed.

## Contribution and merge gates

Follow the organization [contribution contract](https://github.com/TogetherWeOwn/.github/blob/main/CONTRIBUTING.md) and [pipeline standard](https://github.com/TogetherWeOwn/.github/blob/main/PIPELINE-STANDARD.md), subject to current governance: required CI and Devin Review; CodeRabbit is advisory, with every finding answered but no trigger/poll/wait. The final-stage reviewer merges the exact settled reviewed head in the approval run. Production-affecting merges/deploys require Release Manager approval; non-production merges do not need owner approval.

The first PR must report the actual `ci-ok`, `gitleaks`, `Devin Review` and PR-convention checks; the operator must configure the real required check names before first merge. An evaluate-only organization rule is not enforcement, and no missing check may be waived. There is no deploy or publish workflow in this change.

## License

MIT. See [LICENSE](LICENSE).
