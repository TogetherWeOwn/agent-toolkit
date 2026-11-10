import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetOauthApplicationPreparation, bindGetOrganizationSsoPreparation, bindGetOrganizationSsoDomainPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as applicationRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-oauth-application.js';
import { prepare as ssoRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-sso.js';
import { prepare as domainRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-sso-domain.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'record_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org';
const cases = [
  { operation: 'get_oauth_application', bind: bindGetOauthApplicationPreparation, read: applicationRead,
    target: () => ({ ...organization(), applicationId: 'record_1' }),
    scope: t => ({ organization: t.organization, applicationId: t.applicationId }),
    resource: 'planetscale/oauth-application/record_1', path: `${path}/oauth-applications/record_1`,
    identity: 'record-id-only-parent-not-verified',
    body: { id: 'record_1', dcr: false, single_org_authorization: true, requires_org_scope: true },
    keys: ['id', 'dynamicRegistration', 'singleOrganization', 'requiresOrganizationScope', 'effectiveAuthority'],
    invalid: { dcr: 'false' }, invalidCode: 'upstream' },
  { operation: 'get_organization_sso', bind: bindGetOrganizationSsoPreparation, read: ssoRead,
    target: organization, scope: t => ({ organization: t.organization, organizationId: t.organizationId }),
    resource: 'planetscale/organization-sso/record_1', path: `${path}/sso`, identity: 'organization-id-matched',
    body: { type: 'OrganizationSSO', id: 'record_1', enabled: true, configured: true, directory: false, has_verified_domain: true },
    keys: ['id', 'enabled', 'configured', 'directory', 'hasVerifiedDomain', 'effectiveAuthority'],
    invalid: { type: 'Other' }, invalidCode: 'upstream' },
  { operation: 'get_organization_sso_domain', bind: bindGetOrganizationSsoDomainPreparation, read: domainRead,
    target: () => ({ ...organization(), domainId: 'record_1' }),
    scope: t => ({ organization: t.organization, domainId: t.domainId }),
    resource: 'planetscale/organization-sso-domain/record_1', path: `${path}/sso/domains/record_1`,
    identity: 'record-id-only-parent-not-verified',
    body: { type: 'OrganizationDomain', id: 'record_1', state: 'verified', verified_at: null },
    keys: ['id', 'state', 'verificationRecorded'], invalid: { state: 'other' }, invalidCode: 'schema' },
];

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable IDs, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual({ ...prepared.plan.target }, target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(Object.hasOwn(prepared.plan.proposedRequest, 'body'), false);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains exact identity/non-waking limits without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits client/contact/verification/authority canaries`, () => {
    const output = c.read(c.scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', client_id: 'synthetic-canary', client_secret: 'synthetic-canary',
      redirect_uri: 'synthetic-canary', domain: 'synthetic-canary', verification_token: 'synthetic-canary',
      scopes: ['synthetic-canary'], saml: { certificate: 'synthetic-canary' },
      email: 'synthetic-canary', actor: { name: 'synthetic-canary' }, error: 'synthetic-canary',
      approved: true, effectiveAuthority: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    if (c.keys.includes('effectiveAuthority')) assert.equal(output.effectiveAuthority, 'not-established');
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses rebound identity and malformed selected fields`, () => {
    const read = c.read(c.scope(c.target()), {});
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, id: 'other' }))), { code: 'scope' });
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...c.invalid }))), { code: c.invalidCode });
  });

  test(`${c.operation}: captured target and request remain immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target.organizationId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent/record/revision field affects plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      const changed = { ...c.target(), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' };
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/secrets/authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { organizationId: 'other' },
      { applicationId: 'other' }, { domainId: 'other' }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { method: 'POST' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' },
      { ...c.target(), [Symbol('scope')]: true }, Object.defineProperty(c.target(), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });
}

test('application, SSO and domain identities do not collide with equal IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
  for (const p of prepared) assert.notEqual(p.resource.id, 'planetscale/organization/record_1');
});

test('SSO organization identity is bound despite the name-only request path', () => {
  const target = organization();
  const first = bindGetOrganizationSsoPreparation(target)({});
  target.organizationId = 'other';
  const second = bindGetOrganizationSsoPreparation(target)({});
  assert.deepEqual(first.plan.proposedRequest, second.plan.proposedRequest);
  assert.notEqual(first.resource.id, second.resource.id);
  assert.notEqual(canonicalHash(first), canonicalHash(second));
  assert.throws(() => ssoRead({ organization: target.organization, organizationId: target.organizationId }, {})
    .project(Buffer.from(JSON.stringify(cases[1].body))), { code: 'scope' });
});
