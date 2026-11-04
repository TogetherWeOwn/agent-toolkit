---
name: workspace-supply-chain
description: Before installing or updating workspace dependencies, inventory required scripts, apply supported native release-age and script/build controls, and verify with a clean install and build. Record unsupported controls and narrow reviewed exceptions.
---

# Workspace supply-chain prevention

Use project-local, native package-manager settings. Never change global harness
permissions, environment or hooks. Never substitute a custom installer wrapper.
A three-day delay and script refusal reduce exposure; they do not establish that
an old release, wheel, registry, lockfile or installed package is safe.

## Before the first install

1. Confirm the assigned isolated workspace and its branch. Inspect existing
   manifests, lockfiles, config, package-manager versions and CI install commands.
   Do not run a dependency install merely to discover its lifecycle scripts.
2. Inventory root `preinstall`/`install`/`postinstall`/`prepare`/pack hooks and locked
   dependency install hooks. For npm locks, inspect `packages[*].hasInstallScript`;
   it is a candidate list, not proof of the hook's contents or safety. Review the
   exact package artifact/source before approving an exception. Inspect pnpm hook
   files too: `ignoreScripts` does not suppress `.pnpmfile.cjs`/`.pnpmfile.mjs`.
3. Merge the supported settings below into existing project config, preserving
   workspace membership, registry and authentication settings. Never replace a
   whole config file blindly. Check the installed tool accepts and enforces the
   option; older tools may warn and silently ignore unknown settings.
4. Leave exemptions empty unless reviewed. Record exact package/version/integrity,
   script, need, scope, reviewer, expiry/removal condition and build evidence.
   Broad exemptions, security-update delays and required-check waivers need the
   designated security decision; do not grant them yourself.

## Native controls (verified 2026-11-04)

| Manager | Three-day age control | Script/build control | Compatibility and gaps |
| --- | --- | --- | --- |
| npm | `.npmrc`: `min-release-age=3` (days) | `ignore-scripts=true` | Native probe: npm 11.19.0. Verify older npm supports age filtering. Explicit `npm run build`/`test` still runs the named command, not its pre/post hooks. |
| pnpm | `pnpm-workspace.yaml`: `minimumReleaseAge: 4320` (minutes) | `ignoreScripts: true` | Age requires 10.16+. Probe: 10.34.9. Blocks root and dependency scripts, not pnpm hook files. Do not copy pnpm 11/12 build-approval syntax into pnpm 10 blindly. |
| Bun | `[install]` in `bunfig.toml`: `minimumReleaseAge = 259200` (seconds) | `ignoreScripts = true` | Verify both settings on the actual installed version. Default dependency trust is not a substitute. Existing `bun.lock` entries bypass new-resolution age filtering; missing timestamps pass. |
| uv | `uv.toml`: `exclude-newer = "P3D"` | `no-build = true` | Probe: 0.13.6. Registry artifact upload times, not version publication times. No source-distribution builds; cached wheels and first-party/editable builds remain possible. Not a universal ignore-scripts setting. |
| pip | `pip.conf` `[install]`: `uploaded-prior-to = P3D` | `only-binary = :all:` | Relative age requires pip 26.1+; absolute cutoff first appeared in 26.0. pip 24 has no age filter. `PIP_CONFIG_FILE=/absolute/project/pip.conf` is required: pip does not auto-discover project config. No source builds, not general code-execution prevention. |
| Cargo | No documented stable native age filter | No blanket dependency `build.rs` or proc-macro disable | `build = false` controls only that package's manifest; per-target `links` overrides are narrow substitutes, not a blanket policy. `--locked`, `--frozen` and `--offline` do not provide either requested protection. Record this residual gap; review dependencies and use an appropriately isolated build. |

The toolkit's `policies/native/` templates are adoption inputs, not proof that
another project or agent has installed them. This managed skill is self-contained:
merge the following settings into the adopting project's existing configuration.
Do not use the npm age key as a pnpm age setting.

```ini
# .npmrc (npm only)
min-release-age=3
ignore-scripts=true
```

```yaml
# pnpm-workspace.yaml (pnpm 10.16+)
minimumReleaseAge: 4320
ignoreScripts: true
```

```toml
# bunfig.toml
[install]
minimumReleaseAge = 259200
ignoreScripts = true
```

