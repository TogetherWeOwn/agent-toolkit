import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonCustomDomainDeleteOperations } from '../dist/plugins/neon-broker/src/custom-domain-delete.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { customDomainDeleteFixture as fixture, customDomainDeleteArgs as args, customDomainDeleteScope as scope,
  customDomainDeleteMetadata as metadata, canary, response } from './helpers.mjs';

const expected = { acknowledged: true };
const listed = { custom_domains: [metadata] };
const base = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/custom-domains`;

test('Custom domain delete: terminal binding preflight precedes one bodyless DELETE; HTTP204 acknowledges only', async () => {
  const f = fixture();
  const result = await f.run('deleteProjectBranchCustomDomain', args);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(result, expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [[base + '?limit=10', 'GET'], [base + '/' + scope.domain, 'DELETE']]);
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.body, undefined);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation('deleteProjectBranchCustomDomain');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.prepare(args).resource.id, 'neon/projects/project-a/branches/br-a/custom-domains/app.example.invalid/delete');
  assert.equal(op.prepare(args).plan.function_slug, 'hello');
  assert.equal(op.prepare(args).plan.completion, 'acknowledgement_only');
  for (const key of ['routingStopVerified', 'dnsRemovalVerified', 'connectionFence']) assert.equal(op.prepare(args).plan[key], false);
  assert.equal(f.operation('registerProjectBranchCustomDomain'), undefined);
});

test('Custom domain delete: copied scope and exact plan reject target, binding and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonCustomDomainDeleteOperations(config, {});
  config.domain = 'other.invalid'; config.functionSlug = 'other';
  assert.equal(op.prepare(args).plan.domain, scope.domain);
  assert.equal(op.prepare(args).plan.function_slug, scope.functionSlug);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'domain'].map(key => ({ ...args, [key]: 'other' })),
    ...['approved', 'agent', 'credential', 'url', 'retry', 'runtimeContext', 'force', 'token', 'timeout', 'entity_id', 'cname_target'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'domain', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture(); const p = f.operation('deleteProjectBranchCustomDomain').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['domain', 'function_slug', 'effect', 'routingStopVerified'].map(key => ({ plan: { ...p.plan, [key]: 'other' } })), { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('deleteProjectBranchCustomDomain').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation('deleteProjectBranchCustomDomain').execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../project' }, { branchId: 'b\n' }, { projectId: '-' }, { branchId: '-branch' },
    ...['', 'A.invalid', '../id', 'a.invalid?query', 'a.invalid\n', 'a..invalid', '-a.invalid', 'a-.invalid', 'a.invalid.', 'a'.repeat(64) + '.invalid'].map(domain => ({ domain })),
    { functionSlug: 'Upper' }, { functionSlug: 'a'.repeat(21) }, { revision: '' }, { approved: true },
    { projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), domain: 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.invalid' }]) assert.throws(() => createNeonCustomDomainDeleteOperations({ ...scope, ...change }, {}));
});

test('Custom domain delete: absent, rebound, duplicate, malformed and foreign lists refuse before DELETE', async () => {
  for (const raw of [null, {}, [], { custom_domains: null }, { custom_domains: [] }, { custom_domains: [{ ...metadata, domain: 'other.invalid' }] },
    ...[{ entity_type: 'unknown' }, { entity_id: 'other' }, { entity_id: null }, { domain: null }, { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }]
      .map(change => ({ custom_domains: [{ ...metadata, ...change }] })),
    { custom_domains: [metadata, metadata] }, { custom_domains: [metadata, { domain: 'other.invalid', entity_type: null, entity_id: 'other' }] },
    { custom_domains: Array.from({ length: 11 }, (_, i) => ({ ...metadata, domain: i ? `other-${i}.invalid` : metadata.domain })) },
    { ...listed, project_id: 'other' }, { ...listed, branch_id: 'other' }, { ...listed, pagination: { cursor: 'wrong-field' } }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('deleteProjectBranchCustomDomain', args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET']);
  }
  for (const status of [403, 404, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('deleteProjectBranchCustomDomain', args));
    assert.equal(f.requests.length, 1);
  }
});

test('Custom domain delete: complete bounded pagination required even after target found; cycles and late contradictions refuse', async () => {
  const f = fixture((url, init, n) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response(n === 1 ? { ...listed, pagination: { next: 'opaque+cursor' } } : { custom_domains: [{ domain: 'future.invalid', entity_type: 'future-kind', entity_id: 'future-id' }], pagination: {} }));
  assert.deepEqual(await f.run('deleteProjectBranchCustomDomain', args), expected);
  assert.equal(f.requests[1].url, base + '?limit=10&cursor=opaque%2Bcursor');
  assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'DELETE']);
  const later = fixture((url, init, n) => init.method === 'DELETE' ? new Response(null, { status: 204 }) :
    response(n === 1 ? { custom_domains: [], pagination: { next: 'next' } } : listed));
  assert.deepEqual(await later.run('deleteProjectBranchCustomDomain', args), expected);
  for (const page of [{ ...listed }, { custom_domains: [], branch_id: 'other' },
    { custom_domains: [], pagination: { next: 'next' } }, { custom_domains: [], pagination: { next: null } }]) {
    const g = fixture((url, init, n) => response(n === 1 ? { ...listed, pagination: { next: 'next' } } : page));
    await assert.rejects(g.run('deleteProjectBranchCustomDomain', args));
    assert.equal(g.requests.length, 2);
  }
  const capped = fixture((url, init, n) => response({ custom_domains: n === 1 ? [metadata] : [], pagination: { next: `page-${n}` } }));
  await assert.rejects(capped.run('deleteProjectBranchCustomDomain', args));
  assert.equal(capped.requests.length, 3);
  assert(capped.requests.every(({ init }) => init.method === 'GET'));
});

test('Custom domain delete: ambiguity observes once without retry or upgrading absence/rebinding to success', async () => {
  for (const followup of [{ custom_domains: [] }, listed, { custom_domains: [{ ...metadata, entity_id: 'other' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'DELETE') throw Error(canary);
      return response(n === 1 ? listed : followup);
    });
    await assert.rejects(f.run('deleteProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'DELETE', 'GET']);
    assert.equal(f.requests[2].url, f.requests[0].url);
  }
  const f = fixture((url, init, n) => {
    if (init.method === 'DELETE') throw Error(canary);
    return response(n === 1 ? listed : { custom_domains: [], pagination: { next: `page-${n}` } });
  });
  await assert.rejects(f.run('deleteProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 5);
  assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
});

test('Custom domain delete: only empty HTTP204 acknowledges; failures, redirects and malformed lengths stay uncertain', async () => {
  for (const make of [...[200, 202, 302, 403, 404, 409, 422, 500].map(status => () => response({ ...expected, token: canary }, { status })),
    () => new Response(null, { status: 204, headers: { 'content-length': '1' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': 'invalid' } }),
    () => new Response(null, { status: 204, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => ({ status: 204, redirected: true, body: null, headers: new Headers() }),
    () => ({ status: 204, redirected: false, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), headers: new Headers() })]) {
    const f = fixture((url, init) => init.method === 'DELETE' ? make() : response(listed));
    await assert.rejects(f.run('deleteProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(f.requests.length, 3);
  }
});

test('Custom domain delete: activation targets, DNS and routing diagnostics are never evaluated or emitted', async () => {
  const value = { ...metadata };
  for (const name of ['cname_target', 'status', 'dns_status', 'binding_status', 'status_reason', 'error', 'secret']) Object.defineProperty(value, name, { get() { throw Error('unused'); }, enumerable: true });
  const [direct] = createNeonCustomDomainDeleteOperations(scope, {
    async listProjectBranchCustomDomains() { return { custom_domains: [value] }; }, async deleteProjectBranchCustomDomain() { return expected; },
  });
  assert.deepEqual(direct.project(await direct.execute(direct.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { acknowledged: false }, { ...expected, domain: scope.domain },
    Object.defineProperty({}, 'acknowledged', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => direct.project(raw));
  let deletes = 0;
  const [poisoned] = createNeonCustomDomainDeleteOperations(scope, {
    async listProjectBranchCustomDomains() { return { custom_domains: [Object.defineProperty({ ...metadata }, 'domain', { get() { throw Error('getter'); }, enumerable: true })] }; },
    async deleteProjectBranchCustomDomain() { deletes++; return expected; },
  });
  await assert.rejects(poisoned.execute(poisoned.prepare(args), canary, new AbortController().signal));
  assert.equal(deletes, 0);
});

test('Custom domain delete: cancellation and ignored DELETE deadline bound the sole attempt', async () => {
  for (const stopAt of [1, 2]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => {
      if (n === stopAt) controller.abort();
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : response(listed);
    });
    await assert.rejects(f.run('deleteProjectBranchCustomDomain', args, controller.signal), stopAt === 2 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'DELETE' ? new Promise(() => {}) : response(listed));
  await assert.rejects(f.run('deleteProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 3);
});

test('Custom domain delete: resource-budget boundaries work; noncanonical names refuse before fetch', async () => {
  for (const config of [{ ...scope, projectId: 'a', branchId: 'a', domain: 'a.b', functionSlug: 'a' },
    { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), domain: 'a'.repeat(63) + '.invalid', revision: 'r'.repeat(80) }]) {
    const f = fixture(null, config);
    assert.deepEqual(await f.run('deleteProjectBranchCustomDomain', { project_id: config.projectId, branch_id: config.branchId, domain: config.domain }), expected);
  }
  const overhead = 'neon/projects/project-a/branches/br-a/custom-domains//delete'.length;
  const domain = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(256 - overhead - 192);
  const [op] = createNeonCustomDomainDeleteOperations({ ...scope, domain }, {});
  assert.equal(op.prepare({ ...args, domain }).resource.id.length, 256);
  assert.throws(() => createNeonCustomDomainDeleteOperations({ ...scope, domain: domain + 'd' }, {}));
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of ['', '../id', 'a.invalid?query', 'a.invalid\n', 'A.invalid', 'a.invalid.', 'a..invalid', 'a'.repeat(64) + '.invalid']) assert.throws(() => transport.deleteProjectBranchCustomDomain('project-a', 'br-a', bad, options));
  for (const bad of ['', '../project', 'a?query', 'a\n', 'A', 'a'.repeat(61)]) {
    assert.throws(() => transport.deleteProjectBranchCustomDomain(bad, 'br-a', scope.domain, options));
    assert.throws(() => transport.deleteProjectBranchCustomDomain('project-a', bad, scope.domain, options));
  }
  await assert.rejects(transport.deleteProjectBranchCustomDomain('project-a', 'br-a', scope.domain, { ...options, credential: 'bad\nheader' }));
  await assert.rejects(transport.deleteProjectBranchCustomDomain('project-a', 'br-a', scope.domain, { ...options, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
