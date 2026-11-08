import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNeonMetadataOperations, MAX_PAGES } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES, REQUEST_TIMEOUT_MS } from '../dist/plugins/neon-broker/src/transport.js';
import { scope, project, branch, endpoint, cases, allCases, canary, fixture, response } from './helpers.mjs';

for (const [name, args, raw, expected] of cases) {
  test(`${name}: strict typed metadata and safe projection`, async () => {
    const poisoned = structuredClone(raw);
    for (const value of Object.values(poisoned).flat()) Object.assign(value, {
      password: canary, connection_uri: `postgres://user:${canary}@example.invalid/db`,
      credentials: { token: canary }, name: canary, host: canary, proxy_host: canary,
      owner: { email: canary }, settings: { password: canary },
    });
    const f = fixture(poisoned);
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(new URL(url).origin, NEON_ORIGIN);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert(!url.includes(canary));
    assert(!JSON.stringify(expected).includes(canary));
  });

  test(`${name}: detached descriptors preserve preparation, execution and resource refusals`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    const signal = new AbortController().signal;
    for (const resource of [
      { ...prepared.resource, id: 'neon/projects/project-other' },
      { ...prepared.resource, revision: 'scope-v2' },
    ]) await assert.rejects(execute({ ...prepared, resource }, canary, signal), { message: 'OUTPUT_REFUSED' });
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, signal)), expected);
    assert.equal(f.requests.length, 1);
  });

  test(`${name}: malformed, extra, caller identity and scope arguments refuse before transport`, () => {
    const f = fixture(raw);
    const operation = f.operation(name);
    for (const bad of [null, [], {}, 'project-a', { ...args, approved: true }, { ...args, agent: 'agent-a' },
      { ...args, runtimeContext: 'verified-runtime' }, { ...args, url: 'https://example.invalid' },
      { ...args, credential: canary }, { ...args, project_id: 'project-b' },
      { ...args, project_id: '../project-a' }, { ...args, project_id: 'project-a\n' },
      { ...args, project_id: 'prоject-a' }, { ...args, project_id: 'x'.repeat(81) },
      { ...args, project_id: 'project%2fa' }, { ...args, project_id: 'project-a/branches' },
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter executed'); }, enumerable: true })]) {
      assert.throws(() => operation.prepare(bad));
    }
    if ('branch_id' in args) assert.throws(() => operation.prepare({ ...args, branch_id: 'br-other' }));
    if ('endpoint_id' in args) assert.throws(() => operation.prepare({ ...args, endpoint_id: 'ep-other' }));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: response errors never expose raw provider diagnostics or use fallback`, async () => {
    const f = fixture(() => response({ error: canary, password: canary, connection_uri: canary }, { status: 403 }));
    await assert.rejects(f.run(name, args), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  });
}

test('the five exact descriptors are source adapters, not a generic executor or enablement API', () => {
  const f = fixture({ project });
  assert.deepEqual(f.operations.map(op => op.name), cases.map(([name]) => `neon.${name}`));
  for (const operation of f.operations) {
    assert.equal(operation.tier, 'read');
    assert.equal(operation.lifecycle, 'none');
    assert(operation.timeoutMs <= 3500);
  }
  for (const name of ['startProjectEndpoint', 'restartProjectEndpoint', 'resume', 'suspendProjectEndpoint',
    'getConnectionURI', 'getProjectBranchRolePassword', 'sql', 'fetchSecret']) assert.equal(f.operation(name), undefined);
});

test('resource targets distinguish collection authority, project, branch and endpoint binding', () => {
  const f = fixture({ project });
  const resources = cases.map(([name, args]) => f.operation(name).prepare(args).resource);
  assert.equal(new Set(resources.map(resource => resource.id)).size, 5);
  assert(resources.every(resource => resource.revision === scope.revision));
  assert.equal(resources[4].id, 'neon/projects/project-a/branches/br-a/endpoints/ep-a');
  assert.equal(resources[1].id, 'neon/projects/project-a/branches');
  assert.equal(resources[3].id, 'neon/projects/project-a/branches/br-a/endpoints');
});

test('trusted configuration is validated, copied and cannot be widened after construction', () => {
  const config = structuredClone(scope);
  const operations = createNeonMetadataOperations(config, {});
  config.projectId = 'project-b';
  config.branchIds.push('br-evil');
  config.endpoints[0].branchId = 'br-b';
  assert.equal(operations[0].prepare({ project_id: 'project-a' }).resource.id, 'neon/projects/project-a');
  assert.throws(() => operations[2].prepare({ project_id: 'project-a', branch_id: 'br-evil' }));
  for (const bad of [
    { ...scope, endpoints: [{ id: 'ep-a', branchId: 'br-other' }] },
    { ...scope, endpoints: [scope.endpoints[0], scope.endpoints[0]] },
    { ...scope, branchIds: ['br-a', 'br-a'] }, { ...scope, approved: true },
  ]) assert.throws(() => createNeonMetadataOperations(bad, {}));
});

test('wrong response project, branch and endpoint parent binding refuses', async () => {
  for (const [name, args, raw] of [
    ['getProject', cases[0][1], { project: { ...project, id: 'project-b' } }],
    ['getProjectBranch', cases[2][1], { branch: { ...branch, project_id: 'project-b' } }],
    ['getProjectBranch', cases[2][1], { branch: { ...branch, id: 'br-b' } }],
    ['getProjectEndpoint', cases[4][1], { endpoint: { ...endpoint, branch_id: 'br-b' } }],
    ['getProjectEndpoint', cases[4][1], { endpoint: { ...endpoint, id: 'ep-b', branch_id: 'br-b' } }],
    ['listProjectBranchEndpoints', cases[3][1], { endpoints: [{ ...endpoint, branch_id: 'br-b' }] }],
    ['listProjectBranches', cases[1][1], { branches: [{ ...branch, project_id: 'project-b' }] }],
  ]) {
    const f = fixture(raw);
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('explicit collection targets filter children, without pretending filtering authorizes the request', async () => {
  assert.deepEqual(await fixture({ branches: [branch, { ...branch, id: 'br-unlisted' }] })
    .run('listProjectBranches', cases[1][1]), { branches: [branch] });
  assert.deepEqual(await fixture({ endpoints: [endpoint, { ...endpoint, id: 'ep-unlisted' }] })
    .run('listProjectBranchEndpoints', cases[3][1]), { endpoints: [endpoint] });
});

test('branch pagination uses opaque encoded cursors and fixed sort/bounds, with no cursor output', async () => {
  const cursor = '2022-12-07T00:45:05.262011Z?&next=ignored';
  const f = fixture((url, init, count) => response(count === 1 ?
    { branches: [branch], pagination: { next: cursor, sort_by: 'name', sort_order: 'asc' } } :
    { branches: [{ ...branch, id: 'br-b' }], pagination: {} }));
  assert.deepEqual(await f.run('listProjectBranches', cases[1][1]), { branches: [branch, { ...branch, id: 'br-b' }] });
  assert.equal(f.requests.length, 2);
  for (const { url } of f.requests) {
    const query = new URL(url).searchParams;
    assert.equal(query.get('limit'), '10');
    assert.equal(query.get('sort_by'), 'name');
    assert.equal(query.get('sort_order'), 'asc');
    assert.equal(query.get('include_deleted'), 'false');
  }
  assert.equal(new URL(f.requests[1].url).searchParams.get('cursor'), cursor);
});

test('pagination cycles, overflow, mismatched sort, duplicate rows and unsupported endpoint pagination refuse', async () => {
  for (const value of [
    { branches: [], pagination: { next: 'same' } },
    (url, init, n) => response({ branches: [], pagination: { next: `cursor-${n}` } }),
    { branches: Array.from({ length: 11 }, () => branch) },
    { branches: [branch, branch] },
    { branches: [], pagination: { next: '' } },
    { branches: [], pagination: { next: 'x', sort_by: 'updated_at' } },
    { branches: [], pagination: { next: 'x', sort_order: 'desc' } },
    { branches: [], pagination: { next: '\n' } },
  ]) {
    const f = fixture(value);
    await assert.rejects(f.run('listProjectBranches', cases[1][1]));
    assert(f.requests.length <= MAX_PAGES);
  }
  await assert.rejects(fixture({ endpoints: [endpoint], pagination: {} }).run('listProjectBranchEndpoints', cases[3][1]));
});

test('project projection accepts pinned-schema Postgres versions through 19 and refuses out-of-range values', async () => {
  for (const pg_version of [14, 18, 19]) {
    const value = { ...project, pg_version };
    assert.deepEqual(await fixture({ project: value }).run('getProject', cases[0][1]), { project: value });
  }
  const operation = fixture({ project }).operation('getProject');
  for (const pg_version of [13, 20, 19.5, '19', null]) {
    assert.throws(() => operation.project({ project: { ...project, pg_version } }));
  }
});

test('projection refuses malformed selected fields without reading accessors or arbitrary names', () => {
  const f = fixture({ project });
  for (const bad of [
    { project: { ...project, pg_version: '17' } },
    { project: { ...project, region_id: 'postgres://secret' } },
    { project: Object.defineProperty({ ...project }, 'id', { get() { throw Error('getter'); }, enumerable: true }) },
  ]) assert.throws(() => f.operation('getProject').project(bad));
  assert.throws(() => f.operation('getProjectBranch').project({ branch: { ...branch, current_state: canary } }));
  assert.throws(() => f.operation('getProjectEndpoint').project({ endpoint: { ...endpoint, disabled: 'false' } }));
});

test('transport refuses redirects, invalid JSON/content, oversized streams and network errors without retry', async () => {
  for (const factory of [
    () => new Response('', { status: 302, headers: { location: 'https://example.invalid/secret' } }),
    () => new Response('not-json', { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => new Response('x'.repeat(RESPONSE_BYTES + 1), { headers: { 'content-type': 'application/json' } }),
    () => { throw Error(canary); },
  ]) {
    const f = fixture(factory);
    await assert.rejects(f.run('getProject', cases[0][1]), { message: 'UPSTREAM_UNAVAILABLE' });
    assert.equal(f.requests.length, 1);
  }
});

test('pre-aborted calls do not touch transport; ignored cancellation still has a bounded deadline', async () => {
  const controller = new AbortController();
  controller.abort();
  const f = fixture({ project });
  await assert.rejects(f.run('getProject', cases[0][1], controller.signal));
  assert.equal(f.requests.length, 0);
  const hung = fixture(() => new Promise(() => {}));
  const start = Date.now();
  await assert.rejects(hung.run('getProject', cases[0][1]), { message: 'UPSTREAM_UNAVAILABLE' });
  assert(Date.now() - start < REQUEST_TIMEOUT_MS + 500);
  assert.equal(hung.requests.length, 1);
});

for (const boundary of ['fetch', 'body']) {
  test(`transport refuses overdue ${boundary} success before the abort timer can run`, async () => {
    const blockPastDeadline = () => {
      const until = performance.now() + REQUEST_TIMEOUT_MS + 50;
      const cell = new Int32Array(new SharedArrayBuffer(4));
      while (performance.now() < until) Atomics.wait(cell, 0, 0, until - performance.now());
    };
    const f = fixture(() => {
      if (boundary === 'fetch') {
        blockPastDeadline();
        return response({ project });
      }
      return new Response(new ReadableStream({
        pull(controller) {
          blockPastDeadline();
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ project })));
          controller.close();
        },
      }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/json' } });
    });
    const start = performance.now();
    await assert.rejects(f.run('getProject', cases[0][1]), { message: 'UPSTREAM_UNAVAILABLE' });
    assert(performance.now() - start >= REQUEST_TIMEOUT_MS);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].init.signal.aborted, true);
  });
}

test('transport accepts on-time success and refuses in-flight abort even when fetch ignores it', async () => {
  const onTime = fixture({ project });
  assert.deepEqual(await onTime.run('getProject', cases[0][1]), { project });
  assert.equal(onTime.requests.length, 1);
  const controller = new AbortController();
  const aborted = fixture(() => {
    controller.abort();
    return new Promise(() => {});
  });
  await assert.rejects(aborted.run('getProject', cases[0][1], controller.signal), { message: 'UPSTREAM_UNAVAILABLE' });
  assert.equal(aborted.requests.length, 1);
  assert.equal(aborted.requests[0].init.signal.aborted, true);
});

test('transport refuses CR/LF credentials before invoking injected fetch', async () => {
  for (const [name, args, raw] of cases) {
    const f = fixture(raw);
    const operation = f.operation(name);
    for (const credential of [`${canary}\r`, `${canary}\n`, `${canary}\r\nX-Test: injected`]) {
      await assert.rejects(operation.execute(operation.prepare(args), credential, new AbortController().signal),
        { message: 'UPSTREAM_UNAVAILABLE' });
    }
    assert.equal(f.requests.length, 0);
  }
});

test('fixed transport exposes exactly the mapped source methods and rejects path injection even at the transport seam', () => {
  const transport = createNeonMetadataTransport(() => { throw Error('not called'); });
  assert.deepEqual(Object.keys(transport).sort(), allCases.map(([name]) => name).sort());
  assert.throws(() => transport.getProject('../credentials', { credential: canary, signal: new AbortController().signal }));
});

test('194-operation inventory stays explicit: mapped source only, no qualification/enablement or package completeness', () => {
  const map = JSON.parse(readFileSync(new URL('../operation-map.json', import.meta.url)));
  const snapshot = JSON.parse(readFileSync(new URL('../api-snapshot.json', import.meta.url)));
  assert.equal(map.inventory.length, 194);
  assert.equal(new Set(map.inventory).size, 194);
  assert.deepEqual(map.inventory, snapshot.operations.map(op => op.id));
  assert.deepEqual(map.operations.filter(op => op.implemented).map(op => op.id).sort(), allCases.map(([name]) => name).sort());
  assert.equal(map.operations.filter(op => op.status === 'incomplete').length, map.inventory.length - allCases.length);
  assert(map.operations.every(op => !op.reviewed && !op.enabled && op.entitlement === 'unknown' && op.prerequisite));
  assert.equal(map.reference.sha256, 'bcc73bd5e55a57a5349791a6367e62b39763cc512e49346b27a4436bb79ebafa');
});
