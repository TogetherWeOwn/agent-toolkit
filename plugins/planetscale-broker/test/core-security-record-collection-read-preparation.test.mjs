import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListServiceTokensPreparation, bindListOauthTokensPreparation,
  bindListWebhooksPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as serviceRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-service-tokens.js';
import { prepare as oauthRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-oauth-tokens.js';
import { prepare as webhookRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-webhooks.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'org_1',
  revision: 'a'.repeat(64), pagination: { page: 2, perPage: 3 } });
const root = '/v1/organizations/sample-org';
const tokenRow = { id: 'record_1', expires_at: '2027-01-01T00:00:00Z', last_used_at: null };
const tokenOutput = { id: 'record_1', expiryConfigured: true, usageRecorded: false, effectiveAuthority: 'not-established' };
const cases = [
  { operation: 'list_service_tokens', bind: bindListServiceTokensPreparation, read: serviceRead,
    parent: organization, field: 'tokenIds', resource: 'planetscale/organization/org_1',
    path: `${root}/service-tokens`, row: tokenRow, output: tokenOutput,
    malformed: { expires_at: 'not-a-time' }, malformedCode: 'schema' },
  { operation: 'list_oauth_tokens', bind: bindListOauthTokensPreparation, read: oauthRead,
    parent: () => ({ ...organization(), applicationId: 'application_1' }), field: 'tokenIds',
    resource: 'planetscale/oauth-application/application_1', path: `${root}/oauth-applications/application_1/tokens`,
    row: tokenRow, output: tokenOutput, malformed: { last_used_at: false }, malformedCode: 'schema' },
  { operation: 'list_webhooks', bind: bindListWebhooksPreparation, read: webhookRead,
    parent: () => ({ ...organization(), database: 'sample-db', databaseId: 'db_1' }), field: 'webhookIds',
    resource: 'planetscale/database/db_1', path: `${root}/databases/sample-db/webhooks`,
    row: { id: 'record_1', enabled: true, authorization_header_configured: true, last_sent_success: null },
    output: { id: 'record_1', enabled: true, authorizationHeaderConfigured: true, lastSentSuccess: null },
    malformed: { enabled: 'true' }, malformedCode: 'upstream' },
];
const targetFor = c => ({ ...c.parent(), [c.field]: ['record_1', 'record_2'] });
const scopeFor = (c, t) => ({ organization: t.organization, ...(t.database ? { database: t.database } : {}),
  ...(t.applicationId ? { applicationId: t.applicationId } : {}), [c.field]: t[c.field] });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: immutable host parents, record IDs and page bind a fixed GET`, () => {
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

  test(`${c.operation}: confinement grants no collection, credential or non-waking authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'executionAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: receipts omit secrets, endpoints, actors, grants and parent claims`, () => {
    const result = project(c, envelope([{ ...c.row, token: 'synthetic-canary', refresh_token: 'synthetic-canary',
      secret: 'synthetic-canary', url: 'synthetic-canary', authorization_header: 'synthetic-canary',
      access: [{ role: 'synthetic-canary' }], scopes: ['synthetic-canary'], actor: 'synthetic-canary',
      organization_id: 'unverified-parent', database_id: 'unverified-parent', application_id: 'unverified-parent',
      created_at: 'synthetic-canary' }]));
    assert.deepEqual(result, { items: [c.output], nextPage: 3, complete: false });
    assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(result).includes('unverified-parent'), false);
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown records, malformed fields and mismatched pages refuse whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'other' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope([{ ...c.row, ...c.malformed }])), { code: c.malformedCode });
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: [c.row, c.row, c.row, c.row] }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: deeply captures IDs and pagination without later host rebinding`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.field][0] = 'other';
    target[c.field].push('record_3');
    target.pagination.page = 3;
    target.pagination.perPage = 10;
    for (const key of Object.keys(c.parent()).filter(k => k !== 'pagination')) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], before.plan.target.pagination, before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0] = 'other'; }, TypeError);
    assert.throws(() => { before.plan.target.pagination.page = 3; }, TypeError);
  });

  test(`${c.operation}: every host parent, revision, record ID and page field changes both hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [];
    for (const key of Object.keys(c.parent()).filter(k => k !== 'pagination')) {
      variants.push({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' });
    }
    for (const key of ['page', 'perPage']) {
      const target = targetFor(c);
      target.pagination[key] += 1;
      variants.push(target);
    }
    for (const index of [0, 1]) {
      const target = targetFor(c);
      target[c.field][index] = 'other';
      variants.push(target);
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

  test(`${c.operation}: caller cannot override IDs, pagination, transport or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: ['other'] }, { page: 1 }, { perPage: 10 },
      { applicationId: 'other' }, { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' },
      { revision: 'b'.repeat(64) }, { url: 'https://example.invalid' }, { [Symbol('scope')]: true },
      Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
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

  test(`${c.operation}: record-ID lists and pagination are unique, bounded and data-only`, () => {
    const rows = n => Array.from({ length: n }, (_, i) => `record_${i + 1}`);
    for (const ids of [[], rows(33), ['record_1', 'record_1'], ['../escape'], [null], [{ id: 'record_1' }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: ids }));
    }
    let touched = false;
    const ids = rows(2);
    Object.defineProperty(ids, '0', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: ids }));
    assert.equal(touched, false);
    for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 }, { page: 2, perPage: 0 },
      { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) refused(() => c.bind({ ...targetFor(c), pagination }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: rows(32), pagination: { page: 100, perPage: 10 } })({}).plan.target[c.field].length, 32);
  });
}

test('security-record collection plans distinguish token operations despite identical record projections', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
  assert.deepEqual(project(cases[0], envelope([tokenRow])), project(cases[1], envelope([tokenRow])));
});

test('record-ID rebinding changes both hashes without changing upstream collection request', () => {
  for (const c of cases) {
    const original = c.bind(targetFor(c))({});
    const target = targetFor(c);
    target[c.field][0] = 'other';
    const changed = c.bind(target)({});
    assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});

test('token timestamps and webhook flags are metadata, never validity, delivery or effective authority', () => {
  for (const c of cases.slice(0, 2)) {
    const result = project(c, envelope([{ ...tokenRow, expires_at: '2000-01-01T00:00:00Z', last_used_at: '2000-01-01T00:00:00Z' }]));
    assert.deepEqual(result.items[0], { ...tokenOutput, usageRecorded: true });
  }
  const result = project(cases[2], envelope([{ ...cases[2].row, last_sent_success: false }]));
  assert.deepEqual(result.items[0], { ...cases[2].output, lastSentSuccess: false });
});
