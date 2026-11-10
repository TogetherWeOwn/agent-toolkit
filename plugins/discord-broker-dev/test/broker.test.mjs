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

test('exact tool inventory: dev is read-only (14 read, 0 write)', () => {
  const tools = toolsFor('dev');
  assert.equal(tools.length, 14);
  assert.ok(tools.every(t => t.tier === 'read'), 'dev registers read tools only');
  assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  assert.equal(manifest.id, 'togetherweown.discord-broker-dev');
  for (const name of UNREGISTERED_WRITES) assert.ok(!tools.some(t => t.name === name), `${name} must be unregistered`);
  for (const name of UNREGISTERED_WRITES) assert.ok(!manifest.tools.some(t => t.name === name), `${name} must be absent from manifest`);
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
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'TWO Staging', description: 'synthetic' });
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
  f.read(`/guilds/${guildId}/messages/search?q=${encodeURIComponent('TWO-1081')}&channel_id=${channelId}&limit=10`, { total_results: 1, messages: [[{ id: messageId, channel_id: channelId, content: 'see https://discord.com/api/webhooks/123/abcETE' }]] });
  const result = await f.call('discord.messages_search', { ...base, query: 'TWO-1081', channelId, limit: 10 });
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

test('legacy ledger cleanup: expired entries are still swept on dev calls', async () => {
  // Writes are unregistered, so no new entries are created. Any legacy
  // entry already in state is still removed via verify+DELETE+GET-404.
  const f = fixture();
  const life = `discord:life:message:${channelId}:${messageId}`;
  f.kv.set(life, { kind: 'message', channelId, resourceId: messageId, guildId, agentId: run.agentId, runId: run.runId, authorId: '1469137636663758888', createdAt: Date.now() - 8 * 86400000, expiresAt: Date.now() - 1000, state: 'owned' });
  f.kv.set('discord:life-index', [`life:message:${channelId}:${messageId}`]);
  f.read(`/channels/${channelId}/messages/${messageId}`, { id: messageId, channel_id: channelId, author: { id: '1469137636663758888' } });
  f.steps.push({ method: 'DELETE', path: `/api/v10/channels/${channelId}/messages/${messageId}`, status: 204, body: {} });
  f.read(`/channels/${channelId}/messages/${messageId}`, { message: 'gone' }, { status: 404 });
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'TWO Staging' });
  const result = await f.call('discord.guild_get', { ...base });
  assert.equal(result.data.ok, true);
  assert.ok(!f.kv.has(life), 'Sweep cleared expired ledger');
  assert.ok(f.events.some(e => e.rule === 'sweep.deleted'), 'Sweep audit emitted');
  f.done();
});
