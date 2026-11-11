import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, channelId, messageId, guildId, token, refused } from './helpers.mjs';
import { Broker, toolsFor } from '../dist/plugins/discord-broker-dev/src/broker.js';
import manifest from '../dist/plugins/discord-broker-dev/src/manifest.js';

globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };

const UNREGISTERED_WRITES = [
  'discord.message_post', 'discord.message_reply', 'discord.message_edit_own',
  'discord.reaction_add_own', 'discord.reaction_remove_own',
  'discord.thread_create', 'discord.event_create',
  'discord.message_delete_own', 'discord.thread_delete_own', 'discord.event_delete_own',
];

// Reads without a verifiable permitted channel tie are unregistered.
const UNREGISTERED_READS = [
  'discord.guild_get', 'discord.channels_list', 'discord.threads_active_list',
  'discord.events_list', 'discord.event_get',
  'discord.member_get', 'discord.members_search', 'discord.roles_list',
];

test('exact tool inventory: dev is read-only (6 channel-bound reads, 0 write)', () => {
  const tools = toolsFor('dev');
  assert.equal(tools.length, 6);
  assert.ok(tools.every(t => t.tier === 'read'), 'dev registers read tools only');
  assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  assert.equal(manifest.id, 'togetherweown.discord-broker-dev');
  for (const name of UNREGISTERED_WRITES) assert.ok(!tools.some(t => t.name === name), `${name} must be unregistered`);
  for (const name of UNREGISTERED_WRITES) assert.ok(!manifest.tools.some(t => t.name === name), `${name} must be absent from manifest`);
  for (const name of UNREGISTERED_READS) {
    assert.ok(!tools.some(t => t.name === name), `${name} must be unregistered (no verifiable channel tie)`);
    assert.ok(!manifest.tools.some(t => t.name === name), `${name} must be absent from manifest`);
  }
});

test('dev writes are unregistered: any write name is refused as unknown tool before secret', async () => {
  for (const name of UNREGISTERED_WRITES) {
    const events = [];
    const result = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, 'dev', name, { ...base, channelId, messageId, content: 'x', eventId: messageId, threadId: messageId, emoji: '👍', name: 'n', scheduledStartTime: '2026-11-20T00:00:00' }, run);
    assert.equal(result.isError, true, name);
    assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool', name);
    assert.equal(events.length, 1, name);
  }
});

test('discord.channel_get: fixed origin, bounded read, audit, no token in output', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}`, { id: channelId, name: 'synthetic', type: 0, guild_id: guildId, topic: 'synthetic' });
  const result = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(result.error, undefined); assert.equal(result.data.ok, true);
  assert.equal(f.secretCalls, 1); assert.equal(f.events.length, 2);
  assert.equal(f.events[0].phase, 'intent'); assert.equal(f.events[1].outcome, 'success');
  f.hygiene(result); f.done();
});

test('discord.messages_list: allowlisted channel only', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}/messages?limit=10`, [{ id: messageId, channel_id: channelId, content: 'synthetic hello', timestamp: '2026-11-10T00:00:00.000Z', author: { id: '1'.repeat(17), username: 'synthetic' } }]);
  const result = await f.call('discord.messages_list', { ...base, channelId, limit: 10 });
  assert.equal(result.data.ok, true); f.hygiene(result); f.done();
});

test('discord.messages_search: bounded query in allowlisted channel; webhook/invite redaction', async () => {
  const f = fixture();
  // Discord documents the text filter as `content` (limit 1-25).
  f.read(`/guilds/${guildId}/messages/search?content=${encodeURIComponent('feature-request')}&channel_id=${channelId}&limit=10`, { total_results: 1, messages: [[{ id: messageId, channel_id: channelId, content: 'see https://discord.com/api/webhooks/123/abcETE' }]] });
  const result = await f.call('discord.messages_search', { ...base, query: 'feature-request', channelId, limit: 10 });
  assert.equal(result.data.ok, true);
  assert.ok(!JSON.stringify(result.data).includes('abcETE'), 'Webhook token must be redacted');
  f.hygiene(result); f.done();
});

test('unknown tool and prototype dispatch have no secret or outbound access', async () => {
  for (const name of ['constructor', '__proto__', 'toString', 'discord.member_ban', 'discord.webhook_create', 'discord.channel_delete', 'discord.command_create', 'discord.bulk_delete', 'discord.guild_leave']) {
    const events = [];
    const result = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, 'dev', name, base, run);
    assert.equal(result.isError, true); assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool'); assert.equal(events.length, 1);
  }
});

