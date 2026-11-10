import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationMemberUpdateOperations } from '../dist/plugins/neon-broker/src/organization-member-update.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationMemberUpdateFixture as fixture, organizationMemberUpdateArgs as args, organizationMemberUpdateScope as scope,
  organizationMemberUpdateMetadata as member, organizationMemberUpdateReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { member_id: scope.memberId, acknowledged: true };
const path = `${NEON_ORIGIN}/api/v2/organizations/org-a/members/${scope.memberId}`;

test('organization member viewer: exact member/editor preflight then one viewer-only PATCH', async () => {
  for (const expectedRole of ['member', 'editor']) {
    const f = fixture(null, { ...scope, expectedRole });
    assert.deepEqual(await f.run('updateOrganizationMember', args), expected);
    assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'PATCH']]);
    for (const { init } of f.requests) {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${canary}`);
      assert.equal(init.headers['Idempotency-Key'], undefined);
    }
    assert.equal(f.requests[0].init.body, undefined);
    assert.deepEqual(JSON.parse(f.requests[1].init.body), { role: 'viewer' });
    assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
    const op = f.operation('updateOrganizationMember');
    assert.equal(op.tier, 'reserved');
    assert.equal(op.lifecycle, 'none');
    const p = op.prepare(args);
    assert.equal(p.resource.id, `neon/organizations/org-a/members/${scope.memberId}/role/viewer`);
    assert.deepEqual(p.plan.diff, { before: { role: expectedRole }, after: { role: 'viewer' } });
    for (const k of ['effectiveAccessVerified', 'sessionRevocationVerified', 'connectionFence']) assert.equal(p.plan[k], false);
    for (const name of ['removeOrganizationMember', 'getOrganizationMember', 'setProjectMemberRole']) assert.equal(f.operation(name), undefined);
  }
});

test('organization member viewer: copied scope, strict caller arguments and exact plan refuse overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonOrganizationMemberUpdateOperations(config, {});
  config.memberId = scope.userId;
  config.userId = scope.memberId;
  config.expectedRole = 'member';
  assert.equal(op.prepare(args).plan.expected_role, 'editor');
  assert.equal(op.prepare(args).plan.user_id, scope.userId);
  for (const raw of [null, [], {}, { ...args, org_id: 'other' }, { ...args, member_id: scope.userId },
    ...['', '../p', 'p?q', scope.memberId + '\n', scope.memberId.toUpperCase().replace('1', 'A'), 123, null].map(member_id => ({ ...args, member_id })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'user_id', 'role', 'force', 'timeout', 'expected_role'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'member_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const operation = f.operation('updateOrganizationMember');
  const p = operation.prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, user_id: scope.memberId } }, { plan: { ...p.plan, diff: { ...p.plan.diff, after: { role: 'admin' } } } },
    { plan: { ...p.plan, expected_role: 'admin' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(operation.execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(operation.execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ organizationId: '../p' }, { organizationId: 'org\n' }, { organizationId: 'Upper' }, { organizationId: 'p'.repeat(61) },
    { memberId: 'invalid' }, { userId: 'invalid' }, ...['admin', 'viewer', 'collaborator', 'owner', null].map(expectedRole => ({ expectedRole })),
    { revision: '' }, { role: 'viewer' }]) assert.throws(() => createNeonOrganizationMemberUpdateOperations({ ...scope, ...change }, {}));
});

test('organization member viewer: absent, reassociated, changed-role and malformed preflight refuse before PATCH', async () => {
  for (const raw of [null, [], {}, { ...member, id: scope.userId }, { ...member, user_id: scope.memberId }, { ...member, org_id: 'other' },
    ...['admin', 'member', 'viewer', 'collaborator', 'owner', null, 123].map(role => ({ ...member, role })),
    ...['id', 'user_id', 'org_id', 'role'].map(key => Object.fromEntries(Object.entries(member).filter(([k]) => k !== key))),
    ...[{ project_id: 'p' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...member, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('updateOrganizationMember', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  const f = fixture(() => response({ error: canary }, { status: 404 }));
  await assert.rejects(f.run('updateOrganizationMember', args));
  assert.equal(f.requests.length, 1);
});

test('organization member viewer: ambiguity observes once without upgrading viewer, absence or replaced member', async () => {
  for (const followup of [null, member, receipt, { ...receipt, user_id: scope.memberId }, { ...member, role: 'admin' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'PATCH') throw Error(canary);
      return n === 1 ? response(member) : followup === null ? response({}, { status: 404 }) : response(followup);
    });
    await assert.rejects(f.run('updateOrganizationMember', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'PATCH', 'GET']);
    assert.equal(f.requests[2].url, path);
  }
});

test('organization member viewer: only exact HTTP200 identity and viewer echo acknowledges', async () => {
  for (const make of [() => new Response(null, { status: 204 }),
    ...[201, 202, 302, 403, 404, 409, 422, 500].map(status => () => response(receipt, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ...receipt, ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ...[null, [], true, 1, {}, member, { ...receipt, id: scope.userId }, { ...receipt, user_id: scope.memberId },
      { ...receipt, org_id: 'other' }, { ...receipt, role: 'admin' }, { ...receipt, pagination: {} },
      ...['id', 'user_id', 'org_id', 'role'].map(key => Object.fromEntries(Object.entries(receipt).filter(([k]) => k !== key)))].map(raw => () => response(raw))]) {
    const f = fixture((url, init) => init.method === 'PATCH' ? make() : response(member));
    await assert.rejects(f.run('updateOrganizationMember', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'PATCH').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('organization member viewer: profiles and timestamps never evaluate or enter closed output', async () => {
  const raw = { ...member }, ack = { ...receipt };
  for (const value of [raw, ack]) for (const name of ['email', 'name', 'user', 'joined_at', 'token', 'password']) {
    Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonOrganizationMemberUpdateOperations(scope, {
    async getOrganizationMember() { return raw; }, async updateOrganizationMember() { return ack; },
  });
  const result = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(result, expected);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  let touched = false;
  const evil = Object.defineProperty({ ...receipt }, 'role', { get() { touched = true; throw Error('consumed'); }, enumerable: true });
  assert.throws(() => op.project(evil));
  assert.equal(touched, false);
});

test('organization member viewer: cancellation and ignored PATCH deadline bound sole mutation', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return response(init.method === 'PATCH' ? receipt : member); });
    await assert.rejects(f.run('updateOrganizationMember', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'PATCH' ? new Promise(() => {}) : response(member));
  await assert.rejects(f.run('updateOrganizationMember', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('organization member viewer: path bounds work and direct transport refuses injection', async () => {
  for (const organizationId of ['-', 'p'.repeat(60)]) {
    const f = fixture(null, { ...scope, organizationId });
    assert.deepEqual(await f.run('updateOrganizationMember', { ...args, org_id: organizationId }), expected);
    assert.equal(f.requests[1].url, `${NEON_ORIGIN}/api/v2/organizations/${organizationId}/members/${scope.memberId}`);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../p', 'p?query', scope.memberId + '\n', 'A' + scope.memberId.slice(1), 'p'.repeat(81)]) assert.throws(() => transport.updateOrganizationMember('org-a', bad, options));
  for (const bad of ['', '../p', 'p?query', 'p\n', 'A', 'p'.repeat(61)]) assert.throws(() => transport.updateOrganizationMember(bad, scope.memberId, options));
  await assert.rejects(transport.updateOrganizationMember('org-a', scope.memberId, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.updateOrganizationMember('org-a', scope.memberId, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
