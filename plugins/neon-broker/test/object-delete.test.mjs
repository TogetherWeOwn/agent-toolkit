import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonObjectDeleteOperations } from '../dist/plugins/neon-broker/src/object-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { objectDeleteFixture as fixture, objectDeleteArgs as args, objectDeleteScope as scope,
  objectDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = { objects: [metadata], folders: [], prefix: scope.objectKey, is_truncated: false };

test('Object delete: terminal prefix-list exact key/size preflight precedes one encoded bodyless DELETE', async () => {
  const f = fixture();
  const result = await f.run('deleteProjectBranchBucketObject', args);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/buckets/assets/objects?limit=10&prefix=docs%2Ffile.txt`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/buckets/assets/objects/docs%2Ffile.txt`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchBucketObject');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/buckets/assets/objects/docs/file.txt/delete');
  assert.equal(op.prepare(args).plan.expected_size, 123);
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const key of ['deletionVerified', 'objectIdentityVerified', 'connectionFence']) assert.equal(op.prepare(args).plan[key], false);
  for (const name of ['deleteProjectBranchBucketObjectsByPrefix', 'getProjectBranchBucketObject', 'presignProjectBranchBucketObject']) assert.equal(f.operation(name), undefined);
});

test('Object delete: copied scope, strict arguments and exact plan refuse target, size and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonObjectDeleteOperations(config, {});
  config.objectKey = 'other';
  config.expectedSize = 0;
  assert.equal(op.prepare(args).plan.object_key, scope.objectKey);
  assert.equal(op.prepare(args).plan.expected_size, scope.expectedSize);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'bucket_name', 'object_key'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'expected_size', 'prefix', 'etag', 'version_id'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'object_key', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation('deleteProjectBranchBucketObject').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['object_key', 'expected_size', 'effect', 'deletionVerified'].map(key => ({ plan: { ...p.plan, [key]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation('deleteProjectBranchBucketObject').execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation('deleteProjectBranchBucketObject').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: 'Upper' }, { projectId: '-' }, { branchId: '-branch' },
    ...['', 'a.b', '../id', 'a?query', 'a\n', 'a'.repeat(61)].map(bucketName => ({ bucketName })),
    ...['', '../id', 'a/../b', 'a//b', 'a/./b', 'a?query', 'a\n', 'a%2Fb', 'é', 'a'.repeat(81)].map(objectKey => ({ objectKey })),
    ...[-1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, '123', null].map(expectedSize => ({ expectedSize })),
    { revision: '' }, { approved: true }, { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 's'.repeat(60), objectKey: 'k'.repeat(80) }]) assert.throws(() => createNeonObjectDeleteOperations({ ...scope, ...change }, {}));
});

