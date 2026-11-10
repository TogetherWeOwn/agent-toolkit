import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationMemberRemoveOperations } from '../dist/plugins/neon-broker/src/organization-member-remove.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationMemberRemoveFixture as fixture, organizationMemberRemoveArgs as args, organizationMemberRemoveScope as scope,
  organizationMemberRemoveMetadata as member, canary, response } from './helpers.mjs';

const expected = { member_id: scope.memberId, acknowledged: true };
const path = `${NEON_ORIGIN}/api/v2/organizations/org-a/members/${scope.memberId}`;

test('organization member remove: exact identity preflight precedes one bodyless DELETE and empty acknowledgement', async () => {
  for (const expectedRole of ['admin', 'member', 'editor', 'viewer', 'collaborator']) {
    const f = fixture({}, { ...scope, expectedRole });
    assert.deepEqual(await f.run('removeOrganizationMember', args), expected);
    assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'DELETE']]);
    for (const { init } of f.requests) {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${canary}`);
      assert.equal(init.body, undefined);
      assert.equal(init.headers['Content-Type'], undefined);
      assert.equal(init.headers['Idempotency-Key'], undefined);
    }
    const op = f.operation('removeOrganizationMember');
    assert.equal(op.tier, 'reserved');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.prepare(args).resource.id, `neon/organizations/org-a/members/${scope.memberId}/remove`);
    assert.equal(op.prepare(args).plan.expected_role, expectedRole);
    assert.equal(op.prepare(args).plan.user_id, scope.userId);
    assert.equal(op.prepare(args).plan.connectionFence, false);
    for (const name of ['updateOrganizationMember', 'getOrganizationMember', 'removeProjectMemberRole']) assert.equal(f.operation(name), undefined);
  }
});

test('organization member remove: copied scope and exact plan reject caller target and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonOrganizationMemberRemoveOperations(config, {});
  config.memberId = scope.userId;
  config.userId = scope.memberId;
  config.expectedRole = 'admin';
  assert.equal(op.prepare(args).plan.expected_role, 'editor');
  assert.equal(op.prepare(args).plan.user_id, scope.userId);
  for (const raw of [null, [], {}, { ...args, org_id: 'other' }, { ...args, member_id: scope.userId },
    ...['', '../p', 'p?q', scope.memberId + '\n', scope.memberId.toUpperCase().replace('1', 'A'), 123, null].map(member_id => ({ ...args, member_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'user_id', 'role', 'force', 'timeout'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'member_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('removeOrganizationMember').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, user_id: scope.memberId } }, { plan: { ...p.plan, expected_role: 'admin' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('removeOrganizationMember').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('removeOrganizationMember').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ organizationId: '../p' }, { organizationId: 'org\n' }, { organizationId: 'Upper' }, { organizationId: 'p'.repeat(61) },
    { memberId: 'invalid' }, { userId: 'invalid' }, { expectedRole: 'owner' }, { expectedRole: null }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonOrganizationMemberRemoveOperations({ ...scope, ...change }, {}));
  }
});

test('organization member remove: absent, reassociated, changed-role and malformed preflight refuse before DELETE', async () => {
  for (const raw of [null, [], {}, { ...member, id: scope.userId }, { ...member, user_id: scope.memberId }, { ...member, org_id: 'other' },
    ...['admin', 'member', 'viewer', 'collaborator', 'owner', null, 123].map(role => ({ ...member, role })),
    ...['id', 'user_id', 'org_id', 'role'].map(key => Object.fromEntries(Object.entries(member).filter(([k]) => k !== key))),
    ...[{ project_id: 'p' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...member, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('removeOrganizationMember', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  const f = fixture(() => response({ error: canary }, { status: 404 }));
  await assert.rejects(f.run('removeOrganizationMember', args));
  assert.equal(f.requests.length, 1);
});

test('organization member remove: ambiguity observes once and never upgrades absence or matching state to success', async () => {
  for (const followup of [null, member, { ...member, user_id: scope.memberId }, { ...member, role: 'admin' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return n === 1 ? response(member) : followup === null ? response({}, { status: 404 }) : response(followup);
    });
    await assert.rejects(f.run('removeOrganizationMember', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, path);
  }
});

test('organization member remove: only HTTP200 bounded empty JSON acknowledges; provider denials remain uncertain', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[202, 302, 403, 404, 409, 422, 500].map(status => () => response({ error: canary }, { status })),
    () => response({}, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, [], true, 1, { id: scope.memberId }, { acknowledged: true }, { org_id: 'other' }, { error: canary }].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(member));
    await assert.rejects(f.run('removeOrganizationMember', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('organization member remove: profile and timestamp extras are never evaluated or emitted', async () => {
  const raw = { ...member };
  for (const name of ['email', 'name', 'user', 'joined_at', 'token', 'password']) {
    Object.defineProperty(raw, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonOrganizationMemberRemoveOperations(scope, {
    async getOrganizationMember() { return raw; }, async removeOrganizationMember() { return {}; },
  });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
  let touched = false;
  assert.throws(() => op.project(Object.defineProperty({}, 'email', { get() { touched = true; throw Error('unused'); }, enumerable: true })));
  assert.equal(touched, false);
});

test('organization member remove: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'DELETE' ? {} : member); });
    await assert.rejects(f.run('removeOrganizationMember', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(member));
  await assert.rejects(f.run('removeOrganizationMember', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('organization member remove: path boundaries work; injection and header overrides refuse before fetch', async () => {
  for (const organizationId of ['-', 'p'.repeat(60)]) {
    const f = fixture({}, { ...scope, organizationId });
    assert.deepEqual(await f.run('removeOrganizationMember', { ...args, org_id: organizationId }), expected);
    assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/organizations/${organizationId}/members/${scope.memberId}`);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../p', 'p?query', scope.memberId + '\n', 'A' + scope.memberId.slice(1), 'p'.repeat(81)]) assert.throws(() => transport.removeOrganizationMember('org-a', bad, options));
  for (const bad of ['', '../p', 'p?query', 'p\n', 'A', 'p'.repeat(61)]) assert.throws(() => transport.removeOrganizationMember(bad, scope.memberId, options));
  await assert.rejects(transport.removeOrganizationMember('org-a', scope.memberId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.removeOrganizationMember('org-a', scope.memberId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
