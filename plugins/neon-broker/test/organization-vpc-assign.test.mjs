import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationVPCAssignOperations } from '../dist/plugins/neon-broker/src/organization-vpc-assign.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationVPCAssignFixture as fixture, organizationVPCAssignArgs as args, organizationVPCAssignScope as scope,
  organizationVPCAssignMetadata as metadata, canary, response } from './helpers.mjs';

const name = 'assignOrganizationVPCEndpoint';
const expected = { acknowledged: true };
const acknowledged = () => new Response(null, { status: 200 });
const path = `${NEON_ORIGIN}/api/v2/organizations/org-a/vpc/region/aws-us-east-1/vpc_endpoints/vpce-a`;

test('Organization VPC assignment: exact existing-label detail preflight then one label-only POST acknowledges only', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[path, 'GET'], [path, 'POST']]);
  assert.equal(f.requests[0].init.body, undefined);
  assert.equal(f.requests[1].init.body, JSON.stringify({ label: scope.label }));
  assert.equal(f.requests[1].init.headers['Content-Type'], 'application/json');
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/organizations/org-a/vpc/region/aws-us-east-1/vpc_endpoints/vpce-a/assign');
  assert.deepEqual(op.prepare(args).plan.diff, { before: scope.expectedLabel, after: scope.label });
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const k of ['atomicCompareAndSwap', 'policyPreservationVerified', 'enforcementVerified', 'sessionsRevoked', 'connectionFence']) assert.equal(op.prepare(args).plan[k], false);
});

test('Organization VPC assignment: copied strict scope and tampered plans refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonOrganizationVPCAssignOperations(config, {});
  config.organizationId = 'other';
  config.regionId = 'aws-other';
  config.vpcEndpointId = 'other';
  config.expectedLabel = 'other';
  config.label = 'other';
  assert.deepEqual(op.prepare(args).plan.diff, { before: scope.expectedLabel, after: scope.label });
  for (const raw of [null, [], {}, { ...args, org_id: 'other' }, { ...args, region_id: 'aws-other' }, { ...args, vpc_endpoint_id: 'other' }, { ...args, label: 'other' },
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'revision', 'force', 'timeout', 'project_id', 'expected_label', 'body'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'label', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id.replace('/assign', '/delete') } },
    ...['label', 'effect', 'policyPreservationVerified', 'diff'].map(k => ({ plan: { ...p.plan, [k]: 'other' } })),
    { artifactDigest: '0'.repeat(64) }]) await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('Organization VPC assignment: absent, changed, malformed and foreign assignment details refuse before mutation', async () => {
  for (const raw of [null, {}, [], { endpoints: [metadata] }, { ...metadata, vpc_endpoint_id: 'other' }, { ...metadata, label: scope.label },
    ...['', 'x\n', null, 2].map(label => ({ ...metadata, label })),
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
  const f = fixture((url, init) => init.method === 'POST' ? acknowledged() : response({ ...metadata, org_id: scope.organizationId, region_id: scope.regionId }));
  assert.deepEqual(await f.run(name, args), expected);
});

test('Organization VPC assignment: ambiguity observes once without upgrading desired label or absence to success', async () => {
  for (const after of [metadata, { ...metadata, label: scope.label }, { ...metadata, vpc_endpoint_id: 'other' }, null, {}]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? metadata : after);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'POST', 'GET']);
    assert.equal(f.requests[2].url, path);
  }
  const f = fixture((url, init, n) => init.method === 'POST' ? response({}, { status: 500 }) : response(metadata, { status: n > 2 ? 404 : 200 }));
  await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Organization VPC assignment: only empty200 accepts; wrong status, nonempty, redirected and encoded receipts refuse', async () => {
  for (const make of [...[201, 202, 204, 302, 403, 404, 409, 410, 500].map(status => () => new Response(null, { status })),
    ...['{}', ' ', canary].map(body => () => new Response(body, { status: 200 })),
    ...['invalid', '1', '65537'].map(length => () => new Response(null, { status: 200, headers: { 'content-length': length } })),
    () => new Response(null, { status: 200, headers: { 'content-encoding': 'gzip' } }),
    () => ({ status: 200, redirected: true, body: null, headers: new Headers() }),
    () => new Response(new ReadableStream({ start(c) { c.error(Error(canary)); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
    assert.equal(f.requests.length, 3);
  }
  for (const make of [acknowledged, () => new Response('', { status: 200 }),
    () => new Response(null, { status: 200, headers: { 'content-length': '0' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(metadata));
    assert.deepEqual(await f.run(name, args), expected);
  }
});

test('Organization VPC assignment: sensitive metadata never evaluates and normalized acknowledgement remains closed', async () => {
  const row = { ...metadata };
  for (const k of ['secret', 'state', 'num_restricted_projects', 'example_restricted_projects', 'error']) Object.defineProperty(row, k, { get() { throw Error('unused'); }, enumerable: true });
  const [op] = createNeonOrganizationVPCAssignOperations(scope, {
    async getOrganizationVPCEndpointDetails() { return row; }, async assignOrganizationVPCEndpoint() { return expected; },
  });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const raw of [null, [], {}, { acknowledged: false }, { acknowledged: true, label: canary },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
  for (const key of ['label', 'vpc_endpoint_id', 'org_id', 'region_id']) {
    const unsafe = Object.defineProperty({ ...metadata }, key, { get() { throw Error('getter'); }, enumerable: true });
    const [bad] = createNeonOrganizationVPCAssignOperations(scope, { async getOrganizationVPCEndpointDetails() { return unsafe; } });
    await assert.rejects(bad.execute(bad.prepare(args), canary, new AbortController().signal));
  }
});

test('Organization VPC assignment: abort and ignored fetch/body deadlines bound the single attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'POST' ? acknowledged() : response(metadata);
    });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 200 })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : response(metadata));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 3);
  }
});