```toml
# uv.toml
exclude-newer = "P3D"
no-build = true
```

```ini
# pip.conf, loaded through an absolute PIP_CONFIG_FILE path (pip 26.1+)
[install]
uploaded-prior-to = P3D
only-binary = :all:
```

For `pyproject.toml`, uv settings belong under `[tool.uv]`; in `uv.toml` they are
at top level. For pip 24, prefer the already available supported uv path, or use a
reviewed project-local tool upgrade; do not silently omit age filtering and claim
full protection. Do not upgrade host packages as part of this skill.

## Install, build and pilot acceptance

- Resolve/update with the age policy before accepting a new lockfile. Frozen or
  existing locks are not a retrospective publication/provenance audit. Local,
  Git, direct URL and workspace sources need separate review; age checks are not
  universally enforced on them. Reject or explicitly document missing timestamp
  behavior rather than assuming all registries expose usable timestamps.
- Run the repository's normal frozen install (`npm ci`,
  `pnpm install --frozen-lockfile`, `bun install --frozen-lockfile`,
  `uv sync --locked --no-build`) with its effective project policy. Use
  `PIP_CONFIG_FILE=/absolute/project/pip.conf pip install ...` for pip 26.1+.
  These are native invocations, not permission to execute unreviewed build hooks.
- Run named, reviewed build/test commands explicitly. Do not enable all scripts
  to repair a missing generated artifact. For uv, separately review first-party
  and editable build backends. Wheel-only installs fail when no compatible wheel
  exists; do not fall back to source builds without a scoped reviewed decision.
- Record clean install, build/test output, native-manager/version, hooks inventory,
  exceptions, remaining gaps and affected workspace. Run
  `python3 -I -m unittest discover -s test -p 'test_supply_chain_policy.py' -v`
  in this repository for synthetic old/new release and harmless marker-hook
  probes. A skipped manager is NOT installation/pilot acceptance.
- Obtain the instruction/skill review before installing or assigning this managed
  skill. Register/import the reviewed source through the company skill library,
  inspect the saved file, and attach it additively to intended agents. A source
  file in git is not an installed managed skill. Rollout is incomplete until the
  intended workspace(s) pass a real clean install/build and the saved skill and
  assignment are verified. Never close an implementation card with an open PR
  or replace required CI/review with these fixture results.

## Dependabot

GitHub documents an implicit three-day **version-update** cooldown; preserve it.
An explicit `cooldown.default-days: 3` makes the intended value inspectable.
Audit every applicable ecosystem/directory entry and SemVer override: a shorter
`semver-patch-days`/`semver-minor-days` or exclusion can shorten the effective
cooldown even when `default-days` is three. Do not change existing schedules or
exclude security fixes. Include `github-actions` at directory `/` for SHA pins.

GitHub's current docs state that cooldown does not affect security updates.
Local package-manager age filters are DIFFERENT: npm's age filter can block
`npm audit fix` from installing a fresh security patch. Report that conflict and
obtain a narrow package/version exception through the proper security decision;
do not declare an unremediated security update successful or relax the entire
policy. Keep any existing branch/security-update behavior under review.

## Official references

- [npm config: min-release-age and ignore-scripts](https://docs.npmjs.com/cli/v11/using-npm/config)
- [pnpm 10 settings and versioned build controls](https://pnpm.io/10.x/settings)
- [Bun install: age and existing lockfile behavior](https://bun.com/docs/pm/cli/install)
- [Bun native configuration](https://bun.com/docs/runtime/bunfig)
- [uv settings: exclude-newer and no-build](https://docs.astral.sh/uv/reference/settings/)
- [uv resolution limitations](https://docs.astral.sh/uv/concepts/resolution/)
- [pip install options](https://pip.pypa.io/en/stable/cli/pip_install/)
- [pip upload-time filtering compatibility](https://pip.pypa.io/en/stable/user_guide/)
- [pip config loading](https://pip.pypa.io/en/stable/topics/configuration/)
- [Cargo config](https://doc.rust-lang.org/cargo/reference/config.html)
- [Cargo build scripts and narrow overrides](https://doc.rust-lang.org/cargo/reference/build-scripts.html)
- [Dependabot cooldown options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference#cooldown)

REA angle: use each manager's shipped policy and resolution behavior, with
first-party local registry probes for enforcement; do not add a parallel resolver
or installer broker.
