import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProjection } from "../scripts/canary-projection.mjs";

const expected = { guildId: "11111111111111111", channelId: "22222222222222222" };
const channel = { id: expected.channelId, type: 0, guild_id: expected.guildId };
const message = { id: "33333333333333333", channel_id: expected.channelId, guild_id: expected.guildId,
  timestamp: "2026-01-01T00:00:00Z", url: `https://discord.com/channels/${expected.guildId}/${expected.channelId}/33333333333333333` };
const check = (page, operation) => validateProjection(page, operation, expected);

test("source-derived synthetic channel and message projections are accepted", () => {
  assert.deepEqual(check(channel, "discord.channel_get"), { ok: true });
  assert.deepEqual(check([message], "discord.messages_list"), { ok: true });
  assert.deepEqual(check([], "discord.messages_list"), { ok: true });
  assert.deepEqual(check([{ ...message, timestamp: "2024-02-29T23:59:59+01:00" }], "discord.messages_list"), { ok: true });
});

test("projections reject extra fields, bad types, identities and replayed messages", () => {
  for (const value of [
    { ...channel, name: "secret" }, { ...channel, type: "0" }, { ...channel, id: "9" },
  ]) assert.deepEqual(check(value, "discord.channel_get"), { ok: false, reason: "projection" });
  for (const value of [
    Array(1), [{ ...message, content: "secret" }], [{ ...message, timestamp: "yesterday" }],
    ...["2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-01-01T24:00:00Z"].map((timestamp) => [{ ...message, timestamp }]),
    [{ ...message, channel_id: "44444444444444444" }], [{ ...message, url: "https://example.test" }],
    [{ ...message, author_bot: "false" }], [message, message], Array(101).fill(message),
    [{ ...message, message_reference: { guild_id: "44444444444444444" } }],
  ]) assert.deepEqual(check(value, "discord.messages_list"), { ok: false, reason: "projection" });
});
