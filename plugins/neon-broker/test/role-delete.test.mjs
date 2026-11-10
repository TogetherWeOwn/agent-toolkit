import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonRoleDeleteOperations } from '../dist/plugins/neon-broker/src/role-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { roleDeleteFixture as fixture, roleDeleteArgs as args, roleDeleteScope as scope,
  roleDeleteReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { name: 'reader', branch_id: 'br-a', acknowledged: true,
  operations: receipt.operations.map(({ id, status }) => ({ id, status })) };

 test('role deletion: exact name/branch/creation fingerprint and unprotected preflight then one bodyless DELETE acknowledges only', async () => {
  const f = fixture({ ...receipt, role: { ...receipt.role, password: canary, authentication_method: canary, updated_at: canary } });
  assert.deepEqual(await f.run('deleteProjectBranchRole', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/roles/reader`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchRole');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/roles/reader/delete');
  assert.equal(op.prepare(args).plan.expected_created_at, scope.expectedCreatedAt);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.deepEqual(await fixture({ ...receipt, operations: [] }).run('deleteProjectBranchRole', args), { ...expected, operations: [] });
});

test('role deletion: copied exact scope and plan reject identity, SQL and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonRoleDeleteOperations(config, {});
  config.expectedCreatedAt = '2026-11-09T10:00:00Z';
  assert.equal(op.prepare(args).plan.expected_created_at, scope.expectedCreatedAt);
  for (const raw of [null, [], {}, { ...args, role_name: 'other' }, { ...args, branch_id: 'br-other' }, { ...args, project_id: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'expected_created_at', 'role_id', 'sql', 'cascade', 'timeout']
      .map(key => ({ ...args, [key]: true })), Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'role_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranchRole').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, expected_created_at: config.expectedCreatedAt } }, { plan: { ...p.plan, connectionFence: true } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectBranchRole').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectBranchRole').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '-project' }, { branchId: 'br-' }, { roleName: '../role' }, { roleName: 'x'.repeat(64) },
    ...[null, '', 'not-a-timestamp', '2026-11-08T10:00:00', '2026-11-08T10:00:00Z\n'].map(expectedCreatedAt => ({ expectedCreatedAt })), { approved: true }]) {
    assert.throws(() => createNeonRoleDeleteOperations({ ...scope, ...change }, {}));
  }
});

test('role deletion: mandatory preflight refuses protected, missing protection, changed creation fingerprint and contradictory ancestry', async () => {
  for (const raw of [null, {}, { role: {} }, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' },
    ...[{ name: 'other' }, { branch_id: 'br-other' }, { branch_id: undefined }, { protected: true }, { protected: undefined }, { protected: 'false' },
      { created_at: '2026-11-09T10:00:00Z' }, { created_at: undefined }, { created_at: null }, { role_name: 'other' }, { project_id: 'other' }, { pagination: {} }]
      .map(change => ({ role: { ...receipt.role, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchRole', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchRole', args));
    assert.equal(f.requests.length, 1);
  }
});

test('role deletion: ambiguity observes once, never retries or treats absence or changed fingerprint as completion', async () => {
  for (const followup of [receipt, null, { role: {} }, { role: { ...receipt.role, created_at: '2026-11-09T10:00:00Z' } }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? receipt : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
  }
  const f = fixture((url, init, n) => n === 1 ? response(receipt) : new Response(null, { status: init.method === 'DELETE' ? 204 : 404 }));
  await assert.rejects(f.run('deleteProjectBranchRole', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
});

test('role deletion: only HTTP200 bounded JSON acknowledges without provider refusal bypass', async () => {
  for (const make of [() => response(receipt, { status: 202 }), () => new Response(null, { status: 204 }),
    ...[403, 404, 409, 422, 500, 302].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(receipt));
    await assert.rejects(f.run('deleteProjectBranchRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('role deletion: closed receipt refuses protected/changed identities and duplicate/foreign/unbounded operations without reading passwords', async () => {
  const op = fixture().operation('deleteProjectBranchRole');
  for (const raw of [null, [], {}, { role: {} }, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' },
    ...[{ name: 'other' }, { branch_id: 'br-other' }, { protected: true }, { protected: undefined }, { created_at: '2026-11-09T10:00:00Z' }]
      .map(change => ({ ...receipt, role: { ...receipt.role, ...change } })),
    ...[undefined, null, [...receipt.operations, ...receipt.operations], Array(31).fill(receipt.operations[0]),
      ...[{ project_id: 'other' }, { branch_id: 'br-other' }, { id: 'bad' }, { status: 'unknown' }, { pagination: {} }]
        .map(change => [{ ...receipt.operations[0], ...change }])].map(operations => ({ ...receipt, operations }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('deleteProjectBranchRole', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => op.project(raw));
  }
  const role = { ...receipt.role };
  const operation = { ...receipt.operations[0] };
  for (const key of ['password', 'connection_uri', 'authentication_method', 'updated_at']) {
    Object.defineProperty(role, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  for (const key of ['action', 'endpoint_id', 'error', 'created_at', 'total_duration_ms']) {
    Object.defineProperty(operation, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  assert.deepEqual(op.project({ role, operations: [operation] }), expected);
  assert.throws(() => op.project({ ...receipt, role: Object.defineProperty({ ...receipt.role }, 'created_at', { get() { throw Error('getter'); }, enumerable: true }) }));
});

test('role deletion: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(receipt); });
  await assert.rejects(f.run('deleteProjectBranchRole', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'DELETE') { during.abort(); throw Error(canary); }
    return response(receipt);
  });
  await assert.rejects(g.run('deleteProjectBranchRole', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(receipt));
  await assert.rejects(h.run('deleteProjectBranchRole', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('role deletion: accepted IDs and role names fit GET and DELETE; path/header injection refuses', async () => {
  for (const [projectId, branchId, roleName] of [['p', 'br-0', '_'], ['p'.repeat(60), 'br-' + 'b'.repeat(57), 'R'.repeat(63)]]) {
    const config = { ...scope, projectId, branchId, roleName };
    const raw = { role: { name: roleName, branch_id: branchId, created_at: scope.expectedCreatedAt, protected: false }, operations: [] };
    const f = fixture(raw, config);
    assert.deepEqual(await f.run('deleteProjectBranchRole', { project_id: projectId, branch_id: branchId, role_name: roleName }),
      { name: roleName, branch_id: branchId, acknowledged: true, operations: [] });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(64), 'é']) {
    assert.throws(() => transport.deleteProjectBranchRole('project-a', 'br-a', bad, options));
  }
  assert.throws(() => transport.deleteProjectBranchRole('x/y', 'br-a', 'reader', options));
  assert.throws(() => transport.deleteProjectBranchRole('project-a', 'x/y', 'reader', options));
  await assert.rejects(transport.deleteProjectBranchRole('project-a', 'br-a', 'reader', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchRole('project-a', 'br-a', 'reader', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
