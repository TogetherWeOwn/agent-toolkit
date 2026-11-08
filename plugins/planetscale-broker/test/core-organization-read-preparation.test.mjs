import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetOrganizationMembershipPreparation, bindGetOrganizationTeamPreparation, bindGetOrganizationTeamMemberPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as membershipRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-membership.js';
import { prepare as teamRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-team.js';
import { prepare as memberRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-team-member.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'org_1', revision: 'a'.repeat(64) });
const membership = () => ({ id: 'membership_1', userId: 'user_1' });
const team = () => ({ id: 'team_1', slug: 'sample-team' });
const refused = fn => assert.throws(fn, { code: 'schema' });
const fields = target => Object.keys(target).flatMap(key => typeof target[key] === 'object'
  ? Object.keys(target[key]).map(child => [key, child]) : [[key]]);
const parentAt = (target, path) => path.length === 1 ? target : target[path[0]];
const cases = [
  { operation: 'get_organization_membership', bind: bindGetOrganizationMembershipPreparation, read: membershipRead,
    target: () => ({ ...organization(), membership: membership() }),
    resource: t => `planetscale/organization-membership/${t.membership.id}`,
    path: '/v1/organizations/sample-org/members/membership_1',
    identity: 'record-and-user-ids-parent-not-verified',
    body: { id: 'membership_1', user: { id: 'user_1' }, role: 'admin' },
    mismatches: [{ id: 'other' }, { user: { id: 'other' } }] },
  { operation: 'get_organization_team', bind: bindGetOrganizationTeamPreparation, read: teamRead,
    target: () => ({ ...organization(), team: team() }),
    resource: t => `planetscale/organization-team/${t.team.id}`,
    path: '/v1/organizations/sample-org/teams/sample-team',
    identity: 'record-id-only-parent-not-verified',
    body: { id: 'team_1', slug: 'sample-team', managed: true },
    mismatches: [{ id: 'other' }, { slug: 'other' }] },
  { operation: 'get_organization_team_member', bind: bindGetOrganizationTeamMemberPreparation, read: memberRead,
    target: () => ({ ...organization(), team: team(), membership: membership() }),
    resource: t => `planetscale/organization-team-member/${t.team.id}/${t.membership.id}`,
    path: '/v1/organizations/sample-org/teams/sample-team/members/membership_1',
    identity: 'record-and-user-ids-parent-not-verified',
    body: { id: 'membership_1', user: { id: 'user_1' } },
    mismatches: [{ id: 'other' }, { user: { id: 'other' } }] },
];
const scope = target => Object.fromEntries(Object.entries(target).filter(([key]) => !['organizationId', 'revision'].includes(key)));

for (const c of cases) {
  test(`${c.operation}: core preparation binds every identity and existing fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource(target), revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    for (const value of Object.values(prepared.plan.target)) {
      if (typeof value === 'object') assert.equal(Object.getPrototypeOf(value), null);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scope(target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${c.operation}: preparation retains parent identity limits without effective authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
    const output = c.read(scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', team_id: 'unverified-parent', password: 'synthetic-canary',
      user: { ...c.body.user, email: 'synthetic-canary', password: 'synthetic-canary' },
      passwords: [{ password: 'synthetic-canary' }] })));
    assert.equal(output.effectiveAuthority, 'not-established');
    for (const key of ['organization_id', 'team_id', 'password', 'passwords', 'user']) assert.equal(Object.hasOwn(output, key), false);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
  });

  test(`${c.operation}: existing projection refuses mismatched response binding`, () => {
    const read = c.read(scope(c.target()), {});
    for (const mismatch of c.mismatches) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...mismatch }))), { code: 'scope' });
    }
  });

  test(`${c.operation}: deeply captured host targets and requests are immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const path of fields(target)) parentAt(target, path)[path.at(-1)] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.proposedRequest, ...Object.values(before.plan.target).filter(value => typeof value === 'object')]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target.organizationId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent, nested binding and revision changes plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const path of fields(target)) {
      const changed = structuredClone(target);
      const key = path.at(-1);
      parentAt(changed, path)[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan), path.join('.'));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared), path.join('.'));
    }
  });

  test(`${c.operation}: caller cannot supply scope, credentials, requests or authority`, () => {
    const prepare = c.bind(c.target());
    for (const args of [null, [], { target: c.target() }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { approved: true }, { userId: 'other' }, { artifactDigest: 'b'.repeat(64) }, { url: 'https://example.invalid' },
      { method: 'DELETE' }, { page: 2 }, { credential: 'synthetic-canary' }]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
    refused(() => prepare(Object.defineProperty({}, 'hidden', { value: true })));
    refused(() => prepare({ [Symbol('scope')]: true }));
  });

  test(`${c.operation}: incomplete, extra and unsafe host bindings refuse without accessors`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' }]) refused(() => c.bind(raw));
    for (const path of fields(c.target())) {
      const missing = c.target();
      delete parentAt(missing, path)[path.at(-1)];
      refused(() => c.bind(missing));
      const unsafe = c.target();
      parentAt(unsafe, path)[path.at(-1)] = '../other';
      refused(() => c.bind(unsafe));
      let touched = false;
      const accessor = c.target();
      Object.defineProperty(parentAt(accessor, path), path.at(-1),
        { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind(accessor));
      assert.equal(touched, false);
    }
    for (const key of Object.keys(c.target()).filter(key => typeof c.target()[key] === 'object')) {
      for (const value of [null, [], { ...c.target()[key], approved: true }]) {
        refused(() => c.bind({ ...c.target(), [key]: value }));
      }
    }
  });
}

test('organization detail resources retain separate namespaces for identical provider IDs', () => {
  const prepared = cases.map(c => {
    const target = c.target();
    for (const key of ['team', 'membership']) if (target[key]) target[key].id = 'shared_1';
    return c.bind(target)({});
  });
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('team-member resource identity retains the team when membership IDs are reused', () => {
  const first = cases[2].target();
  const second = { ...first, team: { ...first.team, id: 'other_team' } };
  const a = bindGetOrganizationTeamMemberPreparation(first)({});
  const b = bindGetOrganizationTeamMemberPreparation(second)({});
  assert.notEqual(a.resource.id, b.resource.id);
  assert.notEqual(canonicalHash(a.plan), canonicalHash(b.plan));
  assert.notEqual(canonicalHash(a), canonicalHash(b));
});
