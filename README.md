# agent-toolkit

Reusable, deny-by-default policy helpers and synthetic test fixtures for narrow credential-broker tools. **No operational provider plugin is shipped or installed by this repository.**

A real tool keeps broad and internal-derived credentials in its trusted broker process and exposes only explicit, runtime-validated operations. Neither prompt instructions nor a model-generated schema is an authorization boundary. Prefer provider-native resource scoping or an existing broker when sufficient.

## Workspace

- `packages/core`: shared bounded closed JSON schemas, ASCII scope guards, binding/lease/cap checks, exact dispatch, fixed-field audit and result/error boundary, durable adapter interfaces.
- `packages/core/src/testing`: fake host clock/secrets, strict no-network transport, Cloudflare/GitHub fixture builders, disk-backed transactional SQLite state/approval/audit fixture and a synthetic-only reference handler. Test-only modules are separate from the core policy entrypoint.
- `plugins/<provider>`: reserved for independently versioned, reviewed and installed plugins, one per provider credential trust boundary. No provider implementation is included.
- `plugins/_template`: **inert documentation outline**, not an installable tool.
- [STANDARD.md](STANDARD.md): full proposed per-tool security and acceptance standard, including OWASP/MCP rationale.
- [CATALOG.md](CATALOG.md): existing brokers, exposure models and evidence-based candidate demand.
- [ADAPTER-CONTRACTS.md](ADAPTER-CONTRACTS.md): what production state, approval, audit, secrets and cleanup adapters must actually guarantee.
- [Reference threat model](packages/core/testing/THREAT-MODEL.md) and [refusal/evidence matrix](packages/core/testing/ACCEPTANCE.md).

Share core code, not credentials or runtime authority: each provider worker loads its own pinned core version. Split sharply different production/test trust levels and expose many small single-purpose tools with their own read/write/destructive classifications, threat-model sections and refusal tests—not a provider action multiplexer. Verify actual worker, secret and native tool governance isolation; process separation is not an OS sandbox. Existing external plugins stay in their own repositories. Packages are private and no npm publishing workflow is configured.

## Local verification

Requires Node 24 (the test-only SQLite API is experimental), npm and Python 3 (stdlib-only workflow-guard tests). Bootstrap from the pinned lockfile:

```sh
npm ci --ignore-scripts
npm run check
```

After dependencies are installed, `npm run check`, `npm test`, `npm run typecheck` and `npm run build` require no network or provider credential. Tests use strict injected synthetic messages—there is no fetch/network fallback. Independent subprocesses contend on the same temporary SQLite database for reservation/approval tests; reopen tests exercise persisted intent and recovery transitions. Runtime-generated canaries are checked against results, audit/call records and database bytes, then temporary databases are removed.

These tests **do not** prove a provider integration, a production store, native plugin governance or autonomous restart-safe teardown. The reference's manually driven recovery function is not a scheduler. See the explicit gaps in the evidence matrix. Never install a destructive tool until the exact artifact/configuration/permission set has Security acceptance and a verified approval/governance path, followed by operator installation and trusted secret binding.

### Observed bootstrap verification

On 2026-11-03, Node 24.21.0 / npm 11.19.0: `npm ci --ignore-scripts --no-audit --no-fund` succeeded, followed by `npm run check` (type-check, build and 171 passing tests, no skipped tests). Actionlint 1.7.7 passed for all four workflow files. Gitleaks 8.30.1 reported no leaks in the baseline git history and a separate snapshot of all proposed source files. These are local observations, not a statement that PR checks or Security acceptance have passed.

## Contribution and merge gates

Follow the organization [contribution contract](https://github.com/TogetherWeOwn/.github/blob/main/CONTRIBUTING.md) and [pipeline standard](https://github.com/TogetherWeOwn/.github/blob/main/PIPELINE-STANDARD.md): required CI and Devin Review; CodeRabbit is advisory, with every finding answered but no trigger/poll/wait. The organization default is that the implementing agent merges after all gates pass. For work routed through a formal final review stage, current review governance overrides that default: the final-stage reviewer merges the exact settled reviewed head in the approval run, before marking the work done. This scaffold retains its required Security review and operator enforcement gate. Production-affecting merges/deploys require explicit approval through the applicable owner/delegated release-governance `request_confirmation` path; non-production merges do not need owner approval.

The first PR must report the actual `ci-ok`, `gitleaks`, `Devin Review` and PR-convention checks; the operator must configure the real required check names before first merge. An evaluate-only organization rule is not enforcement, and no missing check may be waived. There is no deploy or publish workflow in this change.

## License

MIT. See [LICENSE](LICENSE).
