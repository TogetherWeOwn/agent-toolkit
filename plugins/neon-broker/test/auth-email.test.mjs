import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthEmailOperations, AUTH_EMAIL_OPERATIONS } from '../dist/plugins/neon-broker/src/auth-email.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { authEmailCases as cases, authEmailFixture as fixture, authEmailScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const booleanFields = Object.keys(raw).filter(key => key !== 'email_verification_method');
const poison = { password: canary, smtp_password: canary, email_provider: { key: canary }, url: canary, message: canary };

test('email auth: fixed branch-authenticated GET and closed required configuration fields', async () => {
  const f = fixture({ ...raw, ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/email_and_password`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/auth/email_and_password', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  for (const email_verification_method of ['link', 'otp']) {
    for (const enabled of [true, false]) {
      const value = { ...raw, email_verification_method, enabled };
      assert.deepEqual(await fixture(value).run(name, args), value);
    }
  }
  for (const key of booleanFields) {
    for (const value of [true, false]) assert.deepEqual(await fixture({ ...raw, [key]: value }).run(name, args), { ...expected, [key]: value });
  }
});

test('email auth: canonical project/branch arguments reject authority and configuration overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: 'project-a' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].flatMap(id =>
      [{ ...args, project_id: id }, { ...args, branch_id: id }]),
    ...['agent', 'approved', 'credential', 'url', 'cursor', ...Object.keys(raw)].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('email auth: construction copies selection and rejects malformed or duplicate scope', () => {
  const config = structuredClone(scope);
  const operations = createNeonAuthEmailOperations(config, {});
  config.projectId = 'other';
  config.revision = 'scope-v2';
  config.branchIds[0] = 'other';
  config.branchIds.push('br-other');
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/auth/email_and_password', revision: 'scope-v1' });
  assert.throws(() => operations[0].prepare({ ...args, branch_id: 'br-other' }));
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { projectId: 'x'.repeat(61) }, { revision: '' },
    { branchIds: ['br-a', 'br-a'] }, { branchIds: ['Upper'] }, { branchIds: Array.from({ length: 31 }, (_, i) => `br-${i}`) }]) {
    assert.throws(() => createNeonAuthEmailOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), AUTH_EMAIL_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['updateNeonAuthEmailAndPasswordConfig', 'getNeonAuthEmailProvider', 'getNeonAuthPluginConfigs', 'sendNeonAuthTestEmail']) {
    assert.equal(fixture(raw).operation(other), undefined);
  }
});

test('email auth: detached execution revalidates exact arguments/resource/revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a/branches/br-a/auth' },
    { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/auth/email_and_password' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('email auth: missing/malformed fields, contradictory ancestry and pagination refuse', async () => {
  for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' },
    { ...raw, branch_id: 'other' }, { ...raw, pagination: {} },
    ...[null, '', 'LINK', 'link\n', true, {}, canary].map(email_verification_method => ({ ...raw, email_verification_method })),
  ]) await assert.rejects(fixture(value).run(name, args));
  for (const key of Object.keys(raw)) {
    const missing = { ...raw };
    delete missing[key];
    await assert.rejects(fixture(missing).run(name, args));
  }
  for (const key of booleanFields) {
    for (const value of [null, 'true', 0, 1, [], {}]) await assert.rejects(fixture({ ...raw, [key]: value }).run(name, args));
  }
  const op = fixture(raw).operation(name);
  for (const key of [...Object.keys(raw), 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'password', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  assert.deepEqual(await fixture({ ...raw, project_id: args.project_id, branch_id: args.branch_id }).run(name, args), expected);
});

test('email auth: non-200/failed transport never fabricates defaults or uses email-provider fallback', async () => {
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

test('email auth: direct transport rejects malformed project and branch IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.getNeonAuthEmailAndPasswordConfig(value, args.branch_id, options));
    assert.throws(() => transport.getNeonAuthEmailAndPasswordConfig(args.project_id, value, options));
  }
  assert.equal(calls, 0);
});
