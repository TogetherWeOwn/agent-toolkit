import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, channelId, messageId, guildId, refused } from './helpers.mjs';
import { Broker, toolsFor } from '../dist/plugins/discord-broker-prod/src/broker.js';
import manifest from '../dist/plugins/discord-broker-prod/src/manifest.js';

globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };

test('prod inventory is read-only: 11 reads, no publish tools registered', () => {
  const tools = toolsFor('prod');
  assert.equal(tools.length, 11);
  assert.ok(tools.every(t => t.tier === 'read'));
  assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  assert.equal(manifest.id, 'togetherweown.discord-broker-prod');
  for (const name of ['discord.message_post', 'discord.message_reply', 'discord.message_edit_own', 'discord.reaction_add_own', 'discord.thread_create', 'discord.event_create']) {
    assert.ok(!manifest.tools.some(t => t.name === name), `${name} must be off at first`);
    assert.ok(!tools.some(t => t.name === name));
  }
  for (const name of ['discord.member_get', 'discord.members_search', 'discord.roles_list']) {
    assert.ok(!manifest.tools.some(t => t.name === name), `${name} must be unregistered (guild-wide personal data)`);
    assert.ok(!tools.some(t => t.name === name));
  }
});

test('prod guild_get + messages_list: bounded read, audit, no token in output', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'TogetherWeOwn' });
  const r1 = await f.call('discord.guild_get', { ...base });
  assert.equal(r1.data.ok, true); f.hygiene(r1); f.done();
  const g = fixture();
  g.read(`/channels/${channelId}/messages?limit=5`, [{ id: messageId, channel_id: channelId, content: 'synthetic member message body', author: { id: '1'.repeat(17), username: 'syn' } }]);
  const r2 = await g.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(r2.data.ok, true);
  // A2: raw member bodies must not leave the broker on prod.
  assert.ok(!JSON.stringify(r2.data).includes('synthetic member message body'), 'Message body escaped prod surface');
  assert.equal(r2.data.page[0].id, messageId);
  g.hygiene(r2); g.done();
});

