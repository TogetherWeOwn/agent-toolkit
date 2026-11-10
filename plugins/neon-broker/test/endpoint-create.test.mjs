import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonEndpointCreateOperations } from '../dist/plugins/neon-broker/src/endpoint-create.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { endpointCreateFixture as fixture, endpointCreateArgs as args, endpointCreateScope as scope,
  endpointCreateReceipt as receipt, endpointCreateConfig as desired, canary, response } from './helpers.mjs';

const name = 'createProjectEndpoint';
const branch = { branch: { id: 'br-a', project_id: 'project-a' } };
const empty = { endpoints: [] };
const expected = { id: 'ep-new', branch_id: 'br-a', acknowledged: true, operations: receipt.operations.map(({ id, status }) => ({ id, status })) };
const preflight = url => response(url.endsWith('/endpoints') ? empty : branch);

test('Endpoint create: branch identity and bounded absence precede one fixed disabled read-only POST', async () => {
  const f = fixture(receipt);
  assert.deepEqual(await f.run(name, args), expected);
  const path = `${NEON_ORIGIN}/api/v2/projects/project-a`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${path}/branches/br-a`, 'GET'], [`${path}/branches/br-a/endpoints`, 'GET'], [`${path}/endpoints`, 'POST']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['Content-Type'], init.method === 'POST' ? 'application/json' : undefined);
    assert.equal(init.body, init.method === 'POST' ? JSON.stringify({ endpoint: desired }) : undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 4500);
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/endpoints/create/replica_a');
  assert.deepEqual(p.plan.diff, { before: 'selected_endpoint_name_absent', after: desired });
  for (const key of ['atomicCompareAndSwap', 'spendCapEnforced', 'independentFenceVerified', 'persistenceVerified']) assert.equal(p.plan[key], false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('Endpoint create: copied exact scope, strict arguments and prepared plan refuse overrides before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonEndpointCreateOperations(config, {});
  config.name = 'other';
  assert.equal(op.prepare(args).plan.name, scope.name);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'name'].map(k => ({ ...args, [k]: 'other' })),
    ...['endpoint', 'type', 'disabled', 'autoscaling_limit_max_cu', 'settings', 'approved', 'agent', 'credential', 'url', 'retry', 'revision'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'name', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/create/', '/') } },
    ...['preflight', 'effect', 'diff', 'spendCapEnforced'].map(k => ({ plan: { ...p.plan, [k]: true } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Endpoint create: malformed or foreign branch preflight never reaches collection or mutation', async () => {
  for (const raw of [null, {}, { branch: null }, { branch: {} }, { branch: { ...branch.branch, id: 'br-b' } },
    { branch: { ...branch.branch, project_id: 'other' } }, { ...branch, project_id: 'other' }, { ...branch, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(() => response(branch, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('Endpoint create: existing name refuses regardless of type; unnamed and differently named endpoints permit creation', async () => {
  for (const type of ['read_only', 'read_write']) {
    const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) :
      url.endsWith('/endpoints') ? response({ endpoints: [{ ...receipt.endpoint, type }] }) : response(branch));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
  for (const endpoint of [{ ...receipt.endpoint, name: 'other' }, { id: 'ep-existing', project_id: 'project-a', branch_id: 'br-a', type: 'read_write' }]) {
    const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) :
      url.endsWith('/endpoints') ? response({ endpoints: [endpoint] }) : response(branch));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Endpoint create: validate entire bounded nonpaginated collection before name-absence decision', async () => {
  const other = { ...receipt.endpoint, name: 'other' };
  for (const raw of [null, {}, { endpoints: null }, { endpoints: [other, other] },
    { endpoints: Array.from({ length: 31 }, (_, n) => ({ ...other, id: `ep-${n}` })) },
    ...[{ name: null }, { name: '' }, { name: 'x'.repeat(65) }, { name: 'x\n' }, { id: 'bad' }, { type: 'unknown' },
      { branch_id: 'br-b' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ endpoints: [{ ...other, ...change }] })),
    { ...empty, branch_id: 'br-b' }, { ...empty, pagination: {} }]) {
    const f = fixture(url => url.endsWith('/endpoints') ? response(raw) : response(branch));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
  for (const status of [201, 403, 404, 410, 500]) {
    const f = fixture(url => url.endsWith('/endpoints') ? response(empty, { status }) : response(branch));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 2);
  }
});

test('Endpoint create: ambiguous mutation observes once and never promotes presence/absence to success', async () => {
  for (const after of [empty, { endpoints: [receipt.endpoint] }, { endpoints: [{ ...receipt.endpoint, name: 'replacement' }] }, null, {}, { ...empty, branch_id: 'br-b' }]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return n > 3 ? response(after) : preflight(url);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
    assert.equal(f.requests[3].url, f.requests[1].url);
  }
});

test('Endpoint create: exact201 config/identity echo and bounded bound-operation observations required', async () => {
  const bad = [null, {}, { endpoint: null }, ...[{ id: 'bad' }, { name: 'other' }, { project_id: 'other' }, { branch_id: 'br-b' },
    { type: 'read_write' }, { disabled: false }, { disabled: 'true' }, { autoscaling_limit_min_cu: 1 }, { autoscaling_limit_max_cu: 1 },
    { provisioner: 'k8s-pod' }, { suspend_timeout_seconds: 0 }].map(change => ({ ...receipt, endpoint: { ...receipt.endpoint, ...change } })),
    ...[{ operations: null }, { operations: [receipt.operations[0], receipt.operations[0]] }, { pagination: {} }, { project_id: 'other' },
      { operations: Array.from({ length: 31 }, () => receipt.operations[0]) }].map(change => ({ ...receipt, ...change })),
    ...[{ id: 'bad' }, { status: 'unknown' }, { project_id: 'other' }, { branch_id: 'br-b' }, { endpoint_id: 'ep-other' }].map(change => ({ ...receipt, operations: [{ ...receipt.operations[0], ...change }] }))];
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

test('Endpoint create: unused sensitive metadata never evaluated and project independently validates', async () => {
  const ignored = raw => {
    for (const k of ['host', 'proxy_host', 'settings', 'password', 'connection_uri', 'created_at', 'updated_at', 'action', 'error']) {
      Object.defineProperty(raw, k, { get() { throw Error('unused'); }, enumerable: true });
    }
    return raw;
  };
  const [op] = createNeonEndpointCreateOperations(scope, {
    async getProjectBranch() { return ignored({ branch: ignored({ ...branch.branch }) }); },
    async listProjectBranchEndpoints() { return { endpoints: [ignored({ id: 'ep-existing', project_id: 'project-a', branch_id: 'br-a', type: 'read_only' })] }; },
    async createProjectEndpoint() { return ignored({ endpoint: ignored({ ...receipt.endpoint }), operations: receipt.operations.map(v => ignored({ ...v })) }); },
  });
  const result = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(result, expected);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  for (const raw of [null, [], {}, expected, { ...receipt, endpoint: { ...receipt.endpoint, name: 'other' } },
    { ...receipt, endpoint: Object.defineProperty({}, 'id', { get() { throw Error('getter'); }, enumerable: true }) }]) assert.throws(() => op.project(raw));
  assert.deepEqual(op.project({ ...receipt, ignored: canary }), expected);
  assert.deepEqual(op.project({ ...receipt, operations: [] }), { ...expected, operations: [] });
});

test('Endpoint create: cancellation and ignored fetch/body deadlines bound one mutation', async () => {
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

test('Endpoint create: canonical parsers, maximum budgets and unsafe direct transport refusals', async () => {
  for (const change of [{ projectId: '-p' }, { projectId: 'p'.repeat(61) }, { branchId: 'b' }, { branchId: 'br-' },
    { revision: '' }, { name: '../x' }, { name: 'x'.repeat(65) }, { name: 'name\n' }, { name: '' }, { disabled: false }]) assert.throws(() => createNeonEndpointCreateOperations({ ...scope, ...change }, {}));
  for (const name of ['a', 'a'.repeat(64)]) {
    const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'br-' + 'b'.repeat(57), name, revision: 'r'.repeat(80) };
    const f = fixture(null, config);
    assert.deepEqual(await f.run('createProjectEndpoint', { project_id: config.projectId, branch_id: config.branchId, name }),
      { id: 'ep-new', branch_id: config.branchId, acknowledged: true, operations: [] });
    assert.deepEqual(JSON.parse(f.requests[2].init.body), { endpoint: { ...desired, branch_id: config.branchId, name } });
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../p', 'project\n', 'p?x=y', 'p'.repeat(65)]) {
    assert.throws(() => t.createProjectEndpoint(bad, 'br-a', 'replica_a', options));
    assert.throws(() => t.createProjectEndpoint('project-a', bad, 'replica_a', options));
    assert.throws(() => t.createProjectEndpoint('project-a', 'br-a', bad, options));
  }
  await assert.rejects(t.createProjectEndpoint('project-a', 'br-a', 'replica_a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
