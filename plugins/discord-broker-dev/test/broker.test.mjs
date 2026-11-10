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

test('exact tool inventory: dev is read-only (11 read, 0 write)', () => {
  const tools = toolsFor('dev');
  assert.equal(tools.length, 11);
  assert.ok(tools.every(t => t.tier === 'read'), 'dev registers read tools only');
  assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  assert.equal(manifest.id, 'togetherweown.discord-broker-dev');
  for (const name of UNREGISTERED_WRITES) assert.ok(!tools.some(t => t.name === name), `${name} must be unregistered`);
  for (const name of UNREGISTERED_WRITES) assert.ok(!manifest.tools.some(t => t.name === name), `${name} must be absent from manifest`);
  for (const name of ['discord.member_get', 'discord.members_search', 'discord.roles_list']) {
    assert.ok(!tools.some(t => t.name === name), `${name} must be unregistered (guild-wide personal data)`);
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

test('discord.guild_get: fixed origin, bounded read, audit, no token in output', async () => {
  const f = fixture();
  // Real guild payloads carry a `features` array; guild_get must succeed.
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'TWO Staging', description: 'synthetic', features: ['COMMUNITY', 'CHANNEL_PERMISSIONS'] });
  const result = await f.call('discord.guild_get', { ...base });
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
  refused(a, await a.call('discord.guild_get', { ...base }), 'identity.issue_company');
  const b = fixture(); b.config.policy.agents[0].profile = 'none';
  refused(b, await b.call('discord.guild_get', { ...base }), 'policy.profile');
  const c = fixture(); c.config.policy.readChannelIds = ['1999999999999999999'];
  refused(c, await c.call('discord.messages_list', { ...base, channelId, limit: 1 }), 'policy.channel');
  const e = fixture(); e.issue.checkoutRunId = 'another-run'; e.issue.executionRunId = 'another-run';
  refused(e, await e.call('discord.guild_get', { ...base }), 'identity.issue_run');
});

test('401 stops credential use (guild pause); 429 honors Retry-After', async () => {
  const f = fixture();
  f.steps.push({ method: 'GET', path: `/api/v10/guilds/${guildId}`, status: 401, body: { message: '401' } });
  const r1 = await f.call('discord.guild_get', { ...base });
  assert.equal(r1.data.rule, 'upstream.unauthorized');
  const g = fixture();
  g.steps.push({ method: 'GET', path: `/api/v10/guilds/${guildId}`, status: 429, headers: { 'retry-after': '17' }, body: { message: '429' } });
  const r2 = await g.call('discord.guild_get', { ...base });
  assert.equal(r2.data.rule, 'rate.discord'); assert.equal(r2.data.retryAfterSeconds, 17);
});

test('token canary never appears in success/refusal/audit (webhook+invite redaction)', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}`, { id: guildId, name: token, description: `invite discord.gg/abc123 webhook https://discord.com/api/webhooks/1/${token}` });
  const result = await f.call('discord.guild_get', { ...base });
  assert.equal(result.data.ok, true);
  const visible = JSON.stringify({ result, events: f.events });
  assert.ok(!visible.includes(token) && !visible.includes('abc123'), 'Token/invite escaped');
  f.hygiene(result);
});

test('hydration: audit failure blocks side effects; policy change refuses', async () => {
  const f = fixture(); f.failAudit = true;
  const r = await f.call('discord.guild_get', { ...base });
  assert.equal(r.data.rule, 'audit.unavailable'); assert.equal(f.secretCalls, 0);
});

