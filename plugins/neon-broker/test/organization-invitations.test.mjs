import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationInvitationOperations, ORGANIZATION_INVITATION_OPERATIONS } from '../dist/plugins/neon-broker/src/organization-invitations.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationInvitationCases as cases, organizationInvitationFixture as fixture, organizationInvitationScope as scope,
  organizationInvitation as invitation, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const otherId = '00000000-0000-0000-0000-000000000002';
const poison = { email: canary, invited_by: canary, invited_at: canary, status: canary, password: canary, message: canary };

test('invitation collection uses a fixed authenticated nonpaginated path and closed output', async () => {
  const f = fixture({ invitations: [{ ...invitation, ...poison }] });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  const target = new URL(url);
  assert.equal(target.origin, NEON_ORIGIN);
  assert.equal(target.pathname, '/api/v2/organizations/org-a/invitations');
  assert.equal(target.search, '');
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.equal(op.prepare(args).resource.id, 'neon/organizations/org-a/invitations');
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
});

test('canonical invitation arguments reject caller authority, pagination and target injection before transport', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { ...args, org_id: 'other' },
    ...['agent', 'approval', 'credential', 'url', 'cursor', 'limit', 'sort_by', 'runtimeContext', 'invitation_id', 'project_id', 'branch_id'].map(key => ({ ...args, [key]: canary })),
    ...['../escape', 'Upper', 'has_underscore', 'x/y', 'x\n', 'x'.repeat(61), null, true].map(org_id => ({ org_id })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('detached invitation execution rechecks resource, revision, target, credential and abort', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { org_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('invitation collection refuses malformed identities, roles, ancestry and pagination without truncation', async () => {
  for (const value of [null, [], {}, { invitations: null }, { ...raw, org_id: 'other' }, { ...raw, project_id: 'p' },
    { ...raw, branch_id: 'b' }, { ...raw, pagination: {} }, { invitations: Array(31).fill(invitation) }]) {
    await assert.rejects(fixture(value).run(name, args));
  }
  for (const changed of [{ id: null }, { id: `${invitation.id}\n` }, { org_id: 'other' }, { org_id: null },
    { role: 'owner' }, { role: null }, { pagination: {} }, { project_id: 'p' }, { branch_id: 'b' }]) {
    await assert.rejects(fixture({ invitations: [{ ...invitation, ...changed }] }).run(name, args));
  }
  for (const role of ['admin', 'member', 'editor', 'viewer', 'collaborator']) {
    assert.deepEqual(await fixture({ invitations: [{ ...invitation, role }] }).run(name, args), { invitations: [{ ...invitation, role }] });
  }
  const op = fixture(raw).operation(name);
  let unused = { ...invitation };
  for (const key of Object.keys(poison)) unused = Object.defineProperty(unused, key, { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(op.project({ invitations: [unused] }), expected);
  for (const key of ['id', 'org_id', 'role', 'pagination']) {
    assert.throws(() => op.project({ invitations: [Object.defineProperty({ ...invitation }, key, { get() { throw Error('getter'); }, enumerable: true })] }));
  }
});

test('invitation selection is explicit, duplicates include unselected rows, and empty results infer no access status', async () => {
  const outsider = { ...invitation, id: otherId };
  assert.deepEqual(await fixture({ invitations: [outsider, invitation] }).run(name, args), expected);
  assert.deepEqual(await fixture({ invitations: [outsider] }).run(name, args), { invitations: [] });
  assert.deepEqual(await fixture({ invitations: [] }).run(name, args), { invitations: [] });
  assert.deepEqual(await fixture(raw, { ...scope, invitationIds: [] }).run(name, args), { invitations: [] });
  for (const invitations of [[invitation, invitation], [outsider, outsider], [invitation, { ...outsider, org_id: 'other' }]]) {
    await assert.rejects(fixture({ invitations }).run(name, args));
  }
});

test('invitation transport failures and oversized JSON never fabricate empty success or fall back', async () => {
  for (const value of [...[403, 404, 410, 500, 302].map(status => () => response(poison, { status })),
    () => { throw Error(canary); }, () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } })]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('invitation scope is closed, copied, unique and bounded; mutation and account enumeration remain absent', () => {
  const config = structuredClone(scope);
  const ops = createNeonOrganizationInvitationOperations(config, {});
  config.invitationIds[0] = otherId;
  config.organizationId = 'other';
  config.revision = 'scope-v2';
  assert.deepEqual(ops[0].project(raw), expected);
  assert.equal(ops[0].prepare(args).resource.revision, 'scope-v1');
  for (const changed of [{ approved: true }, { organizationId: 'Upper' }, { revision: '' }, { invitationIds: [...scope.invitationIds, ...scope.invitationIds] },
    { invitationIds: [null] }, { invitationIds: [otherId + '\n'] }, { invitationIds: Array(17).fill(otherId) }]) {
    assert.throws(() => createNeonOrganizationInvitationOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(ops.map(op => op.name), ORGANIZATION_INVITATION_OPERATIONS.map(operation => `neon.${operation}`));
  for (const operation of ['createOrganizationInvitations', 'revokeOrganizationInvitation', 'getOrganizationMembers', 'getCurrentUserOrganizations', 'sql']) {
    assert.equal(fixture({}).operation(operation), undefined);
  }
});

test('invitation transport validates organization path without a fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const org of ['Upper', '../escape', 'x/y', 'x\n', 'x'.repeat(61), null]) {
    assert.throws(() => transport.getOrganizationInvitations(org, options));
  }
  assert.equal(calls, 0);
});
