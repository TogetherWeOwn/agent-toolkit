import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as invoice from '../../../dist/plugins/planetscale-broker/src/tools/get-invoice.js';
import * as invoices from '../../../dist/plugins/planetscale-broker/src/tools/list-invoices.js';
import * as lineItems from '../../../dist/plugins/planetscale-broker/src/tools/get-invoice-line-items.js';
import * as paymentMethod from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-billing-payment-method.js';
import * as paymentSetup from '../../../dist/plugins/planetscale-broker/src/tools/get-payment-method-setup.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const org = { organization: 'example-org' };
const prefix = '/v1/organizations/example-org';
const authority = { spendingAuthority: 'not-established' };
const invoiceRow = { id: 'inv123', paid: true, overdue: false, total: canary, billing_period_start: canary, billing_period_end: canary };
const invoiceExpected = { id: 'inv123', paid: true, overdue: false, ...authority };
const lineRow = { id: 'line123', cloudflare_billed: false, subtotal: canary, description: canary, metric_name: canary, database_id: canary, database_name: canary, resource: { id: canary, name: canary } };
const lineExpected = { id: 'line123', cloudflareBilled: false, ...authority };
const methodRow = { type: 'PaymentMethod', id: 'pm123', brand: canary, last4: canary, exp_month: canary, exp_year: canary, name: canary, client_secret: canary };
const methodExpected = { id: 'pm123', ...authority };
const setupRow = { type: 'BillingPaymentMethodSetup', id: 'pmsetup_1234', state: 'completed', checkout_url: canary, error: canary, expires_at: canary, completed_at: canary, failed_at: canary, client_secret: canary };
const setupExpected = { id: 'pmsetup_1234', state: 'completed', ...authority };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [invoice, { ...org, invoiceId: 'inv123' }, 'invoiceId', invoiceRow, invoiceExpected, '/invoices/inv123', false, ['paid', 'overdue']],
  [invoices, { ...org, invoiceIds: ['inv123'] }, 'invoiceIds', invoiceRow, invoiceExpected, '/invoices', true, ['paid', 'overdue']],
  [lineItems, { ...org, invoiceId: 'inv123', lineItemIds: ['line123'] }, 'lineItemIds', lineRow, lineExpected, '/invoices/inv123/line-items', true, ['cloudflare_billed']],
  [paymentMethod, { ...org, paymentMethodId: 'pm123' }, 'paymentMethodId', methodRow, methodExpected, '/billing/payment-method', false, ['type']],
  [paymentSetup, { ...org, setupId: 'pmsetup_1234' }, 'setupId', setupRow, setupExpected, '/billing/payment-method-setups/pmsetup_1234', false, ['type', 'state']],
];

