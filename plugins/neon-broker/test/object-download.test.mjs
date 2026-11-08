import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonObjectDownloadOperations, OBJECT_DOWNLOAD_OPERATIONS } from '../dist/plugins/neon-broker/src/object-download.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { objectDownloadCases as cases, objectDownloadFixture as fixture, objectDownloadScope as scope,
  binaryResponse, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const options = () => ({ credential: canary, signal: new AbortController().signal });
const badKeys = ['', '.', '..', 'a/../b', 'a/./b', 'a//b', '/a', 'a/', 'x%2fy', 'x?token=x', 'x#fragment', 'x\\y', 'x\n', 'іmages/a', 'x'.repeat(81)];

test('object byte observation: exact copied target, fixed encoded path and count-only output', async () => {
  const f = fixture(raw);
  assert.deepEqual(await f.run(name, args), expected);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/buckets/assets/objects/images%2Fa.png/download`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.deepEqual(init.headers, { Authorization: `Bearer ${canary}`, Accept: 'application/octet-stream' });
  assert.equal(init.body, undefined);
  const op = f.operation(name);
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/buckets/assets/objects/images/a.png/download');
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(f.operations.map(op => op.name), OBJECT_DOWNLOAD_OPERATIONS.map(name => `neon.${name}`));
});

test('object byte observation: strict arguments reject identity, selectors and path overrides before fetch', () => {
  const f = fixture(raw);
  for (const bad of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    { ...args, bucket_name: 'other' }, { ...args, object_key: 'images/b.png' },
    ...['approved', 'agent', 'credential', 'url', 'range', 'prefix', 'cursor', 'limit', 'etag', 'if_match'].map(key => ({ ...args, [key]: canary })),
    ...badKeys.map(object_key => ({ ...args, object_key })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'object_key', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(bad));
  assert.equal(f.requests.length, 0);
});

test('object byte observation: scope is copied and overlong composed resources refuse at construction', () => {
  const config = structuredClone(scope);
  const ops = createNeonObjectDownloadOperations(config, {});
  config.projectId = 'other'; config.branchId = 'br-b'; config.bucketName = 'other'; config.objectKey = 'other'; config.revision = 'scope-v2';
  assert.equal(ops[0].prepare(args).resource.revision, 'scope-v1');
  assert.throws(() => ops[0].prepare({ ...args, object_key: 'other' }));
  for (const changed of [...badKeys.map(objectKey => ({ objectKey })), { approved: true }, { projectId: 'x'.repeat(61) },
    { bucketName: 'x/y' }, { branchId: 'br-a\n' }, { revision: '' },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 'a'.repeat(40), objectKey: 'k'.repeat(46) }]) {
    assert.throws(() => createNeonObjectDownloadOperations({ ...scope, ...changed }, {}));
  }
});

test('object byte observation: detached execution revalidates target and revision before any request', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: prepared.resource.id.replace('br-a', 'br-b') },
    { ...prepared.resource, revision: 'scope-v2' }, { ...prepared.resource, id: prepared.resource.id.replace('/download', '') }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, object_key: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('object byte observation: zero, invalid UTF-8, credential-like bytes and exact cap count without decoding or exposure', async () => {
  for (const bytes of [[], [0, 255, 254, 192, 128], [...new TextEncoder().encode(canary)], new Array(RESPONSE_BYTES).fill(255)]) {
    const f = fixture({ bytes });
    const result = await f.run(name, args);
    assert.deepEqual(result, { observed_bytes: bytes.length });
    assert(!JSON.stringify(result).includes(canary));
  }
  const op = fixture(raw).operation(name);
  for (const invalid of [null, [], {}, { observed_bytes: -0 }, { observed_bytes: -1 }, { observed_bytes: 1.5 },
    { observed_bytes: '3' }, { observed_bytes: RESPONSE_BYTES + 1 }, { observed_bytes: NaN },
    { ...expected, body: canary }, Object.defineProperty({}, 'observed_bytes', { get() { throw Error('getter'); }, enumerable: true })]) {
    assert.throws(() => op.project(invalid));
  }
});

test('object byte observation: Content-Length, MIME, encoding, body and terminal count must agree', async () => {
  const invalid = [
    () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'application/octet-stream' } }),
    () => new Response(null, { headers: { 'content-type': 'application/octet-stream', 'content-length': '0' } }),
    ...['-1', '1.5', 'NaN', '1e1', '9007199254740993', String(RESPONSE_BYTES + 1), '0', '2'].map(length =>
      () => binaryResponse([1], { 'content-length': length })),
    () => binaryResponse([1], { 'content-type': 'application/json' }),
    () => binaryResponse([1], { 'content-type': 'text/plain' }),
    () => binaryResponse([1], { 'content-encoding': 'gzip' }),
    () => response({ observed_bytes: 3 }),
  ];
  for (const value of invalid) {
    const f = fixture(value);
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

function streamResponse(chunks, length, onCancel = () => {}) {
  return new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
    cancel: onCancel,
  }), { headers: { 'content-type': 'application/octet-stream', 'content-length': String(length) } });
}

test('object byte observation: chunked stream counts only complete bytes, refuses overflow and cancels', async () => {
  const f = fixture(() => streamResponse([new Uint8Array([0, 255]), new Uint8Array([1])], 3));
  assert.deepEqual(await f.run(name, args), expected);
  for (const [chunks, length] of [ [[new Uint8Array([1])], 2], [[new Uint8Array([1, 2])], 1],
    [[new Uint8Array(RESPONSE_BYTES), new Uint8Array([1])], RESPONSE_BYTES] ]) {
    const f = fixture(() => streamResponse(chunks, length));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
  }
  let cancelled = 0;
  const overflow = fixture(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(RESPONSE_BYTES + 1)); }, cancel() { cancelled++; },
  }), { headers: { 'content-type': 'application/octet-stream', 'content-length': String(RESPONSE_BYTES) } }));
  await assert.rejects(overflow.run(name, args));
  assert.equal(cancelled, 1);
});

test('object byte observation: denied, missing, partial and redirected responses refuse without fallback', async () => {
  for (const status of [302, 403, 404, 410, 500, 206]) {
    const f = fixture(() => new Response(canary, { status, headers: { 'content-type': 'application/octet-stream', 'content-length': String(canary.length) } }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
  const redirected = fixture(() => {
    const value = binaryResponse([1]);
    Object.defineProperty(value, 'redirected', { value: true });
    return value;
  });
  await assert.rejects(redirected.run(name, args));
  const error = fixture(() => { throw Error(canary); });
  await assert.rejects(error.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
});

test('object byte observation: cancellation and stalled stream share the existing transport deadline', async () => {
  let cancelled = 0;
  const f = fixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), {
    headers: { 'content-type': 'application/octet-stream', 'content-length': '1' },
  }));
  await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(cancelled, 1);
  const controller = new AbortController();
  const aborted = fixture(() => {
    controller.abort();
    return binaryResponse([1]);
  });
  await assert.rejects(aborted.run(name, args, controller.signal));
});

test('object byte observation: direct transport validates all path segments before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  for (const key of badKeys) assert.throws(() => transport.getProjectBranchBucketObject('project-a', 'br-a', 'assets', key, options()));
  for (const value of ['../escape', 'x/y', 'x\n', 'x'.repeat(61), 'br-а']) {
    assert.throws(() => transport.getProjectBranchBucketObject(value, 'br-a', 'assets', 'a', options()));
    assert.throws(() => transport.getProjectBranchBucketObject('project-a', value, 'assets', 'a', options()));
    assert.throws(() => transport.getProjectBranchBucketObject('project-a', 'br-a', value, 'a', options()));
  }
  assert.equal(calls, 0);
});
