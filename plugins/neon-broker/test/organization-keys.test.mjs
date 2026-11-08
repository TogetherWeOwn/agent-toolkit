import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationKeyOperations, ORGANIZATION_KEY_OPERATIONS } from '../dist/plugins/neon-broker/src/organization-keys.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationKeyCases as cases, organizationKeyFixture as fixture, organizationKeyScope as scope,
  organizationKey as key, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { key: canary, token: canary, name: canary, created_by: canary, last_used_from_addr: canary, project_id: canary };

test('organization keys: fixed exact-organization GET returns selected numeric IDs only', async () => {
  const f = fixture([{ ...key, ...poison }, { id: 123 }]);
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/organizations/org-a/api_keys`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/organizations/org-a/api_keys', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture([]).run(name, args), { api_keys: [] });
  assert.deepEqual(await fixture(raw, { ...scope, keyIds: [] }).run(name, args), { api_keys: [] });
  assert.deepEqual(await fixture([{ id: 123 }]).run(name, args), { api_keys: [] });
});

test('organization keys: canonical arguments reject selectors, account fallback and authority fields', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { org_id: 'other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].map(org_id => ({ org_id })),
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'key_id', 'project_id', 'user_id', 'reveal', 'keyIds'].map(k => ({ ...args, [k]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('organization keys: trusted numeric selection is copied, bounded and unique', () => {
  const config = structuredClone(scope);
  const operations = createNeonOrganizationKeyOperations(config, {});
  config.organizationId = 'other';
  config.revision = 'scope-v2';
  config.keyIds[0] = 123;
  config.keyIds.push(456);
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/organizations/org-a/api_keys', revision: 'scope-v1' });
  assert.deepEqual(operations[0].project([...raw, { id: 123 }, { id: 456 }]), expected);
  for (const change of [{ extra: true }, { organizationId: 'Upper' }, { organizationId: 'x'.repeat(61) }, { revision: '' },
    { keyIds: [1, 1] }, ...[null, true, -1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', NaN, Infinity].map(id => ({ keyIds: [id] })),
    { keyIds: Array.from({ length: 31 }, (_, i) => i) }]) assert.throws(() => createNeonOrganizationKeyOperations({ ...scope, ...change }, {}));
  assert.deepEqual(operations.map(op => op.name), ORGANIZATION_KEY_OPERATIONS.map(n => `neon.${n}`));
  for (const other of ['listApiKeys', 'createOrgApiKey', 'revokeOrgApiKey', 'revealCredential']) assert.equal(fixture(raw).operation(other), undefined);
});

test('organization keys: detached execution validates exact resource, revision, arguments and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/organizations/org-a' },
    { ...prepared.resource, id: 'neon/organizations/org-b/api_keys' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { org_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const value of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, value, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('organization keys: bare-array shape, safe IDs, ancestry and duplicates refuse before filtering', async () => {
  for (const value of [null, {}, { api_keys: raw }, [null],
    ...[null, true, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', {}, []].map(id => [key, { id }]),
    [key, key], [{ id: 123 }, { id: 123 }], [key, { id: 123, org_id: 'other' }],
    [key, { id: 123, org_id: null }], [key, { id: 123, pagination: {} }],
    Array.from({ length: 31 }, (_, n) => ({ id: n })),
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  // JSON.stringify turns -0 into 0; exercise negative zero without fixture serialization.
  assert.throws(() => op.project([{ id: -0 }]));
  await assert.rejects(fixture(() => new Response('[{"id":-0}]', { headers: { 'content-type': 'application/json' } })).run(name, args));
  for (const k of ['id', 'org_id', 'pagination']) assert.throws(() => op.project([Object.defineProperty({ ...key }, k,
    { get() { throw Error('getter'); }, enumerable: true })]));
  assert.throws(() => op.project(new Array(1)));
  assert.throws(() => op.project(Object.assign([...raw], { pagination: {} })));
  assert.throws(() => op.project(Object.defineProperty([...raw], '0', { get() { throw Error('getter'); }, enumerable: true })));
  for (const k of ['key', 'token', 'name', 'created_by', 'created_at', 'last_used_at', 'last_used_from_addr', 'project_id']) {
    assert.deepEqual(op.project([Object.defineProperty({ ...key }, k,
      { get() { throw Error('unused getter'); }, enumerable: true })]), expected);
  }
  const apiKeys = Array.from({ length: 30 }, (_, n) => ({ id: Number.MAX_SAFE_INTEGER - n }));
  assert.deepEqual(await fixture(apiKeys, { ...scope, keyIds: apiKeys.map(k => k.id) }).run(name, args), { api_keys: apiKeys });
  assert.deepEqual(await fixture([{ id: 0 }], { ...scope, keyIds: [0] }).run(name, args), { api_keys: [{ id: 0 }] });
});

test('organization keys: transport failures never fabricate empty results or account-wide fallback', async () => {
  for (const status of [403, 404, 410, 500, 302]) {
    const f = fixture(() => response(poison, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response([{ ...key, ignored: 'x'.repeat(RESPONSE_BYTES) }])]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('organization keys: direct transport rejects malformed organization IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.listOrgApiKeys(value, options));
  }
  assert.equal(calls, 0);
});
