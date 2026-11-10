# Threat model — Discord broker dev (tier 1 read only; writes unregistered)

Per STANDARD §2. This is a draft modeling aid for Security Engineer review, not acceptance. The prod plugin (`plugins/discord-broker-prod`) shares the same implementation via `packages/discord` and differs only in the read-only tool set and its own secret/guild binding; its tier deltas are noted where they differ.

## 1. Credential ceiling vs exposed subset

- **Ceiling (what the bot token can do, staging):** guild `1545644954272137297` Administrator for bot `1469137636663758888` — i.e. mutable moderation/admin surface at Discord. Wildly more than the exposed subset.
- **Exposed subset (tools):** 14 reads only. Dev writes (post, reply, edit-own, react, thread/event create, and the three exact-owned deletes) are **unregistered**: the October security review retained the lifecycle finding (no independent teardown scheduler on this host; opportunistic sweep is not one, per commits c72e7ae and 388b473) and records a further authorization concern on the exact-ownership path (details held confidentially, not reproduced here). Per the review’s direction the write envelope is held out of registration rather than repaired in a third cycle. The implementations remain in `packages/discord` (`writeTools`) but `toolsFor("dev")` and the manifest register reads only; any write name is refused as `validation.unknown_tool` before secret resolution (tested). No delete, timeout, roles, bans, channels, webhooks, commands, guild leave/delete, mass DM, or token disclosure exists as a tool.
- **Enforcement:** the exposed subset is the maximum reachable; out-of-scope names (`discord.member_ban`, `discord.webhook_create`, `discord.channel_delete`, `discord.command_create`, `discord.bulk_delete`, `discord.guild_leave`, …) hit `validation.unknown_tool` before secret resolution (tested). Prototype keys (`constructor`, `__proto__`, `toString`) likewise.
- **Residual:** the ceiling itself remains an Administrator token; a broker bug that escapes the closed surface equals the ceiling. Least-privilege tightening of the token (dropping Administrator, scoping to allowlisted channels) is an Operator action before live canary.

## 2. Data flows & trust boundaries

Caller args → closed-schema dispatch → `authorize()` (company/profile/channel allowlist/issue binding) → rate reserve → audit `intent` → policy revalidation → `secrets.resolve` (call time) → fixed-origin `https://discord.com/api/v10` via `ctx.http.fetch` (host caller: in-flight <4, FIFO 4, 1 MiB cap, no redirects) → projection/scrub → audit `outcome` → tool result (≤262 KiB). (Ownership-ledger preflight belonged to the unregistered write envelope and is not on this read path.) Token never leaves the broker host except as `Authorization: Bot …` on that fixed origin. **Host-boundary residual:** downstream call-event audit may retain up to ~4000 chars of args/results outside this broker; in-broker no-logging is not end-to-end non-retention (see §10).

## 3. Per-tool threat model

Common properties (all tools): closed schema (unknown/spoofed args refused, e.g. `token`, `url`, `guildId`, `secretRef`); guild bound to config; channel args validated against `readChannelIds`/`writeChannelIds`; snowflakes `^[0-9]{17,20}$`; content ≤2000 chars, no control chars; search query ≤512; emoji rejects `/` and `%`; output projected (pick-lists) and scrubbed; `Retry-After`/401 handled centrally.

| Tool | Tier | Reads credential? | Effect / risk | Key control |
| --- | --- | --- | --- | --- |
| `discord.guild_get` | read | yes, call-time | guild metadata exposure | guild = config; audit both phases |
| `discord.channels_list` / `channel_get` | read | yes | channel enumeration within guild | bounded projection; `channels_list` post-projection filtered to `readChannelIds` (tested: restricted channels absent); no token in output |
| `discord.messages_list` / `message_get` | read | yes | member message content read (allowlisted channels only) | channel allowlist; 1 MiB cap; **store no raw member messages** |
| `discord.messages_search` | read | yes | content search across allowlisted channel | bounded query/limit; webhook/invite scrub in results |
| `discord.pins_list`, `reactions_list` | read | yes | pins/reactions read | channel allowlist |
| `discord.threads_active_list`, `events_list`, `event_get` | read | yes | thread/event metadata | bounded projection; `threads_active_list` post-projection filtered to threads whose parent channel is allowlisted (tested) |
| `discord.roles_list`, `member_get`, `members_search` | read | yes | role/member metadata (no assignment tool) | no role-write tool exists; bounded search |
| `discord.message_post`, `message_reply`, `message_edit_own`, `reaction_add_own`, `reaction_remove_own`, `thread_create`, `event_create`, `message_delete_own`, `thread_delete_own`, `event_delete_own` | **unregistered** | n/a | previously tier-2/on staging; held out of registration — see scope-reduction note in §1 | `validation.unknown_tool` before secret (tested); implementations retained unregistered in `packages/discord` |

