import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectDeleteOperations } from '../dist/plugins/neon-broker/src/project-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectDeleteFixture as fixture, projectDeleteArgs as args, projectDeleteScope as scope,
  projectDeleteReceipt as receipt, canary, response } from './helpers.mjs';

const expected = { id: 'project-a', acknowledged: true };

test('project deletion: exact owner preflight then one bodyless DELETE acknowledges the explicit cascade only', async () => {
  const f = fixture({ project: { ...receipt.project, name: canary, proxy_host: canary, owner: { email: canary } } });
  assert.deepEqual(await f.run('deleteProject', args), expected);
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  for (const { url, init } of f.requests) {
    assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProject');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/delete');
  assert.equal(op.prepare(args).plan.organization_id, scope.organizationId);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  assert.equal(op.prepare(args).plan.connectionFence, false);
  assert.deepEqual(op.prepare(args).plan.cascade, ['endpoints', 'branches', 'databases', 'users']);
  assert.deepEqual(await fixture({ ...receipt, org_id: 'org-a', project: { ...receipt.project, org_id: 'org-a' } }).run('deleteProject', args), expected);
});

test('project deletion: copied exact scope and plan reject owner, cascade, authority and recovery overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonProjectDeleteOperations(config, {});
  config.organizationId = 'org-other';
  assert.equal(op.prepare(args).plan.organization_id, 'org-a');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'force', 'runtimeContext', 'cascade', 'owner_id', 'org_id', 'recover', 'timeout']
      .map(key => ({ ...args, [key]: true })), Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProject').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, cascade: [] } }, { plan: { ...p.plan, organization_id: 'org-other' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProject').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProject').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '-project' }, { projectId: '' }, { organizationId: null }, { organizationId: '-org' },
    { approved: true }, { projectId: 'p'.repeat(61) }, { organizationId: 'org-а' }]) assert.throws(() => createNeonProjectDeleteOperations({ ...scope, ...change }, {}));
});

test('project deletion: mandatory exact project and owner plus contradictory organization refuse before mutation', async () => {
  for (const raw of [null, {}, { project: {} }, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' }, { ...receipt, org_id: 'org-other' },
    ...[{ id: 'other' }, { id: undefined }, { owner_id: 'org-other' }, { owner_id: undefined }, { owner_id: null },
      { org_id: 'org-other' }, { org_id: null }, { project_id: 'other' }, { pagination: {} }]
      .map(change => ({ project: { ...receipt.project, ...change } }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProject', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProject', args));
    assert.equal(f.requests.length, 1);
  }
});

test('project deletion: ambiguity observes once but absence or surviving project never proves completed cascade or retries', async () => {
  for (const followup of [receipt, null, { project: {} }, { project: { ...receipt.project, org_id: 'org-other' } }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? receipt : followup);
    });
    await assert.rejects(f.run('deleteProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
  }
  const f = fixture((url, init, n) => n === 1 ? response(receipt) : new Response(null, { status: init.method === 'DELETE' ? 204 : 404 }));
  await assert.rejects(f.run('deleteProject', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
});

test('project deletion: only HTTP200 bounded JSON acknowledges, without recovery or provider refusal bypass', async () => {
  for (const make of [() => response(receipt, { status: 202 }), () => new Response(null, { status: 204 }),
    ...[403, 404, 409, 422, 500, 302].map(status => () => response({ error: canary }, { status })),
    () => response(receipt, { headers: { 'content-type': 'text/plain' } }), () => response({ ignored: 'x'.repeat(RESPONSE_BYTES) }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(receipt));
    await assert.rejects(f.run('deleteProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('project deletion: closed identity acknowledgement rejects reassociation and never evaluates unused project data', async () => {
  const op = fixture().operation('deleteProject');
  for (const raw of [null, [], {}, { project: {} }, { ...receipt, pagination: {} }, { ...receipt, project_id: 'other' },
    { ...receipt, org_id: 'org-other' }, ...[{ id: 'other' }, { owner_id: 'org-other' }, { owner_id: undefined }, { org_id: 'org-other' },
      { pagination: {} }].map(change => ({ project: { ...receipt.project, ...change } }))]) {
    const f = fixture(raw);
    await assert.rejects(f.run('deleteProject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
    assert.throws(() => op.project(raw));
  }
  const ignored = { ...receipt.project };
  for (const key of ['name', 'proxy_host', 'owner', 'settings', 'compute_time_seconds', 'created_at', 'deleted_at']) {
    Object.defineProperty(ignored, key, { get() { throw Error('unused'); }, enumerable: true });
  }
  const raw = { project: ignored };
  Object.defineProperty(raw, 'operations', { get() { throw Error('unused'); }, enumerable: true });
  assert.deepEqual(op.project(raw), expected);
  const consumed = Object.defineProperty({ ...receipt.project }, 'owner_id', { get() { throw Error('getter'); }, enumerable: true });
  assert.throws(() => op.project({ project: consumed }));
});

test('project deletion: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  const beforeAbort = new AbortController();
  const f = fixture(() => { beforeAbort.abort(); return response(receipt); });
  await assert.rejects(f.run('deleteProject', args, beforeAbort.signal));
  assert.equal(f.requests.length, 1);
  const during = new AbortController();
  const g = fixture((url, init) => {
    if (init.method === 'DELETE') { during.abort(); throw Error(canary); }
    return response(receipt);
  });
  await assert.rejects(g.run('deleteProject', args, during.signal), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(g.requests.length, 2);
  const h = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(receipt));
  await assert.rejects(h.run('deleteProject', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(h.requests.length, 3);
});

test('project deletion: accepted IDs fit GET and DELETE; path/header injection refuses', async () => {
  for (const projectId of ['p', '0', 'p-', 'p'.repeat(60)]) {
    const config = { ...scope, projectId };
    const f = fixture({ project: { id: projectId, owner_id: config.organizationId } }, config);
    assert.deepEqual(await f.run('deleteProject', { project_id: projectId }), { id: projectId, acknowledged: true });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE']);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../escape', 'x/y', 'x?query', 'x\n', 'x'.repeat(61), 'UPPER']) assert.throws(() => transport.deleteProject(bad, options));
  await assert.rejects(transport.deleteProject('project-a', { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProject('project-a', { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
