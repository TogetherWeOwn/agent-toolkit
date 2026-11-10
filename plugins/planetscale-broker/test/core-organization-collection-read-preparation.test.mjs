import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListOrganizationMembersPreparation, bindListOrganizationTeamsPreparation,
  bindListOrganizationTeamMembersPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as membershipRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-members.js';
import { prepare as teamRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-teams.js';
import { prepare as memberRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-team-members.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'org_1',
  revision: 'a'.repeat(64), pagination: { page: 2, perPage: 3 } });
const team = () => ({ ...organization(), team: { id: 'team_1', slug: 'engineering' } });
const root = '/v1/organizations/sample-org';
const cases = [
  { operation: 'list_organization_members', bind: bindListOrganizationMembersPreparation, read: membershipRead,
    parent: organization, field: 'memberships', child: i => ({ id: `membership_${i}`, userId: `user_${i}` }),
    resource: 'planetscale/organization/org_1', path: `${root}/members`,
    identity: 'record-and-user-ids-parent-not-verified', row: { id: 'membership_1', user: { id: 'user_1' }, role: 'admin' },
    output: { id: 'membership_1', userId: 'user_1', role: 'admin', effectiveAuthority: 'not-established' },
    malformed: { role: 'owner' }, malformedCode: 'schema' },
  { operation: 'list_organization_teams', bind: bindListOrganizationTeamsPreparation, read: teamRead,
    parent: organization, field: 'teams', child: i => ({ id: `team_${i}`, slug: `team-${i}` }),
    resource: 'planetscale/organization/org_1', path: `${root}/teams`,
    identity: 'record-and-name-parent-not-verified', row: { id: 'team_1', slug: 'team-1', managed: true },
    output: { id: 'team_1', slug: 'team-1', managed: true, effectiveAuthority: 'not-established' },
    malformed: { managed: 'true' }, malformedCode: 'upstream' },
  { operation: 'list_organization_team_members', bind: bindListOrganizationTeamMembersPreparation, read: memberRead,
    parent: team, field: 'memberships', child: i => ({ id: `membership_${i}`, userId: `user_${i}` }),
    resource: 'planetscale/organization-team/team_1', path: `${root}/teams/engineering/members`,
    identity: 'record-and-user-ids-parent-not-verified', row: { id: 'membership_1', user: { id: 'user_1' } },
    output: { id: 'membership_1', userId: 'user_1', effectiveAuthority: 'not-established' },
    malformed: { user: { id: 'other' } }, malformedCode: 'scope' },
];
const targetFor = c => ({ ...c.parent(), [c.field]: [c.child(1), c.child(2)] });
const scopeFor = (c, t) => ({ organization: t.organization, ...(t.team ? { team: t.team } : {}), [c.field]: t[c.field] });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: host parents, child bindings and page produce a fixed GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: confinement grants no collection, role, grant or non-waking authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: projections omit contact, credentials, grants, actors and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, ...(c.row.user ? {
      user: { ...c.row.user, email: 'synthetic-canary', name: 'synthetic-canary' } } : {}),
      password: 'synthetic-canary', passwords: [{ secret: 'synthetic-canary' }],
      connection_url: 'synthetic-canary', organization_id: 'unverified-parent', team_id: 'unverified-parent',
      actor: 'synthetic-canary', created_at: 'synthetic-canary' }]));
    assert.deepEqual(result, { items: [c.output], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown children, malformed fields and mismatched pages refuse whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope([{ ...c.row, ...c.malformed }])), { code: c.malformedCode });
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: [c.row, c.row, c.row, c.row] }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: captures deeply immutable host bindings and pagination`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.field][0].id = 'other';
    target[c.field].push(c.child(3));
    target.pagination.page = 3;
    target.pagination.perPage = 10;
    target.revision = 'b'.repeat(64);
    if (target.team) { target.team.id = 'other'; target.team.slug = 'other'; }
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], ...before.plan.target[c.field], before.plan.target.pagination,
      before.plan.proposedRequest, ...(before.plan.target.team ? [before.plan.target.team] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0].id = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.pagination.page = 3; }, TypeError);
  });

  test(`${c.operation}: every parent, child, revision and page field changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [];
    for (const key of Object.keys(c.parent()).filter(k => !['pagination', 'team'].includes(k))) {
      variants.push({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' });
    }
    if (c.parent().team) {
      for (const key of ['id', 'slug']) {
        const target = targetFor(c);
        target.team[key] = 'other';
        variants.push(target);
      }
    }
    for (const key of ['page', 'perPage']) {
      const target = targetFor(c);
      target.pagination[key] += 1;
      variants.push(target);
    }
    for (const index of [0, 1]) {
      for (const key of Object.keys(c.child(1))) {
        const target = targetFor(c);
        target[c.field][index][key] = 'other';
        variants.push(target);
      }
    }
    const reordered = targetFor(c);
    reordered[c.field].reverse();
    variants.push(reordered);
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot override bindings, page, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: [c.child(1)] }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
      refused(() => prepare(raw));
    }
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing, extra, unsafe and accessor host fields refuse without evaluation`, () => {
    for (const raw of [null, [], {}, { ...targetFor(c), approved: true }, { ...targetFor(c), credential: 'synthetic-canary' },
      { ...targetFor(c), revision: 'latest' }, { ...targetFor(c), [Symbol('scope')]: true },
      Object.defineProperty(targetFor(c), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c);
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });

  test(`${c.operation}: child bindings and pagination are unique, bounded and closed`, () => {
    const rows = n => Array.from({ length: n }, (_, i) => c.child(i + 1));
    for (const children of [[], rows(33), [c.child(1), c.child(1)], ['../escape'],
      [{ ...c.child(1), approved: true }], [{ ...c.child(1), id: '../escape' }],
      [c.child(1), { ...c.child(1), id: 'other' }], [c.child(1), { ...c.child(2), id: c.child(1).id }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    }
    for (const key of Object.keys(c.child(1))) {
      const row = c.child(1);
      delete row[key];
      refused(() => c.bind({ ...targetFor(c), [c.field]: [row] }));
      let touched = false;
      const accessor = Object.defineProperty(c.child(1), key, { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind({ ...targetFor(c), [c.field]: [accessor] }));
      assert.equal(touched, false);
    }
    let touched = false;
    const children = rows(2);
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return c.child(1); } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    assert.equal(touched, false);
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: rows(32), pagination: { page: 100, perPage: 10 } })({}).plan.target[c.field].length, 32);
  });
}

test('organization collection plans distinguish operations sharing an organization resource', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(prepared[0].resource.id, prepared[1].resource.id);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('organization child rebinding changes hashes without changing the upstream collection request', () => {
  for (const c of cases) {
    const original = c.bind(targetFor(c))({});
    const target = targetFor(c);
    target[c.field][0].id = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
  }
});

test('membership user IDs and team slugs match independently without proving organization or team ownership', () => {
  for (const c of [cases[0], cases[2]]) {
    assert.throws(() => project(c, envelope([{ ...c.row, user: { id: 'other' } }])), { code: 'scope' });
  }
  const c = cases[1];
  assert.throws(() => project(c, envelope([{ ...c.row, slug: 'other' }])), { code: 'scope' });
  const target = targetFor(cases[2]);
  const original = cases[2].bind(target)({});
  target.team.id = 'other';
  const changed = cases[2].bind(target)({});
  assert.notEqual(original.resource.id, changed.resource.id);
  assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
  for (const patch of [{ team: { ...team().team, approved: true } }, { team: { id: 'team_1' } }]) {
    refused(() => cases[2].bind({ ...targetFor(cases[2]), ...patch }));
  }
  for (const key of ['id', 'slug']) {
    let touched = false;
    const target = targetFor(cases[2]);
    Object.defineProperty(target.team, key, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => cases[2].bind(target));
    assert.equal(touched, false);
  }
});
