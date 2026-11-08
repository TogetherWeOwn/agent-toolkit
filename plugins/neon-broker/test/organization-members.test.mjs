import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationMemberOperations, ORGANIZATION_MEMBER_OPERATIONS } from '../dist/plugins/neon-broker/src/organization-members.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationMemberCases as cases, organizationMemberFixture as fixture, organizationMemberScope as scope,
  organizationMember as member, canary, response } from './helpers.mjs';

const otherId = '00000000-0000-0000-0000-000000000003';
const otherUser = '00000000-0000-0000-0000-000000000004';
const poison = { email: canary, joined_at: canary, has_mfa: canary, deactivated_at: canary, password: canary, message: canary };
for (const [name, args, raw, expected] of cases) {
  const detail = name === 'getOrganizationMember';
  const wrap = value => detail ? value : { members: [{ member: value, user: poison }] };
  test(`${name}: fixed authenticated path and closed member projection`, async () => {
    const f = fixture(wrap({ ...member, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    const { url, init } = f.requests[0];
    const target = new URL(url);
    assert.equal(target.origin, NEON_ORIGIN);
    assert.equal(target.pathname, `/api/v2/organizations/org-a/members${detail ? `/${member.id}` : ''}`);
    assert.deepEqual(Object.fromEntries(target.searchParams), detail ? {} : { limit: '10', sort_by: 'joined_at', sort_order: 'desc' });
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/organizations/org-a/members${detail ? `/${member.id}` : ''}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: canonical arguments reject caller authority and unbound IDs before transport`, () => {
    const f = fixture(raw);
    for (const value of [null, [], {}, { ...args, org_id: 'other' },
      ...['agent', 'approval', 'credential', 'url', 'cursor', 'limit', 'sort_by', 'sort_order', 'runtimeContext', 'user_id', 'project_id', 'branch_id'].map(key => ({ ...args, [key]: canary })),
      ...['../escape', 'Upper', 'has_underscore', 'x/y', 'x\n', 'x'.repeat(61), null, true].map(org_id => ({ ...args, org_id })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
      { ...args, member_id: otherId }, { ...args, member_id: `${member.id}\n` },
    ]) assert.throws(() => f.operation(name).prepare(value));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution rechecks resource, revision, target, credential and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, org_id: 'other' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: malformed identity, role, ancestry and output refuse`, async () => {
    for (const value of [null, [], {}, { ...raw, org_id: 'other' }, { ...raw, project_id: 'p' }, { ...raw, branch_id: 'b' }]) {
      await assert.rejects(fixture(value).run(name, args));
    }
    for (const changed of [{ org_id: 'other' }, { id: null }, { id: `${member.id}\n` }, { user_id: otherUser },
      { role: 'owner' }, { role: null }, { org_id: null }, { pagination: {} }, { project_id: 'p' }, { branch_id: 'b' }]) {
      await assert.rejects(fixture(wrap({ ...member, ...changed })).run(name, args));
    }
    for (const role of ['admin', 'member', 'editor', 'viewer', 'collaborator']) {
      const output = await fixture(wrap({ ...member, role })).run(name, args);
      assert.equal(detail ? output.role : output.members[0].member.role, role);
    }
    const op = fixture(raw).operation(name);
    const unused = Object.defineProperty({ ...member }, 'joined_at', { get() { throw Error('unused'); }, enumerable: true });
    assert.deepEqual(op.project(wrap(unused)), expected);
    for (const key of ['id', 'user_id', 'org_id', 'role', 'pagination']) {
      assert.throws(() => op.project(wrap(Object.defineProperty({ ...member }, key, { get() { throw Error('getter'); }, enumerable: true }))));
    }
  });

  test(`${name}: transport failure, non-200 and oversized JSON stay unavailable without fallback`, async () => {
    for (const value of [...[403, 404, 410, 500, 302].map(status => () => response(poison, { status })),
      () => { throw Error(canary); }, () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) }),
      () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
  });
}

test('organization member collection filters explicit bindings without reassociation or duplicate identities', async () => {
  const args = { org_id: 'org-a' };
  const outsider = { ...member, id: otherId, user_id: otherUser };
  assert.deepEqual(await fixture({ members: [{ member: outsider }, { member }] }).run('getOrganizationMembers', args), { members: [{ member }] });
  assert.deepEqual(await fixture({ members: [] }).run('getOrganizationMembers', args), { members: [] });
  for (const members of [[{ member }, { member }], [{ member }, { member: outsider }, { member: outsider }],
    [{ member: { ...outsider, user_id: member.user_id } }], [{ member: { ...member, user_id: otherUser } }],
    [{ member, branch_id: 'b' }], Array.from({ length: 11 }, () => ({ member }))]) {
    await assert.rejects(fixture({ members }).run('getOrganizationMembers', args));
  }
});

test('detail refuses another configured member and does not accept collection envelopes', async () => {
  const config = { ...scope, members: [...scope.members, { memberId: otherId, userId: otherUser }] };
  const args = cases[1][1];
  await assert.rejects(fixture({ ...member, id: otherId, user_id: otherUser }, config).run('getOrganizationMember', args));
  for (const value of [{ members: [{ member }] }, { ...member, pagination: {} }]) await assert.rejects(fixture(value).run('getOrganizationMember', args));
});

test('collection uses next cursor, validates sort echoes, terminates empty pages and never returns partial success', async () => {
  const args = cases[0][1];
  const f = fixture((url, init, n) => response(n === 1 ? { members: [{ member }], pagination: { next: 'opaque/?&=', sort_by: 'joined_at', sort_order: 'desc' } } : { members: [], pagination: {} }));
  assert.deepEqual(await f.run('getOrganizationMembers', args), cases[0][3]);
  assert.equal(f.requests.length, 2);
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), 'opaque/?&=');
  for (const pagination of [null, [], { cursor: 'wrong' }, { next: null }, { next: '' }, { next: 'x\n' }, { next: 'x'.repeat(257) },
    { sort_by: 'email' }, { sort_order: 'asc' }, { next: 'page', sort_order: null }]) {
    const bad = fixture({ members: [], pagination });
    await assert.rejects(bad.run('getOrganizationMembers', args));
    assert.equal(bad.requests.length, 1);
  }
  for (const mode of ['cycle', 'ceiling', 'duplicate', 'ancestry', 'role', 'failed']) {
    const bad = fixture((url, init, n) => {
      if (mode === 'failed' && n === 2) return response(poison, { status: 500 });
      return response({ members: mode === 'duplicate' || n === 1 ? [{ member }] : [],
        ...(mode === 'ancestry' && n === 2 ? { org_id: 'other' } : {}),
        pagination: { next: mode === 'cycle' ? 'same' : `page-${n}`, ...(mode === 'role' && n === 2 ? { sort_by: 'role' } : {}) } });
    });
    await assert.rejects(bad.run('getOrganizationMembers', args));
    assert.equal(bad.requests.length, mode === 'ceiling' ? 3 : 2);
  }
});

test('scope is copied, bounded, one-to-one and closed; unsupported mutation methods stay absent', () => {
  const config = structuredClone(scope);
  const ops = createNeonOrganizationMemberOperations(config, {});
  config.members[0].memberId = otherId;
  config.members[0].userId = otherUser;
  config.organizationId = 'other';
  config.revision = 'scope-v2';
  assert.equal(ops[1].prepare(cases[1][1]).resource.revision, 'scope-v1');
  for (const changed of [{ approved: true }, { organizationId: 'Upper' }, { revision: '' }, { members: [...scope.members, ...scope.members] },
    { members: [...scope.members, { memberId: otherId, userId: member.user_id }] },
    { members: [...scope.members, { memberId: member.id, userId: otherUser }] },
    { members: [{ memberId: otherId, userId: otherUser, approved: true }] }, { members: Array(17).fill(scope.members[0]) }]) {
    assert.throws(() => createNeonOrganizationMemberOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(ops.map(op => op.name), ORGANIZATION_MEMBER_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['updateOrganizationMember', 'removeOrganizationMember', 'getOrganizationInvitations', 'sql']) assert.equal(fixture({}).operation(name), undefined);
});

test('membership transport validates org, member UUID and internal cursor before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const org of ['Upper', '../escape', 'x/y', 'x\n', 'x'.repeat(61)]) {
    assert.throws(() => transport.getOrganizationMembers(org, null, options));
    assert.throws(() => transport.getOrganizationMember(org, member.id, options));
  }
  for (const id of ['', otherId.toUpperCase().replace('0000', 'ABCD'), '../escape', `${member.id}\n`, `${member.id}/child`]) {
    assert.throws(() => transport.getOrganizationMember('org-a', id, options));
  }
  for (const cursor of ['', '\n', 'x'.repeat(257)]) assert.throws(() => transport.getOrganizationMembers('org-a', cursor, options));
  assert.equal(calls, 0);
});
