import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-branch-query-tags.js';
import * as get from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query-tag.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const target = { organization: 'example-org', database: 'app', branch: 'staging' };
const tag = { id: 'tag-1', name: 'application' };
const second = { id: 'tag-2', name: 'service' };
const listScope = { ...target, tags: [tag, second] };
const getScope = { ...target, tag };
const path = '/v1/organizations/example-org/databases/app/branches/staging/insights/tags';
const row = { ...tag, source: 'sql', query_count: 99, values: [{ name: canary, query_count: 99, kind: 'literal' }], normalized_sql: canary, dimensions: { customer: canary }, actor: canary, last_run_at: canary };
const page = { type: 'list', prev_page: null, next_page: null, data: [row], next_page_url: canary };
const output = { id: 'tag-1', source: 'sql', executionAuthority: 'not-established' };
const pageOutput = { items: [output], hasMore: false, coverage: 'first-page-only' };
const fixtures = [
  [list, listScope, page, pageOutput, path + '?page=1&per_page=10'],
  [get, getScope, row, output, path + '/application'],
];

for (const [adapter, scope, body, expected, endpoint] of fixtures) {
  const response = change => adapter === list ? { ...page, data: [{ ...row, ...change }] } : { ...row, ...change };

  test(`${adapter.operationId}: fixed GET and immutable metadata without tag values or names`, () => {
    const prepared = adapter.prepare(scope, {});
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: endpoint });
    const result = prepared.project(wire(body));
    assert.deepEqual(result, expected);
    for (const text of [canary, tag.name, 'query_count', 'values', 'dimensions']) assert.ok(!JSON.stringify(result).includes(text));
    for (const value of [prepared, prepared.request, result, ...(result.items ? [result.items, ...result.items] : [])]) assert.ok(Object.isFrozen(value));
  });

  test(`${adapter.operationId}: malformed and oversized wire refuses without reflection`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: closed arguments reject filters, SQL and authority overrides`, () => {
    for (const field of ['q', 'sql', 'url', 'secret', 'credential', 'approval', 'agentId', 'production', 'all', 'tag', 'tags', 'fingerprint', 'keyspace', 'from', 'to', 'period', 'page', 'per_page', 'tablet_type', 'values_limit', 'literal_values_only', 'execute']) assert.throws(() => adapter.prepare(scope, { [field]: canary }));
    for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(scope, value));
    const hostile = Object.defineProperty({}, 'q', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(scope, hostile), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: broker scope and tag bindings are closed and injection-safe`, () => {
    for (const field of ['organization', 'database', 'branch']) for (const value of [undefined, null, '', '../foreign', 'x/y', 'x%2fy', 'x?all=true', 'é', 'a'.repeat(129), canary]) assert.throws(() => adapter.prepare({ ...scope, [field]: value }, {}), error => !String(error).includes(canary));
    for (const value of [null, [], { ...scope, approval: true }, { ...scope, agentId: 'other' }]) assert.throws(() => adapter.prepare(value, {}));
    for (const field of ['id', 'name']) for (const value of [undefined, null, '', '../foreign', 'x/y', 'x%2fy', 'x?all=true', 'é', 'a'.repeat(81), canary]) {
      const bad = { ...tag, [field]: value };
      assert.throws(() => adapter.prepare(adapter === list ? { ...scope, tags: [bad] } : { ...scope, tag: bad }, {}), error => !String(error).includes(canary));
    }
    const hostile = Object.defineProperty({ ...tag }, 'name', { get() { throw new Error(canary); }, enumerable: true });
    for (const bad of [hostile, { ...tag, approval: true }, null, [], { id: 'tag-1' }]) assert.throws(() => adapter.prepare(adapter === list ? { ...scope, tags: [bad] } : { ...scope, tag: bad }, {}), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: caller mutation cannot retarget path or bound ID/name pairs`, () => {
    const copy = structuredClone(scope);
    const prepared = adapter.prepare(copy, {});
    copy.organization = 'foreign'; copy.database = 'foreign'; copy.branch = 'foreign';
    if (adapter === list) { copy.tags[0].id = 'foreign'; copy.tags[0].name = 'foreign'; copy.tags.push({ id: 'other', name: 'other' }); }
    else { copy.tag.id = 'foreign'; copy.tag.name = 'foreign'; }
    assert.equal(prepared.request.path, endpoint);
    assert.deepEqual(prepared.project(wire(body)), expected);
    for (const field of ['id', 'name']) assert.throws(() => prepared.project(wire(response({ [field]: 'foreign' }))));
  });

  test(`${adapter.operationId}: match independent tag ID/name pair and strict source enum`, () => {
    const prepared = adapter.prepare(scope, {});
    for (const field of ['id', 'name']) for (const value of [undefined, null, '', 'foreign', canary, 1, {}, []]) assert.throws(() => prepared.project(wire(response({ [field]: value }))), error => !String(error).includes(canary));
    assert.throws(() => prepared.project(wire(response({ name: second.name }))));
    assert.throws(() => prepared.project(wire(response({ id: second.id }))));
    for (const source of [undefined, null, '', 'SQL', 'other', true, 1, canary, {}, []]) assert.throws(() => prepared.project(wire(response({ source }))), error => !String(error).includes(canary));
    for (const source of ['sql', 'system']) assert.deepEqual(prepared.project(wire(response({ source }))), adapter === list ? { ...pageOutput, items: [{ ...output, source }] } : { ...output, source });
  });
}

test('query tags: whole-page refusal on unknown, duplicate, rebound or over-cap rows', () => {
  const prepared = list.prepare(listScope, {});
  for (const data of [null, {}, [null], [row, { ...row, id: 'foreign' }], [row, row], Array(11).fill(row), [row, { ...row, id: second.id }], [row, { ...row, ...second, source: canary }]]) assert.throws(() => prepared.project(wire({ ...page, data })), error => !String(error).includes(canary));
  assert.deepEqual(prepared.project(wire({ ...page, data: [row, { ...row, ...second }] })), { ...pageOutput, items: [output, { ...output, id: second.id }] });
  assert.deepEqual(prepared.project(wire({ ...page, data: [] })), { ...pageOutput, items: [] });
});

test('query tags: exact first-page envelope, optional nullable fields and no URL following', () => {
  const prepared = list.prepare(listScope, {});
  assert.deepEqual(prepared.project(wire({ ...page, next_page: 2 })), { ...pageOutput, hasMore: true });
  for (const change of [{ type: undefined }, { type: canary }, { prev_page: undefined }, { prev_page: 1 }, { next_page: undefined }, { next_page: 0 }, { next_page: 3 }, { next_page: canary }, { current_page: 2 }, { per_page: 11 }]) assert.throws(() => prepared.project(wire({ ...page, ...change })));
  for (const change of [{ current_page: 1, per_page: 10 }, { current_page: null, per_page: null }]) assert.deepEqual(prepared.project(wire({ ...page, ...change })), pageOutput);
});

test('query tags: bounded unique bindings and distinct detail/list scopes', () => {
  for (const tags of [[], [tag, tag], [tag, { ...second, name: tag.name }], Array(33).fill(tag)]) assert.throws(() => list.prepare({ ...listScope, tags }, {}));
  const hostile = Object.defineProperty([tag], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...listScope, tags: hostile }, {}), error => !String(error).includes(canary));
  assert.throws(() => get.prepare(listScope, {})); assert.throws(() => list.prepare(getScope, {}));
});

test('query tags: omit sensitive subtrees without interpreting values and refuse the static summaries route', () => {
  for (const values of [undefined, null, [], { name: canary }, canary]) assert.deepEqual(get.prepare(getScope, {}).project(wire({ ...row, values })), output);
  assert.deepEqual(get.prepare(getScope, {}).project(wire({ ...tag, source: 'sql' })), output);
  assert.throws(() => get.prepare({ ...getScope, tag: { ...tag, name: 'summaries' } }, {}));
});

test('query tags match pinned paths, required ID/name/source, envelopes and incomplete grouped summary contract', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  for (const [adapter, , , , endpoint] of fixtures) {
    const entry = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(value => value.value.operationId === adapter.operationId);
    assert.equal(entry.method, 'get');
    assert.equal('/v1' + entry.template.replace(/\{([^}]+)\}/g, (_, key) => key === 'tag' ? tag.name : target[key]), endpoint.split('?')[0]);
    const response = schema.definitions[entry.value.responses['200'].schema.$ref.split('/').at(-1)];
    const item = adapter === list ? response.properties.data.items : response;
    for (const field of ['id', 'name', 'source']) { assert.equal(item.properties[field].type, 'string'); assert.ok(item.required.includes(field)); }
    assert.deepEqual(item.properties.source.enum, ['sql', 'system']);
    if (adapter === list) { assert.deepEqual(response.required, ['type', 'next_page', 'prev_page', 'data']); for (const field of ['page', 'per_page']) assert.equal(entry.value.parameters.find(value => value.name === field).in, 'query'); }
    else { const selector = entry.value.parameters.find(value => value.name === 'tag'); assert.equal(selector.in, 'path'); assert.equal(selector.required, true); assert.match(selector.description, /name/); }
    const mapped = map.operations.find(value => value.operationId === adapter.operationId);
    assert.equal(mapped.implementation, 'offline-adapter-only'); assert.equal(mapped.test, 'test/query-tags.test.mjs'); assert.equal(mapped.enablement, 'disabled');
  }
  const grouped = schema.definitions.PaginatedDimensionsQuerySummary.properties.data.items;
  assert.equal(grouped.properties.id, undefined);
  assert.equal(grouped.properties.dimensions.additionalProperties, true);
  const gap = map.operations.find(value => value.operationId === 'list_branch_query_tag_summaries');
  assert.equal(gap.implementation, 'missing'); assert.equal(gap.adapter, null); assert.equal(gap.tier, 'unresolved');
  assert.ok(gap.prerequisites.includes('package-builder-reviewed-grouped-tag-dimensions-identity-and-safe-projection-contract'));
});
