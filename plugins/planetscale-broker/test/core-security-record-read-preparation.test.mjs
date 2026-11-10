import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetServiceTokenPreparation, bindGetOauthTokenPreparation, bindGetWebhookPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as serviceRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-service-token.js';
import { prepare as oauthRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-oauth-token.js';
import { prepare as webhookRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-webhook.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'org_1', revision: 'a'.repeat(64) });
const tokenBody = { id: 'token_1', expires_at: null, last_used_at: null };
const refused = fn => assert.throws(fn, { code: 'schema' });
const cases = [
  { operation: 'get_service_token', bind: bindGetServiceTokenPreparation, read: serviceRead,
    target: () => ({ ...organization(), tokenId: 'token_1' }),
    resource: t => `planetscale/service-token/${t.tokenId}`,
    path: '/v1/organizations/sample-org/service-tokens/token_1', body: tokenBody },
  { operation: 'get_oauth_token', bind: bindGetOauthTokenPreparation, read: oauthRead,
    target: () => ({ ...organization(), applicationId: 'app_1', tokenId: 'token_1' }),
    resource: t => `planetscale/oauth-token/${t.applicationId}/${t.tokenId}`,
    path: '/v1/organizations/sample-org/oauth-applications/app_1/tokens/token_1', body: tokenBody },
  { operation: 'get_webhook', bind: bindGetWebhookPreparation, read: webhookRead,
    target: () => ({ ...organization(), database: 'sample-db', databaseId: 'db_1', webhookId: 'webhook_1' }),
    resource: t => `planetscale/webhook/${t.webhookId}`,
    path: '/v1/organizations/sample-org/databases/sample-db/webhooks/webhook_1',
    body: { id: 'webhook_1', enabled: true, authorization_header_configured: true, last_sent_success: null } },
];
const scope = target => Object.fromEntries(Object.entries(target).filter(([key]) => !['organizationId', 'databaseId', 'revision'].includes(key)));

for (const c of cases) {
  test(`${c.operation}: core preparation binds immutable IDs and existing fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource(target), revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual({ ...prepared.plan.target }, target);
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

  test(`${c.operation}: preparation retains parent identity and non-waking limits without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: existing projection drops raw secrets and unverified parent identities`, () => {
    const output = c.read(scope(c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', application_id: 'unverified-parent',
      token: 'synthetic-canary', access_token: 'synthetic-canary', refresh_token: 'synthetic-canary',
      secret: 'synthetic-canary', url: 'synthetic-canary', authorization_header: 'synthetic-canary',
      scopes: ['synthetic-canary'], actor: { name: 'synthetic-canary' } })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), (c.operation === 'get_webhook'
      ? ['id', 'enabled', 'authorizationHeaderConfigured', 'lastSentSuccess']
      : ['id', 'expiryConfigured', 'usageRecorded', 'effectiveAuthority']).sort());
    if (c.operation !== 'get_webhook') assert.equal(output.effectiveAuthority, 'not-established');
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: existing projection refuses mismatched response record identity`, () => {
    const read = c.read(scope(c.target()), {});
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, id: 'other' }))), { code: 'scope' });
  });

  test(`${c.operation}: captured host targets and requests are immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target)) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.organizationId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent, record and revision changes plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      const changed = { ...target, [key]: key === 'revision' ? 'b'.repeat(64) : 'other' };
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan), key);
      assert.notEqual(canonicalHash(original), canonicalHash(prepared), key);
    }
  });

  test(`${c.operation}: caller cannot supply scope, secrets, requests or authority`, () => {
    const prepare = c.bind(c.target());
    for (const args of [null, [], { target: c.target() }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { approved: true }, { tokenId: 'other' }, { applicationId: 'other' }, { webhookId: 'other' },
      { artifactDigest: 'b'.repeat(64) }, { url: 'https://example.invalid' }, { method: 'DELETE' },
      { credential: 'synthetic-canary' }]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
    refused(() => prepare(Object.defineProperty({}, 'hidden', { value: true })));
    refused(() => prepare({ [Symbol('scope')]: true }));
  });

  test(`${c.operation}: incomplete, extra and unsafe host bindings refuse without accessors`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' }]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../other' }));
      let touched = false;
      const accessor = Object.defineProperty(c.target(), key,
        { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind(accessor));
      assert.equal(touched, false);
    }
  });
}

test('security record resources retain separate namespaces for identical provider IDs', () => {
  const prepared = cases.map(c => c.bind({ ...c.target(), [c.operation === 'get_webhook' ? 'webhookId' : 'tokenId']: 'shared_1' })({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('OAuth token resource identity retains the application when token IDs are reused', () => {
  const first = cases[1].target();
  const second = { ...first, applicationId: 'other_app' };
  const a = bindGetOauthTokenPreparation(first)({});
  const b = bindGetOauthTokenPreparation(second)({});
  assert.notEqual(a.resource.id, b.resource.id);
  assert.notEqual(canonicalHash(a.plan), canonicalHash(b.plan));
  assert.notEqual(canonicalHash(a), canonicalHash(b));
});
