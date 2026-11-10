# Discord broker — dev (TWO Staging)

Version 0.1.0. Maintainer: agent-toolkit maintainers. **Not installed or security-accepted.** SDK/host baseline: `@paperclipai/plugin-sdk@2026.1023.0`, Node 24.11+, Discord REST `v10`, `packages/discord` 0.1.0. See [ACCEPTANCE.md](ACCEPTANCE.md) and [THREAT-MODEL.md](THREAT-MODEL.md).

Binds only its own secret ref (`DISCORD_BOT_TOKEN_STAGING`, bot Owen QA Test `1469137636663758888`) and its own guild allowlist (TWO Staging `1545644954272137297`). Agents never see the token. Prod (`plugins/discord-broker-prod`) is a separate plugin with separate secret ref, guild, and deployment; it cannot reach staging resources and vice versa. ADR: separate plugin bindings are not an OS sandbox or proof of Discord-side isolation; the tool split is the isolation mechanism.

## Tools (21: 14 read + 7 dev writes)

Each tool requires `issueId` + `workspaceId` selectors. The broker verifies the caller’s company/profile, the issue’s company/assignee/current run/active status, and (when bound to a project) the explicit workspace. Unknown fields and arguments fail closed; there is no generic HTTP proxy.

Tier 1 — read: `discord.guild_get`, `discord.channels_list`, `discord.channel_get`, `discord.messages_list`, `discord.message_get`, `discord.messages_search`, `discord.pins_list`, `discord.reactions_list`, `discord.threads_active_list`, `discord.events_list`, `discord.event_get`, `discord.roles_list`, `discord.member_get`, `discord.members_search`.

Tier 2 — dev writes (staging only): `discord.message_post`, `discord.message_reply`, `discord.message_edit_own`, `discord.reaction_add_own`, `discord.reaction_remove_own`, `discord.thread_create`, `discord.event_create`. Writes are plain text with `allowed_mentions:{parse:[]}` frozen. `message_edit_own` additionally requires a broker ownership-ledger entry (`own:<channelId>:<messageId>` via `plugin.state`) **and** upstream author == configured bot user; the ledger existence check runs before secret resolution (STANDARD §8 preflight).

Tier 3 (prod publish) is off at first; tier 4 (moderation/admin: delete, timeout, roles, channels, bans, webhooks, commands) is not registered. Hard denies, never constructed: token disclosure, app/intent/permission changes, @everyone/@here escalation, mass DM, bulk ban/prune, guild leave/delete.

## Profiles and budgets

- Profiles: `builder` (read + dev writes), `lead`, `researcher-read`, `reviewer-read`, `none`. A write tool requires a write-capable profile; prod registers no write tools.
- `allowProjectless:true` grant: agents running outside a project binding (TWO-5606 research) must have this explicit grant in policy. This is a documented residual-risk path (see THREAT-MODEL §10), not a blanket bypass — channel allowlists and profile checks still apply.
- Budgets: 30 calls/min per agent, 4000/hr per guild, 2 concurrent per worker. Honors `Retry-After`/`retry_after`/`X-RateLimit-*`; 401 pauses the guild 3600s and stops credential use. Responses capped at 1 MiB, output at 262 KiB, 30s per-request deadline.

## Audit and redaction

Every call emits an `intent` and an `outcome` audit record; audit failure blocks side effects (`audit.unavailable`). Outputs, audit, logs, and plugin state are scrubbed for the bot token, webhook tokens (`discord.com/api/webhooks/<id>/<token>`), and invite codes (`discord.gg/<code>`), plus any echoed `Bot …` auth header.

## Acceptance gates

Unmet and blocking: Security Engineer review and acceptance of this artifact + policy envelope; Operator install; live canary on TWO Staging. See ACCEPTANCE.md for exact commands/results and the open-control-gap register. Do not mark tiers 1–2 ready for install until those gates pass.