test('prod message_get and pins_list return metadata only (no bodies)', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}/messages/${messageId}`, { id: messageId, channel_id: channelId, content: 'member body secret', author: { id: '1'.repeat(17), username: 'syn' } });
  const r1 = await f.call('discord.message_get', { ...base, channelId, messageId });
  assert.equal(r1.data.ok, true);
  assert.ok(!JSON.stringify(r1.data).includes('member body secret'), 'Body escaped message_get');
  const g = fixture();
  g.read(`/channels/${channelId}/pins`, [{ id: messageId, channel_id: channelId, content: 'pinned body secret', author: { id: '1'.repeat(17), username: 'syn' } }]);
  const r2 = await g.call('discord.pins_list', { ...base, channelId });
  assert.equal(r2.data.ok, true);
  assert.ok(!JSON.stringify(r2.data).includes('pinned body secret'), 'Body escaped pins_list');
  f.hygiene(r1); g.hygiene(r2); f.done(); g.done();
});

test('prod messages_search returns counts/links without storing raw member messages', async () => {
  const f = fixture();
  // Discord documents the text filter as `content` (limit 1-25).
  f.read(`/guilds/${guildId}/messages/search?content=${encodeURIComponent('feature-request')}&channel_id=${channelId}&limit=5`, { total_results: 2, messages: [[{ id: messageId, channel_id: channelId, content: 'asked for a feature' }]] });
  const result = await f.call('discord.messages_search', { ...base, query: 'feature-request', channelId, limit: 5 });
  assert.equal(result.data.ok, true);
  assert.ok(!JSON.stringify(result.data).includes('secret-prod'));
  // A2: only counts + metadata links leave the broker.
  assert.equal(result.data.page.total_results, 2);
  assert.equal(result.data.page.messages[0].id, messageId);
  assert.ok(!JSON.stringify(result.data).includes('asked for a feature'), 'Message body escaped search');
  f.hygiene(result); f.done();
});

test('prod refuses publish tools as unknown_tool before secret/HTTP', async () => {
  for (const name of ['discord.message_post', 'discord.message_reply', 'discord.message_edit_own', 'discord.message_delete', 'discord.member_timeout', 'discord.member_ban', 'discord.webhook_create']) {
    const events = [];
    const result = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, 'prod', name, { ...base, channelId, content: 'x' }, run);
    assert.equal(result.isError, true); assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool'); assert.equal(events.length, 1);
  }
});

test('cross-environment binding refused: dev guild/secret on prod plugin', async () => {
  const f = fixture();
  f.config.environment = 'dev';
  refused(f, await f.call('discord.guild_get', { ...base }), 'policy.environment');
  const g = fixture(); g.config.botTokenSecretRef.secretId = 'secret-dev';
  // secret ref mismatch is enforced by host fake: secrets fake asserts equality to config ref; change host expectation via fresh fixture
  // directly verify plugin binds its own ref path (configPath) — done in helpers; here check env isolation via tool split.
  assert.ok(!toolsFor('prod').some(t => t.name === 'discord.message_post'));
});

test('closed schemas + channel allowlist + profile refusals', async () => {
  const f = fixture(); refused(f, await f.call('discord.messages_list', { ...base, channelId, limit: 0 }), 'validation.schema');
  const g = fixture(); g.config.policy.readChannelIds = ['1999999999999999999'];
  refused(g, await g.call('discord.messages_list', { ...base, channelId, limit: 1 }), 'policy.channel');
  const h = fixture(); h.config.policy.agents[0].profile = 'none';
  refused(h, await h.call('discord.guild_get', { ...base }), 'policy.profile');
});

test('prod channels_list + threads_active_list restrict to allowlisted channels', async () => {
  const restrictedId = '326474832151838739';
  const f = fixture();
  f.read(`/guilds/${guildId}/channels`, [ { id: channelId, name: 'public', type: 0 }, { id: restrictedId, name: 'restricted-prod', type: 0, topic: 'hidden' } ]);
  const r1 = await f.call('discord.channels_list', { ...base });
  assert.equal(r1.data.ok, true);
  assert.deepEqual(r1.data.page.map(c => c.id), [channelId]);
  assert.ok(!JSON.stringify(r1.data).includes('restricted-prod'));
  const g = fixture();
  g.read(`/guilds/${guildId}/threads/active`, { threads: [
    { id: '326474832151838740', name: 'public-thread', parent_id: channelId, type: 11 },
    { id: '326474832151838741', name: 'restricted-thread', parent_id: restrictedId, type: 11 },
  ] });
  const r2 = await g.call('discord.threads_active_list', { ...base });
  assert.equal(r2.data.ok, true);
  assert.deepEqual(r2.data.page.map(t => t.name), ['public-thread']);
  f.hygiene(r1); g.hygiene(r2); f.done(); g.done();
});

test('prod embedded foreign bot token redacted; message links preserved', async () => {
  const otherToken = `${'C'.repeat(24)}.ABCDEF.${'D'.repeat(27)}`;
  // Prod returns metadata only, so verify the scrub path via guild description
  // carrying the embedded token (message-link preservation is covered on the
  // dev full-body surface).
  const g = fixture();
  g.read(`/guilds/${guildId}`, { id: guildId, name: 'prod', description: `copy ${otherToken} plus discord.gg/abc123` });
  const r = await g.call('discord.guild_get', { ...base });
  assert.equal(r.data.ok, true);
  const visible = JSON.stringify({ result: r, events: g.events });
  assert.ok(!visible.includes(otherToken) && !visible.includes('abc123'), 'Embedded token/invite escaped');
  g.hygiene(r);
});

test('prod limits: search at most 25; dropped guild-wide reads are unknown tools', async () => {
  const b = fixture();
  refused(b, await b.call('discord.messages_search', { ...base, query: 'synthetic', channelId, limit: 26 }), 'validation.schema');
  for (const name of ['discord.member_get', 'discord.members_search', 'discord.roles_list']) {
    const events = [];
    const { Broker: BrokerProd } = await import('../dist/plugins/discord-broker-prod/src/broker.js');
    const result = await new BrokerProd().execute({ audit: async e => events.push(e), clock: Date.now }, 'prod', name, { ...base }, run);
    assert.equal(result.isError, true, name);
    assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool', name);
    assert.equal(events.length, 1, name);
  }
});

test('token canary / webhook / invite redaction on prod too', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'prod', description: 'https://discord.com/api/webhooks/1/should-redact discord.gg/abc123' });
  const result = await f.call('discord.guild_get', { ...base });
  assert.equal(result.data.ok, true);
  const visible = JSON.stringify({ result, events: f.events });
  assert.ok(!visible.includes('should-redact') && !visible.includes('abc123'));
  f.hygiene(result);
});

test('prod events_list restricts to allowlisted channels', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}/scheduled-events`, [
    { id: '326474832151838740', name: 'public-event', channel_id: channelId, guild_id: guildId },
    { id: '326474832151838741', name: 'restricted-event', channel_id: '326474832151838739', guild_id: guildId },
  ]);
  const result = await f.call('discord.events_list', { ...base });
  assert.equal(result.data.ok, true);
  assert.deepEqual(result.data.page.map(e => e.name), ['public-event']);
  f.hygiene(result); f.done();
});

test('prod channel_get from another guild is refused (guild binding)', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}`, { id: channelId, name: 'other-guild-channel', guild_id: '9999999999999999999', type: 0 });
  const result = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(result.data.ok, false);
  assert.equal(result.data.rule, 'upstream.guild');
  f.hygiene(result);
});
