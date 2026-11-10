import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonCustomDomainRegisterOperations } from '../dist/plugins/neon-broker/src/custom-domain-register.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { customDomainRegisterFixture as fixture, customDomainRegisterArgs as args, customDomainRegisterScope as scope,
  canary, response } from './helpers.mjs';

const metadata = { domain: scope.domain, entity_type: 'function', entity_id: scope.functionSlug };
const expected = { ...metadata, acknowledged: true };
const fn = { function: { id: scope.functionId, slug: scope.functionSlug } };
const empty = { custom_domains: [] };
const base = `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a`;
const route = (url, init) => init.method === 'POST' ? response(metadata, { status: 201 }) : response(url.includes('/functions/') ? fn : empty);

test('Custom domain register: function identity and complete absence precede one fixed POST; acknowledgement only', async () => {
  const f = fixture();
  const result = await f.run('registerProjectBranchCustomDomain', args);
  assert.deepEqual(result, expected);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [base + '/functions/hello', 'GET'], [base + '/custom-domains?limit=10', 'GET'], [base + '/custom-domains', 'POST']]);
  const post = f.requests[2].init;
  assert.deepEqual(JSON.parse(post.body), metadata);
  assert.equal(post.headers['Content-Type'], 'application/json');
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
    if (init.method === 'GET') assert.equal(init.body, undefined);
  }
  const op = f.operation('registerProjectBranchCustomDomain');
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/custom-domains/app.example.invalid/register');
  assert.equal(p.plan.function_id, scope.functionId);
  assert.equal(p.plan.completion, 'acknowledgement_only');
  for (const key of ['atomicCompareAndSwap', 'domainCustodyVerified', 'routingVerified', 'dnsActivationVerified', 'persistenceVerified']) assert.equal(p.plan[key], false);
  assert.equal(f.operation('deleteProjectBranchCustomDomain'), undefined);
});

