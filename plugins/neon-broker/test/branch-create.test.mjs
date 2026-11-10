import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchCreateOperations } from '../dist/plugins/neon-broker/src/branch-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { branchCreateFixture as fixture, branchCreateArgs as args, branchCreateScope as scope,
  branchCreateReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'createProjectBranch';
const parent = { branch: { id: 'br-a', project_id: 'project-a' } };
const empty = { branches: [] };
const expected = { id: 'br-new', parent_id: 'br-a', acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };
const isList = url => new URL(url).pathname.endsWith('/branches');
const preflight = url => response(isList(url) ? empty : parent);
const desired = { branch: { parent_id: 'br-a', name: 'schema_child', init_source: 'parent-schema', protected: false } };
const existing = { id: 'br-existing', project_id: 'project-a', name: 'other' };

test('Branch create: exact parent and terminal name-absence preflights precede one schema-only POST without endpoints', async () => {
  const f = fixture(receipt);
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a/branches`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${path}/br-a`, 'GET'], [`${path}?limit=10&sort_by=name&sort_order=asc&include_deleted=false`, 'GET'], [path, 'POST']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.body, init.method === 'POST' ? JSON.stringify(desired) : undefined);
  }
  const op = f.operation(name);
  const p = op.prepare(args);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 8500);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/create/schema_child');
  assert.deepEqual(p.plan.diff, { before: 'selected_branch_name_absent', after: desired });
  for (const key of ['atomicCompareAndSwap', 'endpointsRequested', 'dataIsolationVerified', 'persistenceVerified']) assert.equal(p.plan[key], false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Branch create: copied exact scope and strict arguments/prepared plan refuse overrides before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonBranchCreateOperations(config, {});
  config.parentId = 'br-other';
  assert.equal(op.prepare(args).plan.parent_id, scope.parentId);
  for (const raw of [null, [], {}, ...['project_id', 'parent_id', 'name'].map(k => ({ ...args, [k]: 'other' })),
    ...['branch', 'endpoints', 'init_source', 'parent_timestamp', 'parent_lsn', 'protected', 'realtime', 'archived', 'expires_at', 'approved', 'agent', 'credential', 'url', 'retry', 'revision'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/create/', '/') } },
    ...['preflight', 'effect', 'diff', 'dataIsolationVerified'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Branch create: malformed/foreign/missing parent refuses before collection or mutation', async () => {
  for (const raw of [null, {}, { branch: null }, { branch: {} }, { branch: { ...parent.branch, id: 'br-b' } },
    { branch: { ...parent.branch, project_id: 'other' } }, { ...parent, project_id: 'other' }, { ...parent, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(() => response(parent, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Branch create: all sorted pages must be terminal and name absent; later-page collision refuses', async () => {
  for (const collision of [false, true]) {
    const f = fixture((url, init) => {
      if (init.method === 'POST') return response(receipt, { status: 201 });
      if (!isList(url)) return response(parent);
      if (!new URL(url).searchParams.has('cursor')) return response({ branches: [existing], pagination: { next: 'page-two', sort_by: 'name', sort_order: 'asc' } });
      return response({ branches: collision ? [{ ...existing, id: 'br-second', name: scope.name }] : [], pagination: { sort_by: 'name', sort_order: 'asc' } });
    });
    if (collision) await assert.rejects(f.run(name, args));
    else assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, collision ? 3 : 4);
    assert.equal(new URL(f.requests[2].url).searchParams.get('cursor'), 'page-two');
  }
  const f = fixture(url => isList(url) ? response({ branches: [{ ...existing, name: scope.name }] }) : response(parent));
  await assert.rejects(f.run(name, args));
  assert.equal(f.requests.length, 2);
});

test('Branch create: malformed complete collections, page overflow/cycles and cross-page duplicates refuse without POST', async () => {
  for (const raw of [null, {}, { branches: null }, { branches: [existing, existing] },
    { branches: Array.from({ length: 11 }, (_, n) => ({ ...existing, id: `br-${n}` })) },
    ...[{ name: null }, { name: '' }, { name: 'x'.repeat(257) }, { name: 'x\n' }, { id: 'bad' }, { project_id: 'other' }].map(change => ({ branches: [{ ...existing, ...change }] })),
    ...[null, { next: '' }, { next: null }, { next: 'x\n' }, { next: 'x'.repeat(257) }, { cursor: 'wrong-field' }, { sort_by: 'created_at' }, { sort_order: 'desc' }, { sort_order: 1 }].map(pagination => ({ ...empty, pagination })),
    { ...empty, project_id: 'other' }]) {
    const f = fixture(url => isList(url) ? response(raw) : response(parent));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
  for (const mode of ['cycle', 'overflow', 'duplicate']) {
    const f = fixture((url, init, n) => !isList(url) ? response(parent) : response({
      branches: mode === 'duplicate' ? [existing] : [], pagination: { next: mode === 'cycle' ? 'same' : `page-${n}` } }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, mode === 'overflow' ? 4 : 3);
    assert.equal(f.requests.some(({ init }) => init.method === 'POST'), false);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(url => isList(url) ? response(empty, { status }) : response(parent));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
});

test('Branch create: ambiguous mutation observes one bounded collection and never promotes presence/absence to success', async () => {
  for (const after of [empty, { branches: [receipt.branch] }, { branches: [{ ...receipt.branch, parent_id: 'br-other' }] }, null, {}, { ...empty, project_id: 'other' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return n > 3 ? response(after) : preflight(url);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
  }
  const f = fixture((url, init, n) => {
    if (init.method === 'POST') throw Error(canary);
    return n > 3 ? response({ branches: [], pagination: { next: `after-${n}` } }) : preflight(url);
  });
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 6);
  assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
});

test('Branch create: exact201 new identity/parent/name and bound-operation acknowledgement required', async () => {
  const bad = [null, {}, { branch: null }, ...[{ id: 'bad' }, { id: 'br-a' }, { name: 'other' }, { project_id: 'other' }, { parent_id: 'br-b' },
    { default: true }, { protected: true }].map(change => ({ ...receipt, branch: { ...receipt.branch, ...change } })),
    ...[{ endpoints: [{}] }, { endpoints: null }, { operations: null }, { operations: [receipt.operations[0], receipt.operations[0]] }, { pagination: {} }, { project_id: 'other' },
      { operations: Array.from({ length: 31 }, () => receipt.operations[0]) }].map(change => ({ ...receipt, ...change })),
    ...[{ id: 'bad' }, { status: 'unknown' }, { project_id: 'other' }, { branch_id: 'br-a' }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))];
  for (const make of [...bad.map(raw => () => response(raw, { status: 201 })),
    ...[200, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    () => new Response(canary, { status: 201, headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(65537), { status: 201, headers: { 'content-type': 'application/json' } }),
    ...['invalid', '65537'].map(length => () => response(receipt, { status: 201, headers: { 'content-type': 'application/json', 'content-length': length } })),
    () => response(receipt, { status: 201, headers: { 'content-type': 'text/plain' } }),
    () => ({ status: 201, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : preflight(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
  }
});

test('Branch create: password-bearing roles and connection URIs/unused metadata never evaluated or emitted', async () => {
  const ignored = raw => {
    for (const k of ['roles', 'databases', 'connection_uris', 'password', 'connection_uri', 'created_at', 'updated_at', 'action', 'error']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonBranchCreateOperations(scope, {
    async getProjectBranch() { return ignored({ branch: ignored({ ...parent.branch }) }); },
    async listProjectBranches() { return ignored({ branches: [ignored({ ...existing })] }); },
    async createProjectBranch() { return ignored({ branch: ignored({ ...receipt.branch }), endpoints: [], operations: receipt.operations.map(v => ignored({ ...v })) }); },
  });
  const result = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(result, expected);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  for (const raw of [null, [], {}, expected, { ...receipt, branch: { ...receipt.branch, name: 'other' } },
    { ...receipt, branch: Object.defineProperty({}, 'id', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...receipt, roles: [{ password: canary }], connection_uris: [{ connection_uri: canary }] }), expected);
  assert.deepEqual(op.project({ ...receipt, operations: [] }), { ...expected, operations: [] });
});

test('Branch create: cancellation and ignored fetch/body deadlines bound one mutation', async () => {
  for (const stopAt of [1, 2, 3]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? response(receipt, { status: 201 }) : preflight(url);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 3 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : preflight(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
});

test('Branch create: canonical selection and maximum budgets; direct transport rejects unsafe paths', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { parentId: 'b' }, { parentId: 'br-' },
    { revision: '' }, { name: '../x' }, { name: 'x'.repeat(81) }, { name: 'name\n' }, { name: '' }, { protected: true }]) assert.throws(() => createNeonBranchCreateOperations({ ...scope, ...change }, {}));
  for (const name of ['a', 'a'.repeat(80)]) {
    const config = { ...scope, projectId: 'p'.repeat(60), parentId: 'br-' + 'b'.repeat(57), name, revision: 'r'.repeat(80) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run('createProjectBranch', { project_id: config.projectId, parent_id: config.parentId, name }),
      { id: 'br-new', parent_id: config.parentId, acknowledged: true, operations: [] });
    assert.deepEqual(JSON.parse(f.requests[2].init.body), { branch: { ...desired.branch, parent_id: config.parentId, name } });
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(81)]) {
    assert.throws(() => t.createProjectBranch(bad, 'br-a', 'schema_child', options));
    assert.throws(() => t.createProjectBranch('project-a', bad, 'schema_child', options));
    assert.throws(() => t.createProjectBranch('project-a', 'br-a', bad, options));
  }
  await assert.rejects(t.createProjectBranch('project-a', 'br-a', 'schema_child', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