test('Object delete: malformed, absent, size drift, duplicate, foreign and truncated lists refuse before DELETE', async () => {
  for (const raw of [null, {}, [], { ...listed, objects: null }, { ...listed, objects: [] }, { ...listed, objects: [{ ...metadata, key: scope.objectKey + '.other' }] },
    ...[{ size: 124 }, { size: -1 }, { size: 0.5 }, { size: Number.MAX_SAFE_INTEGER + 1 }, { size: null }, { key: null },
      { key: 'other' }, { project_id: 'other' }, { branch_id: 'other' }, { bucket_name: 'other' }, { pagination: {} }]
      .map(change => ({ ...listed, objects: [{ ...metadata, ...change }] })),
    { ...listed, objects: [metadata, metadata] }, { ...listed, objects: [metadata, { key: scope.objectKey + '.other', size: null }] },
    { ...listed, objects: Array.from({ length: 11 }, (_, i) => ({ ...metadata, key: i ? scope.objectKey + i : metadata.key })) },
    ...[{ project_id: 'other' }, { branch_id: 'other' }, { bucket_name: 'other' }, { prefix: 'other' }, { folders: ['folder/'] },
      { pagination: {} }, { is_truncated: true }, { is_truncated: null }, { next_cursor: 'unexpected' }].map(change => ({ ...listed, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchBucketObject', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchBucketObject', args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture(() => new Response('{"objects":[{"key":"docs/file.txt","size":-0}],"folders":[],"prefix":"docs/file.txt","is_truncated":false}', { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(f.run('deleteProjectBranchBucketObject', args));
  assert.equal(f.requests.length, 1);
});

test('Object delete: early presence cannot bypass later-page validation, cycles or three-page ceiling', async () => {
  for (const followup of [{ ...listed, objects: [metadata] }, { ...listed, branch_id: 'other', objects: [] },
    { ...listed, objects: [], is_truncated: true, next_cursor: 'next' }]) {
    const f = fixture((url, init, n) => response(n === 1 ? { ...listed, is_truncated: true, next_cursor: 'next' } : followup));
    await assert.rejects(f.run('deleteProjectBranchBucketObject', args));
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 0);
  }
  const f = fixture((url, init, n) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response(n === 1 ? { ...listed, is_truncated: true, next_cursor: 'next' } : { ...listed, objects: [] }));
  assert.deepEqual(await f.run('deleteProjectBranchBucketObject', args), expected);
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), 'next');
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'DELETE']);
  const g = fixture((url, init, n) => response({ ...listed, objects: n === 1 ? [metadata] : [], is_truncated: true, next_cursor: String(n) }));
  await assert.rejects(g.run('deleteProjectBranchBucketObject', args));
  assert.equal(g.requests.length, 3);
  const h = fixture((url, init, n) => init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ ...listed,
    objects: n === 1 ? [metadata] : Array.from({ length: 10 }, (_, i) => ({ key: scope.objectKey + `-${n}-${i}`, size: i })),
    is_truncated: n < 3, ...(n < 3 ? { next_cursor: String(n) } : {}) }));
  assert.deepEqual(await h.run('deleteProjectBranchBucketObject', args), expected);
  assert.equal(h.requests.length, 4);
});

test('Object delete: ambiguity observes one bounded list and never upgrades absence or same-key replacement to success', async () => {
  for (const followup of [{ ...listed, objects: [] }, listed, { ...listed, objects: [{ ...metadata, size: 124 }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchBucketObject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => {
    if (init.method === 'DELETE') throw Error(canary);
    return response(n === 1 ? listed : { ...listed, objects: [], is_truncated: n < 5, ...(n < 5 ? { next_cursor: String(n) } : {}) });
  });
  await assert.rejects(f.run('deleteProjectBranchBucketObject', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET', 'GET', 'GET']);
});

test('Object delete: only empty HTTP204 acknowledges; redirects/errors/body/length mismatch remain uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    ...['1', 'invalid', String(RESPONSE_BYTES + 1)].map(length => () => new Response(null, { status: 204, headers: { 'content-length': length } })),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteProjectBranchBucketObject', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Response(null, { status: 204, headers: { 'content-length': '0' } }) : response(listed));
  assert.deepEqual(await f.run('deleteProjectBranchBucketObject', args), expected);
});

test('Object delete: hashes, timestamps and content never evaluated; projection stays closed', async () => {
  const value = { ...metadata };
  for (const name of ['etag', 'last_modified', 'content', 'origin_branch_id', 'error', 'secret']) Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  const [direct] = createNeonObjectDeleteOperations(scope, {
    async listProjectBranchBucketObjects() { return { ...listed, objects: [value] }; }, async deleteProjectBranchBucketObject() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, object_key: scope.objectKey },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonObjectDeleteOperations(scope, {
    async listProjectBranchBucketObjects() { return { ...listed, objects: [Object.defineProperty({ ...metadata }, 'key', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async deleteProjectBranchBucketObject() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
});

test('Object delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('deleteProjectBranchBucketObject', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteProjectBranchBucketObject', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Object delete: composed resource boundary and zero/max-size controls work; injection never fetches', async () => {
  // Fixed resource punctuation uses 49 characters; exact 256 boundary remains valid.
  const configs = [{ ...scope, projectId: 'a', branchId: 'a', bucketName: 'a', objectKey: 'a', expectedSize: 0 },
    { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 's'.repeat(7), objectKey: 'k'.repeat(80), expectedSize: Number.MAX_SAFE_INTEGER, revision: 'r'.repeat(80) }];
  for (const config of configs) {
    const f = fixture(null, config);
    const input = { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName, object_key: config.objectKey };
    assert.deepEqual(await f.run('deleteProjectBranchBucketObject', input), expected);
    assert(f.operation('deleteProjectBranchBucketObject').prepare(input).resource.id.length <= 256);
  }
  assert.equal(fixture(null, configs[1]).operation('deleteProjectBranchBucketObject').prepare({ project_id: configs[1].projectId, branch_id: configs[1].branchId, bucket_name: configs[1].bucketName, object_key: configs[1].objectKey }).resource.id.length, 256);
  assert.throws(() => createNeonObjectDeleteOperations({ ...configs[1], bucketName: 's'.repeat(8) }, {}));
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', 'a/../b', 'a//b', 'a?query', 'a\n', 'a%2Fb', 'a'.repeat(81)]) assert.throws(() => transport.deleteProjectBranchBucketObject('project-a', 'br-a', 'assets', bad, options));
  for (const bad of ['', '../id', 'a.b', 'a?query', 'a\n', 'a'.repeat(61)]) assert.throws(() => transport.deleteProjectBranchBucketObject('project-a', 'br-a', bad, scope.objectKey, options));
  await assert.rejects(transport.deleteProjectBranchBucketObject('project-a', 'br-a', 'assets', scope.objectKey, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchBucketObject('project-a', 'br-a', 'assets', scope.objectKey, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
