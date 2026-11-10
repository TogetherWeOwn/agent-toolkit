import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchFeatureOperations, BRANCH_FEATURE_OPERATIONS } from '../dist/plugins/neon-broker/src/branch-features.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { MAX_ITEMS } from '../dist/plugins/neon-broker/src/metadata.js';
import { branchFeatureCases as cases, branchFeatureFixture as fixture, branchFeatureScope as scope,
  realtime, canary, response } from './helpers.mjs';

const suffixes = ['realtime', 'storage', 'ai_gateway'];
const poison = { secret: canary, password: canary, connection_uri: `postgres://user:${canary}@example.invalid/db`,
  invocation_url: canary, s3_endpoint: canary, base_url: canary, allowed_origins: [canary], region: canary,
  message: canary, reason: canary, settings: { token: canary } };
for (const [index, [name, args, raw, expected]] of cases.entries()) {
  test(`${name}: closed status projection and exact branch-feature GET path`, async () => {
    const f = fixture({ ...raw, ...poison });
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    const path = `/api/v2/projects/project-a/branches/br-a/${suffixes[index]}`;
    assert.equal(url, `${NEON_ORIGIN}${path}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!JSON.stringify(expected).includes(canary));
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/branches/br-a/${suffixes[index]}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: canonical closed arguments refuse authority claims and wrong resources before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approved', 'approval', 'url', 'cursor', 'limit', 'credential', 'runtimeContext', 'enabled', 'secret'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) {
      for (const value of ['../escape', 'bad%2fname', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(81), 'br-а', 1, null]) {
        assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
      }
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached descriptors revalidate exact resource/revision and pre-aborted calls`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/other' }, { ...prepared.resource, revision: 'scope-v2' },
      { ...prepared.resource, id: prepared.resource.id.replace('br-a', 'br-b') }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: malformed success, pagination and contradictory ancestry refuse`, async () => {
    for (const value of [null, [], {}, { ...raw, enabled: 1 }, { ...raw, enabled: 'true' }, { ...raw, enabled: null },
      { ...raw, pagination: {} }, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'unlisted' },
      { ...raw, branch_id: 'br-b' }]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args));
      assert.equal(f.requests.length, 1);
    }
    assert.deepEqual(await fixture({ ...raw, project_id: 'project-a', branch_id: 'br-a' }).run(name, args), expected);
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project(Object.assign(Object.create({ enabled: true }), raw)));
    for (const key of ['enabled', 'branch_id', 'pagination']) assert.throws(() => op.project(Object.defineProperty({ ...raw }, key,
      { get() { throw Error('getter'); }, enumerable: true })));
    // Omitted fields cannot trigger getters, expose locations or authorize secondary requests.
    assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'base_url',
      { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  });

  test(`${name}: unavailable feature stays unavailable, no fabricated disabled status or fallback`, async () => {
    for (const status of [404, 403, 500, 302]) {
      const f = fixture(() => response({ ...poison, enabled: false }, { status }));
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    const f = fixture(() => { throw Error(canary); });
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
    const clean = fixture(raw);
    for (const credential of [`${canary}\r`, `${canary}\n`]) {
      await assert.rejects(clean.operation(name).execute(clean.operation(name).prepare(args), credential, new AbortController().signal));
    }
    assert.equal(clean.requests.length, 0);
  });
}

test('branch feature scope is copied, bounded and cannot introduce authority or duplicate selections', () => {
  const config = structuredClone(scope);
  const ops = createNeonBranchFeatureOperations(config, {});
  config.projectId = 'other';
  config.branchIds.push('unlisted');
  assert.equal(ops[0].prepare(cases[0][1]).resource.revision, 'scope-v1');
  assert.throws(() => ops[0].prepare({ project_id: 'project-a', branch_id: 'unlisted' }));
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { branchIds: new Array(1) },
    { branchIds: Array.from({ length: MAX_ITEMS + 1 }, (_, n) => `br-${n}`) }, { approved: true },
    { branchIds: ['br-a\n'] }]) assert.throws(() => createNeonBranchFeatureOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(ops.map(op => op.name), BRANCH_FEATURE_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(new Set(cases.map(([name, args]) => fixture({}).operation(name).prepare(args).resource.id)).size, 3);
  for (const name of ['enableProjectBranchRealtime', 'disableProjectBranchRealtime', 'getProjectBranchRealtimeSecret',
    'getProjectBranchBucketObject', 'getConnectionURI', 'sql']) assert.equal(fixture({}).operation(name), undefined);
});

test('realtime preserves all enabled/pending states and validates optional int32 revision', async () => {
  const [name, args] = cases[0];
  for (const enabled of [false, true]) for (const pending of [false, true]) {
    assert.deepEqual(await fixture({ enabled, pending }).run(name, args), { enabled, pending });
  }
  for (const value of [{ ...realtime, pending: undefined }, { ...realtime, pending: 'false' },
    ...[null, 0, -1, 0.5, '1', 2147483648].map(revision => ({ ...realtime, revision }))]) {
    await assert.rejects(fixture(value).run(name, args));
  }
  assert.throws(() => fixture({}).operation(name).project({ ...realtime, revision: -0 }));
  assert.deepEqual(await fixture({ enabled: true, pending: false, revision: 2147483647 }).run(name, args),
    { enabled: true, pending: false, revision: 2147483647 });
});

test('storage and gateway refuse unknown non-usable success states rather than normalize them', async () => {
  for (const [name, args, raw] of cases.slice(1)) {
    await assert.rejects(fixture({ ...raw, enabled: false }).run(name, args));
  }
});

test('all branch feature transport methods reject path injection before fetching', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const name of BRANCH_FEATURE_OPERATIONS) for (const bad of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'br-а']) {
    assert.throws(() => transport[name](bad, 'br-a', options));
    assert.throws(() => transport[name]('project-a', bad, options));
  }
  assert.equal(calls, 0);
});
