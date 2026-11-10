import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonJWKSAddOperations } from '../dist/plugins/neon-broker/src/jwks-add.js';
import { createNeonMetadataTransport, NEON_ORIGIN } from '../dist/plugins/neon-broker/src/transport.js';
import { jwksAddFixture as fixture, jwksAddArgs as args, jwksAddScope as scope, jwksAddReceipt as receipt, canary, response } from './helpers.mjs';

const name = 'addProjectJWKS';
const expected = { id: 'jwks-new', branch_id: 'br-a', acknowledged: true };
const role = { role: { name: scope.roleName, branch_id: scope.branchId } };
const list = { jwks: [] };
const base = `${NEON_ORIGIN}/api/v2/projects/project-a`;
function preflight(url) { return response(url.endsWith('/jwks') ? list : role); }

test('JWKS add: role identity and whole-list absence precede one explicit branch-role-audience POST', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(name, args), expected);
  assert.deepEqual(f.requests.map(({ url, init }) => [url, init.method]), [
    [`${base}/branches/br-a/roles/reader_a`, 'GET'], [`${base}/jwks`, 'GET'], [`${base}/jwks`, 'POST']]);
  assert.equal(f.requests[2].init.body, JSON.stringify({ jwks_url: scope.jwksUrl, provider_name: scope.providerName,
    branch_id: scope.branchId, jwt_audience: scope.audience, role_names: [scope.roleName], skip_role_creation: true }));
  for (const { init } of f.requests) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${canary}`);
    assert.equal(init.headers['Idempotency-Key'], undefined);
  }
  const op = f.operation(name);
  assert.equal(op.tier, 'reserved');
  assert.equal(op.lifecycle, 'none');
  const p = op.prepare(args);
  assert.equal(p.resource.id, 'neon/projects/project-a/branches/br-a/jwks/add');
  assert.equal(p.plan.tokensWithoutAudienceAccepted, true);
  assert.equal(p.plan.providerMayRetrieveURL, true);
  assert.equal(p.plan.atomicCompareAndSwap, false);
  assert.equal(p.plan.jwtAcceptanceVerified, false);
  assert.equal(p.plan.completion, 'acknowledgement_only');
});

test('JWKS add: copied strict scope, authority overrides and plan tampering refuse before transport', async () => {
  const config = { ...scope };
  const [op] = createNeonJWKSAddOperations(config, {});
  for (const k of Object.keys(config)) config[k] = 'changed';
  assert.equal(op.prepare(args).plan.jwks_url, scope.jwksUrl);
  for (const raw of [null, [], {}, ...Object.keys(args).map(k => ({ ...args, [k]: 'other' })),
    ...['approved', 'credential', 'agent', 'revision', 'runtimeContext', 'skip_role_creation', 'role_names', 'body', 'retry'].map(k => ({ ...args, [k]: true })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'jwks_url', { get() { throw Error('getter'); }, enumerable: true })]) assert.throws(() => op.prepare(raw));
  const f = fixture();
  const p = f.operation(name).prepare(args);
  for (const change of [{ resource: { ...p.resource, revision: 'other' } }, { resource: { ...p.resource, id: p.resource.id + '/other' } },
    { plan: { ...p.plan, skip_role_creation: false } }, { plan: { ...p.plan, jwt_audience: 'other' } }, { artifactDigest: '0'.repeat(64) }]) {
    await assert.rejects(f.operation(name).execute({ ...p, ...change }, canary, new AbortController().signal));
  }
  await assert.rejects(f.operation(name).execute(p, canary, AbortSignal.abort()));
  assert.equal(f.requests.length, 0);
});

test('JWKS add: wrong role or ancestry and failed role reads stop before list and mutation', async () => {
  for (const raw of [null, {}, { ...role, project_id: 'other' }, { ...role, pagination: {} },
    { role: { ...role.role, name: 'other' } }, { role: { ...role.role, branch_id: 'other' } },
    { role: { ...role.role, project_id: 'other' } }, { role: { ...role.role, pagination: {} } }]) {
    const f = fixture(() => response(raw));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
  for (const status of [403, 404, 410, 500]) {
    const f = fixture(() => response({}, { status }));
    await assert.rejects(f.run(name, args));
    assert.equal(f.requests.length, 1);
  }
});

test('JWKS add: bounded complete list validates every row and refuses URL presence in any branch', async () => {
  const row = { id: 'existing', project_id: 'project-a', jwks_url: 'https://other.example.invalid/keys' };
  for (const raw of [null, {}, { jwks: null }, { jwks: [row, row] }, { jwks: Array.from({ length: 31 }, (_, i) => ({ ...row, id: `j-${i}` })) },
    { jwks: [row], pagination: {} }, { jwks: [row], project_id: 'other' }, { jwks: [row], branch_id: 'br-a' },
    ...[{ project_id: 'other' }, { branch_id: '../bad' }, { jwks_url: null }, { pagination: {} }].map(change => ({ jwks: [{ ...row, ...change }] })),
    ...[undefined, 'br-a', 'br-other'].map(branch_id => ({ jwks: [{ ...row, jwks_url: scope.jwksUrl, ...(branch_id ? { branch_id } : {}) }] }))]) {
    const f = fixture((url) => url.endsWith('/jwks') ? response(raw) : response(role));
    await assert.rejects(f.run(name, args));
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET']);
  }
  const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status: 201 }) :
    response(url.endsWith('/jwks') ? { jwks: [{ ...row, branch_id: 'br-other' }] } : role));
  assert.deepEqual(await f.run(name, args), expected);
});

test('JWKS add: exact201 echoed configuration is required; unsafe receipt remains uncertain after one observation', async () => {
  for (const raw of [null, {}, { ...receipt, project_id: 'other' }, { ...receipt, pagination: {} },
    ...[{ id: '' }, { id: 'j'.repeat(257) }, { id: 'j\n' }, { project_id: 'other' }, { branch_id: 'other' }, { branch_id: undefined },
      { jwks_url: 'https://other.example.invalid/.well-known/jwks.json' }, { provider_name: 'other' }, { jwt_audience: undefined },
      { role_names: [] }, { role_names: ['other'] }, { role_names: [scope.roleName, 'other'] }, { pagination: {} }].map(change => ({ jwks: { ...receipt.jwks, ...change } }))]) {
    const f = fixture((url, init) => init.method === 'POST' ? response(raw, { status: 201 }) : preflight(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
    assert.equal(f.requests.filter(({ init }) => init.method === 'POST').length, 1);
  }
  for (const status of [200, 202, 302, 403, 404, 409, 500]) {
    const f = fixture((url, init) => init.method === 'POST' ? response(receipt, { status }) : preflight(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
  for (const id of ['a', 'j.'.repeat(64), 'j'.repeat(256)]) {
    const f = fixture({ jwks: { ...receipt.jwks, id } });
    assert.deepEqual(await f.run(name, args), { ...expected, id });
  }
});

test('JWKS add: ambiguity never upgrades list presence or absence to successful registration', async () => {
  for (const after of [list, { jwks: [receipt.jwks] }, { jwks: [{ ...receipt.jwks, branch_id: 'br-other' }] }, null]) {
    const f = fixture((url, init, n) => {
      if (init.method === 'POST') throw Error(canary);
      return n > 3 ? response(after) : preflight(url);
    });
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.deepEqual(f.requests.map(({ init }) => init.method), ['GET', 'GET', 'POST', 'GET']);
    assert.equal(f.requests[3].url, `${base}/jwks`);
  }
});

test('JWKS add: passwords, operation chains and key material are never evaluated or emitted', async () => {
  const raw = { ...receipt, jwks: { ...receipt.jwks } };
  const detail = { role: { ...role.role } };
  for (const [target, keys] of [[raw, ['operations', 'secret']], [raw.jwks, ['created_at', 'updated_at', 'keys', 'error']], [detail.role, ['password', 'authentication_method']]]) {
    for (const k of keys) Object.defineProperty(target, k, { get() { throw Error('unused'); }, enumerable: true });
  }
  const [op] = createNeonJWKSAddOperations(scope, { async getProjectBranchRole() { return detail; }, async getProjectJWKS() { return list; }, async addProjectJWKS() { return raw; } });
  const value = op.project(await op.execute(op.prepare(args), canary, new AbortController().signal));
  assert.deepEqual(value, expected);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const key of ['id', 'branch_id', 'jwks_url', 'role_names']) {
    const unsafe = { jwks: Object.defineProperty({ ...receipt.jwks }, key, { get() { throw Error('getter'); }, enumerable: true }) };
    assert.throws(() => op.project(unsafe));
  }
});

test('JWKS add: cancellation and ignored fetch/body deadlines bound the one mutation attempt', async () => {
  for (const stopAt of [1, 2, 3]) {
    const controller = new AbortController();
    const f = fixture((url, init, n) => { if (n === stopAt) controller.abort(); return init.method === 'POST' ? response(receipt, { status: 201 }) : preflight(url); });
    await assert.rejects(f.run(name, args, controller.signal), stopAt === 3 ? { message: 'OUTCOME_UNCERTAIN' } : undefined);
    assert.equal(f.requests.length, stopAt);
  }
  for (const make of [() => new Promise(() => {}), () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 201, headers: { 'content-type': 'application/json' } })]) {
    const f = fixture((url, init) => init.method === 'POST' ? make() : preflight(url));
    await assert.rejects(f.run(name, args), { message: 'OUTCOME_UNCERTAIN' });
    assert.equal(f.requests.length, 4);
  }
});

test('JWKS add: canonical narrow URL and explicit singleton configuration share transport parsers', async () => {
  const badUrls = ['http://issuer.example.invalid/.well-known/jwks.json', 'https://user:pass@issuer.example.invalid/.well-known/jwks.json',
    'https://127.0.0.1/.well-known/jwks.json', 'https://[::1]/.well-known/jwks.json', 'https://issuer.local/.well-known/jwks.json',
    'https://issuer.internal/.well-known/jwks.json', 'https://ISSUER.example.invalid/.well-known/jwks.json',
    'https://issuer.example.invalid:443/.well-known/jwks.json', 'https://issuer.example.invalid/keys', scope.jwksUrl + '?x=y', scope.jwksUrl + '#x', scope.jwksUrl + '\n'];
  for (const change of [...badUrls.map(jwksUrl => ({ jwksUrl })), { projectId: '-p' }, { branchId: '../b' }, { roleName: '' }, { roleName: 'x'.repeat(64) },
    { providerName: '' }, { audience: '' }, { audience: 'a\n' }, { revision: '' }, { skipRoleCreation: false }]) assert.throws(() => createNeonJWKSAddOperations({ ...scope, ...change }, {}));
  const config = { ...scope, projectId: 'p'.repeat(60), branchId: 'b'.repeat(60), roleName: 'r'.repeat(63), providerName: 'P'.repeat(80), audience: 'A'.repeat(80),
    jwksUrl: `https://${['h'.repeat(63), 'i'.repeat(63), 'j'.repeat(63), 'k'.repeat(61)].join('.')}/.well-known/jwks.json`, revision: 'r'.repeat(80) };
  const f = fixture(null, config);
  assert.equal((await f.run(name, { project_id: config.projectId, branch_id: config.branchId, role_name: config.roleName, jwks_url: config.jwksUrl, provider_name: config.providerName, jwt_audience: config.audience })).acknowledged, true);
  let calls = 0;
  const t = createNeonMetadataTransport(() => { calls++; throw Error('not reached'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const bad of badUrls) assert.throws(() => t.addProjectJWKS('project-a', 'br-a', scope.roleName, bad, scope.providerName, scope.audience, options));
  for (const bad of ['', 'x\n', 'x'.repeat(64)]) assert.throws(() => t.addProjectJWKS('project-a', 'br-a', bad, scope.jwksUrl, scope.providerName, scope.audience, options));
  await assert.rejects(t.addProjectJWKS('project-a', 'br-a', scope.roleName, scope.jwksUrl, scope.providerName, scope.audience, { ...options, credential: 'bad\nheader' }));
  assert.equal(calls, 0);
});
