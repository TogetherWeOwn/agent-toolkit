import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonCredentialMetadataOperations, CREDENTIAL_METADATA_OPERATIONS } from '../dist/plugins/neon-broker/src/credential-metadata.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { credentialMetadataCases as cases, credentialMetadataFixture as fixture, credentialMetadataScope as scope,
  credentialMetadata as credential, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { token: canary, secret: canary, password: canary, name: canary, function_id: canary, expires_at: canary };

test('credential metadata: fixed branch GET projects only explicitly selected opaque identities', async () => {
  const f = fixture({ credentials: [{ ...raw.credentials[0], ...poison, scopes: ['unknown:future'] }, { token_id: 'unselected' }], ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/credentials`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/credentials', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ credentials: [] }).run(name, args), { credentials: [] });
  assert.deepEqual(await fixture(raw, { ...scope, tokenIds: [] }).run(name, args), { credentials: [] });
  assert.deepEqual(await fixture({ credentials: [{ token_id: credential.token_id }] }).run(name, args), expected);
  assert.deepEqual(await fixture({ credentials: [{ token_id: 'unselected' }] }).run(name, args), { credentials: [] });
});

test('credential metadata: canonical arguments reject authority, token selectors and reveal controls', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: 'project-a' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].flatMap(id =>
      [{ ...args, project_id: id }, { ...args, branch_id: id }]),
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'token_id', 'reveal', 'scopes', 'tokenIds'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('credential metadata: trusted scope is copied and bounded without adding credential actions', () => {
  const config = structuredClone(scope);
  const operations = createNeonCredentialMetadataOperations(config, {});
  config.projectId = 'other';
  config.branchId = 'br-b';
  config.revision = 'scope-v2';
  config.tokenIds[0] = 'unselected';
  config.tokenIds.push('another');
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/credentials', revision: 'scope-v1' });
  assert.deepEqual(operations[0].project({ credentials: [credential, { token_id: 'unselected' }, { token_id: 'another' }] }), expected);
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: 'Upper' }, { projectId: 'x'.repeat(61) }, { revision: '' },
    { tokenIds: ['a', 'a'] }, { tokenIds: [''] }, { tokenIds: ['x\n'] }, { tokenIds: ['аbc'] }, { tokenIds: ['x'.repeat(81)] },
    { tokenIds: Array.from({ length: 31 }, (_, i) => `id-${i}`) }]) {
    assert.throws(() => createNeonCredentialMetadataOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), CREDENTIAL_METADATA_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['createCredential', 'revealCredential', 'rotateCredential', 'revokeCredential', 'listApiKeys']) {
    assert.equal(fixture(raw).operation(other), undefined);
  }
});

test('credential metadata: detached execution revalidates arguments/resource/revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a/branches/br-a' },
    { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/credentials' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const value of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, value, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('credential metadata: invalid identities, ancestry, duplicates and oversized lists refuse before filtering', async () => {
  for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' },
    { ...raw, pagination: {} }, { credentials: null }, { credentials: {} },
    ...[null, true, 0, {}, [], '', 'x\n', 'аbc', 'x'.repeat(81)].map(token_id => ({ credentials: [credential, { token_id }] })),
    { credentials: [credential, credential] }, { credentials: [{ token_id: 'unselected' }, { token_id: 'unselected' }] },
    ...[{ branch_id: 'br-b' }, { project_id: 'other' }, { branch_id: null }, { pagination: {} }].map(extra =>
      ({ credentials: [credential, { token_id: 'unselected', ...extra }] })),
    { credentials: Array.from({ length: 31 }, (_, n) => ({ token_id: `unselected-${n}` })) },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['credentials', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  for (const key of ['token_id', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project({ credentials: [Object.defineProperty({ ...credential }, key,
      { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  assert.throws(() => op.project({ credentials: new Array(1) }));
  assert.throws(() => op.project({ credentials: Object.defineProperty([credential], '0', { get() { throw Error('getter'); }, enumerable: true }) }));
  for (const key of ['scopes', 'principal_type', 'name', 'token', 'secret', 'function_id', 'expires_at']) {
    assert.deepEqual(op.project({ credentials: [Object.defineProperty({ ...credential }, key,
      { get() { throw Error('unused getter'); }, enumerable: true })] }), expected);
  }
  const credentials = Array.from({ length: 30 }, (_, n) => ({ token_id: `id-${String(n).padStart(77, '0')}`, branch_id: 'br-a' }));
  assert.equal(credentials[0].token_id.length, 80);
  assert.deepEqual(await fixture({ credentials }, { ...scope, tokenIds: credentials.map(value => value.token_id) }).run(name, args), { credentials });
});

test('credential metadata: unavailable Beta and failed transport never fabricate empty results or reveal fallback', async () => {
  for (const status of [403, 404, 410, 500, 302]) {
    const f = fixture(() => response({ reason: 'credentials_not_available', ...poison }, { status }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  for (const value of [() => { throw Error(canary); }, () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
    () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('credential metadata: direct transport rejects malformed project/branch IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.listCredentials(value, args.branch_id, options));
    assert.throws(() => transport.listCredentials(args.project_id, value, options));
  }
  assert.equal(calls, 0);
});
