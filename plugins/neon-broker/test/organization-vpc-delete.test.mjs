import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationVPCDeleteOperations } from '../dist/plugins/neon-broker/src/organization-vpc-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationVPCDeleteFixture as fixture, organizationVPCDeleteArgs as args, organizationVPCDeleteScope as scope,
  organizationVPCDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'deleteOrganizationVPCEndpoint';
const expected = { acknowledged: true };
const acknowledged = () => new Response(null, { status: 200 });

test('Organization VPC delete: exact detail preflight and one bodyless DELETE acknowledge irreversible organization removal only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  const url = `${NEON_ORIGIN}/api/v2/organizations/org-a/vpc/region/aws-us-east-1/vpc_endpoints/vpce-a`;
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[url, 'GET'], [url, 'DELETE']]);
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
  assert.equal(op.prepare(args).resource.id, 'neon/organizations/org-a/vpc/region/aws-us-east-1/vpc_endpoints/vpce-a/delete');
  assert.equal(op.prepare(args).plan.effect, 'remove_organization_vpc_endpoint_cannot_be_added_back');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['enforcementVerified', 'cloudEndpointDeleted', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Organization VPC delete: copied strict scope and exact plans refuse overrides before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonOrganizationVPCDeleteOperations(config, {});
  config.organizationId = config.regionId = config.vpcEndpointId = 'other';
  assert.equal(op.prepare(args).plan.vpc_endpoint_id, 'vpce-a');
  for (const raw of [null, [], {}, ...['org_id', 'region_id', 'vpc_endpoint_id'].map(k => ({ ...args, [k]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout', 'project_id', 'branch_id'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'vpc_endpoint_id', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/delete', '') } },
    ...['org_id', 'region_id', 'vpc_endpoint_id', 'effect', 'cloudEndpointDeleted', 'diff'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Organization VPC delete: absent, malformed and foreign detail refuses before mutation', async () => {
  for (const raw of [null, {}, [], { endpoints: [metadata] }, { ...metadata, vpc_endpoint_id: 'other' },
    ...[{ org_id: 'other' }, { region_id: 'aws-other' }, { project_id: 'project-a' }, { branch_id: 'br-a' }, { pagination: {} }].map(change => ({ ...metadata, ...change }))]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? acknowledged() : response({ ...metadata, org_id: args.org_id, region_id: args.region_id }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Organization VPC delete: ambiguity observes once and never upgrades absence or replacement to completion', async () => {
  for (const after of [metadata, { ...metadata, vpc_endpoint_id: 'other' }, null, {}]) {
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

test('Organization VPC delete: only empty200 accepts; wrong status, body, redirect, encoding and length refuse', async () => {
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

test('Organization VPC delete: sensitive state and restricted projects never evaluate; acknowledgement stays closed', async () => {
  const row = { vpc_endpoint_id: 'vpce-a' };
  for (const k of ['label', 'state', 'num_restricted_projects', 'example_restricted_projects', 'secret', 'error']) {
    Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonOrganizationVPCDeleteOperations(scope, {
    async getOrganizationVPCEndpointDetails() { return row; }, async deleteOrganizationVPCEndpoint() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, { acknowledged: false }, { ...expected, secret: canary },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Organization VPC delete: abort and ignored fetch/body deadlines bound the single attempt', async () => {
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

test('Organization VPC delete: Azure and unsafe paths refuse; exact256 composed resource matches transport bounds', async () => {
  for (const change of [{ organizationId: '../o' }, { organizationId: '-o' }, { organizationId: 'o'.repeat(61) },
    { regionId: 'azure-eastus' }, { regionId: 'aws-../x' }, { regionId: 'aws-' }, { regionId: 'aws-' + 'r'.repeat(77) },
    { vpcEndpointId: 'v'.repeat(81) }, { vpcEndpointId: '-v' }, { vpcEndpointId: '../v' }, { vpcEndpointId: 'v?x=y' }, { revision: '' }, { approved: true }]) {
    assert.throws(() => createNeonOrganizationVPCDeleteOperations({ ...scope, ...change }, {}));
  }
  const maximum = { ...scope, organizationId: 'o'.repeat(60), regionId: 'aws-' + 'r'.repeat(76), vpcEndpointId: 'v'.repeat(63) };
  assert.throws(() => createNeonOrganizationVPCDeleteOperations({ ...maximum, vpcEndpointId: 'v'.repeat(64) }, {}));
  for (const config of [{ ...scope, organizationId: 'o', regionId: 'aws-r', vpcEndpointId: 'v' }, maximum, { ...scope, vpcEndpointId: 'VPC_123-a' }]) {
    const f = fixture(null, config);
    const selected = { org_id: config.organizationId, region_id: config.regionId, vpc_endpoint_id: config.vpcEndpointId };
    if (config === maximum) assert.equal(f.operation(name).prepare(selected).resource.id.length, 256);
    assert.deepEqual(await f.run(name, selected), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../v', 'v\n', 'v?x=y', 'v'.repeat(81)]) assert.throws(() => t.deleteOrganizationVPCEndpoint('org-a', scope.regionId, bad, options));
  for (const bad of ['../o', 'o\n', 'o?x=y', 'o'.repeat(61)]) assert.throws(() => t.deleteOrganizationVPCEndpoint(bad, scope.regionId, 'vpce-a', options));
  for (const bad of ['azure-eastus', 'aws-../x', 'aws-r\n']) assert.throws(() => t.deleteOrganizationVPCEndpoint('org-a', bad, 'vpce-a', options));
  await assert.rejects(t.deleteOrganizationVPCEndpoint('org-a', scope.regionId, 'vpce-a', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
