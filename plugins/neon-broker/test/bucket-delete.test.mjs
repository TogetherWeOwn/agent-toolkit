import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBucketDeleteOperations } from '../dist/plugins/neon-broker/src/bucket-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { bucketDeleteFixture as fixture, bucketDeleteArgs as args, bucketDeleteScope as scope,
  bucketDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = { buckets: [metadata] };

test('Bucket delete: bounded presence/access preflight precedes one bodyless DELETE; HTTP204 acknowledges only', async () => {
  const f = fixture();
  const result = await f.run('deleteProjectBranchBucket', args);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/buckets`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/buckets/assets`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchBucket');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/buckets/assets/delete');
  assert.equal(op.prepare(args).plan.expected_access_level, 'private');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const key of ['deletionVerified', 'objectCompletenessVerified', 'connectionFence']) assert.equal(op.prepare(args).plan[key], false);
  for (const name of ['createProjectBranchBucket', 'deleteProjectBranchBucketObjectsByPrefix']) assert.equal(f.operation(name), undefined);
});

test('Bucket delete: copied scope and exact plan reject target, access and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonBucketDeleteOperations(config, {});
  config.bucketName = 'other';
  config.expectedAccessLevel = 'public_read';
  assert.equal(op.prepare(args).plan.bucket_name, scope.bucketName);
  assert.equal(op.prepare(args).plan.expected_access_level, scope.expectedAccessLevel);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'bucket_name'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'access_level', 'cascade'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'bucket_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranchBucket').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['bucket_name', 'expected_access_level', 'effect', 'deletionVerified'].map(key => ({ plan: { ...p.plan, [key]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation('deleteProjectBranchBucket').execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation('deleteProjectBranchBucket').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { branchId: 'x'.repeat(61) },
    { projectId: '-' }, { branchId: '-branch' },
    ...['', 'A', '../id', 'a?query', 'a\n', 'a'.repeat(61)].map(bucketName => ({ bucketName })),
    { expectedAccessLevel: 'unknown' }, { revision: '' }, { approved: true }]) assert.throws(() => createNeonBucketDeleteOperations({ ...scope, ...change }, {}));
});

test('Bucket delete: absent, access drift, duplicate, malformed, foreign and oversized lists refuse before DELETE', async () => {
  for (const raw of [null, {}, [], { buckets: null }, { buckets: [] }, { buckets: [{ ...metadata, name: 'other' }] },
    ...[{ access_level: 'public_read' }, { access_level: 'unknown' }, { name: null }, { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }]
      .map(change => ({ buckets: [{ ...metadata, ...change }] })),
    { buckets: [metadata, metadata] }, { buckets: [metadata, { name: 'other', access_level: null }] },
    { buckets: Array.from({ length: 31 }, (_, i) => ({ ...metadata, name: i ? `other-${i}` : metadata.name })) },
    { ...listed, project_id: 'other' }, { ...listed, branch_id: 'other' }, { ...listed, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchBucket', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchBucket', args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ buckets:
    Array.from({ length: 30 }, (_, i) => ({ ...metadata, name: i ? `other-${i}` : metadata.name })) }));
  assert.deepEqual(await f.run('deleteProjectBranchBucket', args), expected);
});

test('Bucket delete: ambiguity observes once without retry or upgrading absence/access drift to success', async () => {
  for (const followup of [{ buckets: [] }, listed, { buckets: [{ ...metadata, access_level: 'public_read' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchBucket', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Bucket delete: only empty HTTP204 acknowledges; failures, redirects and malformed lengths stay uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    () => new Response(null, { status: 204, headers: { 'content-length': '1' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': 'invalid' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteProjectBranchBucket', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run('deleteProjectBranchBucket', args), expected);
});

test('Bucket delete: creation, origin and object metadata are never evaluated or emitted', async () => {
  const value = { ...metadata };
  for (const name of ['created_at', 'objects', 'origin_branch_id', 'error', 'secret']) Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  const [direct] = createNeonBucketDeleteOperations(scope, {
    async listProjectBranchBuckets() { return { buckets: [value] }; }, async deleteProjectBranchBucket() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, bucket_name: scope.bucketName },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonBucketDeleteOperations(scope, {
    async listProjectBranchBuckets() { return { buckets: [Object.defineProperty({ ...metadata }, 'name', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async deleteProjectBranchBucket() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
});

test('Bucket delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('deleteProjectBranchBucket', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteProjectBranchBucket', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Bucket delete: maximum/minimum names and public-read controls work; injection refuses before fetch', async () => {
  for (const config of [{ ...scope, projectId: 'a', branchId: 'a', bucketName: 'a', expectedAccessLevel: 'public_read' },
    { ...scope, bucketName: 'a.b-c_d' },
    { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 's'.repeat(60), revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('deleteProjectBranchBucket', { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName }), expected);
  }
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', '-id', 'a?query', 'a\n', 'a'.repeat(256), 'A']) assert.throws(() => transport.deleteProjectBranchBucket('project-a', 'br-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) {
    assert.throws(() => transport.deleteProjectBranchBucket(bad, 'br-a', scope.bucketName, options));
    assert.throws(() => transport.deleteProjectBranchBucket('project-a', bad, scope.bucketName, options));
  }
  await assert.rejects(transport.deleteProjectBranchBucket('project-a', 'br-a', scope.bucketName, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchBucket('project-a', 'br-a', scope.bucketName, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
