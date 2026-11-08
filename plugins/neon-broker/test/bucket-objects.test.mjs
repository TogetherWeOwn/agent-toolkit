import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBucketObjectOperations, BUCKET_OBJECT_OPERATIONS } from '../dist/plugins/neon-broker/src/bucket-objects.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { bucketObjectCases as cases, bucketObjectFixture as fixture, bucketObjectScope as scope, bucketObject, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { etag: canary, last_modified: canary, content: canary, download_url: canary, message: canary };
const second = { key: 'images/b.png', size: 0 };

test('bucket objects: exact collection GET uses copied prefix and emits selected key/size only', async () => {
  const f = fixture({ ...raw, ...poison, objects: [{ ...bucketObject, ...poison }, { key: 'images/unselected', size: 9 }] });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  const parsed = new URL(url);
  assert.equal(parsed.origin, NEON_ORIGIN);
  assert.equal(parsed.pathname, '/api/v2/projects/project-a/branches/br-a/buckets/assets/objects');
  assert.deepEqual(Object.fromEntries(parsed.searchParams), { limit: '10', prefix: 'images/' });
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/buckets/assets/objects', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ ...raw, objects: [] }).run(name, args), { objects: [] });
  assert.deepEqual(await fixture(raw, { ...scope, objectKeys: [] }).run(name, args), { objects: [] });
  assert.deepEqual(await fixture({ ...raw, next_cursor: '' }).run(name, args), expected);
});

test('bucket objects: strict arguments reject caller query, authority and sibling scope before transport', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' }, { ...args, bucket_name: 'other' },
    ...['prefix', 'delimiter', 'limit', 'cursor', 'object_key', 'approved', 'agent', 'credential', 'url'].map(key => ({ ...args, [key]: canary })),
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'аbc', 'Upper', true, null, 'x'.repeat(61)].flatMap(id =>
      [{ ...args, project_id: id }, { ...args, branch_id: id }, { ...args, bucket_name: id }]),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'bucket_name', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('bucket objects: scope is copied, bounded and rejects inconsistent selections', () => {
  const config = structuredClone(scope);
  const ops = createNeonBucketObjectOperations(config, {});
  config.bucketName = 'other'; config.projectId = 'other'; config.branchId = 'br-b'; config.revision = 'scope-v2';
  config.prefix = 'other/'; config.objectKeys[0] = 'other/a';
  assert.deepEqual(ops[0].project(raw), expected);
  assert.equal(ops[0].prepare(args).resource.revision, 'scope-v1');
  assert.deepEqual(ops.map(op => op.name), BUCKET_OBJECT_OPERATIONS.map(n => `neon.${n}`));
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: 'Upper' }, { bucketName: 'x'.repeat(61) }, { revision: '' },
    { prefix: '' }, { prefix: 'x\n' }, { prefix: 'x'.repeat(81) }, { objectKeys: ['images/a', 'images/a'] }, { objectKeys: ['other/a'] },
    { objectKeys: ['images/\n'] }, { objectKeys: ['images/' + 'x'.repeat(74)] },
    { objectKeys: Array.from({ length: 31 }, (_, n) => `images/${n}`) },
  ]) assert.throws(() => createNeonBucketObjectOperations({ ...scope, ...change }, {}));
  for (const excluded of ['getProjectBranchBucketObject', 'presignProjectBranchBucketObject', 'deleteProjectBranchBucketObject']) {
    assert.equal(fixture(raw).operation(excluded), undefined);
  }
});