test('closed schemas reject malformed shapes, spoofed args and over-limit values', async () => {
  const cases = [
    [{ ...base, channelId, limit: 0 }, 'validation.schema'],
    [{ ...base, channelId, limit: 101 }, 'validation.schema'],
    [{ ...base, channelId, limit: 1.5 }, 'validation.schema'],
    [{ ...base, channelId, limit: 10, token: 'spoof' }, 'validation.schema'],
    [{ ...base, channelId, limit: 10, url: 'https://evil.test' }, 'validation.schema'],
    [{ ...base, channelId, limit: 10, guildId, secretRef: 'secret-dev' }, 'validation.schema'],
    [null, 'validation.schema'], [[], 'validation.schema'], [{}, 'validation.schema'],
  ];
  for (const [args, rule] of cases) {
    const f = fixture(); refused(f, await f.call('discord.messages_list', args), rule);
  }
  // Formerly-valid write shapes are now refused as unknown tools even with
  // well-formed args: no write tool is registered to parse them.
  const events = [];
  const post = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, 'dev', 'discord.message_post', { ...base, channelId, content: '@everyone hi' }, run);
  assert.equal(JSON.parse(post.content[0].text).rule, 'validation.unknown_tool');
});

test('policy refusals: wrong company, profile none, channel allowlist, prereq binding', async () => {
  const a = fixture(); a.issue.companyId = 'another-company';
  refused(a, await a.call('discord.channel_get', { ...base, channelId }), 'identity.issue_company');
  const b = fixture(); b.config.policy.agents[0].profile = 'none';
  refused(b, await b.call('discord.channel_get', { ...base, channelId }), 'policy.profile');
  const c = fixture(); c.config.policy.readChannelIds = ['1999999999999999999'];
  refused(c, await c.call('discord.messages_list', { ...base, channelId, limit: 1 }), 'policy.channel');
  const e = fixture(); e.issue.checkoutRunId = 'another-run'; e.issue.executionRunId = 'another-run';
  refused(e, await e.call('discord.channel_get', { ...base, channelId }), 'identity.issue_run');
});

test('401 stops credential use (guild pause); 429 honors Retry-After', async () => {
  const f = fixture();
  f.steps.push({ method: 'GET', path: `/api/v10/channels/${channelId}`, status: 401, body: { message: '401' } });
  const r1 = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(r1.data.rule, 'upstream.unauthorized');
  const g = fixture();
  g.steps.push({ method: 'GET', path: `/api/v10/channels/${channelId}`, status: 429, headers: { 'retry-after': '17' }, body: { message: '429' } });
  const r2 = await g.call('discord.channel_get', { ...base, channelId });
  assert.equal(r2.data.rule, 'rate.discord'); assert.equal(r2.data.retryAfterSeconds, 17);
});

test('token canary never appears in success/refusal/audit (webhook+invite redaction)', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}`, { id: channelId, name: token, type: 0, guild_id: guildId, topic: `invite discord.gg/abc123 webhook https://discord.com/api/webhooks/1/${token}` });
  const result = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(result.data.ok, true);
  const visible = JSON.stringify({ result, events: f.events });
  assert.ok(!visible.includes(token) && !visible.includes('abc123'), 'Token/invite escaped');
  f.hygiene(result);
});

test('hydration: audit failure blocks side effects; policy change refuses', async () => {
  const f = fixture(); f.failAudit = true;
  const r = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(r.data.rule, 'audit.unavailable'); assert.equal(f.secretCalls, 0);
});

test('reads without a verifiable channel tie are unknown tools (no secret, no HTTP)', async () => {
  for (const name of UNREGISTERED_READS) {
    const events = [];
    const result = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, 'dev', name, { ...base, channelId, eventId: messageId, userId: '1'.repeat(17), query: 'synthetic', limit: 5 }, run);
    assert.equal(result.isError, true, name);
    assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool', name);
    assert.equal(events.length, 1, name);
  }
});

