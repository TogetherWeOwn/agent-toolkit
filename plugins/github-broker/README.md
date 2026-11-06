# GitHub read broker

Version 0.1.0. Maintainer: agent-toolkit maintainers. **Implementation candidate; not installed or security-accepted.** SDK/host baseline: `@paperclipai/plugin-sdk@2026.1023.0`, Node 24.11+, GitHub REST `2022-11-28`, core 0.1.0 and shared GitHub helpers 0.1.0. See [ACCEPTANCE.md](ACCEPTANCE.md) and [THREAT-MODEL.md](THREAT-MODEL.md).

## Tools

Each tool requires `issueId`, `workspaceId`, and numeric `repoId`. These are selectors, not identity assertions: the broker verifies the gateway principal, the issue's company/project/assignee/current run/active status, its explicit workspace, that workspace's exact repository URL, the board policy's numeric repository ID, and GitHub's repository ID. Unknown fields fail closed.

| Tool | Additional required arguments | Returned subset |
| --- | --- | --- |
| `github.repo_read` | `mode=file, ref, path`; `mode=tree, ref`; `mode=ref, ref`; or `mode=compare, base, head` | UTF-8 file text, shallow tree, ref SHA/type, or bounded compare |
| `github.pr_list` | `state=open/closed/all, page, perPage` | PR metadata, body, base/head refs and SHAs |
| `github.pr_get` | `number` | One PR's metadata, body and head/base |
| `github.pr_files` | `number, page, perPage` | File names/status/counts/patches |
| `github.checks_get` | `sha, page, perPage` | Check runs, combined statuses and workflow runs for a full 40-character SHA |
| `github.rulesets_get` | `page, perPage` OR `rulesetId` | Inherited/repository summaries, or enforcement/rules with explicit incomplete-parameter markers; no bypass actors |
| `github.actions_runs_list` | `page, perPage` | Run metadata only, no logs/artifacts |
| `github.issue_read` | `number` | Issue metadata and body, no comments |

Pagination is explicit (pages 1–100, at most 100 items). Results are bounded evidence, not a claim of complete history or successful checks. File output is at most 128 KiB; binary files, oversized responses and trees exceeding the item cap are refused. Neither listing rulesets nor the supported detail projection establishes all effective branch protections; rule details omit conditions and explicitly mark unsupported parameters.

All tools are **read** operations. There is no REST/GraphQL/shell proxy, Git command, workflow write, PR write/merge/review, Actions write, artifact/log download or credential-return tool. Native names are additionally namespaced by the plugin host. SDK `error` is populated on every failure so gateway `isError` and invocation status are truthful.

## Board-only configuration

Configuration is read through the native plugin configuration API and is never accepted from tool arguments or changed by this plugin. The board/operator binds a company secret at `privateKeySecretRef`, with `secrets.read-ref` granted only to this plugin. A secret binding is an object, never a raw string or value.

Synthetic example (replace all identifiers with verified native metadata):

```json
{
  "appId": 42,
  "installationId": 99,
  "privateKeySecretRef": { "type": "secret_ref", "secretId": "secret-one" },
  "policy": {
    "version": 1,
    "revision": 1,
    "companyId": "company-one",
    "repositories": [{ "id": 101, "owner": "synthetic-org", "name": "sandbox", "projectId": "project-one", "workspaceId": "workspace-one" }],
    "agents": [{ "agentId": "agent-one", "profile": "reviewer-read", "identityLane": "app", "repositoryIds": [101] }]
  }
}
```

Profiles `builder`, `lead`, `reviewer-read` and `release` explicitly allow the eight reads on selected repositories. `coordinator-read` excludes file/tree/compare reads and PR patches. `none`, absent agents and empty repository grants deny everything. No write privileges are implied by the profile names. Arrays cap at 32 entries and all config also passes core's 256-node/16-KiB JSON bound. Duplicate agents, repository IDs or workspace bindings are rejected. Increment `policy.revision` for changes; the canonical hash includes the complete non-secret configuration, including App/installation/binding IDs. Configuration and issue assignment are re-read immediately before secret resolution and each data read; cache entries are policy/principal/run/issue/request scoped.

