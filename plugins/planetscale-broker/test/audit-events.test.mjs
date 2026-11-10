import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as list from '../../../dist/plugins/planetscale-broker/src/tools/list-audit-logs.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const scope = { organization: 'example-org', eventIds: ['event123', 'event456'] };
const path = '/v1/organizations/example-org/audit-log?limit=10';
const sensitive = ['actor_id', 'actor_type', 'auditable_id', 'auditable_type', 'target_id', 'target_type', 'location', 'asn', 'asn_organization', 'target_display_name', 'action', 'actor_display_name', 'auditable_display_name', 'remote_ip', 'created_at', 'updated_at', 'metadata'];
const row = { id: 'event123', audit_action: canary, ...Object.fromEntries(sensitive.map(field => [field, canary])) };
const expected = { id: 'event123', auditActionRecorded: true, integrity: 'not-established' };
const page = (data, has_next = false) => ({ type: 'list', has_next, has_prev: false, cursor_start: data[0]?.id ?? null, cursor_end: data.at(-1)?.id ?? null, data });
const output = (items, hasMore = false) => ({ items, hasMore, coverage: 'first-page-only-not-completeness-evidence' });

test('audit events: fixed organization GET and frozen bound scalar-only metadata', () => {
  const prepared = list.prepare(scope, {});
  assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path });
  assert.equal(list.tool, 'planetscale.' + list.operationId);
  const projected = prepared.project(wire(page([row])));
  assert.deepEqual(projected, output([expected]));
  assert.ok(!JSON.stringify(projected).includes(canary));
  for (const value of [prepared, prepared.request, projected, projected.items, ...projected.items]) assert.ok(Object.isFrozen(value));
});

test('audit events: arguments cannot override collection, cursor, transport or authority', () => {
  for (const field of ['organization', 'eventIds', 'url', 'sql', 'secret', 'credential', 'approval', 'agentId', 'production', 'starting_after', 'ending_before', 'limit', 'page', 'all']) assert.throws(() => list.prepare(scope, { [field]: canary }));
  for (const value of [null, [], true, 'x', JSON.parse('{"__proto__":{}}')]) assert.throws(() => list.prepare(scope, value));
  const hostile = Object.defineProperty({}, 'url', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare(scope, hostile), error => !String(error).includes(canary));
});

test('audit events: closed broker scope refuses retargeting and getters', () => {
  for (const organization of ['../foreign', 'x%2fy', 'é', 'a'.repeat(64), canary, null]) assert.throws(() => list.prepare({ ...scope, organization }, {}), error => !String(error).includes(canary));
  for (const value of [null, [], { ...scope, approval: true }, { ...scope, database: 'app' }, { ...scope, agentId: 'other' }]) assert.throws(() => list.prepare(value, {}));
  const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare(hostile, {}), error => !String(error).includes(canary));
});

test('audit events: unique bounded event bindings are required', () => {
  for (const eventIds of [[], ['event123', 'event123'], Array(33).fill('event123'), ['x/y'], [null], [canary], ['']]) assert.throws(() => list.prepare({ ...scope, eventIds }, {}));
  const hostile = Object.defineProperty(['event123'], '0', { get() { throw new Error(canary); }, enumerable: true });
  assert.throws(() => list.prepare({ ...scope, eventIds: hostile }, {}), error => !String(error).includes(canary));
  assert.doesNotThrow(() => list.prepare({ ...scope, eventIds: Array.from({ length: 32 }, (_, i) => 'event' + i) }, {}));
});

test('audit events: immutable scopes resist later caller mutation', () => {
  const mutable = structuredClone(scope);
  const prepared = list.prepare(mutable, {});
  mutable.organization = 'foreign'; mutable.eventIds[0] = 'foreign'; mutable.eventIds.push('another');
  assert.equal(prepared.request.path, path);
  assert.deepEqual(prepared.project(wire(page([row]))), output([expected]));
  assert.throws(() => prepared.project(wire(page([{ ...row, id: 'foreign' }]))));
});

test('audit events: malformed or oversized wire data gives non-reflecting refusal', () => {
  const prepared = list.prepare(scope, {});
  for (const value of [wire(null), wire([]), wire({}), wire(canary), new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), new TextEncoder().encode('{"secret":"' + canary)]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
});

test('audit events: unknown or malformed event identity refuses the whole page', () => {
  const prepared = list.prepare(scope, {});
  for (const id of [undefined, null, true, 1, {}, [], canary, 'foreign', '../foreign', 'a'.repeat(81)]) assert.throws(() => prepared.project(wire(page([row, { ...row, id }]))), error => !String(error).includes(canary));
});