## 4. Confused deputy

- Caller cannot supply `token`, `secretRef`, `guildId`, `baseURL`, `headers`, or identity: closed schemas refuse them (tested: spoofed args → `validation.schema`, `secretCalls=0`).
- Identity comes from `ToolRunContext` (`agentId`/`runId`/`companyId`/`projectId`), never args; `authorize()` checks company/profile/(channel/issue/workspace). Host supplies gateway principal; the plugin schema-validates it, not its provenance (tests use synthetic ctx).
- Env confusion: two plugins bind disjoint secret refs/guilds/tool sets; a `dev` config on the `prod` plugin refuses with `policy.environment`.

## 5. Prompt/XML injection in member messages (research)

- Member message content is quoted data in results, never instructions. The tool harness must not execute or follow embedded text; research output summarizes counts/links and must not store raw member messages (embeddings/Hindsight ingest forbidden).
- `@everyone`/`@here` cannot be sent by this read-only plugin: there is no post tool. If writes are ever re-registered, `allowed_mentions:{parse:[]}` must be frozen in the broker and `@everyone` assembly tested wire-side before acceptance.
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

All verified by tests with `secretCalls=0, calls=0`: unknown/prototype tool (incl. all ten unregistered write names and tier-4 names), schema violations, wrong company, profile `none`, channel not in allowlist, issue run mismatch, cross-environment binding, audit failure (secret not resolved, `audit.unavailable`). No registered tool requires a post-secret refusal.

## 9. Lifecycle / TTL / spend caps

- Caps: 1 MiB response, 262 KiB output, 30s deadline, rate budgets above, 401 pause 3600s.
- **Registered tools are read-only.** Per STANDARD §5, read-only tools state that creation lifecycle requirements are not applicable and why: this plugin registers no resource-creating tool, so there is nothing to expire or tear down. State KV is used only for legacy ledger cleanup (below), never as a resource ledger for new work.
- Legacy cleanup: the opportunistic sweep (≤10 expired entries per authorized dev call, verify + DELETE + GET-404 verification) is retained and tested, but it is **not** an independent scheduler and does not satisfy STANDARD §5 by itself. It exists solely to remove any ledger rows left behind by earlier builds; no new rows can be created while writes are unregistered.
- Re-registering any persistent-creation write requires: (a) an independent scheduled teardown that survives restart plus completion/cancellation hooks, (b) a favorable exact-artifact Security review of the write envelope, and (c) fixture evidence covering restart, expiry, and ambiguous-success reconcile. That work is deliberately out of scope for this reduced envelope.

## 10. Open control gaps (open; must not claim solved)

1. **Projectless grant:** the research use needs `allowProjectless:true`; project binding gap means projectless callers rely on profile + channel allowlists, not project/workspaces. Acceptable for product-lead/research reads; requires Security sign-off before prod publish.
2. **Native risk/governance:** host risk inference is name-regex (e.g. `discord.message_reply`, `member_timeout`, `thread_lock`, `member_ban` may classify as `read`; `reaction_remove_own` as `destructive`; `discord.*` not reserved for `core`). Tiers 3–4 need a native approval mapping before enabling; tier 1 is intentionally small and all-read for that reason.
3. **Nested errors:** host gateway may not inspect nested `result.error`; the plugin maps failures to the SDK `error` field (commented pattern from GitHub broker). Verify on exact host before relying on MCP error propagation.
4. **Transport bounds:** `ctx.http` reconstructs 204/205/304 replies via `new Response("")` (throws) and the host buffers up to 200 MiB; abort is not forwarded; 30s is per-request, not an operation deadline. Mitigations here: 1 MiB cap, redirect refusal (3xx except 304), preserved 204 handling. Do not claim durable isolation/timeout beyond this.
5. **State CAS:** `ctx.state` get-then-set is not compare-and-swap. No write tool is registered, so it cannot currently race ledger writes; any future write envelope must address non-atomic ledger updates.
6. **Lifecycle for persistent creations:** n/a for this read-only plugin (§9). Persistent-creation writes are unregistered because STANDARD §5's independent teardown requirement cannot be met on this host; re-registration gates are listed in §9.
7. **Retention boundary:** broker does not log, but host call-event audit may retain ~4000 chars of args/results. On prod this can no longer contain member message bodies (metadata-only surface). On dev (staging), bodies are returned for canary verification by design.
8. **Isolation:** two plugins ≠ OS sandbox ≠ proof of Discord-side isolation; isolation rests on disjoint secret refs + the closed tool set.

## 11. Acceptance status

Testing: fixture/unit only (`node --test`, synthetic `ctx`), 17 dev tests for the read-only envelope. No live canary, no host verification, no Security Engineer acceptance yet. Blocks install.
