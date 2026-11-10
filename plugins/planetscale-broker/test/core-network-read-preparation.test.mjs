import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetDatabasePostgresCidrPreparation, bindGetDatabaseThrottlerPreparation, bindGetDeployRequestThrottlerPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as cidrRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-database-postgres-cidr.js';
import { prepare as databaseRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-database-throttler.js';
import { prepare as deployRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-deploy-request-throttler.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const wire = body => Buffer.from(JSON.stringify(body));
const path = '/v1/organizations/sample-org/databases/sample-db';
const throttlerBody = () => ({ configurable: { id: 'record_1' }, keyspaces: ['main', 'aux'],
  configurations: [{ keyspace_name: 'main', ratio: 0 }] });
const throttlerExpected = { configurableId: 'record_1', keyspaces: [{ name: 'main', configured: true },
  { name: 'aux', configured: false }], configurationAuthority: 'not-established' };
const cases = [
  { operation: 'get_database_postgres_cidr', bind: bindGetDatabasePostgresCidrPreparation, read: cidrRead,
    target: () => ({ ...database(), cidrId: 'record_1' }),
    scope: t => ({ organization: t.organization, database: t.database, cidrId: t.cidrId }),
    resource: 'planetscale/database-cidr/record_1', path: `${path}/cidrs/record_1`,
    body: () => ({ id: 'record_1' }), expected: { id: 'record_1', enforcementAuthority: 'not-established' },
    rebound: { id: 'other' }, invalid: { id: '../other' }, invalidCode: 'schema' },
  { operation: 'get_database_throttler', bind: bindGetDatabaseThrottlerPreparation, read: databaseRead,
    target: () => ({ ...database(), configurableId: 'record_1', keyspaceNames: ['main', 'aux'] }),
    scope: t => ({ organization: t.organization, database: t.database, configurableId: t.configurableId, keyspaceNames: t.keyspaceNames }),
    resource: 'planetscale/database-throttler/db_1/record_1', path: `${path}/throttler`,
    body: throttlerBody, expected: throttlerExpected, rebound: { configurable: { id: 'other' } },
    invalid: { configurations: [{ keyspace_name: 'main', ratio: 96 }] }, invalidCode: 'upstream' },
  { operation: 'get_deploy_request_throttler', bind: bindGetDeployRequestThrottlerPreparation, read: deployRead,
    target: () => ({ ...database(), configurableId: 'record_1', keyspaceNames: ['main', 'aux'], requestId: 'request_1', number: 42 }),
    scope: t => ({ organization: t.organization, database: t.database, configurableId: t.configurableId, keyspaceNames: t.keyspaceNames, number: t.number }),
    resource: 'planetscale/deploy-request-throttler/request_1/record_1', path: `${path}/deploy-requests/42/throttler`,
    body: throttlerBody, expected: throttlerExpected, rebound: { configurable: { id: 'other' } },
    invalid: { configurations: [{ keyspace_name: 'main', ratio: '0' }] }, invalidCode: 'upstream' },
];
const changedValue = (key, value) => key === 'revision' ? 'b'.repeat(64) :
  typeof value === 'number' ? 43 : Array.isArray(value) ? ['other'] : 'other';

for (const c of cases) {
  test(`${c.operation}: preparation binds host IDs, revision and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual({ ...prepared.plan.target }, target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope(target), {}).request);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: c.path });
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains parent/non-waking gaps without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'enforcementAuthority', 'configurationAuthority']) {
      assert.equal(Object.hasOwn(prepared.plan, key), false);
    }
  });

  test(`${c.operation}: projection confines network, role, ratio and operational canaries`, () => {
    const body = { ...c.body(), organization_id: 'unverified-parent', database_id: 'unverified-parent',
      request_id: 'unverified-parent', cidrs: ['synthetic-canary'], schema: 'synthetic-canary', role: 'synthetic-canary',
      description: 'synthetic-canary', actor: 'synthetic-canary', created_at: 'synthetic-canary',
      error: 'synthetic-canary', approved: true, enforcementAuthority: 'synthetic-canary', configurationAuthority: 'synthetic-canary' };
    if (body.configurable) body.configurable.name = 'synthetic-canary';
    if (body.configurations) body.configurations[0].description = 'synthetic-canary';
    const output = c.read(c.scope(c.target()), {}).project(wire(body));
    assert.deepEqual(output, c.expected);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.ok(Object.isFrozen(output));
    if (output.keyspaces) {
      assert.ok(Object.isFrozen(output.keyspaces));
      for (const row of output.keyspaces) assert.ok(Object.isFrozen(row));
      assert.equal(JSON.stringify(output).includes('ratio'), false);
    }
  });

  test(`${c.operation}: projection refuses rebound identity and malformed selected data`, () => {
    const read = c.read(c.scope(c.target()), {});
    assert.throws(() => read.project(wire({ ...c.body(), ...c.rebound })), { code: 'scope' });
    assert.throws(() => read.project(wire({ ...c.body(), ...c.invalid })), { code: c.invalidCode });
  });

  test(`${c.operation}: captured host and request remain immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target)) target[key] = changedValue(key, target[key]);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.target.databaseId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every host field affects plan and full hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      const prepared = c.bind({ ...c.target(), [key]: changedValue(key, target[key]) })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(prepared));
    }
  });

  test(`${c.operation}: caller cannot inject target, request, selectors or authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { approved: true }, { databaseId: 'other' },
      { cidrId: 'other' }, { configurableId: 'other' }, { keyspaceNames: ['other'] }, { number: 43 },
      { requestId: 'other' }, { resource: 'other' }, { revision: 'b'.repeat(64) }, { method: 'POST' },
      { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing, extra, unsafe and accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), database: '../other' },
      { ...c.target(), [Symbol('scope')]: true }, Object.defineProperty(c.target(), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });
}

for (const c of cases.slice(1)) {
  test(`${c.operation}: keyspace captures are bounded, unique JSON data without accessor execution`, () => {
    for (const keyspaceNames of [[], ['main', 'main'], Array(33).fill('main'), ['../other'], Array(1),
      Object.assign(['main'], { hidden: 'other' }), Object.assign(['main'], { [Symbol('scope')]: true })]) {
      refused(() => c.bind({ ...c.target(), keyspaceNames }));
    }
    let touched = false;
    const keyspaceNames = Object.defineProperty(['main'], '0', { enumerable: true, get() { touched = true; return 'main'; } });
    refused(() => c.bind({ ...c.target(), keyspaceNames }));
    assert.equal(touched, false);
    assert.equal(c.bind({ ...c.target(), keyspaceNames: Array.from({ length: 32 }, (_, i) => `space-${i}`) })({}).plan.target.keyspaceNames.length, 32);
  });

  test(`${c.operation}: nested capture stays frozen and projection refuses mixed foreign keyspaces`, () => {
    const target = c.target();
    const names = target.keyspaceNames;
    const prepare = c.bind(target);
    const before = prepare({});
    names[0] = 'other';
    names.push('foreign');
    assert.deepEqual(prepare({}), before);
    assert.deepEqual(before.plan.target.keyspaceNames, ['main', 'aux']);
    assert.ok(Object.isFrozen(before.plan.target.keyspaceNames));
    assert.throws(() => before.plan.target.keyspaceNames.push('foreign'), TypeError);
    const read = c.read(c.scope(c.target()), {});
    assert.throws(() => read.project(wire({ ...throttlerBody(), keyspaces: ['main', 'foreign'] })), { code: 'scope' });
    assert.throws(() => read.project(wire({ ...throttlerBody(), configurations: [{ keyspace_name: 'foreign', ratio: 0 }] })), { code: 'scope' });
  });
}

test('deploy throttler independently binds request ID, number and configurable identity', () => {
  const c = cases[2];
  const original = c.bind(c.target())({});
  const rebound = c.bind({ ...c.target(), requestId: 'other' })({});
  assert.deepEqual(original.plan.proposedRequest, rebound.plan.proposedRequest);
  assert.notEqual(original.resource.id, rebound.resource.id);
  assert.notEqual(canonicalHash(original), canonicalHash(rebound));
  for (const number of [0, -1, 1.5, 2147483648, '42', null]) refused(() => c.bind({ ...c.target(), number }));
});

test('network/throttler resource namespaces do not collide with equal record IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
