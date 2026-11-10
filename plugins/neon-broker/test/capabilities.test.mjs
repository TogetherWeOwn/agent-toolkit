import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonCapabilityOperations, CAPABILITY_OPERATIONS } from '../dist/plugins/neon-broker/src/capabilities.js';
import { MAX_ITEMS } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { capabilityCases as cases, capabilityFixture as fixture, capabilityScope as scope,
  library, anonymized, snapshot, schedule, canary, response } from './helpers.mjs';

const paths = ['/projects/project-a/available_preload_libraries', '/projects/project-a/branches/br-a/anonymized_status',
  '/projects/project-a/snapshots', '/projects/project-a/branches/br-a/backup_schedule'];
const poison = { description: canary, name: canary, status_message: canary, last_run: { triggered_by: canary },
  password: canary, connection_uri: `postgres://user:${canary}@example.invalid/db`, error: canary };
for (const [index, [name, args, raw, expected]] of cases.entries()) {
  test(`${name}: closed metadata projection and exact fixed GET path`, async () => {
    const poisoned = { ...structuredClone(raw), ...poison };
    for (const value of Object.values(poisoned).filter(Array.isArray).flat()) Object.assign(value, poison);
    const f = fixture(poisoned);
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(new URL(url).origin, NEON_ORIGIN);
    assert.equal(new URL(url).pathname, `/api/v2${paths[index]}`);
    assert.equal(new URL(url).search, '');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!JSON.stringify(expected).includes(canary));
  });

  test(`${name}: canonical arguments reject extra authority, cross-resource and malformed inputs before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, 'project-a', { ...args, project_id: 'project-other' },
      ...['agent', 'approved', 'approval', 'url', 'cursor', 'limit', 'credential', 'runtimeContext', 'snapshot_id'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) {
      for (const value of ['../escape', 'bad%2fname', 'x/y', 'x\n', 'x\u0000', 'x'.repeat(81), 'prоject-a', 1, null]) {
        assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
      }
    }
    if ('branch_id' in args) assert.throws(() => f.operation(name).prepare({ ...args, branch_id: 'unlisted' }));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached descriptors refuse changed resource/revision and pre-aborted calls`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: 'neon/projects/other' }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: failures, unknown pagination and credential injection refuse without fallback`, async () => {
    for (const value of [() => response({ message: canary }, { status: 403 }), () => { throw Error(canary); },
      () => response({}, { status: 302 })]) {
      const f = fixture(value);
      await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
      assert.equal(f.requests.length, 1);
    }
    await assert.rejects(fixture({ ...raw, pagination: {} }).run(name, args));
    const f = fixture(raw);
    for (const credential of [`${canary}\r`, `${canary}\n`]) {
      await assert.rejects(f.operation(name).execute(f.operation(name).prepare(args), credential, new AbortController().signal));
    }
    assert.equal(f.requests.length, 0);
  });
}

test('capability descriptors have four distinct resources with no mutator or account enumerator', () => {
  const f = fixture({});
  assert.deepEqual(f.operations.map(op => op.name), CAPABILITY_OPERATIONS.map(name => `neon.${name}`));
  assert.equal(new Set(cases.map(([name, args]) => f.operation(name).prepare(args).resource.id)).size, 4);
  for (const [index, [name, args]] of cases.entries()) {
    assert.equal(f.operation(name).prepare(args).resource.id, `neon${paths[index]}`);
  }
  for (const op of f.operations) {
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  }
  for (const name of ['setSnapshotSchedule', 'createSnapshot', 'restoreSnapshot', 'startAnonymization', 'updateProject', 'sql']) {
    assert.equal(f.operation(name), undefined);
  }
});

test('trusted snapshot bindings are copied, unique, bounded and branch-bound', () => {
  const config = structuredClone(scope);
  const ops = createNeonCapabilityOperations(config, {});
  config.branchIds.push('br-other');
  config.snapshots[0].branchId = 'br-b';
  assert.throws(() => ops[1].prepare({ project_id: 'project-a', branch_id: 'br-other' }));
  assert.deepEqual(ops[2].project({ snapshots: [snapshot] }), { snapshots: [snapshot] });
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { snapshots: [scope.snapshots[0], scope.snapshots[0]] },
    { snapshots: [{ id: 'snap-a', branchId: 'unlisted' }] }, { snapshots: new Array(1) },
    { snapshots: Array.from({ length: MAX_ITEMS + 1 }, (_, n) => ({ id: `snap-${n}`, branchId: 'br-a' })) },
    { approved: true }]) assert.throws(() => createNeonCapabilityOperations({ ...scope, ...changed }, {}));
});

test('anonymized status binds requested branch and projects only known state without diagnostics', async () => {
  const [name, args] = cases[1];
  for (const changed of [{ project_id: 'project-b' }, { branch_id: 'br-b' }, { state: 'unknown' }, { state: canary }]) {
    await assert.rejects(fixture({ ...anonymized, ...changed }).run(name, args));
  }
  for (const state of ['created', 'initialized', 'initialization_error', 'anonymizing', 'anonymized', 'error']) {
    assert.deepEqual(await fixture({ ...anonymized, ...poison, state }).run(name, args), { ...anonymized, state });
  }
});

test('snapshot list filters unselected IDs but never weakens selected ancestry or duplicate checks', async () => {
  const [name, args] = cases[2];
  assert.deepEqual(await fixture({ snapshots: [snapshot, { id: 'unlisted', source_branch_id: 'br-unconfigured', name: canary }] })
    .run(name, args), { snapshots: [snapshot] });
  for (const changed of [{ source_branch_id: 'br-b' }, { source_branch_id: undefined }, { project_id: 'project-b' },
    { manual: 'true' }, { created_at: '2026-02-30T00:00:00Z' }, { created_at: '2026-11-08T24:00:00Z' },
    { created_at: '2026-11-08T00:00:00Z\n' }, { created_at: canary }]) {
    await assert.rejects(fixture({ snapshots: [{ ...snapshot, ...changed }] }).run(name, args));
  }
  for (const value of [[snapshot, snapshot], [{ id: 'unlisted' }, { id: 'unlisted' }]]) {
    await assert.rejects(fixture({ snapshots: value }).run(name, args));
  }
  for (const created_at of ['2026-11-08T00:00:00.123456Z', '2026-11-08T00:00:00Z']) {
    const value = { ...snapshot, created_at };
    assert.deepEqual(await fixture({ snapshots: [value] }).run(name, args), { snapshots: [value] });
  }
});

test('preload metadata rejects duplicate names, malformed selected fields and unknown versions', async () => {
  const [name, args] = cases[0];
  for (const changed of [{ library_name: 'x\n' }, { library_name: 'x/y' }, { is_default: 'true' },
    { is_experimental: null }, { version: '' }, { version: canary + '\n' }]) {
    await assert.rejects(fixture({ libraries: [{ ...library, ...changed }] }).run(name, args));
  }
  await assert.rejects(fixture({ libraries: [library, library] }).run(name, args));
});

test('backup schedule validates optional numeric boundaries and refuses unknown frequencies', async () => {
  const [name, args] = cases[3];
  for (const changed of [{ frequency: 'hourly' }, { hour: -1 }, { hour: 24 }, { day: 0 }, { day: 32 },
    { month: 0 }, { month: 13 }, { retention_seconds: 3599 }, { retention_seconds: 3024001 },
    { hour: 0.5 }, { hour: '3' }, { hour: null }]) {
    await assert.rejects(fixture({ schedule: [{ ...schedule, ...changed }] }).run(name, args));
  }
  // JSON.stringify normalizes -0 to 0: exercise the raw projection and wire -0 separately.
  assert.throws(() => fixture({}).operation(name).project({ schedule: [{ ...schedule, hour: -0 }] }));
  await assert.rejects(fixture(() => new Response('{"schedule":[{"frequency":"daily","hour":-0}]}',
    { headers: { 'content-type': 'application/json' } })).run(name, args));
  for (const value of [{ frequency: 'weekly' }, { frequency: 'monthly', hour: 23, day: 31, month: 12, retention_seconds: 3024000 }]) {
    assert.deepEqual(await fixture({ schedule: [value] }).run(name, args), { schedule: [value] });
  }
});

test('nonpaginated metadata arrays refuse oversized, sparse and accessor rows rather than truncate', async () => {
  for (const [name, args, raw] of cases.filter(([name]) => name !== 'getAnonymizedBranchStatus')) {
    const kind = Object.keys(raw)[0];
    await assert.rejects(fixture({ [kind]: Array.from({ length: MAX_ITEMS + 1 }, () => raw[kind][0]) }).run(name, args));
    const op = fixture(raw).operation(name);
    assert.throws(() => op.project({ [kind]: new Array(1) }));
    const key = Object.keys(raw[kind][0])[0];
    assert.throws(() => op.project({ [kind]: [Object.defineProperty({ ...raw[kind][0] }, key,
      { get() { throw Error('getter'); }, enumerable: true })] }));
    assert.deepEqual(await fixture({ [kind]: [] }).run(name, args), { [kind]: [] });
  }
});

test('new fixed transport seams reject project and branch injection before fetch', () => {
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../project', 'x/y', 'x?limit=999', 'x\n']) {
    assert.throws(() => t.getAvailablePreloadLibraries(bad, options));
    assert.throws(() => t.listSnapshots(bad, options));
    assert.throws(() => t.getAnonymizedBranchStatus('project-a', bad, options));
    assert.throws(() => t.getSnapshotSchedule('project-a', bad, options));
  }
  assert.equal(calls, 0);
});
