import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, channelId, messageId, token } from './helpers.mjs';

globalThis.fetch = () => { throw Error('Live network is forbidden in fixtures'); };

test('reaction user objects return only projected identifiers', async () => {
  const f = fixture(); f.config.policy.agents[0].profile = 'reviewer-read';
  const marker = 'fixture-user-profile-7642';
  const path = `/channels/${channelId}/messages/${messageId}/reactions/ok`;
  f.read(path, [{ id: messageId, username: marker, discriminator: '0', avatar: marker, bot: false }]);
  const result = await f.call('discord.reactions_list', { ...base, channelId, messageId, emoji: 'ok' });
  assert.equal(result.data.ok, true);
  assert.deepEqual(result.data.page, [{ id: messageId }]);
  assert.equal(f.events.length, 2);
  assert.equal(f.events[0].phase, 'intent');
  assert.equal(f.events[1].phase, 'outcome');
  assert.equal(f.events[1].outcome, 'success');
  assert.ok(!JSON.stringify({ result, events: f.events, logs: f.logs }).includes(marker));
  f.hygiene(result); f.done();
});

test('reaction output validates fields and audits each outcome', async () => {
  const args = { ...base, channelId, messageId, emoji: 'ok' };
  const path = `/channels/${channelId}/messages/${messageId}/reactions/ok`;
  const marker = 'fixture-extraneous-value-7642';
  for (const item of [
    { id: { content: marker } }, { id: [marker] }, { id: marker },
    { id: messageId, count: { content: marker } }, { id: messageId, count: -1 },
    { id: messageId, me: { content: marker } }, { id: messageId, me: 'true' },
    { count: 1 },
  ]) {
    const f = fixture(); f.config.policy.agents[0].profile = 'reviewer-read';
    f.read(path, [item]);
    const result = await f.call('discord.reactions_list', args);
    assert.equal(result.data.ok, false);
    assert.equal(result.data.rule, 'upstream.field');
    assert.equal(f.events.length, 2);
    assert.equal(f.events[0].phase, 'intent');
    assert.equal(f.events[1].phase, 'outcome');
    assert.equal(f.events[1].decision, 'deny');
    assert.equal(f.events[1].outcome, 'error');
    assert.ok(!JSON.stringify({ result, events: f.events, logs: f.logs }).includes(marker));
    f.hygiene(result); f.done();
  }
  const f = fixture(); f.config.policy.agents[0].profile = 'reviewer-read';
  f.read(path, [{ id: messageId, count: 0, me: false, content: marker, username: token }]);
  const result = await f.call('discord.reactions_list', args);
  assert.equal(result.data.ok, true);
  assert.deepEqual(result.data.page, [{ id: messageId, count: 0, me: false }]);
  assert.equal(f.events.length, 2);
  assert.equal(f.events[0].phase, 'intent');
  assert.equal(f.events[1].phase, 'outcome');
  assert.equal(f.events[1].outcome, 'success');
  assert.ok(!JSON.stringify({ result, events: f.events, logs: f.logs }).includes(marker));
  f.hygiene(result); f.done();
});
