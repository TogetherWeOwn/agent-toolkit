# Threat model — Discord broker dev (tier 1 + tier 2)

Per STANDARD §2. This is a draft modeling aid for Security Engineer review, not acceptance. The prod plugin (`plugins/discord-broker-prod`) shares the same implementation via `packages/discord` and differs only in the read-only tool set and its own secret/guild binding; its tier deltas are noted where they differ.

## 1. Credential ceiling vs exposed subset

- **Ceiling (what the bot token can do, staging):** guild `1545644954272137297` Administrator for bot `1469137636663758888` — i.e. mutable moderation/admin surface at Discord. Wildly more than the exposed subset.
- **Exposed subset (tools):** 14 reads + 7 dev writes (post, reply, edit-own with ledger + author check, react add/remove own, thread_create, event_create). No delete, timeout, roles, bans, channels, webhooks, commands, guild leave/delete, mass DM, or token disclosure exists as a tool.
- **Enforcement:** the exposed subset is the maximum reachable; out-of-scope names (`discord.member_ban`, `discord.webhook_create`, `discord.channel_delete`, `discord.command_create`, `discord.bulk_delete`, `discord.guild_leave`, …) hit `validation.unknown_tool` before secret resolution (tested). Prototype keys (`constructor`, `__proto__`, `toString`) likewise.
- **Residual:** the ceiling itself remains an Administrator token; a broker bug that escapes the closed surface equals the ceiling. Least-privilege tightening of the token (dropping Administrator, scoping to allowlisted channels) is an Operator action before live canary.

## 2. Data flows & trust boundaries

Caller args → closed-schema dispatch → `authorize()` (company/profile/channel allowlist/issue binding) → ownership-ledger preflight (`message_edit_own` only, before intent/secret) → rate reserve → audit `intent` → policy revalidation → `secrets.resolve` (call time) → fixed-origin `https://discord.com/api/v10` via `ctx.http.fetch` (host caller: in-flight <4, FIFO 4, 1 MiB cap, no redirects) → projection/scrub → audit `outcome` → tool result (≤262 KiB). Token never leaves the broker host except as `Authorization: Bot …` on that fixed origin. **Host-boundary residual:** downstream call-event audit may retain up to ~4000 chars of args/results outside this broker; in-broker no-logging is not end-to-end non-retention (see §10).

## 3. Per-tool threat model

Common properties (all tools): closed schema (unknown/spoofed args refused, e.g. `token`, `url`, `guildId`, `secretRef`); guild bound to config; channel args validated against `readChannelIds`/`writeChannelIds`; snowflakes `^[0-9]{17,20}$`; content ≤2000 chars, no control chars; search query ≤512; emoji rejects `/` and `%`; output projected (pick-lists) and scrubbed; `Retry-After`/401 handled centrally.

| Tool | Tier | Reads credential? | Effect / risk | Key control |
| --- | --- | --- | --- | --- |
| `discord.guild_get` | read | yes, call-time | guild metadata exposure | guild = config; audit both phases |
| `discord.channels_list` / `channel_get` | read | yes | channel enumeration within guild | bounded projection; no token in output |
| `discord.messages_list` / `message_get` | read | yes | member message content read (allowlisted channels only) | channel allowlist; 1 MiB cap; **store no raw member messages** |
| `discord.messages_search` | read | yes | content search across allowlisted channel | bounded query/limit; webhook/invite scrub in results |
| `discord.pins_list`, `reactions_list` | read | yes | pins/reactions read | channel allowlist |
| `discord.threads_active_list`, `events_list`, `event_get` | read | yes | thread/event metadata | bounded projection |
| `discord.roles_list`, `member_get`, `members_search` | read | yes | role/member metadata (no assignment tool) | no role-write tool exists; bounded search |
| `discord.message_post` / `message_reply` | write | yes | persistent staging messages; @everyone attempted as plain text (see below) | `allowed_mentions:{parse:[]}` frozen; profile=`builder`; channel allowlist; ledger persists `own:…` for later edit-own |
| `discord.message_edit_own` | write | yes, after ledger+author verify | edits own messages only | ledger entry MUST exist before secret (tested `policy.ownership` with `secretCalls=0`); upstream author == `botUserId`; Discord nonce dedup window is minutes (residual) |
| `discord.reaction_add_own` / `reaction_remove_own` | write | yes | reactions on own messages | emoji schema rejects `/` `%` (no path smuggling); channel allowlist |
| `discord.thread_create` / `event_create` | write | yes | persistent threads/events on staging | named, bounded; **lifecycle gap:** archiving ≠ deletion — exact-owned deletion is not yet wired (§10) |

## 4. Confused deputy

- Caller cannot supply `token`, `secretRef`, `guildId`, `baseURL`, `headers`, or identity: closed schemas refuse them (tested: spoofed args → `validation.schema`, `secretCalls=0`).
- Identity comes from `ToolRunContext` (`agentId`/`runId`/`companyId`/`projectId`), never args; `authorize()` checks company/profile/(channel/issue/workspace). Host supplies gateway principal; the plugin schema-validates it, not its provenance (tests use synthetic ctx).
- Env confusion: two plugins bind disjoint secret refs/guilds/tool sets; a `dev` config on the `prod` plugin refuses with `policy.environment`.

