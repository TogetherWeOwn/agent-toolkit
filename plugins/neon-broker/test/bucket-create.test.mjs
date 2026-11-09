import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBucketCreateOperations } from '../dist/plugins/neon-broker/src/bucket-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { bucketCreateFixture as fixture, bucketCreateArgs as args, bucketCreateScope as scope,
  bucketCreateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'createProjectBranchBucket';
const expected = { name: 'assets', acknowledged: true };
const bucket = receipt.bucket;

test('Private bucket create: bounded absence preflight then one fixed private POST; exact201 acknowledgement only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/buckets`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'POST']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'POST' ? '{"name":"assets","access_level":"private"}' : undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'POST' ? 'application/json' : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'write');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/buckets/assets/create');
  assert.deepEqual(op.prepare(args).plan.diff, { before: 'selected_bucket_absent', after: bucket });
  assert.equal(op.prepare(args).plan.access_level, 'private');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['persistenceVerified', 'accessEnforcementVerified', 'objectCompletenessVerified']) assert.equal(op.prepare(args).plan[k], false);
});

test('Private bucket create: copied scope, strict arguments and exact prepared plan refuse overrides before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonBucketCreateOperations(config, {});
  config.bucketName = 'other';
  assert.equal(op.prepare(args).plan.bucket_name, 'assets');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'other' }, { ...args, bucket_name: 'other' },
    ...['name', 'access_level', 'bucket', 'approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout'].map(k => ({ ...args, [k]: true })),
    { ...args, access_level: 'public_read' }, Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'bucket_name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/create', '') } },
    ...['bucket_name', 'preflight', 'access_level', 'effect', 'persistenceVerified'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Private bucket create: any existing name including inherited/private/public refuses without POST', async () => {
  for (const access_level of ['private', 'public_read']) {
    const f = fixture(() => response({ buckets: [{ ...bucket, access_level, inherited: true }] }));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) :
    response({ buckets: [{ name: 'other', access_level: 'public_read' }] }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Private bucket create: validate entire terminal bounded list before absence, no empty-success fallback', async () => {
  for (const raw of [null, {}, [], { buckets: null }, { buckets: [bucket, bucket] },
    { buckets: Array.from({ length: 31 }, (_, n) => ({ name: `other-${n}`, access_level: 'private' })) },
    ...[{ name: '' }, { name: 'x'.repeat(256) }, { name: 'x\n' }, { access_level: 'unknown' }, { access_level: null },
      { branch_id: 'other' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ buckets: [{ name: 'other', access_level: 'private', ...change }] })),
    ...[{ project_id: 'other' }, { branch_id: null }, { pagination: {} }].map(change => ({ buckets: [], ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(() => response({ buckets: [] }, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Private bucket create: ambiguous POST observes once, never promotes presence/absence/replacement to success', async () => {
  for (const after of [{ buckets: [] }, { buckets: [bucket] }, { buckets: [{ ...bucket, access_level: 'public_read' }] }, null, {}, { buckets: [], branch_id: 'other' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? { buckets: [] } : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
});

test('Private bucket create: only exact201 private-name echo accepts; status, MIME, redirect, body and bounds refuse', async () => {
  for (const make of [...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...[null, {}, { bucket: null }, { bucket: { ...bucket, name: 'other' } }, { bucket: { ...bucket, access_level: 'public_read' } },
      { bucket: { ...bucket, branch_id: 'other' } }, { ...receipt, project_id: 'other' }, { ...receipt, pagination: {} }].map(raw => () => response(raw, { status: 201 })),
    () => new Response(canary, { status: 201, headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { status: 201, headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { status: 201, headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { status: 201, headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response({ buckets: [] }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Private bucket create: ignored timestamps/origin/content are never evaluated and output is closed', async () => {
  const ignored = raw => {
    for (const k of ['created_at', 'inherited', 'origin_branch_id', 'objects', 'url', 'password', 'error']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonBucketCreateOperations(scope, {
    async listProjectBranchBuckets() { return { buckets: [ignored({ name: 'other', access_level: 'private' })] }; },
    async createProjectBranchBucket() { return ignored({ bucket: ignored({ ...bucket }) }); },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, expected, { bucket: { ...bucket, name: 'other' } },
    { bucket: Object.defineProperty({}, 'name', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ bucket: { ...bucket, created_at: canary, objects: canary }, ignored: canary }), expected);
});

test('Private bucket create: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? response(receipt, { status: 201 }) : response({ buckets: [] });
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response({ buckets: [] }));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Private bucket create: canonical min/max/dotted names share transport parser; public access cannot be selected', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b'.repeat(61) },
    { branchId: '-b' }, { revision: '' }, { bucketName: '../x' }, { bucketName: 'x'.repeat(61) }, { bucketName: '' }, { access_level: 'public_read' }]) assert.throws(() => createNeonBucketCreateOperations({ ...scope, ...change }, {}));
  for (const bucketName of ['a', 'a.b', 'a'.repeat(60)]) {
    const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), bucketName };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, branch_id: config.branchId, bucket_name: bucketName }), { name: bucketName, acknowledged: true });
    assert.deepEqual(JSON.parse(f.requests[1].init.body), { name: bucketName, access_level: 'private' });
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(61)]) {
    assert.throws(() => t.createProjectBranchBucket(bad, 'br-a', 'assets', options));
    assert.throws(() => t.createProjectBranchBucket('project-a', bad, 'assets', options));
    assert.throws(() => t.createProjectBranchBucket('project-a', 'br-a', bad, options));
  }
  await assert.rejects(t.createProjectBranchBucket('project-a', 'br-a', 'assets', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
