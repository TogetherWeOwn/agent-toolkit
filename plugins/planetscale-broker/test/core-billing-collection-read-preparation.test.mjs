import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListInvoicesPreparation, bindGetInvoiceLineItemsPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as invoiceRead } from '../../../dist/plugins/planetscale-broker/src/tools/list-invoices.js';
import { prepare as lineItemRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-invoice-line-items.js';

const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', revision: 'a'.repeat(64) });
const cases = [
  { operation: 'list_invoices', bind: bindListInvoicesPreparation, read: invoiceRead,
    field: 'invoiceIds', path: '/invoices', resource: 'planetscale/organization/org_1',
    row: { id: 'record_1', paid: true, overdue: false },
    output: { id: 'record_1', paid: true, overdue: false, spendingAuthority: 'not-established' }, malformed: { paid: 'true' } },
  { operation: 'get_invoice_line_items', bind: bindGetInvoiceLineItemsPreparation, read: lineItemRead,
    field: 'lineItemIds', path: '/invoices/invoice_1/line-items', resource: 'planetscale/invoice/invoice_1',
    row: { id: 'record_1', cloudflare_billed: false },
    output: { id: 'record_1', cloudflareBilled: false, spendingAuthority: 'not-established' }, malformed: { cloudflare_billed: 'false' } },
];
const ids = n => Array.from({ length: n }, (_, i) => `record_${i + 1}`);
const targetFor = c => ({ ...parent(), ...(c.field === 'lineItemIds' ? { invoiceId: 'invoice_1' } : {}),
  [c.field]: ids(2), pagination: { page: 2, perPage: 3 } });
const scopeFor = (c, t) => ({ organization: t.organization, [c.field]: t[c.field],
  ...(c.field === 'lineItemIds' ? { invoiceId: t.invoiceId } : {}) });
const envelope = data => ({ current_page: 2, per_page: 3, next_page: 3, data });
const project = (c, body) => c.read(scopeFor(c, targetFor(c)), targetFor(c).pagination)
  .project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: exact fixed collection GET and closed host resource`, () => {
    const target = targetFor(c); const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), target.pagination).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `/v1/organizations/sample-org${c.path}?page=2&per_page=3` });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: ID confinement is not parent, collection or spending authority`, () => {
    const prepare = c.bind(targetFor(c)); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'collectionAuthority', 'spendingAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: frozen metadata omits amounts, payment and contact canaries`, () => {
    const result = project(c, envelope([{ ...c.row, amount: 'synthetic-canary', total: 'synthetic-canary',
      description: 'synthetic-canary', payment_method: { card: 'synthetic-canary' },
      billing_address: 'synthetic-canary', email: 'synthetic-canary', checkout_url: 'synthetic-canary',
      actor: 'synthetic-canary', created_at: 'synthetic-canary', organization_id: 'unverified-parent',
      invoice_id: 'unverified-invoice' }]));
    assert.deepEqual(result, { items: [c.output], nextPage: 3, complete: false });
    for (const canary of ['synthetic-canary', 'unverified-parent', 'unverified-invoice']) {
      assert.equal(JSON.stringify(result).includes(canary), false);
    }
    for (const value of [result, result.items, result.items[0]]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(project(c, { ...envelope([]), next_page: null }), { items: [], nextPage: null, complete: true });
  });

  test(`${c.operation}: unknown child or malformed metadata refuses whole page`, () => {
    assert.throws(() => project(c, envelope([c.row, { ...c.row, id: 'unknown' }])), { code: 'scope' });
    assert.throws(() => project(c, envelope([c.row, { ...c.row, ...c.malformed }])), { code: 'upstream' });
    for (const patch of [{ current_page: 1 }, { per_page: 10 }, { next_page: 4 }, { data: Array(4).fill(c.row) }]) {
      assert.throws(() => project(c, { ...envelope([c.row]), ...patch }), { code: 'upstream' });
    }
  });

  test(`${c.operation}: parents, child arrays and page are captured and deeply frozen`, () => {
    const target = targetFor(c); const prepare = c.bind(target); const before = prepare({});
    target[c.field][0] = 'other'; target[c.field].push('third');
    target.pagination.page = 3; target.pagination.perPage = 4;
    for (const key of [...Object.keys(parent()), ...(c.field === 'lineItemIds' ? ['invoiceId'] : [])]) target[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.field], before.plan.proposedRequest, before.plan.target.pagination]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.field][0] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host field, child ID and order changes plan and full hashes`, () => {
    const original = c.bind(targetFor(c))({});
    const variants = [...Object.keys(parent()), ...(c.field === 'lineItemIds' ? ['invoiceId'] : [])]
      .map(key => ({ ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' }));
    for (const index of [0, 1]) { const target = targetFor(c); target[c.field][index] = 'other'; variants.push(target); }
    const reordered = targetFor(c); reordered[c.field].reverse(); variants.push(reordered);
    for (const key of ['page', 'perPage']) { const target = targetFor(c); target.pagination[key]++; variants.push(target); }
    for (const target of variants) {
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  });

  test(`${c.operation}: caller cannot replace host IDs, page, request or authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { [c.field]: ids(1) }, { invoiceId: 'other' }, { page: 1 }, { perPage: 10 },
      { approved: true }, { credential: 'synthetic-canary' }, { method: 'DELETE' }, { revision: 'b'.repeat(64) },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'page', { enumerable: true, get() { touched = true; return 1; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host input is closed, unique, bounded and accessor-free`, () => {
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const children of [[], ids(33), ['same', 'same'], [null], ['../escape'], [{ id: 'one' }]]) {
      refused(() => c.bind({ ...targetFor(c), [c.field]: children }));
    }
    const children = ids(2); let touched = false;
    Object.defineProperty(children, '0', { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind({ ...targetFor(c), [c.field]: children })); assert.equal(touched, false);
    for (const patch of [{ approved: true }, { revision: 'latest' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...targetFor(c), ...patch }));
    assert.equal(c.bind({ ...targetFor(c), [c.field]: ids(32) })({}).plan.target[c.field].length, 32);
  });
}

test('billing collections require bounded captured host pages', () => {
  for (const c of cases) for (const pagination of [{ page: 0, perPage: 3 }, { page: 101, perPage: 3 },
    { page: 2, perPage: 0 }, { page: 2, perPage: 11 }, { page: 2, perPage: 3, approved: true }]) {
    refused(() => c.bind({ ...targetFor(c), pagination }));
  }
});

test('invoice and line-item operations cannot collide despite sharing child IDs', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, cases.length);
  assert.equal(new Set(prepared.map(p => canonicalHash(p))).size, cases.length);
});

test('independent organization and child IDs remain hashed when the request is unchanged', () => {
  for (const c of cases) for (const change of [t => { t.organizationId = 'other'; }, t => { t[c.field][0] = 'other'; }]) {
    const target = targetFor(c); change(target);
    const original = c.bind(targetFor(c))({}); const changed = c.bind(target)({});
    assert.deepEqual(changed.plan.proposedRequest, original.plan.proposedRequest);
    assert.notEqual(canonicalHash(changed.plan), canonicalHash(original.plan));
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
  }
});
