# Native workspace install policies

The reviewed adoption procedure and official sources live in the
[managed-skill source](../skills/workspace-supply-chain/SKILL.md).

## Scope and activation

- The root [`.npmrc`](../.npmrc) enables a three-day release age and lifecycle
  script refusal for **this repository** on supported npm. It does not change
  global npm, harness settings, another checkout, or attached repositories.
- [`native/`](native) contains mergeable project-local templates for pnpm, Bun,
  uv and pip. They are not automatically active: preserve existing settings and
  adopt only the template appropriate to the repository's actual manager/version.
  pip additionally needs an explicit absolute `PIP_CONFIG_FILE` binding.
- No Cargo template is supplied: the stable documented controls cannot enforce
  either requested policy across dependencies. A fictitious setting would be
  worse than an explicit gap.
- No script or age exemptions are granted. No required check is removed, weakened
  or waived. A supported tool/version and a successful clean build are acceptance
  conditions, not optional follow-up prose.
- The skill is source pending instruction review and company-library installation.
  A git merge alone is not rollout acceptance. Verify its saved content, additive
  agent assignment and a real workspace install/build before declaring rollout
  complete. Bun and newer pip need separate pilots where those tools are used.

## Initial install-hook inventory

The toolkit default branch initially contains only README and LICENSE. The
proposed package-workspace baseline at commit
`68ab51922d0ebb6048bec328d26d755a1d88f56a` has no root install/prepare hooks and no
locked `hasInstallScript` entries. Its dependencies are TypeScript 5.9.3,
`@types/node` 24.10.0 and `undici-types` 7.16.0; builds run explicitly through
reviewed `npm run` commands. No dependency-script exception is needed for that
inventory. Re-inventory the merged/current lock before final adoption.

Read-only inventory of the four attached plugin snapshots found these candidates:

| Repository | Install-hook candidates in lock | Root hooks to preserve explicitly |
| --- | --- | --- |
| paperclip-plugin-cf-test-env | optional fsevents 2.3.3 | `prepack` runs build |
| paperclip-plugin-decision-notifier | optional fsevents 2.3.3 | `prepack` runs build |
| paperclip-plugin-cliproxy-connector | esbuild 0.27.1; optional fsevents 2.3.3 | none |
| paperclip-plugin-github-upstream | esbuild 0.28.2; optional fsevents 2.3.3 | `prepack` runs build |

These snapshots are NOT changed or accepted by this pilot. Optional native
packages and esbuild are not blanket-allowed. Each adopting repository must
inspect the exact scripts and test its platform's build. Explicitly build before
packing if script refusal suppresses a required packaging hook. Inventory is not
source review, safety approval, or proof that an artifact is unnecessary.

## Deterministic probes

```sh
python3 -I -m unittest discover -s test -p 'test_supply_chain_policy.py' -v
```

The tests use first-party synthetic package metadata, harmless marker hooks and a
local HTTP registry. They do not fetch production packages or credentials. They
exercise old/new version selection, refusal of an exact too-new request and
root/dependency lifecycle suppression for available JavaScript managers. uv's
probe checks timestamp selection and source-build refusal; pip checks wheel-only
source refusal and, on 26.1+, its age filter. Config checks cover every template.

Missing managers or unsupported old versions are reported as skips, not passes.
The CI workflow pins project-local npm/pnpm probe tools and requires npm age
capability before running; other managers are tested only when available. Those
skips do not establish rollout acceptance. Fixture policy is not an audit of
existing locks, direct URLs, VCS sources, malicious wheels or runtime imports.

## Dependabot

[GitHub's current docs](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference#cooldown)
confirm an implicit three-day version-update cooldown and no security-update
delay from that cooldown. This repository had no Dependabot configuration; the
new `github-actions` entry makes `default-days: 3` explicit, with no SemVer or
package exclusions overriding it. The attached decision-notifier snapshot's
Actions entry has no cooldown override; no claim is made about unaudited repos.
Native package-manager cutoffs can still block a fresh security fix: handle that
as a narrow reviewed exception, never a broad cooldown disablement.
