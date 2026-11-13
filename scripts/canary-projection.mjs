// Source-derived synthetic validation only. This module performs no I/O and
// does not establish that any host invocation or live canary occurred.
const snowflake = (v) => typeof v === "string" && /^[0-9]{17,20}$/.test(v);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, required, optional = []) => record(v)
  && required.every((k) => Object.hasOwn(v, k))
  && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const optional = (v, key, predicate) => !Object.hasOwn(v, key) || predicate(v[key]);
const timestamp = (v) => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.exec(v);
  if (!m || !Number.isFinite(Date.parse(v))) return false;
  const [, y, month, day, hour, minute, second] = m.map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    && hour <= 23 && minute <= 59 && second <= 59;
};

function channel(value, expected) {
  return keys(value, ["id", "type", "guild_id"], ["parent_id", "last_message_id"])
    && value.id === expected.channelId && value.guild_id === expected.guildId
    && integer(value.type)
    && optional(value, "parent_id", snowflake)
    && optional(value, "last_message_id", snowflake);
}

function message(value, expected) {
  if (!keys(value, ["id", "channel_id", "guild_id", "timestamp", "url"],
    ["pinned", "type", "author_id", "author_bot", "message_reference"])) return false;
  if (!snowflake(value.id) || value.channel_id !== expected.channelId || value.guild_id !== expected.guildId
    || !timestamp(value.timestamp)
    || value.url !== `https://discord.com/channels/${expected.guildId}/${expected.channelId}/${value.id}`
    || !optional(value, "pinned", (v) => typeof v === "boolean")
    || !optional(value, "type", integer)
    || !optional(value, "author_id", snowflake)
    || !optional(value, "author_bot", (v) => typeof v === "boolean")) return false;
  if (!Object.hasOwn(value, "message_reference")) return true;
  const ref = value.message_reference;
  return keys(ref, [], ["message_id", "channel_id", "guild_id", "type"])
    && Object.keys(ref).length > 0
    && ["message_id", "channel_id", "guild_id"].every((k) => optional(ref, k, snowflake))
    && optional(ref, "type", integer)
    && optional(ref, "channel_id", (v) => v === expected.channelId)
    && optional(ref, "guild_id", (v) => v === expected.guildId);
}

export function validateProjection(page, operation, expected) {
  if (!record(expected) || !snowflake(expected.channelId) || !snowflake(expected.guildId)) {
    return { ok: false, reason: "expected_identity" };
  }
  if (operation === "discord.channel_get") {
    return channel(page, expected) ? { ok: true } : { ok: false, reason: "projection" };
  }
  if (operation === "discord.messages_list") {
    if (!Array.isArray(page) || page.length > 100 || !Array.from(page).every((m) => message(m, expected))) {
      return { ok: false, reason: "projection" };
    }
    if (new Set(page.map((m) => m.id)).size !== page.length) return { ok: false, reason: "projection" };
    return { ok: true };
  }
  return { ok: false, reason: "operation" };
}
