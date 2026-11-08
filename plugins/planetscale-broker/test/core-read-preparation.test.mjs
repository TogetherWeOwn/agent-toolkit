import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetOrganizationPreparation, bindGetDatabasePreparation, bindGetBranchPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { bindDeleteBranchPreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';
import { prepare as organizationRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-organization.js';
import { prepare as databaseRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-database.js';
import { prepare as branchRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch.js';

const organization = () => ({ organization: 'sample-org', organizationId: 'org_1', revision: 'a'.repeat(64) });
const database = () => ({ ...organization(), database: 'sample-db', databaseId: 'db_1' });
const branch = () => ({ ...database(), branch: 'sample-branch', branchId: 'branch_1' });
const refused = fn => assert.throws(fn, { code: 'schema' });
const cases = [
  { operation: 'get_organization', kind: 'organization', id: 'organizationId', target: organization,
    bind: bindGetOrganizationPreparation, read: organizationRead, scope: { organization: 'sample-org' },
    body: { name: 'sample-org', sso: false } },
  { operation: 'get_database', kind: 'database', id: 'databaseId', target: database,
    bind: bindGetDatabasePreparation, read: databaseRead, scope: { organization: 'sample-org', database: 'sample-db' },
    body: { name: 'sample-db', kind: 'postgresql', ready: true, deletion_protected: true } },
  { operation: 'get_branch', kind: 'branch', id: 'branchId', target: branch,
    bind: bindGetBranchPreparation, read: branchRead,
    scope: { organization: 'sample-org', database: 'sample-db', branch: 'sample-branch' },
    body: { name: 'sample-branch', ready: true, production: false, deletion_protected: true, safe_migrations: true } },
];

for (const c of cases) {
  test(`${c.operation}: core snapshot binds resource, full parent mapping and existing fixed request`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: `planetscale/${c.kind}/${target[c.id]}`, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual({ ...prepared.plan.target }, target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(c.scope, {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation neither asserts response identity/non-waking nor supplies an executor`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'name-only-not-immutable');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    assert.equal(Object.hasOwn(prepare, 'execute'), false);
    assert.equal(Object.hasOwn(prepare, 'project'), false);
    assert.equal(Object.hasOwn(prepared.plan, 'tier'), false);
    assert.equal(Object.hasOwn(prepared.plan, 'approved'), false);
    // Existing name-only projection intentionally does not authenticate an ID.
    const wire = Buffer.from(JSON.stringify({ ...c.body, id: 'unverified-other-id', password: 'synthetic-canary' }));
    const output = c.read(c.scope, {}).project(wire);
    assert.equal(output.name, c.body.name);
    assert.equal(Object.hasOwn(output, 'id'), false);
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
  });

  test(`${c.operation}: immutable captures survive mutation of every input field`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    for (const key of Object.keys(target)) target[key] = key === 'revision' ? 'b'.repeat(64) : 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) {
      assert.ok(Object.isFrozen(value));
    }
    assert.throws(() => { before.plan.proposedRequest.path = '/v1/other'; }, TypeError);
    assert.throws(() => { before.plan.target[c.id] = 'other'; }, TypeError);
  });

  test(`${c.operation}: every immutable ID/name/revision changes the full core hash`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target)) {
      const value = key === 'revision' ? 'b'.repeat(64) : 'other';
      const changed = c.bind({ ...target, [key]: value })({});
      assert.notEqual(canonicalHash(original), canonicalHash(changed), key);
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan), key);
      if (![c.id, 'revision'].includes(key)) assert.deepEqual(original.resource, changed.resource);
    }
  });

  test(`${c.operation}: caller cannot replace scope, request, identity, approval or artifact`, () => {
    const prepare = c.bind(c.target());
    for (const args of [null, [], { target: c.target() }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { approved: true }, { artifactDigest: 'b'.repeat(64) }, { url: 'https://example.invalid' },
      { method: 'DELETE' }, { page: 1 }, { credential: 'synthetic-canary' }]) refused(() => prepare(args));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
    refused(() => prepare(Object.defineProperty({}, 'hidden', { value: true })));
    refused(() => prepare({ [Symbol('scope')]: true }));
  });

  test(`${c.operation}: host target is closed and rejects missing/unsafe binding data without accessors`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' },
      { ...c.target(), [c.id]: '../other' }]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const raw = c.target();
      delete raw[key];
      refused(() => c.bind(raw));
    }
    let touched = false;
    const raw = c.target();
    Object.defineProperty(raw, c.id, { enumerable: true, get() { touched = true; return 'other'; } });
    refused(() => c.bind(raw));
    assert.equal(touched, false);
  });
}

test('read resources with identical provider IDs stay separate across resource kinds', () => {
  const prepared = cases.map(c => {
    const target = c.target();
    target[c.id] = 'shared_1';
    return c.bind(target)({});
  });
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});

test('branch read and destructive preview share a resource without sharing an operation/plan hash', () => {
  const read = bindGetBranchPreparation(branch())({});
  const deletion = bindDeleteBranchPreparation({ organization: 'sample-org', database: 'sample-db', branch: 'sample-branch',
    branchId: 'branch_1', revision: 'a'.repeat(64), production: false, deletionProtected: false, safeMigrations: true })({});
  assert.deepEqual(read.resource, deletion.resource);
  assert.notEqual(canonicalHash(read.plan), canonicalHash(deletion.plan));
  assert.notEqual(canonicalHash(read), canonicalHash(deletion));
  assert.deepEqual(deletion.plan.requiredAuthorities, ['release-manager']);
});
