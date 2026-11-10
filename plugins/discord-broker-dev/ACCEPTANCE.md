# Acceptance record — Discord broker dev (tier 1 read only)

Status: **NOT ACCEPTED, NOT INSTALLED.** This record binds only the exact artifact and configuration envelope tested below. Security Engineer review and acceptance of this envelope is a precondition for Operator install and live canary.

## Scope reduction (why this file no longer describes writes)

Earlier revisions of this envelope registered dev writes (tier 2) plus exact-owned deletes. Security review (including the re-review of exact head 388b473) withheld acceptance of that envelope: the lifecycle finding was retained because this host offers no independent teardown scheduler (the opportunistic sweep is not one; STANDARD §5), and the review records a further authorization concern on the exact-ownership path. Per the review’s direction, dev writes are now **unregistered** — this file covers only the read-only envelope. The write implementations remain in `packages/discord` (`writeTools`) but are not reachable dispatch targets (see Policy matrix: writes → `validation.unknown_tool`, zero secret resolution).

Do not expand this envelope back to writes without an independent teardown scheduler, favorable exact-artifact review, and the fixture evidence listed in THREAT-MODEL §9.

## Implementation under review

- `packages/discord` 0.1.0 (secret-free REST v10 helpers, closed-schema building blocks, scrubbing) + `plugins/discord-broker-dev` 0.1.0 (`togetherweown.discord-broker-dev`, SDK `2026.1023.0`, Node `>=24.11 <25`).
- Tool inventory: 14 read tools, pinned by `test/broker.test.mjs` against `toolsFor("dev")` and the manifest. Zero write tools registered.
- Configuration envelope: `environment:"dev"`, `guildId:"1545644954272137297"`, `botUserId:"1469137636663758888"`, `botTokenSecretRef:{type:"secret_ref",secretId:<staging ref>}`. Policy limits: agents ≤64, `readChannelIds`/`writeChannelIds` ≤200 each, `revision ≥1`.

## Exact commands and results (2026-11-10, worktree `work/11516e1f-c38d-4c64-92d9-d1d4826954fb`)

```bash
npx tsc -p plugins/discord-broker-dev/tsconfig.json
npx tsc -p plugins/discord-broker-prod/tsconfig.json
node --test --test-timeout=30000 plugins/discord-broker-dev/test/*.test.mjs plugins/discord-broker-prod/test/*.test.mjs
# → 28 tests, 28 pass, 0 fail (17 dev + 11 prod)
```

Pre-push: bounded checks per two-operating-rules rule 16 (formatter/linter/typecheck/changed tests). CI of record is GitHub Actions; exact-head Actions run/job links to be appended on the PR before review.

## Policy → test matrix

| Policy | Test evidence |
| --- | --- |
| Read-only inventory; writes unregistered | inventory test: exactly 14 read tools, manifest matches `toolsFor("dev")`, all 10 write names absent; write-names test: every write name → `validation.unknown_tool`, 1 deny event, 0 secret/outbound |
| Closed tool set; prototype dispatch refused | unknown/prototype test (9 names incl. `member_ban`, `webhook_create`, `guild_leave`) → `validation.unknown_tool`, 1 deny event, 0 secret/outbound |
| Closed schemas; spoofed args refused | schema test: `limit` 0/101/1.5, `channelId:'123'`, `token`/`url`/`guildId`/`secretRef` extras, `null`/`[]`/`{}` → `validation.schema` |
| Identity binding (company/run/profile) | `identity.issue_company`, `policy.profile` (`none` read attempt), `identity.issue_run` |
| Channel allowlist | `policy.channel` (read list excludes channel); `channels_list`/`threads_active_list` post-projection filter (restricted channel/thread absent; 150-channel and 120-role inventories succeed within provider caps) |
| Bounded limits | `members_search` limit 11 and `messages_search` limit 26 → `validation.schema`; `messages_list` keeps 100; guild `features` array accepted; search uses documented `content` parameter (fixture path asserts it) |
| Redaction | token/webhook/invite in guild payload → absent from result/audit; embedded foreign bot token in message content redacted while message links survive; `hygiene` scans result+events+logs+kv |
| 401 pause / 429 Retry-After | `upstream.unauthorized` (guild pause); `rate.discord` with `retryAfterSeconds:17` |
| Audit failure blocks | `failAudit` fixture → `audit.unavailable`, `secretCalls=0` |
| Fixed origin | fake `http.fetch` asserts `https://discord.com/api/v10/` + `Authorization: Bot <token>` on every call; live `fetch` disabled |
| Legacy ledger cleanup | pre-seeded expired entry is removed via verify+DELETE+GET-404 with `sweep.deleted` audit; no new entries are created (no creation path exists) |
| Legacy-quarter note | Former tier-2 tests (ownership ledger, post/edit, expiry sweep creation-side, restart, ambiguous reconcile, 404-gone) have been removed with the writes; only the legacy-cleanup sweep test remains (above). |

## Governance / approval gaps

1. **Native risk mapping:** host name-regex inference may classify read names oddly, and `discord.*` is not `core`-reserved. Tiers 3–4 must define an explicit native approval/preview mapping before any tool is registered; nothing here authorizes it. This envelope is intentionally all-read.
2. **Projectless grant:** `allowProjectless:true` is an explicit per-agent policy grant; two-operating-rules project binding is bypassed for projectless callers, compensated by profile + channel allowlists. Security sign-off required; prod research use is the intended consumer.
3. **Nested `result.error`:** verified pattern copied from the GitHub broker (`error` field = native gateway failure/MCP `isError`); re-verify propagation on the exact host before trusting MCP error surfaces.
4. **Approval binding for writes:** out of scope. No write tool is registered, so no write can self-approve.

## Lifecycle / spend caps

Registered tools are read-only; creation lifecycle is not applicable (THREAT-MODEL §9). Caps: 1 MiB response, 262 KiB output, 30s per-request deadline, 30/min per-agent + 4000/hr per-guild budgets, 401 → 3600s pause. The legacy sweep (≤10 deletions/call) remains implemented for rows left by earlier builds only.

## Security acceptance

Pending. Security Engineer must review THREAT-MODEL (incl. credential-ceiling §1, leakage §6, gaps §10) and this matrix, and record accept/reject on the exact head SHA of the PR. Operator install and staging canary follow acceptance only. The confidential authorization concern referenced above remains with the existing confidential handling; this record makes no claim about it.

## Operator runbook (post-acceptance, not authorized by this file)

1. Tighten the staging token below Administrator where Discord allows; scope to the canary channel(s) and record the change.
2. Set `readChannelIds` to the canary channels; profiles `researcher-read` (`allowProjectless:true`) only as needed.
3. Install the dev plugin; run one `guild_get` + one `messages_list` canary; verify audit intent/outcome rows and no token in logs.
4. Capture Actions run/job links for the exact head SHA in the PR; do not merge on local checks alone.
