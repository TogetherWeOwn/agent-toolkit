import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListAuditLogsPreparation, bindListInvoicesPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as auditRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-audit-logs.js';

const ids = n => Array.from({ length: n }, (_, i) => `event_${i + 1}`);
const targetFor = () => ({ organization: 'sample-org', organizationId: 'org_1', revision: 'a'.repeat(64), eventIds: ids(2) });
const scopeFor = t => ({ organization: t.organization, eventIds: t.eventIds });
const envelope = data => ({ type: 'list', has_prev: false, has_next: data.length > 0,
  cursor_start: data[0]?.id ?? null, cursor_end: data.at(-1)?.id ?? null, data });
const project = body => auditRead(scopeFor(targetFor()), {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });
const row = { id: 'event_1', audit_action: 'synthetic-canary' };

test('audit preparation: exact fixed first-page GET and closed organization resource', () => {
  const target = targetFor(); const prepared = bindListAuditLogsPreparation(target)({});
  assert.deepEqual(prepared.resource, { id: 'planetscale/organization/org_1', revision: target.revision });
  assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
  assert.deepEqual(prepared.arguments, {});
  assert.equal(prepared.artifactDigest, null);
  assert.equal(prepared.plan.operationId, 'list_audit_logs');
  assert.equal(prepared.plan.tool, 'planetscale.list_audit_logs');
  assert.deepEqual(prepared.plan.proposedRequest, auditRead(scopeFor(target), {}).request);
  assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
    path: '/v1/organizations/sample-org/audit-log?limit=10' });
  assert.equal(canonicalHash(prepared), canonicalHash(bindListAuditLogsPreparation(target)(Object.create(null))));
});

test('audit preparation: confinement is not collection permission, integrity or native authority', () => {
  const prepare = bindListAuditLogsPreparation(targetFor()); const prepared = prepare({});
  assert.equal(prepared.plan.kind, 'validated-local-read-plan');
  assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
  assert.equal(prepared.plan.execution, 'not-implemented');
  assert.equal(prepared.plan.nonWaking, 'not-verified');
  for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
  for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'integrity', 'read_audit_logs']) {
    assert.equal(Object.hasOwn(prepared.plan, key), false);
  }
});

test('audit preparation: receipt omits action, actor, target, network and metadata canaries', () => {
  const result = project(envelope([{ ...row, actor_id: 'synthetic-canary', auditable_id: 'synthetic-canary',
    remote_ip: 'synthetic-canary', location: 'synthetic-canary', metadata: { token: 'synthetic-canary' },
    organization_id: 'unverified-parent', created_at: 'synthetic-canary' }]));
  assert.deepEqual(result, { items: [{ id: 'event_1', auditActionRecorded: true, integrity: 'not-established' }],
    hasMore: true, coverage: 'first-page-only-not-completeness-evidence' });
  for (const canary of ['synthetic-canary', 'unverified-parent']) assert.equal(JSON.stringify(result).includes(canary), false);
  for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(project(envelope([])), { items: [], hasMore: false, coverage: 'first-page-only-not-completeness-evidence' });
});

test('audit preparation: unknown, duplicate or malformed children refuse the whole page', () => {
  assert.throws(() => project(envelope([row, { ...row, id: 'unknown' }])), { code: 'scope' });
  assert.throws(() => project(envelope([row, row])), { code: 'upstream' });
  for (const audit_action of [null, true, {}, 'x'.repeat(257)]) {
    assert.throws(() => project(envelope([row, { id: 'event_2', audit_action }])), { code: 'upstream' });
  }
});

test('audit preparation: cursor envelope and ten-row cap are enforced without completeness claims', () => {
  for (const patch of [{ type: 'page' }, { has_prev: true }, { has_next: 'true' }, { cursor_start: 'other' },
    { cursor_end: 'other' }, { data: Array(11).fill(row) }]) {
    assert.throws(() => project({ ...envelope([row]), ...patch }), { code: 'upstream' });
  }
  assert.throws(() => project({ ...envelope([]), has_next: true }), { code: 'upstream' });
  const rows = ids(10).map(id => ({ ...row, id }));
  const result = auditRead({ organization: 'sample-org', eventIds: ids(32) }, {})
    .project(Buffer.from(JSON.stringify(envelope(rows))));
  assert.equal(result.items.length, 10);
  assert.equal(result.coverage, 'first-page-only-not-completeness-evidence');
});

