import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonMaskingRuleOperations, MASKING_RULE_OPERATIONS } from '../dist/plugins/neon-broker/src/masking-rules.js';
import { createNeonMetadataTransport, NEON_ORIGIN, RESPONSE_BYTES } from '../dist/plugins/neon-broker/src/transport.js';
import { maskingRuleCases as cases, maskingRuleFixture as fixture, maskingRuleScope as scope, maskingRule as rule, canary, response } from './helpers.mjs';

const [name, args, raw, expected] = cases[0];
const names = ['database_name', 'schema_name', 'table_name', 'column_name'];
const poison = { masking_function: canary, masking_value: canary, password: canary, connection_uri: canary, message: canary };

test('masking rules: fixed branch GET projects only exact selected column identities, never expressions or values', async () => {
  const unselected = names.map(key => ({ ...rule, [key]: 'other' }));
  const f = fixture({ ...raw, ...poison, masking_rules: [{ ...rule, ...poison }, ...unselected] });
  assert.deepEqual(await f.run(name, args), expected);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `${NEON_ORIGIN}/api/v2/projects/project-a/branches/br-a/masking_rules`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  const op = f.operation(name);
  assert.deepEqual(op.prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/masking_rules', revision: 'scope-v1' });
  assert.equal(op.tier, 'read');
  assert.equal(op.lifecycle, 'none');
  assert.equal(op.timeoutMs, 3500);
  assert.deepEqual(await fixture({ masking_rules: [] }).run(name, args), { masking_rules: [] });
  assert.deepEqual(await fixture(raw, { ...scope, rules: [] }).run(name, args), { masking_rules: [] });
  assert.deepEqual(await fixture({ masking_rules: unselected }).run(name, args), { masking_rules: [] });
});

test('masking rules: closed canonical arguments refuse caller selection, authority and path injection', () => {
  const f = fixture(raw);
  for (const value of [null, [], {}, { project_id: 'project-a' }, { ...args, project_id: 'other' }, { ...args, branch_id: 'br-b' },
    ...['', '../escape', 'x/y', 'x?y=z', 'x\n', 'x\u0000', 'аbc', 'Upper', true, null, 'x'.repeat(61)].flatMap(id =>
      [{ ...args, project_id: id }, { ...args, branch_id: id }]),
    ...['agent', 'approved', 'credential', 'url', 'cursor', 'rules', ...names, 'masking_function'].map(key => ({ ...args, [key]: canary })),
    Object.assign(Object.create({ inherited: true }), args),
    Object.defineProperty({ ...args }, 'branch_id', { get() { throw Error('getter'); }, enumerable: true }),
  ]) assert.throws(() => f.operation(name).prepare(value));
  assert.equal(f.requests.length, 0);
});

test('masking rules: construction copies nested tuples and refuses malformed or duplicate selections', () => {
  const config = structuredClone(scope);
  const operations = createNeonMaskingRuleOperations(config, {});
  config.projectId = 'other';
  config.branchId = 'br-b';
  config.revision = 'scope-v2';
  config.rules[0].column_name = 'other';
  config.rules.push({ ...rule, table_name: 'other' });
  assert.deepEqual(operations[0].prepare(args).resource, { id: 'neon/projects/project-a/branches/br-a/masking_rules', revision: 'scope-v1' });
  assert.deepEqual(operations[0].project(raw), expected);
  for (const change of [{ extra: true }, { projectId: 'Upper' }, { branchId: 'Upper' }, { revision: '' },
    { rules: [rule, rule] }, { rules: new Array(1) }, { rules: [{ ...rule, extra: true }] },
    { rules: Array.from({ length: 31 }, (_, n) => ({ ...rule, column_name: `c_${n}` })) },
    ...names.flatMap(key => ['', '../escape', 'x/y', 'x\n', 'аbc', 'x'.repeat(64), null].map(value => ({ rules: [{ ...rule, [key]: value }] }))),
  ]) assert.throws(() => createNeonMaskingRuleOperations({ ...scope, ...change }, {}));
  assert.deepEqual(operations.map(op => op.name), MASKING_RULE_OPERATIONS.map(name => `neon.${name}`));
  for (const other of ['updateMaskingRules', 'getProjectBranchSchema', 'startAnonymization']) assert.equal(fixture(raw).operation(other), undefined);
});

test('masking rules: detached execution revalidates resource, arguments, revision and cancellation', async () => {
  const f = fixture(raw);
  const { prepare, execute, project } = f.operation(name);
  const prepared = prepare(args);
  for (const resource of [{ ...prepared.resource, id: 'neon/projects/project-a/branches/br-a' },
    { ...prepared.resource, id: 'neon/projects/project-a/branches/br-b/masking_rules' }, { ...prepared.resource, revision: 'scope-v2' }]) {
    await assert.rejects(execute({ ...prepared, resource }, canary, new AbortController().signal));
  }
  await assert.rejects(execute({ ...prepared, arguments: { ...args, branch_id: 'br-b' } }, canary, new AbortController().signal));
  await assert.rejects(execute(prepared, canary, AbortSignal.abort()));
  for (const credential of [`${canary}\r`, `${canary}\n`]) await assert.rejects(execute(prepared, credential, new AbortController().signal));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(project(await execute(prepared, canary, new AbortController().signal)), expected);
});

test('masking rules: malformed, duplicate, over-limit and foreign ancestry refuse before selection', async () => {
  const other = { ...rule, column_name: 'other' };
  for (const value of [null, [], {}, { ...raw, project_id: 'other' }, { ...raw, branch_id: 'br-b' }, { ...raw, pagination: {} },
    { masking_rules: null }, { masking_rules: {} }, { masking_rules: [rule, rule] }, { masking_rules: [other, other] },
    ...names.flatMap(key => [undefined, null, true, 1, {}, [], '', 'x\n', 'аbc', 'x'.repeat(64)].map(value =>
      ({ masking_rules: [rule, { ...other, [key]: value }] }))),
    ...[{ project_id: 'other' }, { branch_id: 'br-b' }, { pagination: {} }].map(extra => ({ masking_rules: [rule, { ...other, ...extra }] })),
    { masking_rules: Array.from({ length: 31 }, (_, n) => ({ ...rule, column_name: `c_${n}` })) },
  ]) await assert.rejects(fixture(value).run(name, args));
  const op = fixture(raw).operation(name);
  for (const key of ['masking_rules', 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project(Object.defineProperty({ ...raw }, key, { get() { throw Error('getter'); }, enumerable: true })));
  }
  for (const key of [...names, 'project_id', 'branch_id', 'pagination']) {
    assert.throws(() => op.project({ masking_rules: [Object.defineProperty({ ...rule }, key, { get() { throw Error('getter'); }, enumerable: true })] }));
  }
  assert.throws(() => op.project({ masking_rules: new Array(1) }));
  assert.throws(() => op.project({ masking_rules: Object.defineProperty([rule], '0', { get() { throw Error('getter'); }, enumerable: true }) }));
  const unread = { ...rule };
  for (const key of ['masking_function', 'masking_value', 'password']) Object.defineProperty(unread, key, { get() { throw Error('unused getter'); }, enumerable: true });
  assert.deepEqual(op.project({ masking_rules: [unread] }), expected);
  assert.deepEqual(await fixture({ ...raw, project_id: args.project_id, branch_id: args.branch_id }).run(name, args), expected);
  const rules = Array.from({ length: 30 }, (_, n) => Object.fromEntries(names.map(key => [key, `n_${n}_${'x'.repeat(58)}`.slice(0, 63)])));
  assert.deepEqual(await fixture({ masking_rules: rules }, { ...scope, rules }).run(name, args), { masking_rules: rules });
});

test('masking rules: unavailable Beta and transport failures do not fabricate empty success or SQL fallback', async () => {
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

test('masking rules: direct transport constrains both IDs before fetch', () => {
  let calls = 0;
  const transport = createNeonMetadataTransport(() => { calls++; throw Error('must not fetch'); });
  const options = { credential: canary, signal: new AbortController().signal };
  for (const value of [undefined, null, '', '../escape', 'x/y', 'x?y=z', 'x\n', 'Upper', 'x'.repeat(61), 'аbc']) {
    assert.throws(() => transport.getMaskingRules(value, args.branch_id, options));
    assert.throws(() => transport.getMaskingRules(args.project_id, value, options));
  }
  assert.equal(calls, 0);
});