test('Custom domain register: copied canonical scope and exact plan refuse identity, body and authority overrides', async () => {
  const config = { ...scope };
  const [op] = createNeonCustomDomainRegisterOperations(config, {});
  config.functionId = 'other'; config.functionSlug = 'other'; config.domain = 'other.invalid';
  assert.equal(op.prepare(args).plan.function_id, scope.functionId);
  assert.equal(op.prepare(args).plan.function_slug, scope.functionSlug);
  for (const raw of [null, [], {}, ...['project_id', 'branch_id', 'domain'].map(key => ({ ...args, [key]: 'other' })),
    ...['entity_type', 'entity_id', 'function_id', 'cname_target', 'url', 'agent', 'approved', 'credential', 'retry', 'token', 'runtimeContext'].map(key => ({ ...args, [key]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'domain', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture(); const p = f.operation('registerProjectBranchCustomDomain').prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    ...['function_id', 'function_slug', 'effect', 'domainCustodyVerified'].map(key => ({ plan: { ...p.plan, [key]: 'other' } })), { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation('registerProjectBranchCustomDomain').execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  assert.equal(f.requests.length, 0);
  for (const change of [{ projectId: '../p' }, { branchId: '-b' }, { functionId: '' }, { functionSlug: 'Upper' }, { functionSlug: 'a'.repeat(21) },
    { approved: true }, { revision: '' }, ...['A.invalid', 'a.invalid.', '-a.invalid', 'a-.invalid', 'a..invalid', 'https://a.invalid', 'a.invalid:443', 'a.invalid\n'].map(domain => ({ domain }))]) {
    assert.throws(() => createNeonCustomDomainRegisterOperations({ ...scope, ...change }, {}));
  }
});

test('Custom domain register: wrong function proof refuses before listing or mutation', async () => {
  for (const raw of [null, {}, { function: null }, ...[{ id: 'other' }, { slug: 'other' }, { project_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => ({ function: { ...fn.function, ...change } })),
    { ...fn, branch_id: 'other' }, { ...fn, pagination: {} }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run('registerProjectBranchCustomDomain', args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run('registerProjectBranchCustomDomain', args));
    assert.equal(f.requests.length, 1);
  }
});

test('Custom domain register: existing, malformed, foreign and duplicate lists refuse before POST', async () => {
  for (const raw of [null, {}, { custom_domains: null }, { custom_domains: [metadata] },
    { custom_domains: [{ ...metadata, entity_id: 'other' }] }, { custom_domains: [{ ...metadata, entity_type: 'future' }] },
    { custom_domains: [{ ...metadata, domain: 'other.invalid' }, { ...metadata, domain: 'other.invalid' }] },
    ...[{ domain: null }, { entity_type: null }, { entity_id: null }, { branch_id: 'other' }, { project_id: 'other' }, { pagination: {} }].map(change => ({ custom_domains: [{ ...metadata, domain: 'other.invalid', ...change }] })),
    { custom_domains: Array.from({ length: 11 }, (_, i) => ({ ...metadata, domain: `other-${i}.invalid` })) },
    { ...empty, branch_id: 'other' }, { ...empty, pagination: { cursor: 'wrong' } }]) {
    const f = fixture((url) => response(url.includes('/functions/') ? fn : raw));
    await assert.rejects(f.run('registerProjectBranchCustomDomain', args));
    assert.equal(f.requests.length, 2);
    assert(f.requests.every(({ init }) => init.method === 'GET'));
  }
});

test('Custom domain register: bounded terminal pagination and documented sort metadata required before absence', async () => {
  const f = fixture((url, init, n) => url.includes('/functions/') || init.method === 'POST' ? route(url, init) :
    response({ custom_domains: [{ ...metadata, domain: `other-${n}.invalid`, entity_type: 'future-kind' }],
      pagination: { sort_by: 'domain', sort_order: 'asc', ...(n === 2 ? { next: 'opaque+cursor' } : {}) } }));
  assert.deepEqual(await f.run('registerProjectBranchCustomDomain', args), expected);
  assert.equal(f.requests[2].url, base + '/custom-domains?limit=10&cursor=opaque%2Bcursor');
  assert.equal(f.requests.length, 4);
  for (const later of [{ custom_domains: [metadata] }, { ...empty, pagination: { next: 'next' } }, { ...empty, branch_id: 'other' },
    { ...empty, pagination: { sort_by: 'entity_id' } }, { ...empty, pagination: { sort_order: 'desc' } }]) {
    const g = fixture((url, init, n) => response(n === 1 ? fn : n === 2 ? { ...empty, pagination: { next: 'next', sort_by: 'domain', sort_order: 'asc' } } : later));
    await assert.rejects(g.run('registerProjectBranchCustomDomain', args));
    assert.equal(g.requests.length, 3);
  }
  for (const pagination of [{ next: null }, { sort_by: null }, { sort_by: 'a'.repeat(81) }, { sort_order: 'future' }]) {
    const g = fixture(url => response(url.includes('/functions/') ? fn : { ...empty, pagination }));
    await assert.rejects(g.run('registerProjectBranchCustomDomain', args));
    assert.equal(g.requests.length, 2);
  }
  const capped = fixture((url, init, n) => response(n === 1 ? fn : { ...empty, pagination: { next: `page-${n}` } }));
  await assert.rejects(capped.run('registerProjectBranchCustomDomain', args));
  assert.equal(capped.requests.length, 4);
});

test('Custom domain register: ambiguity observes one bounded list and never retries or upgrades presence to success', async () => {
  for (const later of [empty, { custom_domains: [metadata] }, { custom_domains: [{ ...metadata, entity_id: 'other' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return response(n === 1 ? fn : n === 2 ? empty : later);
    });
    await assert.rejects(f.run('registerProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
  }
  for (const make of [...[200, 202, 302, 403, 404, 409, 500].map(status => () => response(metadata, { status })),
    ...[{ domain: 'other.invalid' }, { entity_type: 'future' }, { entity_id: 'other' }, { branch_id: 'other' }, { pagination: {} }].map(change => () => response({ ...metadata, ...change }, { status: 201 })),
    () => response(metadata, { status: 201, headers: { 'content-type': 'text/plain' } }),
    () => response(metadata, { status: 201, headers: { 'content-length': String(RESPONSE_BYTES + 1) } }),
    () => new Response('bad-json', { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : route(url, init));
    await assert.rejects(f.run('registerProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
  }
});

test('Custom domain register: unused activation and function metadata never evaluated; consumed accessors refuse', async () => {
  const value = { ...metadata }; const detail = { ...fn.function };
  for (const key of ['cname_target', 'status', 'dns_status', 'binding_status', 'status_reason', 'secret', 'error']) Object.defineProperty(value, key, { get() { throw Error('unused'); }, enumerable: true });
  for (const key of ['name', 'invoke_url', 'deployment', 'env', 'error']) Object.defineProperty(detail, key, { get() { throw Error('unused'); }, enumerable: true });
  const [op] = createNeonCustomDomainRegisterOperations(scope, { async getProjectBranchFunction() { return { function: detail }; },
    async listProjectBranchCustomDomains() { return empty; }, async registerProjectBranchCustomDomain() { return value; } });
  assert.deepEqual(op.project(await op.execute(op.prepare(args), canary, new AbortController().signal)), expected);
  for (const raw of [null, {}, { ...metadata, entity_id: 'other' }, Object.defineProperty({ ...metadata }, 'domain', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.project(raw));
});

test('Custom domain register: cancellation and ignored POST deadline bound the only attempt', async () => {
  for (const stopAt of [1, 2, 3]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return route(url, init); });
    await assert.rejects(f.run('registerProjectBranchCustomDomain', args, controller.signal), stopAt === 3 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  const f = fixture((url, init) => init.method === 'POST' ? new Promise(() => {}) : route(url, init));
  await assert.rejects(f.run('registerProjectBranchCustomDomain', args), { message: 'OUTCOME_UNCERTAIN' });
  assert.equal(f.requests.length, 4);
});

test('Custom domain register: resource budget boundaries and direct transport injection refuse before fetch', async () => {
  const overhead = 'neon/projects/project-a/branches/br-a/custom-domains//register'.length;
  const domain = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(256 - overhead - 192);
  const config = { ...scope, domain };
  const f = fixture(null, config);
  assert.equal(f.operation('registerProjectBranchCustomDomain').prepare({ ...args, domain }).resource.id.length, 256);
  assert.equal((await f.run('registerProjectBranchCustomDomain', { ...args, domain })).domain, domain);
  assert.throws(() => createNeonCustomDomainRegisterOperations({ ...config, domain: domain + 'd' }, {}));
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const [project, branch, name, slug] of [['../p', 'br-a', scope.domain, 'hello'], ['project-a', '../b', scope.domain, 'hello'],
    ['project-a', 'br-a', 'A.invalid', 'hello'], ['project-a', 'br-a', 'a.invalid.', 'hello'], ['project-a', 'br-a', scope.domain, '../hello']]) {
    assert.throws(() => transport.registerProjectBranchCustomDomain(project, branch, name, slug, options));
  }
  await assert.rejects(transport.registerProjectBranchCustomDomain('project-a', 'br-a', scope.domain, 'hello', { ...options, signal: AbortSignal.abort() }));
  await assert.rejects(transport.registerProjectBranchCustomDomain('project-a', 'br-a', scope.domain, 'hello', { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
