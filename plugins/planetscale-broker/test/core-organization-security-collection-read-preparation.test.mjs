import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListOauthApplicationsPreparation, bindListOrganizationSsoDomainsPreparation,
  bindListOrganizationInvitationsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as applicationRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-oauth-applications.js';
import { prepare as domainRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-sso-domains.js';
import { prepare as invitationRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-organization-invitations.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', revision: 'a'.repeat(64) });
const cases = [
  { operation: 'list_oauth_applications', bind: bindListOauthApplicationsPreparation, read: applicationRead,
    field: 'applicationIds', paged: true, path: '/oauth-applications?page=2&per_page=3',
    row: { id: 'record_1', dcr: false, single_org_authorization: true, requires_org_scope: true },
    output: { id: 'record_1', dynamicRegistration: false, singleOrganization: true,
      requiresOrganizationScope: true, effectiveAuthority: 'not-established' }, malformed: { dcr: 'false' }, code: 'upstream' },
  { operation: 'list_organization_sso_domains', bind: bindListOrganizationSsoDomainsPreparation, read: domainRead,
    field: 'domainIds', path: '/sso/domains',
    row: { id: 'record_1', type: 'OrganizationDomain', state: 'verified', verified_at: '2026-01-01T00:00:00Z' },
    output: { id: 'record_1', state: 'verified', verificationRecorded: true }, malformed: { state: 'unknown' }, code: 'schema' },
  { operation: 'list_organization_invitations', bind: bindListOrganizationInvitationsPreparation, read: invitationRead,
    field: 'invitationIds', paged: true, path: '/invitations?page=2&per_page=3',
    row: { id: 'record_1', role: 'admin', expired: false },
    output: { id: 'record_1', role: 'admin', expired: false, effectiveAuthority: 'not-established' },
    malformed: { expired: 'false' }, code: 'upstream' },
];
const ids = n => Array.from({ length: n }, (_, i) => `record_${i + 1}`);
const targetFor = c => ({ ...parent(), [c.field]: ids(2), ...(c.paged ? { pagination: { page: 2, perPage: 3 } } : {}) });
const scopeFor = (c, t) => ({ organization: t.organization, [c.field]: t[c.field] });
const envelope = (c, data) => c.paged ? { current_page: 2, per_page: 3, next_page: 3, data } : data;
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), c.paged ? targetFor(c).pagination : {})
  .project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: exact fixed collection GET and closed host resource`, () => {
    const target = targetFor(c); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/organization/org_1', revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), c.paged ? target.pagination : {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `/v1/organizations/sample-org${c.path}` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: ID confinement is not collection, SSO or invitation authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'securityAuthority', 'invitationAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: frozen metadata omits contact, client, scope and verification canaries`, () => {
    const result = project(c, envelope(c, [{ ...c.row, email: 'synthetic-canary', name: 'synthetic-canary',
      domain: 'synthetic-canary', client_id: 'synthetic-canary', client_secret: 'synthetic-canary',
      scopes: ['synthetic-canary'], verification_token: 'synthetic-canary', redirect_uri: 'synthetic-canary',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', organization_id: 'unverified-parent' }]));
    assert.deepEqual(result, c.paged ? { items: [c.output], nextPage: 3, complete: false } : [c.output]);
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    assert.equal(JSON.stringify(result).includes('2026-01-01'), false);
    const items = c.paged ? result.items : result;
    for (const value of [result, items, items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, c.paged ? { ...envelope(c, []), next_page: null } : []),
      c.paged ? { items: [], nextPage: null, complete: true } : []);
  });

  test(`${c.operation}: unknown child or malformed metadata refuses whole response`, () => {
    assert.throws(() => project(c, envelope(c, [c.row, { ...c.row, id: 'unknown' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope(c, [c.row, { ...c.row, ...c.malformed }])), { code: c.code });
    if (c.paged) for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
      assert.throws(() => project(c, { ...envelope(c, [c.row]), ...patch }), { code: 'upstream' });
    }
    else {
      assert.throws(() => project(c, [{ ...c.row, type: 'Other' }]), { code: 'upstream' });
      assert.throws(() => project(c, { data: [c.row] }), { code: 'upstream' });
      assert.throws(() => project(c, Array(33).fill(c.row)), { code: 'upstream' });
    }
  });

  test(`${c.operation}: parents, ID arrays and pagination are captured and deeply frozen`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    target[c.field][0] = 'other'; target[c.field].push('third');
    if (c.paged) { target.pagination.page = 3; target.pagination.perPage = 4; }
    for (const key of Object.keys(parent())) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], before.plan.proposedRequest, ...(c.paged ? [before.plan.target.pagination] : [])]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target[c.field][0] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field, child ID and order changes plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = Object.keys(parent()).map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) { const target = targetFor(c); target[c.field][index] = 'other'; variants.push(target); }
    const reordered = targetFor(c); reordered[c.field].reverse(); variants.push(reordered);
    if (c.paged) for (const key of ['page', 'perPage']) {
      const target = targetFor(c); target.pagination[key]++; variants.push(target);
    }
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot replace host IDs, page, request or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: ids(1) }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host input is closed, unique, bounded and accessor-free`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const children of [[], ids(33), ['same', 'same'], [null], ['../escape'], [{ id: 'one' }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    }
    const children = ids(2); let touched = false;
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children })); assert.equal(touched, false);
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: ids(32) })({}).plan.target[c.field].length, 32);
  });
}

test('SSO domain arrays reject invented pagination; other lists require bounded captured pages', () => {
  const domain = cases[1]; refused(() => domain.bind({ ...targetFor(domain), pagination: { page: 1, perPage: 10 } }));
  for (const c of [cases[0], cases[2]]) for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 },
    { page: 2, perPage: 0 }, { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) {
    refused(() => c.bind({ ...targetFor(c), pagination }));
  }
});

test('collection operations cannot collide despite sharing organization resource and child IDs', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 1);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, cases.length);
  assert.equal(new Set(prepared.map(p => canonicalHash(p))).size, cases.length);
});

test('independent organization and child IDs remain hashed when the request is unchanged', () => {
  for (const c of cases) for (const change of [t => { t.organizationId = 'other'; }, t => { t[c.field][0] = 'other'; }]) {
    const target = targetFor(c); change(target);
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(changed.plan.proposedRequest, original.plan.proposedRequest);
    assert.notEqual(canonicalHash(changed.plan), canonicalHash(original.plan));
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
  }
});