## Identity lanes

Each agent binding must explicitly select `identityLane: "app"`, the default and only implemented credential lane. Each tool and each enabled policy profile declares its allowed lane in code; `none` allows no lane. `owner` is a reserved name, not a second credential path: selecting it is refused with `identity.owner_disabled` before secret resolution or HTTP, even for an otherwise permitted read. Missing/unknown lanes and caller-supplied lane arguments fail closed. No owner secret is accepted or resolved, and there is no fallback between identities. The selected lane is part of the canonical configuration hash and every cache key. Future owner-lane support requires separate approved operations, policy and credential handling.

## Credential, transport and rate behavior

The shared GitHub package adapts the existing upstream watcher's RS256 construction and fixed GitHub-origin REST mechanics. It intentionally drops its unscoped mint and credential cache. Every uncached call signs at call time, mints with exactly one `repository_ids` entry and only the endpoint's read `permissions`, verifies the returned repository/permission envelope, and revokes the installation token in `finally`. Metadata read is GitHub's implicit base permission. Token expiry must be future and no later than 61 minutes after call start (one-hour GitHub TTL plus one-minute clock/transport tolerance). Credentials are never placed in tool output, logs, plugin state, files, environment variables or child processes. There is no promise of managed-memory zeroization.

The native host's HTTP bridge transiently handles authorization headers and responses in memory; it must not trace or persist them. Source inspection of host 2026.1023.0 found a single DNS-pinned `node:https` request with no redirect following, a 5-second DNS deadline and 30-second request deadline. The SDK drops `redirect`/`signal`: this package does **not** pretend those ignored options enforce safety. The host buffers at most 200 MiB before IPC; the broker rejects bodies above 1 MiB, projects allowlisted fields, caps each projected page at 256 KiB and redacts known credential strings (including decoded base64 file contents). Reverify host behavior, telemetry and gateway mapping in sandbox acceptance, especially after upgrades.

Per worker: four concurrent calls, 30 attempted authorized calls per agent/minute, 4,000 reserved HTTP requests per installation/hour (including mint, repository verification, reads and revoke), and at most 128 entries in each bounded map. GitHub `Retry-After`/rate-reset signals pause that installation without in-run sleep or retry. Only projected, scrubbed data is cached: 10-second fresh reads and ETags up to 60 seconds, never tokens. Rate state and caches reset on worker restart; GitHub remains the authoritative cross-worker rate enforcement. These are abuse/backpressure controls, not a billed-spend guarantee or a durable distributed quota.

## Install and rollback runbook

1. Do **not** install until exact-artifact Security and independent cryptography acceptance, exact-head Actions checks and required bot review are recorded.
2. In GitHub Actions, run `npm ci --ignore-scripts` and `npm test`. This builds the root fixtures and the independently installable package's transitive core/GitHub sources; no local full-suite run is required or authorized by this README. Pack `plugins/github-broker` from that reviewed build, recording its digest and lockfile. No install lifecycle script runs automatically.
3. The Operator installs the reviewed plugin artifact and grants only its manifest capabilities. They bind the approved company's App private-key secret and board-only App/installation IDs and versioned profiles. Prefer a narrow read-capable App. A broader interim App needs explicit Security acceptance of that exact credential envelope; this runbook grants no exception or credential creation authority.
4. Verify native plugin governance and audit coverage on the target host, secret/worker isolation, an unconfigured-policy denial, a cross-repo denial with zero upstream calls, and successful sandbox-only reads. Confirm the eight tools in `GET /api/plugins/tools`. QA verifies exact sandbox evidence after install.
5. Disable the plugin to roll back; remove its secret binding and revoke the App key/installation tokens through authorized operator controls if needed. Do not remove other connectors/grants. A revoke failure reports failure, clears cached results and pauses new minting for the maximum token lifetime in the current worker. A process crash/ambiguous mint may leave only GitHub's server-enforced expiry; see residual risks.

REA angle: reuse the shipped watcher's JWT/HTTP protocol and the existing test-environment plugin's authoritative issue/assignee/project checks, with core closed schemas and hash/dispatch primitives. No host/core patch or new credential launcher is introduced.