test('bucket objects: detached execute revalidates arguments, exact resource/revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a/branches/br-a/buckets' },
    { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/buckets/assets/objects' },
    { ...prepared.resource, revision: 'scope-v2' }]) await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  await assert.rejects(execute({ ...prepared, arguments: { ...args, bucket_name: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('bucket objects: next_cursor pagination validates all pages and refuses cycles/ceiling without partial success', async () => {
  const f = fixture((_url, _init, n) => response(n === 1 ? { ...raw, is_truncated: true, next_cursor: 'opaque /?&cursor' } : { ...raw, objects: [second], next_cursor: '' }));
  assert.deepEqual(await f.run(name, args), { objects: [bucketObject, second] });
  assert.equal(f.requests.length, 2);
  assert.deepEqual(Object.fromEntries(new URL(f.requests[1].url).searchParams), { limit: '10', cursor: 'opaque /?&cursor', prefix: 'images/' });
  for (const terminal of [{ ...raw, objects: [bucketObject] }, { ...raw, prefix: 'other/' }, { ...raw, folders: ['images/sub/'] },
    { ...raw, objects: [{ key: 'images/unselected', size: -1 }] }, { ...raw, branch_id: 'br-b' }]) {
    const bad = fixture((_url, _init, n) => response(n === 1 ? { ...raw, is_truncated: true, next_cursor: 'next' } : terminal));
    await assert.rejects(bad.run(name, args));
    assert.equal(bad.requests.length, 2);
  }
  const cycle = fixture(() => response({ ...raw, objects: [], is_truncated: true, next_cursor: 'repeat' }));
  await assert.rejects(cycle.run(name, args));
  assert.equal(cycle.requests.length, 2);
  const ceiling = fixture((_url, _init, n) => response({ ...raw, objects: [], is_truncated: true, next_cursor: `next-${n}` }));
  await assert.rejects(ceiling.run(name, args));
  assert.equal(ceiling.requests.length, 3);
  const empty = fixture((_url, _init, n) => response(n === 1 ? { ...raw, objects: [], is_truncated: true, next_cursor: 'next' } : raw));
  assert.deepEqual(await empty.run(name, args), expected);
});

test('bucket objects: malformed rows, unsafe sizes, wrong ancestry/prefix/folders and ambiguous pagination refuse', async () => {
  for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' }, { ...raw, bucket_name: 'other' },
    { ...raw, pagination: {} }, { ...raw, prefix: '' }, { ...raw, folders: null }, { ...raw, folders: ['images/sub/'] },
    ...[undefined, null, 0, 'false'].map(is_truncated => ({ ...raw, is_truncated })),
    ...[null, true, 0, 'next'].map(next_cursor => ({ ...raw, next_cursor })),
    ...[undefined, '', null, true, 'bad\n', 'x'.repeat(257)].map(next_cursor => ({ ...raw, is_truncated: true, next_cursor })),
    ...[null, true, 1.1, -1, Number.MAX_SAFE_INTEGER + 1, '0'].map(size => ({ ...raw, objects: [{ key: 'images/unselected', size }] })),
    ...['other/a', '', 'images/\n', 'images/' + 'x'.repeat(74)].map(key => ({ ...raw, objects: [{ key, size: 1 }] })),
    { ...raw, objects: [bucketObject, bucketObject] }, { ...raw, objects: [{ key: 'images/unselected', size: 1 }, { key: 'images/unselected', size: 2 }] },
    { ...raw, objects: Array.from({ length: 11 }, (_, n) => ({ key: `images/${n}`, size: 1 })) },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  assert.throws(() => op.project({ ...raw, objects: [{ ...bucketObject, size: -0 }] }));
  assert.throws(() => op.project({ ...raw, objects: new Array(1) }));
  for (const key of ['prefix', 'objects', 'folders', 'next_cursor', 'is_truncated', 'bucket_name']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.throws(() => op.project({ ...raw, objects: [Object.defineProperty({ ...bucketObject }, 'key', { get() { throw Error('getter'); }, enumerable: true })] }));
  assert.deepEqual(op.project({ ...raw, objects: [Object.defineProperty({ ...bucketObject }, 'content', { get() { throw Error('unused'); }, enumerable: true })] }), expected);
});

test('bucket objects: maximum configuration and 30-row pagination stay within closed output budgets', async () => {
  const keys = Array.from({ length: 30 }, (_, n) => `images/${String(n).padStart(73, '0')}`);
  const objects = keys.map(key => ({ key, size: Number.MAX_SAFE_INTEGER }));
  const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName: 'a'.repeat(60), revision: 'r'.repeat(80), objectKeys: keys };
  const maxArgs = { project_id: config.projectId, branch_id: config.branchId, bucket_name: config.bucketName };
  const f = fixture((_url, _init, n) => response({ ...raw, objects: objects.slice((n - 1) * 10, n * 10), is_truncated: n < 3, next_cursor: n < 3 ? `next-${n}` : '' }), config);
  assert.deepEqual(await f.run(name, maxArgs), { objects });
  assert(f.operation(name).prepare(maxArgs).resource.id.length <= 256);
  assert.equal(f.requests.length, 3);
});

test('bucket objects: unavailable Beta/session and transport failure never fabricate empty success or download fallback', async () => {
  for (const status of [401, 403, 404, 410, 500, 302]) {
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

test('bucket objects: direct transport validates path/prefix/cursor before fetch and encodes query data', async () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.listProjectBranchBucketObjects(value, 'br-a', 'assets', scope.prefix, null, options));
    assert.throws(() => transport.listProjectBranchBucketObjects('project-a', value, 'assets', scope.prefix, null, options));
    assert.throws(() => transport.listProjectBranchBucketObjects('project-a', 'br-a', value, scope.prefix, null, options));
  }
  for (const value of [undefined, null, '', 'x\n', 'x'.repeat(81), 'аbc']) {
    assert.throws(() => transport.listProjectBranchBucketObjects('project-a', 'br-a', 'assets', value, null, options));
  }
  for (const value of [undefined, '', 'x\n', 'x'.repeat(257)]) {
    assert.throws(() => transport.listProjectBranchBucketObjects('project-a', 'br-a', 'assets', scope.prefix, value, options));
  }
  assert.equal(calls, 0);
  const prefix = 'images/ ?&=+#';
  const f = fixture({ ...raw, prefix, objects: [{ key: prefix, size: 1 }] }, { ...scope, prefix, objectKeys: [prefix] });
  assert.deepEqual(await f.run(name, args), { objects: [{ key: prefix, size: 1 }] });
  assert.equal(new URL(f.requests[0].url).searchParams.get('prefix'), prefix);
});
