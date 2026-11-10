import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetInvoicePreparation, bindGetOrganizationBillingPaymentMethodPreparation, bindGetPaymentMethodSetupPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as invoiceRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-invoice.js';
import { prepare as paymentRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization-billing-payment-method.js';
import { prepare as setupRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-payment-method-setup.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'record_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org';
const cases = [
  { operation: 'get_invoice', bind: bindGetInvoicePreparation, read: invoiceRead, field: 'invoiceId',
    resource: 'planetscale/invoice/record_1', path: `${path}/invoices/record_1`,
    body: { id: 'record_1', paid: true, overdue: false },
    keys: ['id', 'paid', 'overdue', 'spendingAuthority'], invalid: { paid: 'true' }, invalidCode: 'upstream' },
  { operation: 'get_organization_billing_payment_method', bind: bindGetOrganizationBillingPaymentMethodPreparation,
    read: paymentRead, field: 'paymentMethodId', resource: 'planetscale/billing-payment-method/record_1',
    path: `${path}/billing/payment-method`, body: { type: 'PaymentMethod', id: 'record_1' },
    keys: ['id', 'spendingAuthority'], invalid: { type: 'Other' }, invalidCode: 'upstream' },
  { operation: 'get_payment_method_setup', bind: bindGetPaymentMethodSetupPreparation, read: setupRead, field: 'setupId',
    resource: 'planetscale/payment-method-setup/record_1', path: `${path}/billing/payment-method-setups/record_1`,
    body: { type: 'BillingPaymentMethodSetup', id: 'record_1', state: 'pending' },
    keys: ['id', 'state', 'spendingAuthority'], invalid: { state: 'other' }, invalidCode: 'schema' },
];
const targetFor = c => ({ ...organization(), [c.field]: 'record_1' });
const scopeFor = (c, t) => ({ organization: t.organization, [c.field]: t[c.field] });

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable IDs, revision and fixed GET`, () => {
    const target = targetFor(c);
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual({ ...prepared.plan.target }, target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scopeFor(c, target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(Object.hasOwn(prepared.plan.proposedRequest, 'body'), false);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains identity/non-waking gaps without spending authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'spendingAuthority']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits payment/amount/contact/authority canaries`, () => {
    const output = c.read(scopeFor(c, targetFor(c)), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', amount: 'synthetic-canary', currency: 'synthetic-canary',
      card: { number: 'synthetic-canary' }, bank_account: 'synthetic-canary',
      client_secret: 'synthetic-canary', checkout_url: 'synthetic-canary',
      email: 'synthetic-canary', actor: { name: 'synthetic-canary' }, error: 'synthetic-canary',
      approved: true, spendingAuthority: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.equal(output.spendingAuthority, 'not-established');
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses rebound identity and malformed selected fields`, () => {
    const read = c.read(scopeFor(c, targetFor(c)), {});
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, id: 'other' }))), { code: 'scope' });
    assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...c.invalid }))), { code: c.invalidCode });
  });

  test(`${c.operation}: captured target and request remain immutable`, () => {
    const target = targetFor(c);
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target.organizationId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent/record/revision field affects plan and full hashes`, () => {
    const target = targetFor(c);
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      const changed = { ...targetFor(c), [key]: key === 'revision' ? 'b'.repeat(64) : 'other' };
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot supply target/request/payment/authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { approved: true }, { organizationId: 'other' },
      { [c.field]: 'other' }, { amount: 1 }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { method: 'POST' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return targetFor(c); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...targetFor(c), credential: 'synthetic-canary' },
      { ...targetFor(c), revision: 'latest' }, { ...targetFor(c), organization: '../other' },
      { ...targetFor(c), [Symbol('scope')]: true }, Object.defineProperty(targetFor(c), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(targetFor(c))) {
      const missing = targetFor(c);
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...targetFor(c), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(targetFor(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });
}

test('invoice, payment-method and setup identities do not collide with equal IDs', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('payment-method identity is bound despite its singleton request path', () => {
  const target = targetFor(cases[1]);
  const first = bindGetOrganizationBillingPaymentMethodPreparation(target)({});
  target.paymentMethodId = 'other';
  const second = bindGetOrganizationBillingPaymentMethodPreparation(target)({});
  assert.deepEqual(first.plan.proposedRequest, second.plan.proposedRequest);
  assert.notEqual(first.resource.id, second.resource.id);
  assert.notEqual(canonicalHash(first), canonicalHash(second));
  assert.throws(() => paymentRead(scopeFor(cases[1], target), {})
    .project(Buffer.from(JSON.stringify(cases[1].body))), { code: 'scope' });
});
