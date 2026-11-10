import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonLogFieldOperations, LOG_FIELD_OPERATIONS } from '../dist/plugins/neon-broker/src/log-fields.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { logFieldCases as cases, logFieldFixture as fixture, logFieldScope as scope, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const poison = { values: [canary], logs: [{ message: canary }], password: canary, url: canary, message: canary };

test('log fields: fixed branch GET returns only explicitly selected dynamic field names', async () => {
  const f = fixture({ ...raw, fields: ['level', 'service.name', 'unselected'], ...poison });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/logs/fields`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/logs/fields', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ fields: [] }).run(name, args), { fields: [] });
  assert.deepEqual(await fixture(raw, { ...scope, fieldNames: [] }).run(name, args), { fields: [] });
  assert.deepEqual(await fixture({ fields: ['new field!?'] }, { ...scope, fieldNames: ['new field!?'] }).run(name, args), { fields: ['new field!?'] });
  assert.deepEqual(await fixture(raw, { ...scope, fieldNames: ['not-observed'] }).run(name, args), { fields: [] });
});

test('log fields: canonical arguments reject caller authority, discovery and query parameters', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: 'project-a' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].flatMap(id =>
      [{ ...args, project_id: id }, { ...args, branch_id: id }]),
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'field_name', 'since', 'source', 'query', 'fieldNames'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('log fields: scope copies exact project/branch/revision/selection and rejects duplicate or oversized selections', () => {
  const config = structuredClone(scope);
  const operations = createNeonLogFieldOperations(config, {});
  config.projectId = 'other';
  config.branchId = 'br-b';
  config.revision = 'scope-v2';
  config.fieldNames[0] = 'unselected';
  config.fieldNames.push('another');
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/logs/fields', revision: 'scope-v1' });
  assert.deepEqual(operations[0].project({ fields: ['level', 'unselected', 'another'] }), { fields: ['level'] });
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: 'Upper' }, { projectId: 'x'.repeat(61) }, { revision: '' },
    { fieldNames: ['level', 'level'] }, { fieldNames: [''] }, { fieldNames: ['x\n'] }, { fieldNames: ['аbc'] },
    { fieldNames: ['x'.repeat(81)] }, { fieldNames: Array.from({ length: 31 }, (_, i) => `field-${i}`) }]) {
    assert.throws(() => createNeonLogFieldOperations({ ...scope, ...change }, {}));
  }
  assert.deepEqual(operations.map(op => op.name), LOG_FIELD_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['queryProjectBranchLogs', 'listProjectBranchLogFieldValues', 'getProjectBranchBucketObject']) {
    assert.equal(fixture(raw).operation(other), undefined);
  }
});

test('log fields: detached execution revalidates exact arguments/resource/revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a/branches/br-a/logs' },
    { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/logs/fields' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('log fields: malformed, oversized, duplicate and contradictory responses refuse before filtering', async () => {
  for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' },
    { ...raw, pagination: {} }, { ...raw, fields: null }, { ...raw, fields: {} },
    ...[null, true, 0, {}, [], '', 'x\n', 'аbc', 'x'.repeat(81)].map(value => ({ fields: ['level', value] })),
    { fields: ['level', 'level'] }, { fields: ['unselected', 'unselected'] },
    { fields: Array.from({ length: 31 }, (_, n) => `unselected-${n}`) },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['fields', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  assert.throws(() => op.project({ fields: new Array(1) }));
  assert.throws(() => op.project({ fields: Object.defineProperty(['level'], '0', { get() { throw Error('getter'); }, enumerable: true }) }));
  assert.deepEqual(op.project(Object.defineProperty({ ...raw }, 'logs', { get() { throw Error('unused getter'); }, enumerable: true })), expected);
  assert.deepEqual(await fixture({ ...raw, project_id: args.project_id, branch_id: args.branch_id }).run(name, args), expected);
  const fields = Array.from({ length: 30 }, (_, n) => `field-${String(n).padStart(74, '0')}`);
  assert.equal(fields[0].length, 80);
  assert.deepEqual(await fixture({ fields }, { ...scope, fieldNames: fields }).run(name, args), { fields });
});

test('log fields: unavailable Private Beta and failed transport never fabricate empty lists or query fallback', async () => {
  for (const status of [403, 404, 410, 500, 302]) {
    const f = fixture(() => response({ reason: 'logs_not_available', ...poison }, { status }));
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

test('log fields: direct transport rejects malformed project/branch IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.listProjectBranchLogFields(value, args.branch_id, options));
    assert.throws(() => transport.listProjectBranchLogFields(args.project_id, value, options));
  }
  assert.equal(calls, 0);
});
