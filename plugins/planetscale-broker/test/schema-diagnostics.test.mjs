import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as lint from '../../../dist/plugins/planetscale-broker/src/tools/lint-branch-schema.js';
import * as storage from '../../../dist/plugins/planetscale-broker/src/tools/check-deploy-request-storage.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const lintScope = { ...target, keyspaceNames: ['main', 'archive'] };
const storageScope = { organization: 'example-org', database: 'app', number: 42 };
const path = '/v1/organizations/example-org/databases/app';
const args = { page: 1, perPage: 2 };
const lintRow = { lint_error: canary, subject_type: 'table_error', keyspace_name: 'main', table_name: canary, error_description: canary, docs_url: canary, column_name: canary, foreign_key_column_names: [canary], auto_increment_column_names: [canary], charset_name: canary, engine_name: canary, vindex_name: canary, json_path: canary, check_constraint_name: canary, enum_value: canary, partitioning_type: canary, partition_name: canary };
const lintPage = { current_page: 1, per_page: 2, next_page: null, data: [lintRow], next_page_url: canary };
const storageRow = { enough_storage: false, upgradeable: true, storage_bytes_needed: 12345, storage_report: { [canary]: { [canary]: { used: 1, capacity: 2, remaining: 1, has_enough: false } } }, secret: canary };
const authority = { deploymentAuthority: 'not-established' };
const subjectExpected = { keyspace: 'main', subjectType: 'table_error', ...authority };
const lintExpected = { items: [subjectExpected], nextPage: null, complete: true };
const storageExpected = { enoughStorage: false, upgradeable: true, ...authority };
const fixtures = [
  [lint, lintScope, args, lintPage, lintExpected, path + '/branches/staging/schema/lint?page=1&per_page=2'],
  [storage, storageScope, {}, storageRow, storageExpected, path + '/deploy-requests/42/storage-check'],
];