test('audit events: action presence is a bounded string, never action text or integrity evidence', () => {
  const prepared = list.prepare(scope, {});
  for (const audit_action of [undefined, null, true, 1, {}, [], 'a'.repeat(257)]) assert.throws(() => prepared.project(wire(page([row, { ...row, id: 'event456', audit_action }]))), error => !String(error).includes(canary));
  for (const audit_action of ['', canary, 'a'.repeat(256)]) assert.deepEqual(prepared.project(wire(page([{ ...row, audit_action }]))), output([{ ...expected, auditActionRecorded: audit_action.length > 0 }]));
});

test('audit events: duplicate, malformed and over-cap rows refuse without partial output', () => {
  const prepared = list.prepare(scope, {});
  for (const data of [null, {}, [null], [row, row], Array(11).fill(row)]) assert.throws(() => prepared.project(wire({ ...page([]), data })));
  assert.deepEqual(prepared.project(wire(page([]))), output([]));
  assert.deepEqual(prepared.project(wire(page([row, { ...row, id: 'event456' }]))), output([expected, { ...expected, id: 'event456' }]));
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...row, id: 'event' + i }));
  assert.equal(list.prepare({ ...scope, eventIds: rows.map(row => row.id) }, {}).project(wire(page(rows))).items.length, 10);
});

test('audit events: cursor envelope is validated and later pages remain unsupported', () => {
  const prepared = list.prepare(scope, {});
  assert.deepEqual(prepared.project(wire(page([row], true))), output([expected], true));
  for (const [field, values] of [
    ['type', [undefined, null, true, 'page']],
    ['has_next', [undefined, null, 1, 'true']],
    ['has_prev', [undefined, null, true, 0, 'false']],
    ['cursor_start', [undefined, null, canary, 'event456', 1]],
    ['cursor_end', [undefined, null, canary, 'event456', 1]],
  ]) for (const value of values) assert.throws(() => prepared.project(wire({ ...page([row]), [field]: value })), error => !String(error).includes(canary));
  assert.throws(() => prepared.project(wire(page([], true))));
  for (const field of ['cursor_start', 'cursor_end']) assert.throws(() => prepared.project(wire({ ...page([]), [field]: 'event123' })));
  assert.throws(() => prepared.project(wire({ ...page([row, { ...row, id: 'event456' }]), cursor_start: 'event456', cursor_end: 'event123' })));
});

test('audit events: actor, target, action, network and metadata subtrees are omitted entirely', () => {
  const prepared = list.prepare(scope, {});
  for (const omitted of sensitive) {
    const altered = { ...row, [omitted]: { token: canary, sql: canary } };
    assert.deepEqual(prepared.project(wire(page([altered]))), output([expected]));
    delete altered[omitted];
    assert.deepEqual(prepared.project(wire(page([altered]))), output([expected]));
  }
});

test('audit events: route, cursor contract, selected fields and distinct scope match pinned official schema', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  const operation = schema.paths['/organizations/{organization}/audit-log'].get;
  assert.equal(operation.operationId, list.operationId);
  assert.equal('/v1/organizations/' + scope.organization + '/audit-log?limit=10', path);
  assert.equal(operation.parameters.find(row => row.name === 'limit').type, 'integer');
  const response = schema.definitions[operation.responses['200'].schema.$ref.split('/').at(-1)];
  assert.deepEqual(response.required, ['type', 'has_next', 'has_prev', 'cursor_start', 'cursor_end', 'data']);
  for (const field of ['id', 'audit_action']) {
    assert.ok(response.properties.data.items.required.includes(field));
    assert.equal(response.properties.data.items.properties[field].type, 'string');
  }
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const mapped = map.operations.find(row => row.operationId === list.operationId);
  assert.deepEqual(mapped.documentedAuthorization.serviceTokenAnyOf, ['read_audit_logs']);
  assert.deepEqual(mapped.documentedAuthorization.oauthAlternatives, [{ resource: 'Organization', anyOf: ['read_audit_logs'] }]);
  assert.equal(mapped.implementation, 'offline-adapter-only');
  assert.equal(mapped.projectionCoverage, 'bounded-metadata-subset-not-full-operation');
  assert.equal(mapped.test, 'test/audit-events.test.mjs');
  assert.equal(mapped.enablement, 'disabled');
});
