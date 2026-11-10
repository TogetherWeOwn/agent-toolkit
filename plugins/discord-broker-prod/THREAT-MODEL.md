# Threat model — Discord broker prod (tier 1 read-only at first)

Per STANDARD §2. Draft modeling aid for Security Engineer review, not acceptance. Shares the implementation and the §2/§5/§6/§10 controls with [dev](../discord-broker-dev/THREAT-MODEL.md) via `packages/discord`; the prod-relevant deltas are modeled in full below.

## 1. Credential ceiling vs exposed subset

- **Ceiling (prod):** guild `326474832151838730` Administrator for bot `1539711683898118154` — **shared with the live Owen bot** (Cloudflare Worker `two-bot-next-production`). The broker never owns this token alone.
- **Exposed subset (prod):** 11 metadata-only reads only (guild-wide personal-data reads unregistered; event reads channel-filtered). Table §3. No publish/edit/react/thread/event tool is registered; tier 3 (post/reply/edit-own) is off at first and tier 4 (moderation/admin) does not exist here.
- **Enforcement:** publish/moderation names (`discord.message_post`, `discord.member_ban`, …) hit `validation.unknown_tool` before secret resolution, with one deny audit event (tested). Cross-environment config (`environment: "dev"` on the prod plugin) refuses with `policy.environment`.
- **Residual:** ceiling remains Administrator and shared; a broker escape equals the ceiling plus contention with the live bot. Least-privilege tightening (drop Administrator; scope to public community channels) is an Operator pre-install action. Until then, prod reads must stay low-load.

## 2. Data flows & trust boundaries

Identical to dev: caller args → closed schema → `authorize()` → rate reserve → audit `intent` → revalidation → `secrets.resolve` (call time) → fixed-origin `https://discord.com/api/v10` (1 MiB, no redirects) → projection/scrub → audit `outcome`. Token reaches Discord only as `Authorization: Bot …`; it never reaches the agent. Host call-event retention caveat applies equally (see dev §10 item 7).

## 3. Per-tool threat model (all read; writes absent)

Common: guild = config; channel args checked against `policy.readChannelIds`; snowflakes `^[0-9]{17,20}$`; output projected + scrubbed; 401/429 handling central; unknown/spoofed args refused.

| Tool | Effect / risk | Key control |
| --- | --- | --- |
| `discord.guild_get`, `channels_list`, `channel_get` | guild/channel metadata | bounded projection; audit; no token in output |
| `discord.messages_list`, `message_get` | message **metadata** reads (public channels only) | channel allowlist; bodies never returned (metadata-only projection); counts/links for research |
| `discord.messages_search` (research workhorse) | bounded search returning `total_results` + message metadata links | query ≤512, limit ≤25 (Discord search maximum); webhook/invite scrub; no bodies; report “no matches in coverage”, never “nobody asked” |
| `discord.pins_list`, `reactions_list` | pins metadata / reactions | channel allowlist; pins return metadata only |
| `discord.threads_active_list`, `events_list`, `event_get` | threads/events | `threads_active_list` public/announcement threads (types 10/11) under allowlisted parents only; private (12) dropped; events channel-filtered |
| `discord.roles_list`, `discord.member_get`, `discord.members_search` | **unregistered** (guild-wide personal data, no channel tie; not needed for research) | `validation.unknown_tool` before secret |
| `discord.message_post` / `message_reply` / `message_edit_own` / `reaction_*` / `thread_create` / `event_create` | **NOT REGISTERED (tier 3 off)** — absent, not permission-gated | tool set contains zero writes; `validation.unknown_tool` + single deny event (tested) |

## 4. Confused deputy

Caller-supplied `token`/`secretRef`/`guildId`/URLs/identity are refused by closed schemas (prod tests cover schema + channel + profile). Identity is host `ToolRunContext`, validated by `authorize()`, never from args. Env confusion is refused (`policy.environment`).

## 5. Injection in member messages & research privacy

- Member content never reaches the agent on prod: `messages_list` / `message_get` / `messages_search` / `pins_list` project metadata only (id, channel, timestamp, author id/username, references) — raw bodies are dropped inside the broker, so host call-event retention and the agent can never persist them. Research answers separate explicit requests, pain signals, and inference; disclose coverage (channels/windows searched). `@everyone`/`@here` never appear because bodies never leave the broker. Tier 3 stays off until a separate review.
- Invite/webhook strings in results are redacted (`discord.gg/[REDACTED]`).

## 6. Credential escape

Token resolved only after auth; scrubbed (literal needles, `BOT_TOKEN` shape, webhook URLs, invite codes, echoed `Bot …` headers) across result/audit/logs/state; tests assert token/`secret-prod` absence incl. a guild payload echoing token/webhook/invite. Audit carries policy hash/revision + request IDs only.

## 7. Rate, quota & shared-token load

30/min per agent, 4000/hr per guild, 2 concurrent; `Retry-After` honored; 401 pauses guild 3600s and stops credential use; audit failure blocks side effects; timeout treated as possibly-successful, no auto-replay. **Shared-token load:** broker limits do not cover the live Owen Worker; fleet-wide coordination before install is an Operator precondition.

## 8. Refusal matrix

Preflight (zero secret/outbound, one deny event): unknown/prototype tool, schema violation, channel outside `readChannelIds`, profile `none`, cross-environment binding, publish tools as `validation.unknown_tool`. Post-secret refusal: none applicable for read tools.

## 9. Lifecycle / TTL / spend caps

Read-only (11 tools, metadata-only, events channel-filtered, guild-wide personal-data reads unregistered): no persistent creations, no teardown obligation. Zero outbound mutations. Caps: 1 MiB response, 262 KiB output, 30s deadline, rate/401 controls above. Discord spend is not metered; load coordination (above) is the cap.

## 10. Open control gaps

As dev THREAT-MODEL §10 items 2–5, 8 (dev items 6–7 are resolved: lifecycle is exact-owned, and the prod surface returns no message bodies), plus:

9. **Projectless research path:** the research use is projectless; `allowProjectless:true` for `researcher-read` is an explicit policy grant with profile + channel-allowlist-only binding. Acceptable for read-only research; requires Security sign-off before any tier 3 promotion.
10. **T3/T4 not yet designed for native approval:** enabling publish needs preview + approval binding the exact action/target, and moderator separation; read-only acceptance must not be read as publish acceptance.

## 11. Acceptance status

Fixture/unit tests only (13 prod tests: inventory read-only, guild/list, metadata-only (no bodies) list/get/pins/search, unknown-tool refusals, cross-env, schemas/allowlist, list filtering, bounded limits, redaction, events filter, guild binding). No live canary, no host verification, no Security Engineer acceptance, no Operator install. Blocks all use.
