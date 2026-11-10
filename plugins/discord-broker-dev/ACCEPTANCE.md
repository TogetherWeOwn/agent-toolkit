# Acceptance record — Discord broker dev (tier 1 + tier 2)

Status: **NOT ACCEPTED, NOT INSTALLED.** This record binds only the exact artifact and configuration envelope tested below. Security Engineer review and acceptance of this envelope is a precondition for Operator install and live canary.

## Implementation under review

- `packages/discord` 0.1.0 (secret-free REST v10 helpers, closed-schema building blocks, scrubbing) + `plugins/discord-broker-dev` 0.1.0 (`togetherweown.discord-broker-dev`, SDK `2026.1023.0`, Node `>=24.11 <25`).
- Tool inventory: 21 (14 read + 7 dev writes), pinned by `test/broker.test.mjs` against `toolsFor("dev")` and the manifest.
- Configuration envelope: `environment:"dev"`, `guildId:"1545644954272137297"`, `botUserId:"1469137636663758888"`, `botTokenSecretRef:{type:"secret_ref",secretId:<staging ref>}`. Policy limits: agents ≤64, `readChannelIds`/`writeChannelIds` ≤200 each, `revision ≥1`.

## Exact commands and results (2026-11-10, worktree `work/11516e1f-c38d-4c64-92d9-d1d4826954fb`)

```bash
npx tsc -p plugins/discord-broker-dev/tsconfig.json
npx tsc -p plugins/discord-broker-prod/tsconfig.json
node --test --test-timeout=30000 plugins/discord-broker-dev/test/*.test.mjs plugins/discord-broker-prod/test/*.test.mjs
# → 20 tests, 20 pass, 0 fail (13 dev + 7 prod)
```

Pre-push: bounded checks per two-operating-rules rule 16 (formatter/linter/typecheck/changed tests). CI of record is GitHub Actions; exact-head Actions run/job links to be appended on the PR before review.

## Policy → test matrix

| Policy | Test evidence |
| --- | --- |
| Closed tool set; prototype dispatch refused | unknown/prototype test (9 names incl. `member_ban`, `webhook_create`, `guild_leave`) → `validation.unknown_tool`, 1 deny event, 0 secret/outbound |
| Closed schemas; spoofed args refused | schema test: `limit` 0/101/1.5, `channelId:'123'`, 2001-char content, `token`/`url`/`guildId`/`secretRef` extras, `null`/`[]`/`{}` → `validation.schema` |
| Identity binding (company/run/profile) | `identity.issue_company`, `policy.profile` (incl. `researcher-read` write attempt), `identity.issue_run` |
| Channel allowlist | `policy.channel` (read list excludes channel) |
| Ownership: ledger before secret; author re-check | without ledger → `policy.ownership`, `secretCalls=0, calls=0, events=1 deny`; with ledger + author match → success |
| Plain text, no mentions | post asserts wire body `allowed_mentions:{parse:[]}`; `@everyone hi` content allowed as plain text |
| Redaction | token/webhook/invite in guild payload → absent from result/audit; `hygiene` scans result+events+logs+kv |
| 401 pause / 429 Retry-After | `upstream.unauthorized` (guild pause); `rate.discord` with `retryAfterSeconds:17` |
| Audit failure blocks | `failAudit` fixture → `audit.unavailable`, `secretCalls=0` |
| Fixed origin | fake `http.fetch` asserts `https://discord.com/api/v10/` + `Authorization: Bot <token>` on every call; live `fetch` disabled |

## Governance / approval gaps

1. **Native risk mapping:** host name-regex inference may classify read-named dangerous tools as `read` and `discord.*` is not `core`-reserved. Tiers 3–4 must define an explicit native approval/preview mapping before any tool is registered; nothing here authorizes it.
2. **Projectless grant:** `allowProjectless:true` is an explicit per-agent policy grant; two-operating-rules project binding is bypassed for projectless callers, compensated by profile + channel allowlists. Security sign-off required; prod research use is the intended consumer.
3. **Nested `result.error`:** verified pattern copied from the GitHub broker (`error` field = native gateway failure/MCP `isError`); re-verify propagation on the exact host before trusting MCP error surfaces.
4. **Approval binding for writes:** current writes are self-approved by profile (builder) + audit; STANDARD §5 preview/approval for tier 3–4 is out of scope for tiers 1–2 and must be designed before promotion.

## Lifecycle / spend caps

1 MiB response cap, 262 KiB output cap, 30s per-request deadline, 30/min per-agent + 4000/hr per-guild budgets, 401 → 3600s pause. Threads/events created under tier 2 are persistent; **exact-owned cleanup (delete) is not wired** — staging fixtures accumulate until it is or the Operator cleans them. No auto-teardown claim.

## Security acceptance

Pending. Security Engineer must review THREAT-MODEL (incl. credential-ceiling §1, leakage §6, gaps §10) and this matrix, and record accept/reject on the exact head SHA of the PR. Operator install and staging canary follow acceptance only.

## Operator runbook (post-acceptance, not authorized by this file)

1. Tighten the staging token below Administrator where Discord allows; scope to the canary channel(s) and record the change.
2. Set `readChannelIds`/`writeChannelIds` to the canary channels; profiles `builder` (canary agent) + `researcher-read` (`allowProjectless:true`) only as needed.
3. Install the dev plugin; run one `messages_list` + one `message_post` canary; verify audit intent/outcome rows and no token in logs; then verify `message_edit_own` against a ledger-backed message.
4. Capture Actions run/job links for the exact head SHA in the PR; do not merge on local checks alone.