for (const [adapter, scope, key, row, expected, path, list, selected] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const wrap = rows => list ? page(rows) : rows[0];
  const output = rows => list ? { items: rows, nextPage: null, complete: true } : rows[0];
  test(`${adapter.operationId}: fixed GET and bounded projection without payment, amount or checkout material`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: prefix + path + (list ? '?page=1&per_page=2' : '') });
    const result = prepared.project(wire(wrap([row])));
    assert.deepEqual(result, output([expected]));
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(Object.isFrozen(prepared));
    assert.ok(Object.isFrozen(prepared.request));
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(list ? result.items[0] : result));
    if (list) {
      assert.ok(Object.isFrozen(result.items));
      assert.deepEqual(prepared.project(wire(page([]))), output([]));
    }
  });

  test(`${adapter.operationId}: foreign identity refuses entire response without reflection`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const id of ['foreign', null, {}, canary]) assert.throws(() => prepared.project(wire(wrap(list ? [row, { ...row, id }] : [{ ...row, id }]))), error => !String(error).includes(canary));
  });

  test(`${adapter.operationId}: selected schema and wire limits fail closed`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const field of selected) {
      for (const value of [undefined, null, {}, [], 1, canary]) assert.throws(() => prepared.project(wire(wrap([{ ...row, [field]: value }]))), error => !String(error).includes(canary));
    }
    for (const value of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire({}), wire(canary), new TextEncoder().encode('{')]) assert.throws(() => prepared.project(value), error => !String(error).includes(canary));
    assert.throws(() => prepared.project(wire([row])));
    if (list) {
      for (const value of [page([null]), page([row, row, row]), { ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }]) assert.throws(() => prepared.project(wire(value)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed scope and arguments reject authority, target and credential overrides`, () => {
    for (const field of ['sql', 'url', 'secret', 'approval', 'agentId', 'production', 'all', key]) assert.throws(() => adapter.prepare(scope, { ...args, [field]: canary }));
    for (const invalid of [null, [], { ...scope, approval: true }, { ...scope, organization: '../foreign' }, { ...scope, organization: 'x%2fy' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => adapter.prepare(invalid, args));
    const hostile = Object.defineProperty({ ...scope }, key, { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    for (const invalid of list ? [[], [row.id, row.id], Array(33).fill(row.id), ['../escape'], [canary]] : [null, '../escape', canary]) assert.throws(() => adapter.prepare({ ...scope, [key]: invalid }, args));
    const invalidArgs = list ? [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }] : [{ page: 1 }, { perPage: 2 }];
    for (const invalid of invalidArgs) assert.throws(() => adapter.prepare(scope, invalid));
  });

  test(`${adapter.operationId}: broker identity scope is snapshotted before caller mutation`, () => {
    const copied = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copied, copiedArgs);
    copied.organization = 'foreign';
    if (list) copied[key].push('foreign');
    else copied[key] = 'foreign';
    copiedArgs.page = 2;
    assert.equal(prepared.request.path, prefix + path + (list ? '?page=1&per_page=2' : ''));
    assert.deepEqual(prepared.project(wire(wrap([row]))), output([expected]));
    assert.throws(() => prepared.project(wire(wrap([{ ...row, id: 'foreign' }]))));
  });
}

test('line item parent path is bound separately and cannot be supplied as an argument', () => {
  const scope = { ...org, invoiceId: 'inv123', lineItemIds: ['line123'] };
  const prepared = lineItems.prepare(scope, { page: 1, perPage: 2 });
  scope.invoiceId = 'foreign';
  assert.equal(prepared.request.path, prefix + '/invoices/inv123/line-items?page=1&per_page=2');
  for (const invoiceId of [null, '../escape', canary]) assert.throws(() => lineItems.prepare({ ...scope, invoiceId }, { page: 1, perPage: 2 }));
  assert.throws(() => lineItems.prepare(scope, { page: 1, perPage: 2, invoiceId: 'foreign' }));
});

test('paid, overdue, billing channel and completed setup never establish spending authority', () => {
  for (const value of [true, false]) {
    assert.deepEqual(invoice.prepare({ ...org, invoiceId: 'inv123' }, {}).project(wire({ ...invoiceRow, paid: value, overdue: value, spendingAuthority: 'approved' })), { id: 'inv123', paid: value, overdue: value, ...authority });
    assert.deepEqual(lineItems.prepare({ ...org, invoiceId: 'inv123', lineItemIds: ['line123'] }, { page: 1, perPage: 2 }).project(wire(page([{ ...lineRow, cloudflare_billed: value }]))).items[0], { id: 'line123', cloudflareBilled: value, ...authority });
  }
  for (const state of ['pending', 'completed', 'failed', 'expired']) assert.deepEqual(paymentSetup.prepare({ ...org, setupId: 'pmsetup_1234' }, {}).project(wire({ ...setupRow, state, spendingAuthority: 'approved' })), { id: 'pmsetup_1234', state, ...authority });
  assert.throws(() => paymentSetup.prepare({ ...org, setupId: 'pmsetup_1234' }, {}).project(wire({ ...setupRow, state: 'approved' })));
});

test('payment response types are exact and payment replacement refuses instead of rebinding', () => {
  for (const [adapter, scope, row] of [[paymentMethod, { ...org, paymentMethodId: 'pm123' }, methodRow], [paymentSetup, { ...org, setupId: 'pmsetup_1234' }, setupRow]]) {
    for (const type of [undefined, null, 'Invoice', canary]) assert.throws(() => adapter.prepare(scope, {}).project(wire({ ...row, type })));
    assert.throws(() => adapter.prepare(scope, {}).project(wire({ ...row, id: 'replacement' })));
  }
});

test('billing paths, pagination, setup enum and differing provider access scopes match pinned contracts', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const [adapter, scope, , , , path, list] of fixtures) {
    const operation = Object.entries(schema.paths).flatMap(([template, methods]) => Object.entries(methods).map(([method, value]) => ({ template, method, value }))).find(entry => entry.value.operationId === adapter.operationId);
    assert.equal(operation.method, 'get');
    const parameters = { organization: scope.organization, id: scope.invoiceId ?? scope.setupId };
    assert.equal('/v1' + operation.template.replace(/\{([^}]+)\}/g, (_, key) => parameters[key]), prefix + path);
    assert.deepEqual(operation.value.parameters.filter(item => item.in === 'query').map(item => item.name).sort(), list ? ['page', 'per_page'] : []);
    const access = adapter === paymentSetup ? 'write_payment_method' : adapter === paymentMethod ? 'read_payment_method' : 'read_invoices';
    assert.ok(operation.value.description.includes('`' + access + '`'));
  }
  assert.deepEqual(schema.definitions.BillingPaymentMethodSetup.properties.state.enum, ['pending', 'completed', 'failed', 'expired']);
  assert.deepEqual(schema.definitions.BillingPaymentMethod.properties.type.enum, ['PaymentMethod']);
  assert.deepEqual(schema.definitions.BillingPaymentMethodSetup.properties.type.enum, ['BillingPaymentMethodSetup']);
  const map = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url)));
  const setup = map.operations.find(item => item.operationId === 'get_payment_method_setup');
  assert.deepEqual(setup.documentedAuthorization.serviceTokenAnyOf, ['write_payment_method']);
  assert.equal(setup.credentialEntitlement, 'unknown-awaiting-operator-metadata');
  assert.equal(setup.enablement, 'disabled');
});
