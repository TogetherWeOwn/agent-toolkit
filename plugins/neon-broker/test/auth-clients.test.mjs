import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthClientOperations, AUTH_CLIENT_OPERATIONS, MAX_AUTH_CLIENT_BINDINGS } from '../dist/plugins/neon-broker/src/auth-clients.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { authClientCases as cases, authClientFixture as fixture, authClientScope as scope, authClient as client, canary, response } from './helpers.mjs';

const poison = { name: canary, redirect_uris: [canary], resources: [canary], created_at: canary, client_secret: canary, message: canary };
const wrap = (name, value) => name === 'getNeonAuthOAuthClient' ? value : { clients: [value] };
const context = (name, value) => ({ branch_id: 'br-a', ...(name === 'getNeonAuthOAuthClient' ? { client: value } : { clients: [value] }) });
for (const [name, args, raw, expected] of cases) {
  test(`${name}: exact authenticated GET and closed OAuth-client metadata`, async () => {
    const f = fixture(wrap(name, { ...client, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const suffix = `branches/br-a/auth/oauth-provider/clients${args.client_id ? '/ClientA' : ''}`;
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/${suffix}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: canonical arguments reject caller authority and unbound targets before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'client_secret'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', true, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    if (args.client_id) for (const value of ['ClientB', 'Unknown', 'has-hyphen', 'has_underscore', 'x'.repeat(65)]) {
      assert.throws(() => f.operation(name).prepare({ ...args, client_id: value }));
    }
    for (const key of ['project_id', 'branch_id']) for (const value of ['Upper', 'has_underscore', 'x'.repeat(61)]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates scope revision, resource and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/sibling` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: selected malformed metadata and contradictory ancestry refuse`, async () => {
    for (const value of [null, [], {}, { ...client, project_id: 'other' }, { ...client, branch_id: 'br-b' }, { ...client, pagination: {} },
      ...['type', 'skip_consent', 'disabled'].flatMap(key => [null, 1, 'unknown', undefined].map(value => ({ ...client, [key]: value }))),
    ]) await assert.rejects(fixture(wrap(name, value)).run(name, args));
    for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' }, { ...raw, pagination: {} }]) {
      await assert.rejects(fixture(value).run(name, args));
    }
    const op = fOperation(name);
    for (const key of ['client_id', 'type', 'skip_consent', 'disabled', 'project_id', 'branch_id', 'pagination']) {
      assert.throws(() => op.project(context(name, Object.defineProperty({ ...client }, key, { get() { throw Error('getter'); }, enumerable: true }))));
    }
    assert.deepEqual(op.project(context(name, Object.defineProperty({ ...client }, 'client_secret', { get() { throw Error('unused getter'); }, enumerable: true }))), expected);
    assert.deepEqual(await fixture(wrap(name, { ...client, project_id: 'project-a', branch_id: 'br-a' })).run(name, args), expected);
  });

  test(`${name}: public/confidential and consent/disabled booleans remain independent`, async () => {
    for (const type of ['public', 'confidential']) for (const skip_consent of [true, false]) for (const disabled of [true, false]) {
      const value = { ...client, type, skip_consent, disabled };
      assert.deepEqual(await fixture(wrap(name, value)).run(name, args), wrap(name, value));
    }
  });

  test(`${name}: unavailable beta endpoints and unsafe transport never fabricate empty/disabled success`, async () => {
    for (const status of [404, 403, 410, 500, 302]) {
      const f = fixture(() => response(poison, { status }));
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
}
function fOperation(name) { return fixture({}).operation(name); }

test('OAuth-client detail is unwrapped, matches the exact requested ID and never falls back', async () => {
  const [name, args] = cases[1];
  for (const raw of [{ client }, { ...client, client_id: 'ClientC' }, { ...client, client_id: 'ClientB' }, { ...client, client_id: 'unlisted' }]) {
    const f = fixture(raw);
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('OAuth-client lists filter unbound clients per requested branch, reject duplicates and never truncate', async () => {
  const [name, args] = cases[0];
  assert.deepEqual(await fixture({ clients: [] }).run(name, args), { clients: [] });
  assert.deepEqual(await fixture({ clients: [{ client_id: 'unselected-client', ...poison }, { ...client, client_id: 'ClientB' }, client] }).run(name, args), { clients: [client] });
  for (const raw of [{ clients: Array(31).fill(client) }, { clients: [client, client] },
    { clients: [{ client_id: 'unselected' }, { client_id: 'unselected' }] }, { clients: [client], pagination: {} },
    { clients: [{ ...client, branch_id: 'br-b' }] }]) await assert.rejects(fixture(raw).run(name, args));
  const op = fOperation(name);
  for (const clients of [new Array(1), Object.assign([client], { extra: canary }),
    Object.defineProperty([client], '0', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project({ branch_id: 'br-a', clients }));
  assert.throws(() => op.project({ clients: [client] }));
});

test('OAuth-client scope copies bounded unique branch/client bindings and exposes no mutations or secret tools', () => {
  const config = structuredClone(scope);
  const ops = createNeonAuthClientOperations(config, {});
  config.clients[0].id = 'Changed';
  config.branchIds.push('unlisted');
  assert.equal(ops[1].prepare(cases[1][1]).resource.revision, 'scope-v1');
  for (const changed of [{ clients: [scope.clients[0], scope.clients[0]] }, { clients: [{ id: 'ClientA', branchId: 'unlisted' }] },
    { branchIds: ['br-a', 'br-a'] }, { clients: [{ id: 'has-hyphen', branchId: 'br-a' }] }, { clients: [{ id: 'x'.repeat(65), branchId: 'br-a' }] },
    { clients: new Array(1) }, { branchIds: Array.from({ length: MAX_AUTH_CLIENT_BINDINGS + 1 }, (_, n) => `br-${n}`) },
    { clients: Array.from({ length: MAX_AUTH_CLIENT_BINDINGS + 1 }, (_, n) => ({ id: `Client${n}`, branchId: 'br-a' })) }, { approved: true },
  ]) assert.throws(() => createNeonAuthClientOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(ops.map(op => op.name), AUTH_CLIENT_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['createNeonAuthOAuthClient', 'updateNeonAuthOAuthClient', 'deleteNeonAuthOAuthClient', 'rotateNeonAuthOAuthClientSecret', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('OAuth-client transport enforces pinned path alphabets and lengths without fetching', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а', 'Upper', 'has_underscore', 'x'.repeat(61), '']) {
    assert.throws(() => transport.listNeonAuthOAuthClients(bad, 'br-a', options));
    assert.throws(() => transport.listNeonAuthOAuthClients('project-a', bad, options));
    assert.throws(() => transport.getNeonAuthOAuthClient(bad, 'br-a', 'ClientA', options));
    assert.throws(() => transport.getNeonAuthOAuthClient('project-a', bad, 'ClientA', options));
  }
  for (const bad of ['has-hyphen', 'has_underscore', '', 'x'.repeat(65), 'x\n', 'x/y', 'x?']) {
    assert.throws(() => transport.getNeonAuthOAuthClient('project-a', 'br-a', bad, options));
  }
  assert.equal(calls, 0);
});
