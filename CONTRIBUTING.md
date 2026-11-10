# Contributing

Follow the [organization contribution contract](https://github.com/TogetherWeOwn/.github/blob/main/CONTRIBUTING.md), use its PR template, and open PRs as drafts until implementation and verification are complete. Keep public text free of internal tracker references. Full suites, builds and required gates run on GitHub Actions for the exact PR head; local checks below are separate, bounded diagnostics, not a substitute for CI or independent review.

## Fresh install

Use Node **24.11 or newer within 24.x** and npm **11.19 or newer** (the latter supports the repository's native `min-release-age` setting). Run commands from the repository root. No internal package build, generated source, plugin installation, credential or running service is needed for the source checks.

Before installing, inspect the root/workspace manifests and lockfile for lifecycle hooks and `hasInstallScript` entries. Preserve `.npmrc`'s three-day release-age and `ignore-scripts=true` controls. An existing lockfile is not a retrospective provenance audit; don't enable hooks to work around a missing output.

On a shared host, inspect `/proc/loadavg`, `nproc`, `/proc/meminfo` and `df -P /home`. Do not install if one-minute load exceeds logical CPUs, available memory is below 10% or `/home` is at least 85% full. If dependencies are absent and admission passes:

```sh
# Choose a task-owned scratch directory, not the shared npm cache.
CACHE_ROOT=$(mktemp -d)
nice timeout -k 10 300 npm ci --ignore-scripts --cache "$CACHE_ROOT/npm-cache"
```

`npm ci` is the frozen-lockfile install. Install once and reuse it unless the lockfile changes. Record elapsed time, Node/npm versions, input SHA, scope and results. An install failure or timeout is not a pass. If checks need an unavailable build, database, browser or network service, record the skip and rely on the exact-head Actions job instead; don't broaden the local run.

## Choose the affected package, not individual TypeScript files

Use `git diff --name-only <base>...HEAD` plus any uncommitted diff to identify the changed workspace. Check its whole TypeScript project, including transitive source imports, with **one** of these commands per affected workspace:

```sh
nice timeout -k 10 120 npm run typecheck --workspace packages/core
nice timeout -k 10 120 npm run typecheck --workspace packages/github
nice timeout -k 10 120 npm run typecheck --workspace plugins/github-broker
nice timeout -k 10 120 npm run typecheck --workspace plugins/neon-broker
```

Each invokes `tsc -p tsconfig.json --noEmit` in that workspace, inheriting the root strict compiler options. Neither root `dist` nor plugin `dist` is required or emitted. Check consumers too when changing shared contracts. Do not pass file names directly to `tsc`: that bypasses project configuration. An unknown workspace fails, rather than selecting all workspaces. `packages/work-supply` is JavaScript and has no configured TypeScript check; record that fact, not a fictitious type-check success.

The root `npm run typecheck` still checks all TypeScript sources for CI; it is not the affected-package entry point. There is no separate formatter or JavaScript linter script currently configured. Workflow actionlint runs on Actions; don't download host tooling for a local check.

## Select explicit covering unit-test files

Choose files changed in the diff and files testing the changed modules/contracts. Search imports and existing cases; these are not necessarily in the same workspace. Pass repository-root-relative, existing `.test.mjs` files under `test/`, `packages/<name>/test/` or `plugins/<name>/test/`:

```sh
# Tooling resolver, project-selection and failure-propagation regressions:
nice timeout -k 10 300 npm run test:covering -- test/source-checks.test.mjs

# One provider's mocked unit tests, without building that provider or core:
nice timeout -k 10 300 npm run test:covering -- plugins/neon-broker/test/metadata.test.mjs

# Multiple explicitly chosen covering files, not an implicit suite:
nice timeout -k 10 300 npm run test:covering -- \
  test/source-checks.test.mjs plugins/github-broker/test/discovery.test.mjs
```

The command requires at least one file. Missing files, directories, literal globs, flags, non-test files and symlinks escaping the repository fail with exit 2 **before any file runs**. Do not use a shell-expanded suite-wide glob as a shortcut. Selected files execute literally (no glob expansion, so names containing brackets run exactly the named file, never a matching sibling). A test failure returns nonzero, as does a runner error or timeout. Each file has Node's 30-second test timeout; the runner also has a 290-second child timeout, inside the caller's separate 300-second bound. On timeout the runner SIGTERMs, then SIGKILLs after a 5-second grace, its owned process group and reports nonzero, so a test that ignores SIGTERM or leaves a descendant cannot survive the wrapper. `TEST_COVERING_TIMEOUT_MS`/`TEST_COVERING_GRACE_MS` may shorten those bounds for the teardown regression only. Type-checking and tests are independent commands, never a chained CI mirror.

### How source resolution works

The test command preloads `scripts/source-resolver.mjs` and enables Node 24's native `--experimental-transform-types`. Transformation is needed for existing TypeScript parameter properties; type stripping alone is insufficient. The test-only Node module hook redirects existing test imports:

- `dist/packages/<name>/src/*.js` to `packages/<name>/src/*.ts`;
- `plugins/<name>/dist/{packages,plugins}/.../src/*.js` to the corresponding repository source;
- relative `.js` imports inside those TypeScript sources to `.ts` (including query-qualified parent modules).

It always chooses source for these aliases, even if stale output exists. Missing source remains an error, not a fallback to stale `dist`. Installed dependencies, external candidate checkouts and other JavaScript imports retain normal resolution. No aliases, exports, runtime source files, package artifact paths or build scripts are changed. There is no generated-source bootstrap in the current toolkit; introduce a separately reviewed prerequisite if one becomes necessary rather than silently building the repository here.

The resolver only affects module imports in the launched test process. It does not materialize `dist` for filesystem reads, symlinks or subprocesses that discard the preload/transform flags. Existing artifact/CLI/crash-process tests relying on those outputs and the separately pinned Neon compatibility checkout remain build/Actions checks; do not claim source-only coverage for them. Node's experimental API warning is expected, not a test failure.

`test/source-checks.test.mjs` exercises the existing in-memory common provider fixture with both trusted context and a copied principal. Its isolated `assertion.test.mjs` fixture intentionally asserts the wrong authorization result: the parent regression requires `ERR_ASSERTION` and exit 1, not merely successful module lookup. That fixture must not be included as a normal passing test selection. This tests harness failure propagation without changing security semantics. The historical Auth user-role example is not present in this repository; no historical reproduction is claimed.

## CI evidence and cleanup

The **Fresh source checks (no build)** Actions job starts from its own clean checkout and frozen install, runs the package commands and selected covering files, and asserts no emitted output or compiler cache exists. Normal CI still exercises built artifacts and full suites separately. Source-check failures feed `ci-ok`; no existing gate is waived. Record exact-head run/job links, test counts and conclusions. Missing/skipped required Actions jobs remain missing evidence.

Before each push, rerun the bounded checks for the current diff; record every skip with its concrete reason. Never describe a failed/timeout check as passing. Full `npm test`, `npm run build`, root `npm run check`, plugin artifact builds and compatibility qualification remain Actions-only on shared hosts.

When finished, remove **only** the cache/install you created:

```sh
rm -rf -- "$CACHE_ROOT"
# Only if this task created these installs; preserve any pre-existing install.
rm -rf -- ./node_modules
# Also remove per-workspace node_modules created by your install, if any.
```

Do not remove another task's caches or dependencies, shared checkouts, or pre-existing generated output. Leave the lockfile unchanged unless dependency changes were explicitly intended and reviewed.