test('Organization VPC assignment: AWS-only canonical paths, labels and composed-resource budgets match transport', async () => {
  for (const change of [{ organizationId: '../o' }, { organizationId: '-o' }, { organizationId: 'o'.repeat(61) }, { vpcEndpointId: 'v'.repeat(81) },
    { regionId: 'azure-eastus' }, { regionId: 'aws-' }, { regionId: 'aws-r\n' }, { regionId: 'aws-' + 'r'.repeat(77) },
    { vpcEndpointId: '-v' }, { vpcEndpointId: '../v' }, { vpcEndpointId: 'v?x=y' }, { revision: '' }, { approved: true },
    ...['', 'x\n', ' x', 'x ', 'é', 'x'.repeat(81)].flatMap(label => [{ label }, { expectedLabel: label }]),
    { label: scope.expectedLabel }, { organizationId: 'o'.repeat(60), regionId: 'aws-' + 'r'.repeat(76), vpcEndpointId: 'v'.repeat(80) }]) assert.throws(() => createNeonOrganizationVPCAssignOperations({ ...scope, ...change }, {}));
  for (const [organizationId, regionId, vpcEndpointId, label] of [['o', 'aws-r', 'v', 'a'],
    ['o'.repeat(60), 'aws-' + 'r'.repeat(76), 'v'.repeat(63), 'L'.repeat(80)], ['org-a', 'aws-us-east-1', 'VPC_123-a', 'label_2']]) {
    const config = { ...scope, organizationId, regionId, vpcEndpointId, label };
    const f = fixture(null, config);
    assert.deepEqual(await f.run(name, { org_id: organizationId, region_id: regionId, vpc_endpoint_id: vpcEndpointId, label }), expected);
  }
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['../v', 'v\n', 'v?x=y', 'v'.repeat(81)]) assert.throws(() => t.assignOrganizationVPCEndpoint('org-a', scope.regionId, bad, scope.label, options));
  for (const bad of ['../o', 'o\n', 'o?x=y', 'o'.repeat(61)]) assert.throws(() => t.assignOrganizationVPCEndpoint(bad, scope.regionId, 'vpce-a', scope.label, options));
  for (const bad of ['azure-eastus', 'aws-', 'aws-r\n', 'aws-' + 'r'.repeat(77)]) assert.throws(() => t.assignOrganizationVPCEndpoint('org-a', bad, 'vpce-a', scope.label, options));
  for (const bad of ['', 'x\n', 'x'.repeat(81)]) assert.throws(() => t.assignOrganizationVPCEndpoint('org-a', scope.regionId, 'vpce-a', bad, options));
  await assert.rejects(t.assignOrganizationVPCEndpoint('org-a', scope.regionId, 'vpce-a', scope.label, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
