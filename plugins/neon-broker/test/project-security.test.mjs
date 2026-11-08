import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonProjectSecurityOperations, PROJECT_SECURITY_OPERATIONS, MAX_PROJECT_SECURITY_BINDINGS } from '../dist/plugins/neon-broker/src/project-security.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { projectSecurityCases as cases, projectSecurityFixture as fixture, projectSecurityScope as scope, jwks, vpcEndpoint, canary, response } from './helpers.mjs';

const poison = { jwks_url: canary, provider_name: canary, jwt_audience: canary, role_names: [canary], label: canary,
  created_at: canary, updated_at: canary, password: canary, connection_uri: canary };
for (const [name, args, raw, expected] of cases) {
  const collection = name === 'getProjectJWKS' ? 'jwks' : 'endpoints';
  const suffix = name === 'getProjectJWKS' ? 'jwks' : 'vpc_endpoints';
  const item = raw[collection][0];
  const wrap = value => ({ [collection]: [value] });
  test(`${name}: exact authenticated project collection GET and ID-only projection`, async () => {
    const f = fixture(wrap({ ...item, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/${suffix}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: closed canonical project arguments reject caller authority before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { project_id: 'other' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'branch_id', 'jwks_id', 'vpc_endpoint_id'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
      ...['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(61), 'prоject-a', 'Upper', 'has_underscore', true, null].map(project_id => ({ project_id })),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates exact collection/revision, arguments and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { project_id: 'other' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: nonpaginated bounds, duplicate IDs and contradictory project identity refuse`, async () => {
    for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-a' },
      { ...raw, pagination: {} }, { [collection]: [item, item] }, { [collection]: Array(31).fill(item) },
      wrap({ ...item, project_id: 'other' }), wrap({ ...item, pagination: {} }),
    ]) await assert.rejects(fixture(value).run(name, args));
    const op = fixture(raw).operation(name);
    for (const values of [new Array(1), Object.assign([item], { extra: canary }),
      Object.defineProperty([item], '0', { get() { throw Error('getter'); }, enumerable: true })]) {
      assert.throws(() => op.project({ [collection]: values }));
    }
    for (const key of [...Object.keys(item), 'project_id', 'pagination']) {
      assert.throws(() => op.project(wrap(Object.defineProperty({ ...item }, key, { get() { throw Error('getter'); }, enumerable: true }))));
    }
    assert.deepEqual(op.project(wrap(Object.defineProperty({ ...item }, 'jwks_url', { get() { throw Error('unused getter'); }, enumerable: true }))), expected);
    assert.deepEqual(await fixture({ ...raw, project_id: 'project-a' }).run(name, args), expected);
    assert.deepEqual(await fixture({ [collection]: [] }).run(name, args), { [collection]: [] });
  });

  test(`${name}: unavailable transport never becomes empty success or another endpoint`, async () => {
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
}

test('JWKS list requires exact selected project/branch binding and distinguishes absent branch from null', async () => {
  const [name, args] = cases[0];
  const projectJWKS = { id: 'jwks-project', project_id: 'project-a' };
  assert.deepEqual(await fixture({ jwks: [{ id: 'unselected/url', project_id: 'project-a', ...poison }, jwks, projectJWKS] }).run(name, args), { jwks: [jwks, projectJWKS] });
  for (const changed of [{ project_id: undefined }, { branch_id: 'br-b' }, { branch_id: undefined }, { branch_id: null }, { id: null }, { id: 'x\n' }]) {
    await assert.rejects(fixture({ jwks: [{ ...jwks, ...changed }] }).run(name, args));
  }
  for (const branch_id of [null, 'br-a', 'br-b']) {
    await assert.rejects(fixture({ jwks: [{ ...projectJWKS, branch_id }] }).run(name, args));
  }
  await assert.rejects(fixture({ jwks: [{ id: 'unselected', project_id: 'other' }] }).run(name, args));
  await assert.rejects(fixture({ jwks: [{ id: 'unselected', project_id: 'project-a' }, { id: 'unselected', project_id: 'project-a' }] }).run(name, args));
});

test('VPC list filters only explicit IDs, omits labels and never reports project-wide restriction completeness', async () => {
  const [name, args] = cases[1];
  assert.deepEqual(await fixture({ endpoints: [{ vpc_endpoint_id: 'unselected/provider-id', ...poison }, { ...vpcEndpoint, ...poison }] }).run(name, args), { endpoints: [vpcEndpoint] });
  for (const value of [{ ...vpcEndpoint, branch_id: 'br-a' }, {}, { vpc_endpoint_id: null }, { vpc_endpoint_id: 'x\n' }]) {
    await assert.rejects(fixture({ endpoints: [value] }).run(name, args));
  }
  await assert.rejects(fixture({ endpoints: [{ vpc_endpoint_id: 'unselected' }, { vpc_endpoint_id: 'unselected' }] }).run(name, args));
});

test('security metadata scope copies unique bounded bindings and exposes no URL fetch, keys or mutation tools', () => {
  const config = structuredClone(scope);
  const operations = createNeonProjectSecurityOperations(config, {});
  config.jwks[0].branchId = 'br-b';
  config.vpcEndpointIds[0] = 'changed';
  config.branchIds.push('unlisted');
  assert.deepEqual(operations[0].project(cases[0][2]), cases[0][3]);
  assert.deepEqual(operations[1].project(cases[1][2]), cases[1][3]);
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { jwks: [scope.jwks[0], scope.jwks[0]] },
    { jwks: [{ id: 'jwks-a', branchId: 'unlisted' }] }, { jwks: [{ id: 'jwks-a' }] },
    { jwks: [{ id: 'unsupported/id', branchId: null }] }, { vpcEndpointIds: ['vpce-a', 'vpce-a'] },
    { vpcEndpointIds: ['x'.repeat(81)] }, { jwks: new Array(1) }, { approved: true },
    ...['branchIds', 'jwks', 'vpcEndpointIds'].map(key => ({ [key]: Array(MAX_PROJECT_SECURITY_BINDINGS + 1).fill(scope[key][0]) })),
  ]) assert.throws(() => createNeonProjectSecurityOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(operations.map(op => op.name), PROJECT_SECURITY_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['addProjectJWKS', 'deleteProjectJWKS', 'assignProjectVPCEndpoint', 'deleteProjectVPCEndpoint', 'listApiKeys', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('project security transport enforces pinned project path limits before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', 'Upper', 'has_underscore', '../escape', 'x/y', 'x\n', 'x'.repeat(61)]) {
    assert.throws(() => transport.getProjectJWKS(value, options));
    assert.throws(() => transport.listProjectVPCEndpoints(value, options));
  }
  assert.equal(calls, 0);
});
