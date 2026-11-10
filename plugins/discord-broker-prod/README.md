# Discord broker — prod (TogetherWeOwn, read-only at first)

Version 0.1.0. Maintainer: agent-toolkit maintainers. **Not installed or security-accepted.** SDK/host baseline: `@paperclipai/plugin-sdk@2026.1023.0`, Node 24.11+, Discord REST `v10`, `packages/discord` 0.1.0. See [ACCEPTANCE.md](ACCEPTANCE.md) and [THREAT-MODEL.md](THREAT-MODEL.md).

Binds only its own secret ref (`DISCORD_BOT_TOKEN_PROD`, bot Owen `1539711683898118154`) and its own guild allowlist (TogetherWeOwn `326474832151838730`). Agents never see the token. Dev (`plugins/discord-broker-dev`) is a separate plugin with a separate secret ref; cross-environment use is refused by construction (tool set) and by config (`policy.environment`).

## ⚠️ Shared-token constraint

The prod token is **shared with the live Owen bot** (Cloudflare Worker `two-bot-next-production`). The broker-local limiter (30/min per agent, 4000/hr per guild) does **not** bound the live bot’s usage. The Operator must coordinate fleet-wide Discord load before install; keep broker load far below Discord limits, honor `Retry-After`, and stop on 401. This coordination is an install precondition, not something the code enforces alone.

## Tools (6 read-only, channel-bound)

Tier 1 — read only: `discord.channel_get`, `discord.messages_list`, `discord.message_get`, `discord.messages_search`, `discord.pins_list`, `discord.reactions_list`. Every retained tool carries a `channelId` argument verified against `readChannelIds` before any outbound call, and fetched objects are re-verified to the bound channel (`upstream.channel` fail-closed). Reads without a verifiable permitted channel tie are **unregistered**: `discord.guild_get`, `discord.channels_list`, `discord.threads_active_list`, `discord.events_list`, `discord.event_get`, plus guild-wide personal-data reads (`discord.roles_list`, `discord.member_get`, `discord.members_search`), which are not needed for bounded research. Message tools (`messages_list`, `message_get`, `messages_search`, `pins_list`) return **metadata only** (identifiers, counts, links, timestamps, author ids) — raw member message bodies, channel names/topics and author usernames never leave the broker.

Tier 3 (prod publish: post/reply/edit-own) is **off at first** and registers no tool. Tier 4 (moderation/admin) is not registered. Hard denies, never constructed: token disclosure, app/intent/permission changes, @everyone/@here escalation, mass DM, bulk ban/prune, guild leave/delete.

## Research use

Bounded read-only research answers (e.g. “has anyone in the Discord asked for this feature?”):

- Public community channels only — the Operator sets `readChannelIds` to that set; nothing outside the allowlist is reachable.
- Bounded queries with the `profile: researcher-read` + `allowProjectless:true` grant (projectless research path; residual risk documented in THREAT-MODEL).
- Return counts and message links only. **Store no raw member messages**: no embeddings, no Hindsight ingest, no attachments. Distinguish explicit requests from pain/inference, and “no matches in coverage” from “nobody asked”.

## Profiles and budgets

Profiles: `builder`, `lead`, `researcher-read`, `reviewer-read`, `none`. Budgets: 30/min per agent, 4000/hr per guild, 2 concurrent; `Retry-After` honored; 401 pauses the guild 3600s. Responses ≤1 MiB, output ≤262 KiB, 30s deadline.

## Audit and redaction

Intent + outcome audit per call; audit failure blocks side effects. Scrubbed (case-insensitive): bot token, webhook tokens, invite codes, echoed `Bot …` headers.

## Acceptance gates

Unmet and blocking: Security Engineer review of this read-only tier; Operator install; prod publish (tier 3) requires a **separate** review after the dev canary passes. See ACCEPTANCE.md.
