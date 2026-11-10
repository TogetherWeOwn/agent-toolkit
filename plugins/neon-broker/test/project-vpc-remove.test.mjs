import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectVPCRemoveOperations } from '../dist/plugins/neon-broker/src/project-vpc-remove.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { projectVPCRemoveFixture as fixture, projectVPCRemoveArgs as args, projectVPCRemoveScope as scope,
  projectVPCRemoveMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteProjectVPCEndpoint';
const expected = { acknowledged: true };
const acknowledged = () => new Response(null, { status: 200 });

test('Project VPC removal: bounded presence preflight and one bodyless DELETE acknowledge restriction removal only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${NEON_ORIGIN}/api/v2/projects/project-a/vpc_endpoints`, 'GET'],
    [`${NEON_ORIGIN}/api/v2/projects/project-a/vpc_endpoints/vpce-a`, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    assert.equal(init.headers['Content-Type'], undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/vpc_endpoints/vpce-a/remove');
  assert.equal(op.prepare(args).plan.effect, 'remove_project_vpc_endpoint_restriction_may_broaden_network_access');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'endpointDeleted', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Project VPC removal: copied strict scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonProjectVPCRemoveOperations(config, {});
  config.vpcEndpointId = 'other';
  config.projectId = 'other';
  assert.equal(op.prepare(args).plan.vpc_endpoint_id, 'vpce-a');
  for (const raw of [null, [], {}, { ...args, project_id: 'other' }, { ...args, vpc_endpoint_id: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout', 'org_id', 'region_id'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'vpc_endpoint_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/remove', '') } },
    ...['vpc_endpoint_id', 'effect', 'endpointDeleted', 'diff'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Project VPC removal: absent, duplicate, oversized, malformed and foreign full lists refuse before mutation', async () => {
  for (const raw of [null, {}, [], { endpoints: [] }, { endpoints: [{ vpc_endpoint_id: 'other' }] },
    { endpoints: Array(2).fill(metadata.endpoints[0]) },
    { endpoints: Array.from({ length: 31 }, (_, n) => ({ vpc_endpoint_id: `vpce-${n}` })) },
    ...[null, {}, { vpc_endpoint_id: '' }, { vpc_endpoint_id: 'x\n' }, { vpc_endpoint_id: 'x'.repeat(257) },
      { vpc_endpoint_id: 'other', project_id: 'foreign' }, { vpc_endpoint_id: 'other', branch_id: 'br-a' },
      { vpc_endpoint_id: 'other', pagination: {} }].map(row => ({ endpoints: [metadata.endpoints[0], row] })),
    ...[{ project_id: 'other' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? acknowledged() : response({ ...metadata, project_id: 'project-a' }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Project VPC removal: ambiguity observes once without upgrading absent or replaced restrictions to completion', async () => {
  for (const after of [metadata, { endpoints: [] }, { endpoints: [{ vpc_endpoint_id: 'other' }] }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => init.method === 'DELETE' ? response({}, { status: 500 }) : response(metadata, { status: n > 2 ? 404 : 200 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Project VPC removal: only empty200 accepts; wrong status, nonempty, redirected, encoded and malformed length refuse', async () => {
  for (const make of [...[202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', canary].map(body => () => new Response(body, { status: 200 })),
    ...['invalid', '1', '65537'].map(length => () => new Response(null, { status: 200, headers: { 'content-length': length } })),
    () => new Response(null, { status: 200, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
  for (const make of [acknowledged, () => new Response('', { status: 200 }),
    () => new Response(null, { status: 200, headers: { 'content-length': '0' } })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Project VPC removal: unused labels never evaluate and normalized acknowledgement remains closed', async () => {
  const row = { vpc_endpoint_id: 'vpce-a' };
  for (const k of ['label', 'secret', 'error']) Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  const [op] = createNeonProjectVPCRemoveOperations(scope, {
    async listProjectVPCEndpoints() { return { endpoints: [row] }; }, async deleteProjectVPCEndpoint() { return { acknowledged: true }; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, { acknowledged: false }, { acknowledged: true, secret: canary },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Project VPC removal: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? acknowledged() : response(metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Project VPC removal: canonical path bounds and maximum valid target match transport', async () => {
  for (const change of [{ projectId: '../p' }, { projectId: '-p' }, { projectId: 'p'.repeat(61) }, { vpcEndpointId: 'v'.repeat(81) },
    { vpcEndpointId: '-v' }, { vpcEndpointId: '../v' }, { vpcEndpointId: 'v?x=y' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonProjectVPCRemoveOperations({ ...scope, ...change }, {}));
  }
  for (const [projectId, vpcEndpointId] of [['p', 'v'], ['p'.repeat(60), 'v'.repeat(80)], ['project-a', 'VPC_123-a']]) {
    const config = { ...scope, projectId, vpcEndpointId };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { project_id: config.projectId, vpc_endpoint_id: config.vpcEndpointId }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../v', 'v\n', 'v?x=y', 'v'.repeat(81)]) assert.throws(() => t.deleteProjectVPCEndpoint('project-a', bad, options));
  for (const bad of ['../p', 'p\n', 'p?x=y', 'p'.repeat(61)]) assert.throws(() => t.deleteProjectVPCEndpoint(bad, 'vpce-a', options));
  await assert.rejects(t.deleteProjectVPCEndpoint('project-a', 'vpce-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
