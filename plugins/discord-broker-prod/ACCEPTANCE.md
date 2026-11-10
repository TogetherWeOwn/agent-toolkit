# Acceptance record — Discord broker prod (tier 1 read-only)

Status: **NOT ACCEPTED, NOT INSTALLED.** Binds only the exact artifact and configuration envelope below. Security Engineer review of the read-only tier is a precondition for Operator install. Prod publish (tier 3) additionally requires its own review **after** the staging canary passes; read-only acceptance does not extend to publish.

## Implementation under review

- `packages/discord` 0.1.0 + `plugins/discord-broker-prod` 0.1.0 (`togetherweown.discord-broker-prod`, SDK `2026.1023.0`, Node `>=24.11 <25`).
- Tool inventory: 11 reads, zero writes, pinned by `test/broker.test.mjs` (asserts `message_post`/`message_reply`/`message_edit_own`/`reaction_add_own`/`thread_create`/`event_create` absent from manifest and `toolsFor("prod")`).
- Configuration envelope: `environment:"prod"`, `guildId:"326474832151838730"`, `botUserId:"1539711683898118154"`, `botTokenSecretRef:{type:"secret_ref",secretId:<prod ref>}`.

## Exact commands and results (2026-11-10, branch `work/11516e1f-c38d-4c64-92d9-d1d4826954fb`)

```bash
npx tsc -p plugins/discord-broker-prod/tsconfig.json
node --test --test-timeout=30000 plugins/discord-broker-dev/test/*.test.mjs plugins/discord-broker-prod/test/*.test.mjs
# → 31 tests, 31 pass, 0 fail (18 dev + 13 prod)
```

Pre-push: bounded checks per rule 16. CI of record is GitHub Actions; exact-head run/job links to be appended on the PR.

## Policy → test matrix

| Policy | Test evidence |
| --- | --- |
| Read-only tool set | inventory test: 11 tools, all `tier:"read"`, 6 write names + 3 guild-wide personal-data names absent |
| Publish refusal before secret/HTTP | 7 names (`message_post`…`webhook_create`) → `validation.unknown_tool`, 1 audit event each |
| Cross-environment refusal | `environment:"dev"` config on prod plugin → `policy.environment` |
| Closed schemas + allowlist + profile | `validation.schema`, `policy.channel`, `policy.profile`; `channels_list`/`threads_active_list` post-projection filter (restricted entries absent) |
| Bounded limits | `messages_search` limit 26 → `validation.schema` (dropped `members_search` is `validation.unknown_tool`); search uses documented `content` parameter (fixture path asserts it) |
| Search returns counts/links, no raw storage | `messages_search` test asserts `total_results`/message metadata without `secret-prod` leakage and without message bodies; usage policy: no embeddings/Hindsight ingest |
| Events restricted to allowlisted channels; guild binding | `events_list` filter test, `channel_get` cross-guild refusal test (`upstream.guild`) |
| Guild-wide personal-data reads unregistered | `member_get` / `members_search` / `roles_list` → `validation.unknown_tool` (inventory + refusal tests) |
| Metadata-only surface (no bodies) | `messages_list` / `message_get` / `pins_list` tests assert sentinel body text absent from results — bodies never leave the broker, so host retention cannot persist them |
| Redaction | token/webhook/invite in guild description → absent from result/audit; embedded foreign bot token redacted |

## Research protocol (post-install)

1. Operator sets `readChannelIds` to public community channels only.
2. Queries bounded (`query` per research term, `limit≤25`, the Discord search maximum); agents `lead`/`researcher-read` with `allowProjectless:true`.
3. Report per queried term: count, message links, channel, date window, coverage limits. Explicitly separate “asked for” from “mentioned/pain/adjacent” and state “no matches in coverage” where applicable.
4. No raw member message storage anywhere (broker state, issues, Hindsight).
5. Live canary must confirm Discord accepts bot-token guild search (`discord.messages_search` with the `content` query parameter) before research use; fixture success alone is not evidence for this endpoint.

## Governance / approval gaps

1. **Shared token coordination:** prod token is shared with the live Owen bot (`two-bot-next-production`); broker-local quotas do not bound Worker load. Fleet-wide Discord load plan + token least-privilege tightening (drop Administrator, scope to public channels) are Operator pre-install preconditions.
2. **Projectless grant:** same residual as dev (profile + channel allowlists only). Acceptable for read-only research; Security sign-off required before tier 3.
3. **Tier 3/tier 4 design:** publish needs exact-action/target approval binding + native risk mapping; moderation/admin needs separate preview/approval. Neither is designed or registered here.
4. **Privacy retention:** host call-event audit may retain ~4000 chars of args/results, but results now contain message metadata only — member bodies are dropped by the broker projection, so the host cannot retain what it never receives. No raw-storage by the broker is possible on this surface; agent-side report storage rules still apply.

## Lifecycle / spend caps

Read-only ⇒ no persistent creations or teardown. Caps: 1 MiB response, 262 KiB output, 30s deadline, 30/min per-agent + 4000/hr per-guild, 401 → 3600s guild pause, `Retry-After` honored. Load coordination with the live bot is the effective spend control.

## Security acceptance

Pending. Security Engineer reviews THREAT-MODEL (esp. shared-ceiling §1, research privacy §5, gaps §10) and this matrix, records accept/reject on the exact head SHA. Operator install follows.