for (const [adapter, scope, input, body, expected, endpoint] of fixtures) {
  test(`${adapter.operationId}: fixed GET with frozen redacted projection`, () => {
    const prepared = adapter.prepare(scope, input);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const output = prepared.project(wire(body));
    assert.deepEqual(output, expected);
    assert.ok(!JSON.stringify(output).includes(canary));
    for (const value of [prepared, prepared.request, output, ...(output.items ? [output.items, ...output.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: malformed and oversized wire values fail without reflection`, () => {
    const prepared = adapter.prepare(scope, input);
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments refuse access and authority overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'keyspaceNames', 'number', 'branch', 'execute']) assert.throws(() => adapter.prepare(scope, { ...input, [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({ ...input }, 'sql', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed scope and bounded path segments`, () => {
    for (const field of ['organization', 'database', ...(adapter === lint ? ['branch'] : [])]) for (const value of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, input), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, input));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, input), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: caller mutation cannot retarget scope or arguments`, () => {
    const copy = structuredClone(scope);
    const inputCopy = structuredClone(input);
    const prepared = adapter.prepare(copy, inputCopy);
    copy.organization = 'foreign'; copy.database = 'foreign';
    if (adapter === lint) { copy.branch = 'foreign'; copy.keyspaceNames[0] = 'foreign'; copy.keyspaceNames.push('another'); inputCopy.page = 2; inputCopy.perPage = 10; }
    else copy.number = 99;
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(body)), expected);
    if (adapter === lint) assert.throws(() => prepared.project(wire({ ...lintPage, data: [{ ...lintRow, keyspace_name: 'foreign' }] })));
  });
}

test('lint: unknown or malformed keyspaces refuse the entire page', () => {
  const prepared = lint.prepare(lintScope, args);
  for (const keyspace_name of ['foreign', canary, null, '', 'a'.repeat(64), 1]) assert.throws(() => prepared.project(wire({ ...lintPage, data: [lintRow, { ...lintRow, keyspace_name }] })), error => !String(error).includes(canary));
  for (const data of [null, {}, [null], Array(3).fill(lintRow)]) assert.throws(() => prepared.project(wire({ ...lintPage, data })));
});

test('lint: exact documented subject enums only, with no invented error-code enum', () => {
  const prepared = lint.prepare(lintScope, args);
  for (const subject_type of ['table_error', 'vschema_error', 'routing_rules_error']) assert.deepEqual(prepared.project(wire({ ...lintPage, data: [{ ...lintRow, subject_type }] })), { ...lintExpected, items: [{ ...subjectExpected, subjectType: subject_type }] });
  for (const subject_type of [undefined, null, canary, 'approved', true]) assert.throws(() => prepared.project(wire({ ...lintPage, data: [lintRow, { ...lintRow, subject_type }] })), error => !String(error).includes(canary));
});

test('lint: duplicate subjects are distinct errors, never silently deduplicated', () => {
  assert.deepEqual(lint.prepare(lintScope, args).project(wire({ ...lintPage, data: [lintRow, { ...lintRow, lint_error: 'different' }] })), { ...lintExpected, items: [subjectExpected, subjectExpected] });
});

test('lint: explicit bounded pagination, never follows provider URLs', () => {
  const prepared = lint.prepare(lintScope, args);
  assert.deepEqual(prepared.project(wire({ ...lintPage, next_page: 2 })), { ...lintExpected, nextPage: 2, complete: false });
  assert.deepEqual(prepared.project(wire({ ...lintPage, data: [] })), { ...lintExpected, items: [] });
  for (const change of [{ current_page: 2 }, { per_page: 3 }, { next_page: 3 }, { next_page: canary }]) assert.throws(() => prepared.project(wire({ ...lintPage, ...change })));
  const last = lint.prepare(lintScope, { page: 100, perPage: 2 });
  assert.throws(() => last.project(wire({ ...lintPage, current_page: 100, next_page: 101 })));
  assert.deepEqual(last.project(wire({ ...lintPage, current_page: 100 })), lintExpected);
  for (const input of [{}, { page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: 1, perPage: 0 }]) assert.throws(() => lint.prepare(lintScope, input));
});

test('lint: unique snapshotted scope names with caps, no caller widening', () => {
  for (const keyspaceNames of [[], ['main', 'main'], Array(33).fill('main'), ['x/y'], ['../foreign'], [canary], [null], [''], ['a'.repeat(64)]]) assert.throws(() => lint.prepare({ ...lintScope, keyspaceNames }, args));
  const hostile = Object.defineProperty(['main'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => lint.prepare({ ...lintScope, keyspaceNames: hostile }, args), error => !String(error).includes(canary));
});

test('storage: flags are strictly boolean, never safe-deploy or upgrade authority', () => {
  const prepared = storage.prepare(storageScope, {});
  for (const enough_storage of [true, false]) for (const upgradeable of [true, false]) assert.deepEqual(prepared.project(wire({ ...storageRow, enough_storage, upgradeable })), { enoughStorage: enough_storage, upgradeable, ...authority });
  for (const field of ['enough_storage', 'upgradeable']) for (const value of [undefined, null, 0, 1, 'false', canary, {}, []]) assert.throws(() => prepared.project(wire({ ...storageRow, [field]: value })), error => !String(error).includes(canary));
});

test('storage: bounded request numbers, no response identity invented', () => {
  for (const number of [0, -0, -1, 1.5, 2147483648, '42', null]) assert.throws(() => storage.prepare({ ...storageScope, number }, {}));
  for (const number of [1, 2147483647]) assert.ok(storage.prepare({ ...storageScope, number }, {}).request.path.includes('/' + number + '/storage-check'));
  assert.deepEqual(storage.prepare(storageScope, {}).project(wire({ enough_storage: false, upgradeable: false })), { enoughStorage: false, upgradeable: false, ...authority });
});

test('schema diagnostic paths and selected fields match the pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => scope[key]), endpoint.split('?')[0]);
    const response = entry.value.responses['200'].schema;
    const result = response.$ref ? schema.definitions[response.$ref.split('/').at(-1)] : response;
    if (adapter === lint) {
      assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query').map(value => value.name).sort(), ['page', 'per_page']);
      const row = result.properties.data.items;
      assert.deepEqual(row.properties.subject_type.enum, ['table_error', 'vschema_error', 'routing_rules_error']);
      assert.ok(row.required.includes('subject_type')); assert.ok(row.required.includes('keyspace_name'));
    } else {
      assert.deepEqual(entry.value.parameters.filter(value => value.in === 'query'), []);
      for (const field of ['enough_storage', 'upgradeable']) { assert.equal(result.properties[field].type, 'boolean'); assert.ok(result.required.includes(field)); }
      assert.equal(result.properties.id, undefined);
    }
  }
});

test('workflow map distinguishes missing opaque reads from bounded offline status without live authority', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const operationId of ['list_move_tables_workflows', 'get_move_tables_workflow', 'get_move_tables_workflow_status']) {
    const operation = Object.values(schema.paths).flatMap(methods => Object.values(methods)).find(value => value.operationId === operationId);
    const data = operation.responses['200'].schema.properties.data;
    if (operationId !== 'get_move_tables_workflow_status') { assert.equal(data.properties.workflows.items.additionalProperties, true); assert.equal(data.properties.workflows.items.properties, undefined); }
    else { assert.equal(data.properties.traffic_state.type, 'string'); assert.equal(data.properties.traffic_state.enum, undefined); }
    const mapped = map.operations.find(value => value.operationId === operationId);
    if (operationId === 'get_move_tables_workflow_status') {
      assert.equal(mapped.implementation, 'offline-adapter-only');
      assert.equal(mapped.adapter, 'src/tools/get-move-tables-workflow-status.ts');
      assert.equal(mapped.test, 'test/move-tables-status.test.mjs');
      assert.equal(mapped.tier, 'read');
    } else {
      assert.equal(mapped.implementation, 'missing'); assert.equal(mapped.adapter, null);
      assert.equal(mapped.test, null); assert.equal(mapped.tier, 'unresolved');
    }
    assert.equal(mapped.review, 'not-reviewed'); assert.equal(mapped.enablement, 'disabled');
    for (const prerequisite of ['operator-verified-scope-metadata', 'reviewed-compatible-common-core', 'exact-tier-security-crypto-qa-and-actions', 'package-builder-reviewed-vitess-workflow-identity-state-and-safe-projection-contract']) assert.ok(mapped.prerequisites.includes(prerequisite));
  }
});
