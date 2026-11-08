import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonAuthWebhookOperations, AUTH_WEBHOOK_OPERATIONS, AUTH_WEBHOOK_EVENTS } from '../dist/plugins/neon-broker/src/auth-webhooks.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { authWebhookCases as cases, authWebhookFixture as fixture, authWebhookScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { webhook_url: canary, secret: canary, signing_key: canary, message: canary };

test('auth webhook: fixed branch-authenticated GET and closed status/event/timeout output', async () => {
  const f = fixture({ ...raw, ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/auth/webhooks`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/auth/webhooks', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  for (const enabled of [true, false]) {
    assert.deepEqual(await fixture({ enabled }).run(name, args), { enabled });
    assert.deepEqual(await fixture({ enabled, enabled_events: [] }).run(name, args), { enabled, enabled_events: [] });
    for (const timeout_seconds of [1, 10]) {
      const value = { enabled, enabled_events: [...AUTH_WEBHOOK_EVENTS], timeout_seconds };
      assert.deepEqual(await fixture(value).run(name, args), value);
    }
  }
});

test('auth webhook: strict canonical project/branch arguments and no authority or delivery overrides', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: 'project-a' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-other' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].flatMap(id =>
      [{ ...args, project_id: id }, { ...args, branch_id: id }]),
    ...['agent', 'approved', 'credential', 'url', 'webhook_url', 'enabled', 'enabled_events', 'timeout_seconds', 'cursor'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('auth webhook: construction copies trusted branch selection and rejects malformed or duplicate scope', () => {
  const config = structuredClone(scope);
  const operations = createNeonAuthWebhookOperations(config, {});
  config.projectId = 'other';
  config.revision = 'scope-v2';
  config.branchIds[0] = 'other';
  config.branchIds.push('br-other');
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/auth/webhooks', revision: 'scope-v1' });
  assert.throws(() => operations[0].prepare({ ...args, branch_id: 'br-other' }));
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { projectId: 'x'.repeat(61) }, { revision: '' },
    { branchIds: ['br-a', 'br-a'] }, { branchIds: ['Upper'] }, { branchIds: Array.from({ length: 31 }, (_, i) => `br-${i}`) }]) {
    assert.throws(() => createNeonAuthWebhookOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), AUTH_WEBHOOK_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['updateNeonAuthWebhookConfig', 'getNeonAuthPluginConfigs', 'sendNeonAuthTestEmail']) assert.equal(fixture(raw).operation(other), undefined);
});

test('auth webhook: detached execution revalidates exact arguments/resource/revision and aborts before transport', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a/branches/br-a/auth' },
    { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/auth/webhooks' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-other' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('auth webhook: malformed status/events/timeout, ancestry and pagination refuse without partial success', async () => {
  for (const value of [null, [], {}, { enabled: null }, { enabled: 'true' }, { ...raw, project_id: 'other' },
    { ...raw, branch_id: 'br-b' }, { ...raw, branch_id: 'other' }, { ...raw, pagination: {} },
    ...[null, {}, ['unknown'], ['send.otp', 'send.otp'], ['user.created\n'], [canary], Array(8).fill('send.otp')].map(enabled_events => ({ ...raw, enabled_events })),
    ...[null, 0, 11, 1.5, '5', true, Number.MAX_SAFE_INTEGER + 1].map(timeout_seconds => ({ ...raw, timeout_seconds })),
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const timeout_seconds of [NaN, Infinity, -Infinity, -0]) assert.throws(() => op.project({ ...raw, timeout_seconds }));
  for (const key of ['enabled', 'enabled_events', 'timeout_seconds', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  for (const enabled_events of [Array(1), Object.assign(['send.otp'], { extra: true }),
    Object.defineProperty(['send.otp'], 0, { get() { throw Error('getter'); }, enumerable: true })]) {
    assert.throws(() => op.project({ ...raw, enabled_events }));
  }
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'webhook_url', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  assert.deepEqual(await fixture({ ...raw, project_id: args.project_id, branch_id: args.branch_id }).run(name, args), expected);
});

test('auth webhook: non-200 or failed transport never follows a webhook URL or fabricates disabled status', async () => {
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

test('auth webhook: direct transport rejects malformed project and branch IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.getNeonAuthWebhookConfig(value, args.branch_id, options));
    assert.throws(() => transport.getNeonAuthWebhookConfig(args.project_id, value, options));
  }
  assert.equal(calls, 0);
});
