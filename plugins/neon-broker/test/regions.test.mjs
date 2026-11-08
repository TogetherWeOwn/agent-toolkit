import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonRegionOperations, REGION_OPERATIONS } from '../dist/plugins/neon-broker/src/regions.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { regionCases as cases, regionFixture as fixture, regionScope as scope, region, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { name: canary, geo_lat: canary, geo_long: canary, url: canary, message: canary };

test('regions: fixed organization-filtered authenticated GET and closed selected catalog output', async () => {
  const f = fixture({ regions: [{ ...region, ...poison }, { region_id: 'aws-eu-west-1', default: false, ...poison }] });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/regions?org_id=org-a`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/organizations/org-a/regions', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
});

test('regions: organization is mandatory and canonical with no query/identity override', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { org_id: 'other' }, ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].map(org_id => ({ org_id })),
    ...['agent', 'approved', 'credential', 'url', 'project_id', 'limit', 'cursor', 'region_id'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('regions: copied bounded selection refuses malformed scope and does not acquire new regions', async () => {
  const config = structuredClone(scope);
  const operations = createNeonRegionOperations(config, {});
  config.organizationId = 'other';
  config.revision = 'scope-v2';
  config.regionIds[0] = 'aws-eu-west-1';
  config.regionIds.push('aws-ap-south-1');
  assert.equal(operations[0].prepare(args).resource.revision, 'scope-v1');
  assert.deepEqual(operations[0].project({ regions: [region, { region_id: 'aws-eu-west-1', default: false }] }), expected);
  for (const change of [{ extra: true }, { organizationId: 'Upper' }, { revision: '' }, { regionIds: ['aws-us-east-1', 'aws-us-east-1'] },
    { regionIds: ['aws-x/y'] }, { regionIds: ['aws-' + 'a'.repeat(77)] }, { regionIds: [true] },
    { regionIds: new Array(1) }, { regionIds: Array.from({ length: 31 }, (_, n) => `aws-region-${n}`) }]) {
    assert.throws(() => createNeonRegionOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), REGION_OPERATIONS.map(name => `neon.${name}`));
  assert.deepEqual(await fixture(raw, { ...scope, regionIds: [] }).run(name, args), { regions: [] });
  assert.equal(fixture(raw).operation('createProject'), undefined);
});

test('regions: detached execution revalidates scope, exact resource, revision and abort', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/regions' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { org_id: 'other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('regions: malformed, duplicate, contradictory or over-budget catalog refuses before filtering', async () => {
  for (const value of [null, [], {}, { regions: null }, { ...raw, org_id: 'other' }, { ...raw, project_id: 'project-a' },
    { ...raw, branch_id: 'br-a' }, { ...raw, pagination: {} }, { regions: [region, region] },
    ...[null, [], {}, { ...region, org_id: 'other' }, { ...region, project_id: 'project-a' }, { ...region, branch_id: 'br-a' },
      ...[null, 'true', 0].map(value => ({ ...region, default: value })),
      ...['', 'aws-x/y', 'aws-x\n', 'aws-аbc', 'AWS-us-east-1'].map(region_id => ({ ...region, region_id })),
    ].map(row => ({ regions: [row] })),
    { regions: Array.from({ length: 31 }, (_, n) => ({ region_id: `aws-region-${n}`, default: false })) },
    { regions: [region, { region_id: 'aws-eu-west-1', default: null }] },
    { regions: [{ region_id: 'aws-eu-west-1', default: false }, { region_id: 'aws-eu-west-1', default: false }] },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['region_id', 'default', 'org_id']) {
    assert.throws(() => op.project({ regions: [Object.defineProperty({ ...region }, key, { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  assert.deepEqual(op.project({ regions: [Object.defineProperty({ ...region }, 'name', { get() { throw Error('unused getter'); }, enumerable: true })] }), expected);
  assert.deepEqual(await fixture({ regions: [] }).run(name, args), { regions: [] });
  assert.deepEqual(await fixture({ org_id: 'org-a', regions: [{ region_id: 'azure-eastus2', default: false }] }).run(name, args),
    { regions: [{ region_id: 'azure-eastus2', default: false }] });
});

test('regions: non-200 or failed transport never falls back to an unfiltered or empty catalog', async () => {
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

test('regions: direct transport rejects missing, malformed or query-bearing organizations before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.getActiveRegions(value, options));
  }
  assert.equal(calls, 0);
});
