import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonBranchResourceOperations, BRANCH_RESOURCE_OPERATIONS, MAX_BRANCH_RESOURCE_BINDINGS } from '../dist/plugins/neon-broker/src/branch-resources.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { branchResourceCases as cases, branchResourceFixture as fixture, branchResourceScope as scope, bucket, customDomain, canary, response } from './helpers.mjs';

const poison = { created_at: canary, cname_target: canary, status_reason: canary, dns_status: canary, binding_status: canary,
  password: canary, connection_uri: canary, object_key: canary };
for (const [name, args, raw, expected] of cases) {
  const collection = name === 'listProjectBranchBuckets' ? 'buckets' : 'custom_domains';
  const suffix = collection === 'buckets' ? 'buckets' : 'custom-domains';
  const item = raw[collection][0];
  const wrap = value => ({ [collection]: [value] });
  test(`${name}: exact authenticated collection GET and closed selected metadata`, async () => {
    const f = fixture(wrap({ ...item, ...poison }));
    assert.deepEqual(await f.run(name, args), expected);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/${suffix}${collection === 'buckets' ? '' : '?limit=10'}`);
    assert.equal(f.requests[0].init.method, 'GET');
    assert.equal(f.requests[0].init.redirect, 'error');
    assert.equal(f.requests[0].init.headers.Authorization, `Bearer ${canary}`);
    const op = f.operation(name);
    assert.equal(op.prepare(args).resource.id, `neon/projects/project-a/branches/br-a/${suffix}`);
    assert.equal(op.tier, 'read');
    assert.equal(op.lifecycle, 'none');
    assert.equal(op.timeoutMs, 3500);
  });

  test(`${name}: closed canonical arguments reject unbound targets and caller authority before fetch`, () => {
    const f = fixture(raw);
    for (const bad of [null, [], {}, { ...args, project_id: 'other' }, { ...args, branch_id: 'unlisted' },
      ...['agent', 'approval', 'approved', 'credential', 'url', 'cursor', 'limit', 'runtimeContext', 'bucket_name', 'domain'].map(key => ({ ...args, [key]: canary })),
      Object.assign(Object.create({ inherited: true }), args),
      Object.defineProperty({ ...args }, 'project_id', { get() { throw Error('getter'); }, enumerable: true }),
    ]) assert.throws(() => f.operation(name).prepare(bad));
    for (const key of Object.keys(args)) for (const value of ['../escape', 'x/y', 'x?secret=true', 'x\n', 'x\u0000', 'x'.repeat(61), 'br-а', 'Upper', 'has_underscore', true, null]) {
      assert.throws(() => f.operation(name).prepare({ ...args, [key]: value }));
    }
    assert.equal(f.requests.length, 0);
  });

  test(`${name}: detached execution revalidates exact resource/revision, scope and abort`, async () => {
    const f = fixture(raw);
    const { prepare, execute, project } = f.operation(name);
    const prepared = prepare(args);
    for (const resource of [{ ...prepared.resource, id: `${prepared.resource.id}/child` }, { ...prepared.resource, revision: 'scope-v2' }]) {
      await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
    }
    await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
    await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
    for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
    assert.equal(f.requests.length, 0);
    assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
  });

  test(`${name}: malformed arrays, duplicates and contradictory ancestry refuse without partial success`, async () => {
    for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' }, { [collection]: [item, item] },
      wrap({ ...item, project_id: 'other' }), wrap({ ...item, branch_id: 'br-b' }), wrap({ ...item, pagination: {} }),
    ]) await assert.rejects(fixture(value).run(name, args));
    const op = fixture(raw).operation(name);
    for (const values of [new Array(1), Object.assign([item], { extra: canary }),
      Object.defineProperty([item], '0', { get() { throw Error('getter'); }, enumerable: true })]) {
      assert.throws(() => op.project({ branch_id: 'br-a', [collection]: values }));
    }
    for (const key of [...Object.keys(item), 'project_id', 'branch_id']) {
      assert.throws(() => op.project({ branch_id: 'br-a', [collection]: [Object.defineProperty({ ...item }, key, { get() { throw Error('getter'); }, enumerable: true })] }));
    }
    assert.deepEqual(op.project({ branch_id: 'br-a', [collection]: [Object.defineProperty({ ...item }, 'cname_target', { get() { throw Error('unused getter'); }, enumerable: true })] }), expected);
    assert.throws(() => op.project(raw));
    assert.deepEqual(await fixture(wrap({ ...item, project_id: 'project-a', branch_id: 'br-a' })).run(name, args), expected);
    assert.deepEqual(await fixture({ [collection]: [] }).run(name, args), { [collection]: [] });
  });

  test(`${name}: non-200 and unsafe transport never become empty success or fallback`, async () => {
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

test('bucket list is nonpaginated, bounded and selects names per effective branch including inherited names', async () => {
  const [name, args] = cases[0];
  for (const access_level of ['private', 'public_read']) {
    assert.deepEqual(await fixture({ buckets: [{ ...bucket, access_level }] }).run(name, args), { buckets: [{ ...bucket, access_level }] });
  }
  assert.deepEqual(await fixture({ buckets: [{ name: 'unselected name', ...poison }, { name: 'other' }, bucket] }).run(name, args), { buckets: [bucket] });
  for (const value of [{ buckets: Array(31).fill(bucket) }, { buckets: [bucket], pagination: {} },
    { buckets: [{ name: 'unselected' }, { name: 'unselected' }] },
    ...[null, undefined, false, 'unknown'].map(access_level => ({ buckets: [{ ...bucket, access_level }] })),
  ]) await assert.rejects(fixture(value).run(name, args));
  assert.deepEqual(await fixture({ buckets: [bucket] }).run(name, { ...args, branch_id: 'br-b' }), { buckets: [] });
});

test('custom domains bind exact function targets, omit activation input and handle unknown/absent status honestly', async () => {
  const [name, args] = cases[1];
  for (const status of ['pending', 'active', 'error', 'future-state']) {
    const value = { ...customDomain, status };
    assert.deepEqual(await fixture({ custom_domains: [{ ...value, ...poison }] }).run(name, args),
      { custom_domains: [{ ...value, status: status === 'future-state' ? 'unknown' : status }] });
  }
  const { status, ...noStatus } = customDomain;
  assert.deepEqual(await fixture({ custom_domains: [noStatus] }).run(name, args), { custom_domains: [noStatus] });
  for (const changed of [{ entity_type: 'future' }, { entity_id: 'other' }, { status: null }, { status: 1 }, { status: 'x\n' }]) {
    await assert.rejects(fixture({ custom_domains: [{ ...customDomain, ...changed }] }).run(name, args));
  }
  assert.deepEqual(await fixture({ custom_domains: [{ domain: 'unknown.example.invalid', entity_type: 'future', ...poison }, customDomain] }).run(name, args), { custom_domains: [customDomain] });
  assert.deepEqual(await fixture({ custom_domains: [customDomain] }).run(name, { ...args, branch_id: 'br-b' }), { custom_domains: [] });
  for (const domain of ['APP.example.invalid', 'https://example.invalid', '*.example.invalid', 'x..invalid', '-x.invalid', 'x-.invalid', 'x.invalid.', `${'x'.repeat(64)}.invalid`, 'é.invalid']) {
    await assert.rejects(fixture({ custom_domains: [{ ...customDomain, domain }] }).run(name, args));
  }
});

test('custom-domain pagination follows encoded next cursors without sorting or caller cursor authority', async () => {
  const [name, args] = cases[1];
  const cursor = 'opaque /?&=cursor';
  const f = fixture((url, init, n) => response(n === 1 ? { custom_domains: [customDomain], pagination: { next: cursor } } : { custom_domains: [], pagination: {} }));
  assert.deepEqual(await f.run(name, args), { custom_domains: [customDomain] });
  assert.equal(f.requests.length, 2);
  const url = new URL(f.requests[1].url);
  assert.equal(url.searchParams.get('cursor'), cursor);
  assert.equal(url.searchParams.get('limit'), '10');
  assert.deepEqual([...url.searchParams.keys()], ['limit', 'cursor']);
  for (const pagination of [{ cursor: 'wrong-field' }, { next: null }, { next: '' }, { next: 'x\n' }, { next: 'x'.repeat(257) }, { next: 'page-2', sort_by: 'domain' }]) {
    const f = fixture({ custom_domains: [], pagination });
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const mode of ['cycle', 'ceiling', 'duplicate', 'oversize', 'ancestry']) {
    const f = fixture((url, init, n) => response(mode === 'oversize' ? { custom_domains: Array(11).fill(customDomain) } :
      mode === 'ancestry' ? { custom_domains: [{ ...customDomain, branch_id: 'br-b' }], pagination: { next: 'next' } } :
      { custom_domains: mode === 'duplicate' ? [customDomain] : [], pagination: { next: mode === 'cycle' ? 'same' : `page-${n}` } }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, mode === 'ceiling' ? 3 : ['oversize', 'ancestry'].includes(mode) ? 1 : 2);
  }
  const controller = new AbortController();
  const aborted = fixture(() => { controller.abort(); return response({ custom_domains: [], pagination: { next: 'next' } }); });
  await assert.rejects(aborted.run(name, args, controller.signal));
  assert.equal(aborted.requests.length, 1);
});

test('resource scope copies unique bounded explicit branch bindings; no object access, DNS or mutation tools', () => {
  const config = structuredClone(scope);
  const operations = createNeonBranchResourceOperations(config, {});
  config.buckets[0].name = 'changed';
  config.domains[0].functionSlug = 'other';
  config.branchIds.push('unlisted');
  assert.equal(operations[0].prepare(cases[0][1]).resource.revision, 'scope-v1');
  assert.deepEqual(operations[0].project({ branch_id: 'br-a', buckets: [bucket] }), { buckets: [bucket] });
  assert.deepEqual(operations[1].project({ branch_id: 'br-a', custom_domains: [customDomain] }), { custom_domains: [customDomain] });
  for (const changed of [{ branchIds: ['br-a', 'br-a'] }, { buckets: [scope.buckets[0], scope.buckets[0]] },
    { domains: [scope.domains[0], scope.domains[0]] }, { buckets: [{ name: 'assets', branchId: 'unlisted' }] },
    { domains: [{ ...scope.domains[0], branchId: 'unlisted' }] }, { domains: [{ ...scope.domains[0], functionSlug: 'Bad-Slug' }] },
    { buckets: [{ name: 'x'.repeat(256), branchId: 'br-a' }] }, { buckets: new Array(1) }, { approved: true },
    ...['branchIds', 'buckets', 'domains'].map(key => ({ [key]: Array(MAX_BRANCH_RESOURCE_BINDINGS + 1).fill(scope[key][0]) })),
  ]) assert.throws(() => createNeonBranchResourceOperations({ ...scope, ...changed }, {}));
  assert.deepEqual(operations.map(op => op.name), BRANCH_RESOURCE_OPERATIONS.map(name => `neon.${name}`));
  for (const name of ['createProjectBranchBucket', 'registerProjectBranchCustomDomain', 'deleteProjectBranchBucket', 'listProjectBranchBucketObjects', 'getProjectBranchBucketObject', 'sql']) {
    assert.equal(fixture({}).operation(name), undefined);
  }
});

test('branch-resource transport enforces pinned path parameters without fetching', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of ['', 'Upper', 'has_underscore', '../escape', 'x/y', 'x\n', 'x'.repeat(61)]) {
    for (const [project, branch] of [[value, 'br-a'], ['project-a', value]]) {
      assert.throws(() => transport.listProjectBranchBuckets(project, branch, options));
      assert.throws(() => transport.listProjectBranchCustomDomains(project, branch, null, options));
    }
  }
  assert.equal(calls, 0);
});
