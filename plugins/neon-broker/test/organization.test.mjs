import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonOrganizationOperations, ORGANIZATION_OPERATIONS } from '../dist/plugins/neon-broker/src/organization.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { organizationCases as cases, organizationFixture as fixture, organizationScope as scope, organization, canary, response } from './helpers.mjs';

const poison = { name: canary, handle: canary, plan: canary, managed_by: canary,
  created_at: canary, updated_at: canary, password: canary, connection_uri: canary, message: canary };
for (const [name, args, raw, expected] of cases) {
  const suffix = name === 'getOrganization' ? '' : '/billing/spending_limit';
  test(`${name}: fixed authenticated GET and closed organization metadata projection`, async () => {
    const f = fixture({ ...raw, ...poison });
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    const { url, init } = f.requests[0];
    assert.equal(url, `${NEON_ORIGIN}/api/v2/organizations/org-a${suffix}`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/organizations/org-a${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: closed canonical arguments reject caller authority before fetch`, () => {
    const f = fixture(raw);
    for (const value of [null, [], {}, { ...args, org_id: 'other' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'project_id', 'branch_id', 'spending_limit_cents'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'org_id', { get() { throw Error('getter'); }, enumerable: true }),
      ...['../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'x'.repeat(61), 'оrg-a', 'Upper', 'has_underscore', true, null].map(org_id => ({ org_id })),
    ]) assert.throws(() => f.operation(name).prepare(value));
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates resource, revision, organization and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { org_id: 'other' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: malformed output, contradictory ancestry and pagination refuse`, async () => {
    for (const value of [null, [], {}, { ...raw, org_id: 'other' }, { ...raw, project_id: 'project-a' },
      { ...raw, branch_id: 'br-a' }, { ...raw, pagination: {} }]) await assert.rejects(fixture(value).run(name, args));
    const op = fixture(raw).operation(name);
    for (const key of [...Object.keys(raw), 'org_id', 'pagination']) {
      assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
    }
    assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'name', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
    assert.deepEqual(await fixture({ ...raw, org_id: 'org-a' }).run(name, args), expected);
  });

  test(`${name}: failed, non-200 and oversized responses never become empty/default success or fallback`, async () => {
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

test('organization detail binds returned ID, preserves optional booleans without inventing security qualification', async () => {
  const [name, args] = cases[0];
  assert.deepEqual(await fixture({ id: 'org-a' }).run(name, args), { id: 'org-a' });
  for (const value of [false, true]) {
    const raw = { id: 'org-a', require_mfa: value, allow_hipaa_projects: value };
    assert.deepEqual(await fixture(raw).run(name, args), raw);
  }
  for (const id of ['org-b', 'org-a\n', null, true]) await assert.rejects(fixture({ ...organization, id }).run(name, args));
  for (const key of ['require_mfa', 'allow_hipaa_projects']) {
    for (const value of [null, 0, 'true', {}, []]) await assert.rejects(fixture({ ...organization, [key]: value }).run(name, args));
  }
});

test('spending metadata distinguishes no configured limit, zero and positive safe cents, without rounding int64', async () => {
  const [name, args] = cases[1];
  for (const spending_limit_cents of [null, 0, 1, Number.MAX_SAFE_INTEGER]) {
    const raw = { spending_limit_cents };
    assert.deepEqual(await fixture(raw).run(name, args), raw);
  }
  for (const spending_limit_cents of [-1, 0.1, '100', true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(fixture({ spending_limit_cents }).run(name, args));
  }
  const op = fixture({}).operation(name);
  for (const spending_limit_cents of [-0, NaN, Infinity, -Infinity, undefined]) assert.throws(() => op.project({ spending_limit_cents }));
  await assert.rejects(fixture(() => new Response('{"spending_limit_cents":-0}', { headers: { 'content-type': 'application/json' } })).run(name, args));
});

test('scope is copied and closed; only exact selected organization methods exist', () => {
  const config = { ...scope };
  const operations = createNeonOrganizationOperations(config, {});
  config.organizationId = 'org-b';
  config.revision = 'scope-v2';
  assert.deepEqual(operations[0].prepare({ org_id: 'org-a' }).resource, { id: 'neon/organizations/org-a', revision: 'scope-v1' });
  assert.throws(() => operations[0].prepare({ org_id: 'org-b' }));
  for (const changed of [{ approved: true }, { organizationId: 'Upper' }, { organizationId: 'x'.repeat(61) }, { revision: '' }, { projectId: 'project-a' }]) {
    assert.throws(() => createNeonOrganizationOperations({ ...scope, ...changed }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), ORGANIZATION_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['updateOrganization', 'updateOrganizationSpendingLimit', 'getCurrentUserOrganizations', 'listProjects', 'sql']) assert.equal(fixture({}).operation(name), undefined);
});

test('organization transport methods reject unsupported path identifiers before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', 'Upper', 'has_underscore', '../escape', 'x/y', 'x?y=z', 'x\n', 'x'.repeat(61), 'оrg-a']) {
    for (const name of ORGANIZATION_OPERATIONS) assert.throws(() => transport[name](value, options));
  }
  assert.equal(calls, 0);
});