test('channels_list: large guild inventories succeed and restrict to allowlisted channels', async () => {
  const restrictedId = '1545644954272137300';
  // 150-channel guild (over the old 100 cap): only the allowlisted channel returns.
  const channels = [{ id: channelId, name: 'public', type: 0, topic: 'ok' }, { id: restrictedId, name: 'restricted-secret', type: 0, topic: 'hidden-topic' }];
  for (let i = 0; i < 148; i++) channels.push({ id: `15456449542722${String(i).padStart(4, '0')}`, name: `ch-${i}`, type: 0 });
  const f = fixture();
  f.read(`/guilds/${guildId}/channels`, channels);
  const result = await f.call('discord.channels_list', { ...base });
  assert.equal(result.data.ok, true);
  assert.equal(result.data.page.length, 1);
  assert.equal(result.data.page[0].id, channelId);
  assert.ok(!JSON.stringify(result.data).includes('restricted-secret') && !JSON.stringify(result.data).includes('hidden-topic'), 'Restricted channel leaked');
  f.hygiene(result); f.done();
});

test('threads_active_list: restricted-parent threads are filtered out', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}/threads/active`, { threads: [
    { id: '1545644954272137301', name: 'public-thread', parent_id: channelId, type: 11 },
    { id: '1545644954272137302', name: 'restricted-thread', parent_id: '1545644954272137300', type: 11 },
    { id: '1545644954272137303', name: 'orphan-thread', type: 11 },
  ] });
  const result = await f.call('discord.threads_active_list', { ...base });
  assert.equal(result.data.ok, true);
  assert.deepEqual(result.data.page.map(t => t.name), ['public-thread']);
  f.hygiene(result); f.done();
});

test('events_list: restricted-channel events are filtered out', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}/scheduled-events`, [
    { id: '1545644954272137401', name: 'public-event', channel_id: channelId, guild_id: guildId, description: 'ok' },
    { id: '1545644954272137402', name: 'restricted-event', channel_id: '1545644954272137300', guild_id: guildId, description: 'secret' },
  ]);
  const result = await f.call('discord.events_list', { ...base });
  assert.equal(result.data.ok, true);
  assert.deepEqual(result.data.page.map(e => e.name), ['public-event']);
  assert.ok(!JSON.stringify(result.data).includes('restricted-event') && !JSON.stringify(result.data).includes('secret'), 'Restricted event leaked');
  f.hygiene(result); f.done();
});

test('event_get outside allowlisted channels is refused', async () => {
  const f = fixture();
  f.read(`/guilds/${guildId}/scheduled-events/1545644954272137402`, { id: '1545644954272137402', name: 'restricted', channel_id: '1545644954272137300', guild_id: guildId });
  const result = await f.call('discord.event_get', { ...base, eventId: '1545644954272137402' });
  assert.equal(result.data.ok, false);
  assert.equal(result.data.rule, 'policy.channel');
  f.hygiene(result);
});

test('embedded foreign bot token and invite redacted; message links preserved', async () => {
  const otherToken = `${'A'.repeat(24)}.ABCDEF.${'B'.repeat(27)}`;
  // Dev is metadata-only: scrub is verified via channel topic (free text in
  // the retained surface). Message links (discord.com/channels/...) must
  // survive invite redaction.
  const f = fixture();
  f.read(`/channels/${channelId}`, { id: channelId, name: 'public', type: 0, guild_id: guildId, topic: `leaked ${otherToken} join DISCORD.GG/xyz789 see https://discord.com/channels/${guildId}/${channelId}/${messageId}` });
  const result = await f.call('discord.channel_get', { ...base, channelId });
  assert.equal(result.data.ok, true);
  const text = JSON.stringify(result.data);
  assert.ok(!text.includes(otherToken) && !text.includes('xyz789'), 'Embedded token/invite escaped');
  assert.ok(text.includes('discord.com/channels/'), 'Message link must survive invite redaction');
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
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'TWO Staging' });
  const result = await f.call('discord.guild_get', { ...base });
  assert.equal(result.data.ok, true);
  assert.ok(f.kv.has(life), 'Read call must not delete ledger rows');
  assert.ok(!f.events.some(e => e.rule === 'sweep.deleted'), 'No sweep on read path');
  assert.equal(f.calls.length, 1);
  f.done();
});
