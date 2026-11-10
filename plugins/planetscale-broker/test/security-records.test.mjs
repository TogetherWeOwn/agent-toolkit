import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as token from '../../../dist/plugins/planetscale-broker/src/tools/get-service-token.js';
import * as tokens from '../../../dist/plugins/planetscale-broker/src/tools/list-service-tokens.js';
import * as oauth from '../../../dist/plugins/planetscale-broker/src/tools/get-oauth-token.js';
import * as oauths from '../../../dist/plugins/planetscale-broker/src/tools/list-oauth-tokens.js';
import * as webhook from '../../../dist/plugins/planetscale-broker/src/tools/get-webhook.js';
import * as webhooks from '../../../dist/plugins/planetscale-broker/src/tools/list-webhooks.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const org = { organization: 'example-org' };
const db = { ...org, database: 'example-db' };
const orgPath = '/v1/organizations/example-org';
const tokenRow = { id: 'tk123', name: canary, display_name: canary, token: canary, plain_text_refresh_token: canary, expires_at: '2026-01-01T00:00:00Z', last_used_at: null, last_used_ip: canary, last_used_location: canary, last_used_asn: 123, actor_id: canary, actor_display_name: canary, actor_type: canary, avatar_url: canary, service_token_accesses: [{ access: canary }], oauth_accesses_by_resource: { database: [canary] } };
const tokenExpected = { id: 'tk123', expiryConfigured: true, usageRecorded: false, effectiveAuthority: 'not-established' };
const webhookRow = { id: 'wh123', enabled: true, authorization_header_configured: true, last_sent_success: null, url: canary, secret: canary, authorization_header: canary, last_sent_result: canary, events: [canary], created_at: canary, updated_at: canary, last_sent_at: canary };
const webhookExpected = { id: 'wh123', enabled: true, authorizationHeaderConfigured: true, lastSentSuccess: null };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [token, { ...org, tokenId: 'tk123' }, 'tokenId', tokenRow, tokenExpected, orgPath + '/service-tokens/tk123', false],
  [tokens, { ...org, tokenIds: ['tk123'] }, 'tokenIds', tokenRow, tokenExpected, orgPath + '/service-tokens', true],
  [oauth, { ...org, applicationId: 'oa123', tokenId: 'tk123' }, 'tokenId', tokenRow, tokenExpected, orgPath + '/oauth-applications/oa123/tokens/tk123', false],
  [oauths, { ...org, applicationId: 'oa123', tokenIds: ['tk123'] }, 'tokenIds', tokenRow, tokenExpected, orgPath + '/oauth-applications/oa123/tokens', true],
  [webhook, { ...db, webhookId: 'wh123' }, 'webhookId', webhookRow, webhookExpected, orgPath + '/databases/example-db/webhooks/wh123', false],
  [webhooks, { ...db, webhookIds: ['wh123'] }, 'webhookIds', webhookRow, webhookExpected, orgPath + '/databases/example-db/webhooks', true],
];

for (const [adapter, scope, key, row, expected, path, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const project = (prepared, rows) => prepared.project(wire(list ? page(rows) : rows[0]));
  test(`${adapter.operationId}: fixed GET path and scalar-only secret-free projection`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + (list ? '?page=1&per_page=2' : '') });
    const result = project(prepared, [row]);
    assert.deepEqual(result, list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(prepared));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(list ? result.items[0] : result));
    if (list) {
      assert.ok(Object.isFrozen(result.items));
      assert.deepEqual(project(prepared, []), { items: [], nextPage: null, complete: true });
    }
  });

  test(`${adapter.operationId}: unknown child refuses whole page with no secret reflection`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', null, {}, canary]) {
      assert.throws(() => project(prepared, list ? [row, { ...row, id }] : [{ ...row, id }]), error => !String(error).includes(canary));
    }
  });

  test(`${adapter.operationId}: malformed selected fields and wire limits fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    const selected = key.startsWith('token') ? ['expires_at', 'last_used_at'] : ['enabled', 'authorization_header_configured', 'last_sent_success'];
    for (const field of selected) {
      for (const value of [undefined, {}, [], 1, canary]) assert.throws(() => project(prepared, [{ ...row, [field]: value }]), error => !String(error).includes(canary));
    }
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    if (list) {
      for (const value of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(value)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed input rejects secret, target and authority overrides`, () => {
    for (const field of ['sql', 'url', 'token', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'applicationId', 'webhookId', 'tokenId']) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }]) assert.throws(() => adapter.prepare(value, args));
    for (const field of ['database', 'applicationId']) if (Object.hasOwn(scope, field)) assert.throws(() => adapter.prepare({ ...scope, [field]: '../foreign' }, args));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    for (const value of list ? [[], [row.id, row.id], Array(33).fill(row.id), ['../escape']] : [null, '../escape', canary]) assert.throws(() => adapter.prepare({ ...scope, [key]: value }, args));
    if (list) for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
  });

  test(`${adapter.operationId}: prepared resource and child bindings are immutable snapshots`, () => {
    const copiedScope = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copiedScope, copiedArgs);
    copiedScope.organization = 'foreign';
    if (copiedScope.database) copiedScope.database = 'foreign';
    if (copiedScope.applicationId) copiedScope.applicationId = 'foreign';
    if (list) copiedScope[key].push('foreign');
    else copiedScope[key] = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, path + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(project(prepared, [row]), list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.throws(() => project(prepared, [{ ...row, id: 'foreign' }]));
  });
}

test('token expiry and usage flags are presence only, never validity or effective-scope evidence', () => {
  const prepared = token.prepare({ ...org, tokenId: 'tk123' }, {});
  for (const expiry of [null, '2000-01-01T00:00:00Z', '2099-12-31T23:59:59.123456Z', '2026-01-01T01:00:00+01:00']) {
    const result = prepared.project(wire({ ...tokenRow, expires_at: expiry, last_used_at: '2026-01-01T00:00:00Z', effectiveAuthority: 'accepted', expired: false }));
    assert.equal(result.expiryConfigured, expiry !== null);
    assert.equal(result.usageRecorded, true);
    assert.equal(result.effectiveAuthority, 'not-established');
    assert.ok(!Object.hasOwn(result, 'expired'));
  }
  for (const invalid of ['not-a-date', '', '2026-13-01T00:00:00Z', '2026-01-01', 'x'.repeat(41)]) assert.throws(() => prepared.project(wire({ ...tokenRow, expires_at: invalid })));
});

test('nullable webhook result remains tri-state and does not imply endpoint safety', () => {
  const prepared = webhook.prepare({ ...db, webhookId: 'wh123' }, {});
  for (const value of [true, false, null]) assert.equal(prepared.project(wire({ ...webhookRow, last_sent_success: value })).lastSentSuccess, value);
  for (const field of ['enabled', 'authorization_header_configured']) assert.throws(() => prepared.project(wire({ ...webhookRow, [field]: null })));
});

test('security-record endpoints and pagination match the pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , path, list] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { organization: scope.organization, database: scope.database, application_id: scope.applicationId, token_id: scope.tokenId, id: scope.tokenId ?? scope.webhookId };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), path);
    assert.deepEqual(operation.value.parameters.filter(value => value.in === 'query').map(value => value.name).sort(), list ? ['page', 'per_page'] : []);
  }
  for (const [definition, fields] of [['ServiceToken', ['expires_at', 'last_used_at']], ['DatabaseWebhook', ['enabled', 'authorization_header_configured', 'last_sent_success']]]) {
    for (const field of fields) assert.ok(schema.definitions[definition].required.includes(field));
  }
});