## 5. Prompt/XML injection in member messages (research)

- Member message content is quoted data in results, never instructions. The tool harness must not execute or follow embedded text; research output summarizes counts/links and must not store raw member messages (embeddings/Hindsight ingest forbidden).
- `@everyone`/`@here` in content stays plain text: `allowed_mentions:{parse:[]}` is frozen in the broker, caller cannot override it. A test posts `@everyone hi` and asserts the wire body has `parse:[]`.
- Invite/webhook strings in content are redacted from results (`discord.gg/[REDACTED]`, `[REDACTED]`).

## 6. Credential escape & leakage

- Token resolved only after auth/policy; never in args, results, audit fields, logs, plugin state, or files. Tests assert token/`secret-dev` absence across result+events+logs+kv, including a guild payload echoing the token, a webhook URL, and `discord.gg/abc123` (tested both plugins).
- Redaction layers: literal-needle scrub (lines ≥16 chars), `BOT_TOKEN` shape, webhook URL, invite `discord.gg/<code>`, echoed `Bot …` headers. Audit record carries policy hash/revision + request IDs only, never the token.
- **Limit:** scrub cannot recover a token printed by an upstream error body into host-side call-event retention (§10); broker-local scrub is the control we own.

## 7. Rate, quota & load

- Per-agent 30/min, per-guild 4000/hr, 2 concurrent/worker; Discord’s 50 req/s global is not the target. `Retry-After`/`retry_after`/`x-ratelimit-reset-after` honored (`rate.discord` + pause). 401 (invalid/revoked) pauses guild 3600s, emits `upstream.unauthorized`, stops credential use.
- Audit failure blocks new side effects (`audit.unavailable`). Timeout/lost ack treated as possibly-successful mutation; no auto-replay.
- Prod token is shared with the live Owen bot: fleet-wide coordination is an Operator install precondition (broker-local limits do not cover the Worker).

## 8. Refusal matrix (preflight = zero secret, zero outbound)

All verified by tests with `secretCalls=0, calls=0`: unknown/prototype tool, schema violations, wrong company, profile `none`, channel not in allowlist, write by `researcher-read`, issue run mismatch, missing ownership ledger (`policy.ownership`), cross-environment binding, audit failure (secret not resolved, `audit.unavailable`), prod publish tools (`validation.unknown_tool`). Post-secret refusal is allowed only for the upstream author re-check on `message_edit_own` (read-after-secret is inherent, STANDARD §3).

## 9. Lifecycle / TTL / spend caps

- No general spend cap is Discord-relevant; instead hard caps: 1 MiB response, 262 KiB output, 30s deadline, rate budgets above, 401 pause 3600s. Dev threads/events accumulate on staging — owned-cleanup deletion is **not yet implemented**; until wired, only ledger-tracked messages can be edited (not deleted). The Operator must clean staging fixtures manually or we add exact-owned delete under a separate review. No auto-teardown claim is made.

## 10. Open control gaps (must not treat as blockers for tiers 1–2, must not also claim solved)

1. **Projectless grant:** TWO-5606 needs `allowProjectless:true`; project binding gap means projectless callers rely on profile + channel allowlists, not project/workspaces. Acceptable for product-lead/research reads; requires Security sign-off before prod publish.
2. **Native risk/governance:** host risk inference is name-regex (e.g. `discord.message_reply`, `member_timeout`, `thread_lock`, `member_ban` may classify as `read`; `reaction_remove_own` as `destructive`; `discord.*` not reserved for `core`). Tiers 3–4 need a native approval mapping before enabling; tier 1 is intentionally small and all-read for that reason.
3. **Nested errors:** host gateway may not inspect nested `result.error`; the plugin maps failures to the SDK `error` field (commented pattern from GitHub broker). Verify on exact host before relying on MCP error propagation.
4. **Transport bounds:** `ctx.http` reconstructs 204/205/304 replies via `new Response("")` (throws) and the host buffers up to 200 MiB; abort is not forwarded; 30s is per-request, not an operation deadline. Mitigations here: 1 MiB cap, redirect refusal (3xx except 304), preserved 204 handling. Do not claim durable isolation/timeout beyond this.
5. **State CAS:** `ctx.state` get-then-set is not compare-and-swap; concurrent `message_post` ledger entries could race. Ledger checks are best-effort fencing, not atomic uniqueness.
6. **Lifecycle for persistent creations:** archive ≠ deletion; no exact-owned delete for threads/events/messages yet (see §9).
7. **Retention boundary:** broker does not log, but host call-event audit may retain ~4000 chars of args/results; member-message raw storage is forbidden by usage policy, not by host mechanics.
8. **Isolation:** two plugins ≠ OS sandbox ≠ proof of Discord-side isolation; isolation rests on disjoint secret refs + the closed tool set.

## 11. Acceptance status

Testing: fixture/unit only (`node --test`, synthetic `ctx`), 13 dev tests. No live canary, no host verification, no Security Engineer acceptance yet. Blocks install.