test('descriptive metadata is absent from retained output (identifiers/links/timestamps only)', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}`, { id: channelId, name: 'secret-name', type: 0, guild_id: guildId, topic: 'hidden-topic', parent_id: '1545644954272137300', last_message_id: messageId });
  const ch = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(ch.data.ok, true);
  const chText = JSON.stringify(ch.data);
  assert.ok(!chText.includes('secret-name') && !chText.includes('hidden-topic'), 'Channel descriptive metadata leaked');
  assert.deepEqual(Object.keys(ch.data.page).sort(), ['guild_id', 'id', 'last_message_id', 'parent_id', 'type']);
  const g = fixture();
  g.read(`/channels/${channelId}/messages?limit=5`, [{ id: messageId, channel_id: channelId, guild_id: guildId, content: 'body here', timestamp: '2026-11-10T00:00:00.000Z', author: { id: '1'.repeat(17), username: 'secret-username', discriminator: '0001' }, pinned: false, type: 0 }]);
  const ms = await g.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(ms.data.ok, true);
  const msText = JSON.stringify(ms.data);
  assert.ok(!msText.includes('secret-username') && !msText.includes('body here') && !msText.includes('0001'), 'Author/personal data or body leaked');
  assert.equal(ms.data.page[0].id, messageId);
  assert.equal(ms.data.page[0].author_id, '1'.repeat(17));
  assert.equal(ms.data.page[0].timestamp, '2026-11-10T00:00:00.000Z');
  assert.equal(ms.data.page[0].url, `https://discord.com/channels/${guildId}/${channelId}/${messageId}`);
  f.hygiene(ch); g.hygiene(ms); f.done(); g.done();
});

test('cross-channel upstream objects are refused fail-closed (upstream.channel)', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}/messages?limit=5`, [{ id: messageId, channel_id: '1999999999999999999', guild_id: guildId, timestamp: '2026-11-10T00:00:00.000Z' }]);
  const r = await f.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(r.data.ok, false);
  assert.equal(r.data.rule, 'upstream.channel');
  f.hygiene(r);
  const g = fixture();
  g.read(`/channels/${channelId}`, { id: '1545644954272137300', name: 'other', type: 0, guild_id: guildId });
  const r2 = await g.call('discord.channel_get', { ...base, channelId });
  assert.equal(r2.data.ok, false);
  assert.equal(r2.data.rule, 'upstream.channel');
  g.hygiene(r2);
});

test('embedded foreign bot token and invite redacted; message links preserved', async () => {
  const otherToken = `${'A'.repeat(24)}.ABCDEF.${'B'.repeat(27)}`;
  // Retained projections carry no free-text fields, so embedded secrets in
  // upstream descriptive fields never survive projection; constructed
  // message links must still be intact.
  const f = fixture();
  f.read(`/channels/${channelId}/messages?limit=5`, [{ id: messageId, channel_id: channelId, guild_id: guildId, content: `leaked ${otherToken} join DISCORD.GG/xyz789`, timestamp: '2026-11-10T00:00:00.000Z' }]);
  const result = await f.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(result.data.ok, true);
  const text = JSON.stringify(result.data);
  assert.ok(!text.includes(otherToken) && !text.includes('xyz789'), 'Embedded token/invite escaped');
  assert.ok(text.includes('discord.com/channels/'), 'Message link must survive invite redaction');
  f.hygiene(result); f.done();
});

test('crossposted message_reference from another guild/channel still reads (reference, not membership)', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}/messages?limit=5`, [{ id: messageId, channel_id: channelId, guild_id: guildId, timestamp: '2026-11-10T00:00:00.000Z', message_reference: { message_id: '1999999999999999998', channel_id: '1999999999999999997', guild_id: '1999999999999999999', type: 19 } }]);
  const result = await f.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(result.data.ok, true);
  assert.equal(result.data.page[0].id, messageId);
  f.hygiene(result); f.done();
});

test('ordinary "bot" text is not corrupted by header scrub', async () => {
  const f = fixture();
  f.read(`/channels/${channelId}`, { id: channelId, type: 0, guild_id: guildId, topic: 'the bot posts updates; robot arm demos' });
  const result = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(result.data.ok, true);
  const text = JSON.stringify(result.data);
  assert.ok(!text.includes('[REDACTED]'), 'Ordinary text was spuriously redacted');
  f.hygiene(result); f.done();
});

test('messages_search limit is capped at the provider maximum; dropped guild-wide reads are unknown tools', async () => {
  // messages_search accepts at most 25 (Discord search maximum); 26 refuses.
  const b = fixture();
  refused(b, await b.call('discord.messages_search', { ...base, query: 'synthetic', channelId, limit: 26 }), 'validation.schema');
  // messages_list keeps its 100 cap.
  const c = fixture();
  refused(c, await c.call('discord.messages_list', { ...base, channelId, limit: 101 }), 'validation.schema');
  // Guild-wide personal-data reads are unregistered: unknown tool, no secret.
  for (const name of ['discord.member_get', 'discord.members_search', 'discord.roles_list']) {
    const events = [];
    const result = await new Broker().execute({ audit: async e => events.push(e), clock: Date.now }, 'dev', name, { ...base, userId: '1'.repeat(17), query: 'symthetic', limit: 5 }, run);
    assert.equal(result.isError, true, name);
    assert.equal(JSON.parse(result.content[0].text).rule, 'validation.unknown_tool', name);
    assert.equal(events.length, 1, name);
  }
});

