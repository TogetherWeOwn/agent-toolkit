import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthIntegrationOperations, AUTH_INTEGRATION_OPERATIONS } from '../dist/plugins/neon-broker/src/auth-integrations.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { MAX_ITEMS } from '../dist/plugins/neon-broker/src/metadata.js';
import { authIntegrationCases as cases, authIntegrationFixture as fixture, authIntegrationScope as scope,
  authIntegration as integration, canary, response } from './helpers.mjs';

const poison = { password: canary, client_secret: canary, db_name: canary, auth_provider_project_id: canary,
  jwks_url: canary, base_url: canary, name: canary, created_at: canary, message: canary };
const wrap = (name, value) => name === 'getNeonAuth' ? value : { data: [value] };
for (const [name, args, raw, expected] of cases) {
  test(`${name}: closed integration metadata and distinct authenticated GET path`, async () => {
    const f = fixture(wrap(name, { ...integration, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    const suffix = name === 'getNeonAuth' ? 'branches/br-a/auth' : 'auth/integrations';
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/${suffix}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!JSON.stringify(expected).includes(canary));
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: strict arguments refuse authority, updates and cross-target requests before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'auth_provider', 'owned_by'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'bad%2fname', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', 1, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execute revalidates resource, revision and canonical arguments`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/other/auth' }, { ...prepared.resource, revision: 'scope-v2' },
      { ...prepared.resource, id: name === 'getNeonAuth' ? 'neon/projects/project-a/auth/integrations' : 'neon/projects/project-a/branches/br-a/auth' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: malformed integration state and contradictory ancestry refuse`, async () => {
    const badRows = [null, [], {}, { ...integration, branch_id: 'unlisted' }, { ...integration, project_id: 'other' },
      ...['auth_provider', 'owned_by', 'transfer_status'].flatMap(key => [null, true, 'unknown', canary, 'neon\n'].map(value => ({ ...integration, [key]: value }))),
      { ...integration, pagination: {} }];
    for (const row of badRows) await assert.rejects(fixture(wrap(name, row)).run(name, args));
    for (const value of [null, [], {}, { ...raw, pagination: {} }, { ...raw, project_id: 'other' }]) {
      await assert.rejects(fixture(value).run(name, args));
    }
    assert.deepEqual(await fixture(wrap(name, { ...integration, project_id: 'project-a' })).run(name, args), expected);
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project(wrap(name, Object.assign(Object.create({ inherited: true }), integration))));
    for (const key of ['branch_id', 'auth_provider', 'owned_by', 'transfer_status', 'project_id', 'pagination']) {
      assert.throws(() => op.project(wrap(name, Object.defineProperty({ ...integration }, key,
        { get() { throw Error('getter'); }, enumerable: true }))));
    }
    assert.deepEqual(op.project(wrap(name, Object.defineProperty({ ...integration }, 'db_name',
      { get() { throw Error('unused getter'); }, enumerable: true }))), expected);
  });

  test(`${name}: unavailable legacy/native endpoints never fabricate success or fall back`, async () => {
    for (const status of [404, 410, 403, 500, 302]) {
      const f = fixture(() => response(poison, { status }));
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    for (const value of [() => { throw Error(canary); },
      () => new Response(JSON.stringify(raw), { headers: { 'content-type': 'text/plain' } }),
      () => response({ ...raw, ignored: 'x'.repeat(RESPONSE_BYTES) })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    const clean = fixture(raw);
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(clean.operation(name).execute(
      clean.operation(name).prepare(args), credential, new AbortController().signal));
    assert.equal(clean.requests.length, 0);
  });
}

test('branch detail rejects a different allowlisted branch rather than trusting membership alone', async () => {
  await assert.rejects(fixture({ ...integration, branch_id: 'br-b' }).run(cases[0][0], cases[0][1]), { message: 'OUTPUT_REFUSED' });
  await assert.rejects(fixture({ data: [integration], branch_id: 'br-a' }).run(cases[1][0], cases[1][1]), { message: 'OUTPUT_REFUSED' });
});

test('integration provider/ownership states preserve optional absence without inferring status', async () => {
  for (const auth_provider of ['mock', 'stack', 'better_auth']) for (const owned_by of ['user', 'neon']) {
    for (const transfer of [{}, { transfer_status: 'initiated' }, { transfer_status: 'finished' }]) {
      const row = { branch_id: 'br-a', auth_provider, owned_by, ...transfer };
      for (const [name, args] of cases) assert.deepEqual(await fixture(wrap(name, row)).run(name, args), wrap(name, row));
    }
  }
});

test('legacy integration lists are bounded, unique and reject pagination, sparse arrays and accessors', async () => {
  const [name, args] = cases[1];
  assert.deepEqual(await fixture({ data: [] }).run(name, args), { data: [] });
  const branchIds = Array.from({ length: MAX_ITEMS }, (_, n) => `br-${n}`);
  const data = branchIds.map(branch_id => ({ ...integration, branch_id }));
  assert.deepEqual(await fixture({ data }, { ...scope, branchIds }).run(name, args), { data });
  for (const raw of [{ data: [integration, integration] }, { data: [...data, integration] }, { data: null },
    { data: [integration], pagination: { cursor: 'more' } }]) await assert.rejects(fixture(raw).run(name, args));
  const op = fixture({}).operation(name);
  for (const data of [new Array(1), Object.assign([integration], { extra: canary }),
    Object.defineProperty([integration], '0', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project({ data }));
  assert.throws(() => op.project(Object.defineProperty({}, 'data', { get() { throw Error('getter'); }, enumerable: true })));
});

test('integration scope is copied, bounded, unique and exposes no credential-bearing or write tools', () => {
  const config = structuredClone(scope);
  const ops = createNeonAuthIntegrationOperations(config, {});
  config.projectId = 'other';
  config.branchIds.push('unlisted');
  assert.equal(ops[0].prepare(cases[0][1]).resource.revision, 'scope-v1');
  assert.throws(() => ops[0].prepare({ project_id: 'project-a', branch_id: 'unlisted' }));
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { branchIds: new Array(1) }, { branchIds: ['br-a\n'] },
    { branchIds: Array.from({ length: MAX_ITEMS + 1 }, (_, n) => `br-${n}`) }, { approved: true }]) {
    assert.throws(() => createNeonAuthIntegrationOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(ops.map(op => op.name), AUTH_INTEGRATION_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['createNeonAuth', 'disableNeonAuth', 'transferNeonAuthProviderProject', 'createNeonAuthProviderSDKKeys',
    'getNeonAuthEmailServer', 'listNeonAuthOauthProviders', 'sql']) assert.equal(fixture({}).operation(name), undefined);
});

test('integration transport refuses project/branch path injection without fetching', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а']) {
    assert.throws(() => transport.getNeonAuth(bad, 'br-a', options));
    assert.throws(() => transport.getNeonAuth('project-a', bad, options));
    assert.throws(() => transport.listNeonAuthIntegrations(bad, options));
  }
  assert.equal(calls, 0);
});
