import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, run, channelId, messageId, guildId, token, refused } from './helpers.mjs';
import { Broker, toolsFor } from '../dist/plugins/discord-broker-dev/src/broker.js';
import manifest from '../dist/plugins/discord-broker-dev/src/manifest.js';

globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };

test('exact tool inventory: 14 read + 7 dev writes + 3 exact-owned deletes', () => {
  const tools = toolsFor('dev');
  assert.equal(tools.length, 24);
  assert.equal(readAll(tools), 14); assert.equal(writeAll(tools), 10);
  assert.deepEqual(manifest.tools.map(t => t.name), tools.map(t => t.name));
  assert.equal(manifest.id, 'togetherweown.discord-broker-dev');
  for (const name of ['discord.message_delete_own', 'discord.thread_delete_own', 'discord.event_delete_own']) assert.ok(tools.some(t => t.name === name));
  function readAll(t) { return t.filter(x => x.tier === 'read').length; }
  function writeAll(t) { return t.filter(x => x.tier === 'write').length; }
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

test('discord.message_post: plain text + allowed_mentions parse [], persists ownership ledger', async () => {
  const f = fixture();
  f.steps.push({ method: 'POST', path: `/api/v10/channels/${channelId}/messages`, status: 200, body: { id: messageId, channel_id: channelId, content: 'synthetic post', timestamp: '2026-11-10T00:00:00.000Z', author: { id: '1469137636663758888', username: 'Owen' } },
    inspect(req) { const b = JSON.parse(req.body); assert.deepEqual(b.allowed_mentions, { parse: [] }); assert.equal(b.content, 'synthetic post'); } });
  const result = await f.call('discord.message_post', { ...base, channelId, content: 'synthetic post' });
  assert.equal(result.data.ok, true);
  assert.ok(f.kv.size > 0, 'Ledger entry must persist ownership');
  f.hygiene(result); f.done();
});

test('discord.message_edit_own: requires ledger entry and upstream author match', async () => {
  const f = fixture();
  f.kv.set(`discord:own:${channelId}:${messageId}`, { authorId: '1469137636663758888', agentId: run.agentId, at: Date.now() });
  f.read(`/channels/${channelId}/messages/${messageId}`, { id: messageId, channel_id: channelId, content: 'old', author: { id: '1469137636663758888', username: 'Owen' } });
  f.steps.push({ method: 'PATCH', path: `/api/v10/channels/${channelId}/messages/${messageId}`, status: 200, body: { id: messageId, channel_id: channelId, content: 'synthetic edit', author: { id: '1469137636663758888', username: 'Owen' } } });
  const result = await f.call('discord.message_edit_own', { ...base, channelId, messageId, content: 'synthetic edit' });
  assert.equal(result.data.ok, true); f.done();
});

test('discord.message_edit_own without ledger is refused before secret', async () => {
  const f = fixture();
  refused(f, await f.call('discord.message_edit_own', { ...base, channelId, messageId, content: 'x' }), 'policy.ownership');
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
    [{ ...base, channelId: '123', limit: 10 }, 'validation.schema'],
    [{ ...base, channelId, content: 'x'.repeat(2001) }, 'validation.schema'],
    [{ ...base, channelId, limit: 10, token: 'spoof' }, 'validation.schema'],
    [{ ...base, channelId, limit: 10, url: 'https://evil.test' }, 'validation.schema'],
    [{ ...base, channelId, limit: 10, guildId, secretRef: 'secret-dev' }, 'validation.schema'],
    [null, 'validation.schema'], [[], 'validation.schema'], [{}, 'validation.schema'],
  ];
  for (const [args, rule] of cases) {
    const f = fixture(); refused(f, await f.call('discord.messages_list', args), rule);
  }
  // post with @everyone content is allowed as plain text (broker strips mentions via allowed_mentions)
  const g = fixture(); g.steps.push({ method: 'POST', path: `/api/v10/channels/${channelId}/messages`, status: 200, body: { id: messageId, channel_id: channelId, content: 'hi' }, inspect(req) { assert.deepEqual(JSON.parse(req.body).allowed_mentions, { parse: [] }); } });
  const ok = await g.call('discord.message_post', { ...base, channelId, content: '@everyone hi' });
  assert.equal(ok.data.ok, true);
});

test('policy refusals: wrong company, profile none, channel allowlist, prereq binding', async () => {
  const a = fixture(); a.issue.companyId = 'another-company';
  refused(a, await a.call('discord.guild_get', { ...base }), 'identity.issue_company');
  const b = fixture(); b.config.policy.agents[0].profile = 'none';
  refused(b, await b.call('discord.guild_get', { ...base }), 'policy.profile');
  const c = fixture(); c.config.policy.readChannelIds = ['1999999999999999999'];
  refused(c, await c.call('discord.messages_list', { ...base, channelId, limit: 1 }), 'policy.channel');
  const d = fixture(); d.config.policy.agents[0].profile = 'researcher-read';
  refused(d, await d.call('discord.message_post', { ...base, channelId, content: 'x' }), 'policy.profile');
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

test('discord.message_delete_own: ledger-backed delete clears ledger; 404 is already-gone success', async () => {
  const f = fixture();
  const life = `discord:life:message:${channelId}:${messageId}`;
  f.kv.set(life, { kind: 'message', channelId, resourceId: messageId, guildId, agentId: run.agentId, runId: run.runId, authorId: '1469137636663758888', createdAt: Date.now(), expiresAt: Date.now() + 86400000, state: 'owned' });
  f.kv.set('discord:life-index', [life]);
  f.steps.push({ method: 'DELETE', path: `/api/v10/channels/${channelId}/messages/${messageId}`, status: 204, body: {} });
  const result = await f.call('discord.message_delete_own', { ...base, channelId, messageId });
  assert.equal(result.data.ok, true);
  assert.ok(!f.kv.has(life), 'Ledger cleared after delete');
  assert.deepEqual(f.kv.get('discord:life-index'), []);
  f.done();
  const g = fixture();
  g.kv.set(life, { kind: 'message', channelId, resourceId: messageId, guildId, agentId: run.agentId, runId: run.runId, authorId: '1469137636663758888', createdAt: Date.now(), expiresAt: Date.now() + 86400000, state: 'owned' });
  g.steps.push({ method: 'DELETE', path: `/api/v10/channels/${channelId}/messages/${messageId}`, status: 404, body: { message: 'gone' } });
  const gone = await g.call('discord.message_delete_own', { ...base, channelId, messageId });
  assert.equal(gone.data.ok, true); assert.equal(gone.data.page.alreadyGone, true);
  assert.ok(!g.kv.has(life), 'Ledger cleared on already-gone');
  g.done();
});

test('discord.message_delete_own without ledger is refused before secret', async () => {
  const f = fixture();
  refused(f, await f.call('discord.message_delete_own', { ...base, channelId, messageId }), 'policy.ownership');
});

test('discord.event_delete_own and thread_delete_own ledger gates', async () => {
  const f = fixture();
  refused(f, await f.call('discord.event_delete_own', { ...base, eventId: messageId }), 'policy.ownership');
  const g = fixture();
  refused(g, await g.call('discord.thread_delete_own', { ...base, channelId, threadId: messageId }), 'policy.ownership');
});

test('expiry sweep deletes expired owned resources via verify+delete on next call', async () => {
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

test('restart: new broker instance deletes via persisted ledger after restart', async () => {
  const f = fixture();
  f.steps.push({ method: 'POST', path: `/api/v10/channels/${channelId}/messages`, status: 200, body: { id: messageId, channel_id: channelId, content: 'synthetic post', timestamp: '2026-11-10T00:00:00.000Z', author: { id: '1469137636663758888', username: 'Owen' } } });
  const posted = await f.call('discord.message_post', { ...base, channelId, content: 'synthetic post' });
  assert.equal(posted.data.ok, true); f.done();
  // "Restart": brand-new Broker + fixture sharing the same durable KV.
  const g = fixture();
  for (const [k, v] of f.kv) g.kv.set(k, v);
  g.steps.push({ method: 'DELETE', path: `/api/v10/channels/${channelId}/messages/${messageId}`, status: 204, body: {} });
  const deleted = await g.call('discord.message_delete_own', { ...base, channelId, messageId });
  assert.equal(deleted.data.ok, true); g.done();
});

test('ambiguous create success keeps a pending intent reconciled by sweep', async () => {
  const f = fixture();
  f.steps.push({ method: 'POST', path: `/api/v10/channels/${channelId}/messages`, error: new Error('timeout after dispatch') });
  const failed = await f.call('discord.message_post', { ...base, channelId, content: 'synthetic post' });
  assert.equal(failed.data.ok, false);
  const pending = [...f.kv.entries()].find(([, v]) => v && typeof v === 'object' && v.state === 'pending');
  assert.ok(pending, 'Pending intent must persist for reconciliation');
  // Age the intent past the staleness threshold; sweep search finds exactly
  // one bot-authored message in the channel and adopts it.
  const pk = pending[0];
  f.kv.set(pk, { ...pending[1], createdAt: Date.now() - 120000 });
  f.read(`/guilds/${guildId}/messages/search?author_id=1469137636663758888&channel_id=${channelId}&limit=5`, { total_results: 1, messages: [[{ id: messageId, channel_id: channelId, content: 'synthetic post', author: { id: '1469137636663758888' } }]] });
  f.read(`/guilds/${guildId}`, { id: guildId, name: 'TWO Staging' });
  const healed = await f.call('discord.guild_get', { ...base });
  assert.equal(healed.data.ok, true);
  const owned = f.kv.get(`discord:life:message:${channelId}:${messageId}`);
  assert.ok(owned && owned.state === 'owned' && owned.resourceId === messageId, 'Intent reconciled to owned ledger entry');
  f.done();
});

test('event_create refuses starts outside the immutable window', async () => {
  const f = fixture();
  refused(f, await f.call('discord.event_create', { ...base, name: 'Broker event', scheduledStartTime: '2020-01-01T00:00:00', channelId }), 'policy.expiry');
});