test('read path performs zero outbound mutations; legacy sweep is dormant', async () => {
  // The read-only envelope must not issue DELETEs on a read call. A legacy
  // ledger row is left untouched and no sweep audit is emitted.
  const f = fixture();
  const life = `discord:life:message:${channelId}:${messageId}`;
  f.kv.set(life, { kind: 'message', channelId, resourceId: messageId, guildId, agentId: run.agentId, runId: run.runId, authorId: '1469137636663758888', createdAt: Date.now() - 8 * 86400000, expiresAt: Date.now() - 1000, state: 'owned' });
  f.kv.set('discord:life-index', [`life:message:${channelId}:${messageId}`]);
  f.read(`/channels/${channelId}`, { id: channelId, type: 0, guild_id: guildId });
  const result = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(result.data.ok, true);
  assert.ok(f.kv.has(life), 'Read call must not delete ledger rows');
  assert.ok(!f.events.some(e => e.rule === 'sweep.deleted'), 'No sweep on read path');
  assert.equal(f.calls.length, 1);
  f.done();
});

test('message links use the bound guild when upstream omits guild_id (list/get/pins/search)', async () => {
  const expected = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  // Discord omits the optional guild_id on channel messages.
  const noGuild = { id: messageId, channel_id: channelId, timestamp: '2026-11-10T00:00:00.000Z', author: { id: '1'.repeat(17) } };
  const listF = fixture();
  listF.read(`/channels/${channelId}/messages?limit=5`, [noGuild]);
  const list = await listF.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(list.data.ok, true);
  assert.equal(list.data.page[0].url, expected);
  assert.equal(list.data.page[0].guild_id, guildId);
  listF.hygiene(list); listF.done();
  const getF = fixture();
  getF.read(`/channels/${channelId}/messages/${messageId}`, noGuild);
  const got = await getF.call('discord.message_get', { ...base, channelId, messageId });
  assert.equal(got.data.ok, true);
  assert.equal(got.data.page.url, expected);
  getF.hygiene(got); getF.done();
  const pinsF = fixture();
  pinsF.read(`/channels/${channelId}/pins`, [noGuild]);
  const pins = await pinsF.call('discord.pins_list', { ...base, channelId });
  assert.equal(pins.data.ok, true);
  assert.equal(pins.data.page[0].url, expected);
  pinsF.hygiene(pins); pinsF.done();
  const searchF = fixture();
  searchF.read(`/guilds/${guildId}/messages/search?content=${encodeURIComponent('feature-request')}&channel_id=${channelId}&limit=5`, { total_results: 1, messages: [[noGuild]] });
  const search = await searchF.call('discord.messages_search', { ...base, query: 'feature-request', channelId, limit: 5 });
  assert.equal(search.data.ok, true);
  assert.equal(search.data.page.messages[0].url, expected);
  searchF.hygiene(search); searchF.done();
});

test('mismatching upstream guild_id is refused upstream.guild, never relabelled', async () => {
  const foreign = { id: messageId, channel_id: channelId, guild_id: '9999999999999999999', timestamp: '2026-11-10T00:00:00.000Z' };
  const listF = fixture();
  listF.read(`/channels/${channelId}/messages?limit=5`, [foreign]);
  const list = await listF.call('discord.messages_list', { ...base, channelId, limit: 5 });
  assert.equal(list.data.ok, false);
  assert.equal(list.data.rule, 'upstream.guild');
  assert.ok(!JSON.stringify(list.data).includes('discord.com/channels/9999999999999999999'));
  listF.hygiene(list);
  const searchF = fixture();
  searchF.read(`/guilds/${guildId}/messages/search?content=${encodeURIComponent('feature-request')}&channel_id=${channelId}&limit=5`, { total_results: 1, messages: [[foreign]] });
  const search = await searchF.call('discord.messages_search', { ...base, query: 'feature-request', channelId, limit: 5 });
  assert.equal(search.data.ok, false);
  assert.equal(search.data.rule, 'upstream.guild');
  searchF.hygiene(search);
});

test('caller-supplied guildId/url context is refused (trusted guild only)', async () => {
  for (const extra of [{ guildId }, { guildId: '9999999999999999999' }, { url: 'https://evil.test' }]) {
    const f = fixture();
    refused(f, await f.call('discord.messages_list', { ...base, channelId, limit: 5, ...extra }), 'validation.schema');
  }
});