test('audit preparation: immutable host organization, revision and event IDs are deeply captured', () => {
  const target = targetFor(); const prepare = bindListAuditLogsPreparation(target); const before = prepare({});
  target.organization = 'other'; target.organizationId = 'other'; target.revision = 'b'.repeat(64);
  target.eventIds[0] = 'other'; target.eventIds.push('third');
  assert.deepEqual(prepare({}), before);
  for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
    before.plan.target.eventIds, before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { before.plan.target.eventIds[0] = 'other'; }, TypeError);
});

test('audit preparation: every host field, child ID and order changes plan and full hashes', () => {
  const original = bindListAuditLogsPreparation(targetFor())({});
  const variants = ['organization', 'organizationId', 'revision'].map(key => ({ ...targetFor(),
    [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
  for (const index of [0, 1]) { const target = targetFor(); target.eventIds[index] = 'other'; variants.push(target); }
  const reordered = targetFor(); reordered.eventIds.reverse(); variants.push(reordered);
  for (const target of variants) {
    const changed = bindListAuditLogsPreparation(target)({});
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  }
});

test('audit preparation: independent organization and event IDs remain hashed on unchanged requests', () => {
  const original = bindListAuditLogsPreparation(targetFor())({});
  for (const key of ['organizationId', 'eventIds']) {
    const target = targetFor(); if (key === 'eventIds') target.eventIds[0] = 'other'; else target[key] = 'other';
    const changed = bindListAuditLogsPreparation(target)({});
    assert.deepEqual(changed.plan.proposedRequest, original.plan.proposedRequest);
    assert.notEqual(canonicalHash(changed.plan), canonicalHash(original.plan));
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
  }
});

test('audit preparation: caller cannot replace host scope, request, cursor or authority', () => {
  const prepare = bindListAuditLogsPreparation(targetFor());
  for (const raw of [null, [], { target: targetFor() }, { eventIds: ids(1) }, { organizationId: 'other' },
    { page: 2 }, { starting_after: 'event_1' }, { ending_before: 'event_2' }, { limit: 20 }, { approved: true },
    { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
    { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) {
    refused(() => prepare(raw));
  }
  let touched = false;
  refused(() => prepare(Object.defineProperty({}, 'eventIds', { enumerable: true, get() { touched = true; return ids(1); } })));
  assert.equal(touched, false);
});

test('audit preparation: host fields are required, closed and accessor-free', () => {
  for (const key of Object.keys(targetFor())) {
    const missing = targetFor(); delete missing[key]; refused(() => bindListAuditLogsPreparation(missing));
    refused(() => bindListAuditLogsPreparation({ ...targetFor(), [key]: '../escape' }));
    let touched = false;
    refused(() => bindListAuditLogsPreparation(Object.defineProperty(targetFor(), key,
      { enumerable: true, get() { touched = true; return 'other'; } })));
    assert.equal(touched, false);
  }
  for (const patch of [{ pagination: { page: 2, perPage: 3 } }, { starting_after: 'event_1' }, { limit: 20 },
    { approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }, { database: 'other' }]) {
    refused(() => bindListAuditLogsPreparation({ ...targetFor(), ...patch }));
  }
});

test('audit preparation: event IDs reuse the unique bounded parser and reject array accessors', () => {
  for (const eventIds of [[], ids(33), ['same', 'same'], [null], ['../escape'], [{ id: 'one' }]]) {
    refused(() => bindListAuditLogsPreparation({ ...targetFor(), eventIds }));
  }
  let touched = false; const eventIds = ids(2);
  Object.defineProperty(eventIds, '0', { enumerable: true, get() { touched = true; return 'other'; } });
  refused(() => bindListAuditLogsPreparation({ ...targetFor(), eventIds })); assert.equal(touched, false);
  assert.equal(bindListAuditLogsPreparation({ ...targetFor(), eventIds: ids(32) })({}).plan.target.eventIds.length, 32);
});

test('audit preparation: same organization and child IDs cannot collide with another collection', () => {
  const target = targetFor(); const audit = bindListAuditLogsPreparation(target)({});
  const { eventIds, ...parent } = target;
  const invoice = bindListInvoicesPreparation({ ...parent, invoiceIds: eventIds, pagination: { page: 1, perPage: 10 } })({});
  assert.deepEqual(audit.resource, invoice.resource);
  assert.notEqual(canonicalHash(audit.plan), canonicalHash(invoice.plan));
  assert.notEqual(canonicalHash(audit), canonicalHash(invoice));
});
