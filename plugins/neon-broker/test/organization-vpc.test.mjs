import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationVPCOperations, ORGANIZATION_VPC_OPERATIONS, MAX_ORGANIZATION_VPC_BINDINGS } from '../dist/plugins/neon-broker/src/organization-vpc.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationVPCCases as cases, organizationVPCFixture as fixture, organizationVPCScope as scope, organizationVPCEndpoint as endpoint, canary, response } from './helpers.mjs';

const poison = { label: canary, state: canary, num_restricted_projects: 100,
  example_restricted_projects: [canary], password: canary, connection_uri: canary, message: canary };
const root = 'neon/organizations/org-a/vpc';
for (const [name, args, raw, expected] of cases) {
  const detail = name === 'getOrganizationVPCEndpointDetails';
  const all = name === 'listOrganizationVPCEndpointsAllRegions';
  const suffix = all ? 'vpc_endpoints' : `region/aws-us-east-2/vpc_endpoints${detail ? '/vpce-a' : ''}`;
  const item = detail ? raw : raw.endpoints[0];
  const wrap = value => detail ? value : { endpoints: [value] };
  const envelope = value => all ? value : detail ? { region_id: args.region_id, endpoint: value } : { region_id: args.region_id, ...value };

  test(`${name}: authenticated fixed GET and closed ID/region projection`, async () => {
    const f = fixture(wrap({ ...item, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/organizations/org-a/vpc/${suffix}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `${root}/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: canonical closed arguments reject caller authority before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { ...args, org_id: 'other' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'project_id', 'branch_id'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
      ...['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(61), 'оrg-a', 'Upper', 'has_underscore', true, null].map(org_id => ({ ...args, org_id })),
      ...(all ? [{ ...args, region_id: 'aws-us-east-2' }] : [{ ...args, region_id: 'aws-unlisted' }, { ...args, region_id: 'aws-us-east-2\n' }]),
      ...(detail ? [{ ...args, vpc_endpoint_id: 'vpce-b' }, { ...args, vpc_endpoint_id: '../escape' }] : [{ ...args, vpc_endpoint_id: 'vpce-a' }]),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates exact resource/revision, scope and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, org_id: 'other' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: contradictory ancestry, unexpected pagination and malformed output refuse`, async () => {
    for (const value of [null, [], {}, { ...raw, org_id: 'other' }, { ...raw, project_id: 'project-a' },
      { ...raw, branch_id: 'br-a' }, { ...raw, pagination: {} },
      wrap({ ...item, org_id: 'other' }), wrap({ ...item, project_id: 'project-a' }),
      wrap({ ...item, branch_id: 'br-a' }), wrap({ ...item, pagination: {} }),
      wrap({ ...item, vpc_endpoint_id: null }), wrap({ ...item, vpc_endpoint_id: 'x\n' }),
      wrap({ ...item, region_id: 'aws-us-west-2' }),
    ]) await assert.rejects(fixture(value).run(name, args));
    const op = fixture(raw).operation(name);
    for (const key of [...Object.keys(item), 'org_id', 'pagination']) {
      assert.throws(() => op.project(envelope(wrap(Object.defineProperty({ ...item }, key, { get() { throw Error('getter'); }, enumerable: true })))));
    }
    const ignored = Object.defineProperty({ ...item }, 'state', { get() { throw Error('unused getter'); }, enumerable: true });
    assert.deepEqual(op.project(envelope(wrap(ignored))), expected);
    assert.deepEqual(await fixture({ ...raw, org_id: 'org-a' }).run(name, args), expected);
  });

  test(`${name}: non-200, oversized and failed responses never become empty success or fallback`, async () => {
    for (const status of [403, 404, 410, 500, 302]) {
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

  if (!detail) test(`${name}: nonpaginated lists are bounded before filtering with no duplicates or truncation`, async () => {
    for (const endpoints of [[item, item], Array(31).fill(item)]) await assert.rejects(fixture({ endpoints }).run(name, args));
    for (const endpoints of [new Array(1), Object.assign([item], { extra: canary }),
      Object.defineProperty([item], '0', { get() { throw Error('getter'); }, enumerable: true })]) {
      assert.throws(() => fixture(raw).operation(name).project(envelope({ endpoints })));
    }
    const unselected = { vpc_endpoint_id: 'unselected/provider-id', ...(all ? { region_id: 'future-region' } : {}), ...poison };
    assert.deepEqual(await fixture({ endpoints: [unselected, item] }).run(name, args), expected);
    assert.deepEqual(await fixture({ endpoints: [] }).run(name, args), { endpoints: [] });
    await assert.rejects(fixture({ endpoints: [unselected, unselected] }).run(name, args));
    if (all) await assert.rejects(fixture({ endpoints: [{ vpc_endpoint_id: item.vpc_endpoint_id }] }).run(name, args));
  });
}

test('detail must return exactly the requested endpoint, not another allowlisted endpoint in the same region', async () => {
  const config = { ...scope, endpoints: [...scope.endpoints, { id: 'vpce-other', regionId: 'aws-us-east-2' }] };
  const [name, args] = cases[2];
  await assert.rejects(fixture({ vpc_endpoint_id: 'vpce-other' }, config).run(name, args));
  await assert.rejects(fixture({ vpc_endpoint_id: 'vpce-b' }).run(name, args));
});

test('scope is copied, unique, bounded and rejects unbound regions without mutation or account fallback', async () => {
  const config = structuredClone(scope);
  const operations = createNeonOrganizationVPCOperations(config, {});
  config.endpoints[0].regionId = 'aws-us-west-2';
  config.regionIds.push('aws-unlisted');
  assert.deepEqual(operations[0].project(cases[0][2]), cases[0][3]);
  assert.throws(() => operations[1].prepare({ org_id: 'org-a', region_id: 'aws-unlisted' }));
  for (const changed of [{ regionIds: ['aws-us-east-2', 'aws-us-east-2'] }, { endpoints: [scope.endpoints[0], scope.endpoints[0]] },
    { endpoints: [{ id: 'vpce-a', regionId: 'aws-unlisted' }] }, { endpoints: [{ id: 'unsupported/id', regionId: 'aws-us-east-2' }] },
    { regionIds: ['AWS-us-east-2'] }, { endpoints: new Array(1) }, { approved: true },
    ...['regionIds', 'endpoints'].map(key => ({ [key]: Array(MAX_ORGANIZATION_VPC_BINDINGS + 1).fill(scope[key][0]) })),
  ]) assert.throws(() => createNeonOrganizationVPCOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(operations.map(op => op.name), ORGANIZATION_VPC_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['assignOrganizationVPCEndpoint', 'deleteOrganizationVPCEndpoint', 'listProjects', 'sql']) assert.equal(fixture({}).operation(name), undefined);
});

test('composed detail resource accepts exactly 256 characters and refuses oversized scope at construction', () => {
  const organizationId = 'a'.repeat(60);
  const endpointId = 'v'.repeat(80);
  const at = length => ({ organizationId, revision: 'scope-v1', regionIds: ['aws-' + 'a'.repeat(length - 4)],
    endpoints: [{ id: endpointId, regionId: 'aws-' + 'a'.repeat(length - 4) }] });
  const config = at(70);
  const operations = createNeonOrganizationVPCOperations(config, {});
  const args = { org_id: organizationId, region_id: config.regionIds[0], vpc_endpoint_id: endpointId };
  assert.equal(operations[2].prepare(args).resource.id.length, 256);
  for (const length of [71, 80]) assert.throws(() => createNeonOrganizationVPCOperations(at(length), {}));
});

test('Azure lists remain available under mocks but pinned unsupported Azure detail refuses before fetch', async () => {
  const azure = { vpc_endpoint_id: 'vpce-azure', region_id: 'azure-eastus2' };
  assert.deepEqual(await fixture({ endpoints: [azure] }).run(cases[0][0], cases[0][1]), { endpoints: [azure] });
  assert.deepEqual(await fixture({ endpoints: [{ vpc_endpoint_id: 'vpce-azure' }] }).run(cases[1][0], { org_id: 'org-a', region_id: 'azure-eastus2' }), { endpoints: [azure] });
  const f = fixture({});
  assert.throws(() => f.operation(cases[2][0]).prepare({ org_id: 'org-a', region_id: 'azure-eastus2', vpc_endpoint_id: 'vpce-azure' }));
  assert.equal(f.requests.length, 0);
});

test('transport seam validates organization, region and endpoint paths before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', 'Upper', 'has_underscore', '../escape', 'x/y', 'x\n', 'x'.repeat(61)]) {
    assert.throws(() => transport.listOrganizationVPCEndpointsAllRegions(value, options));
    assert.throws(() => transport.listOrganizationVPCEndpoints(value, endpoint.region_id, options));
    assert.throws(() => transport.getOrganizationVPCEndpointDetails(value, endpoint.region_id, endpoint.vpc_endpoint_id, options));
  }
  for (const value of ['', '../escape', 'aws-us-east-2\n', 'AWS-us-east-2', 'aws-us-east-2?x=y', 'aws-' + 'x'.repeat(80)]) {
    assert.throws(() => transport.listOrganizationVPCEndpoints('org-a', value, options));
    assert.throws(() => transport.getOrganizationVPCEndpointDetails('org-a', value, 'vpce-a', options));
  }
  for (const value of ['', '../escape', 'x/y', 'x\n', 'x'.repeat(81)]) assert.throws(() => transport.getOrganizationVPCEndpointDetails('org-a', endpoint.region_id, value, options));
  assert.throws(() => transport.getOrganizationVPCEndpointDetails('org-a', 'azure-eastus2', 'vpce-azure', options));
  assert.equal(calls, 0);
});
