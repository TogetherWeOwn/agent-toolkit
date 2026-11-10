import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindDeleteBranchPreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';

const target = () => ({ organization: 'sample-org', database: 'sample-db', branch: 'sample-branch',
  branchId: 'branch_1', revision: 'a'.repeat(64), production: false, deletionProtected: false, safeMigrations: true });

const refused = fn => assert.throws(fn, error => ['schema', 'scope'].includes(error.code));

test('delete preparation binds immutable resource and preserves the complete local preview', () => {
  const prepared = bindDeleteBranchPreparation(target())({});
  assert.deepEqual(prepared.resource, { id: 'planetscale/branch/branch_1', revision: 'a'.repeat(64) });
  assert.deepEqual(prepared.arguments, {});
  assert.equal(prepared.artifactDigest, null);
  assert.equal(prepared.plan.kind, 'validated-local-plan-not-provider-dry-run');
  assert.equal(prepared.plan.execution, 'not-implemented');
  assert.equal(prepared.plan.remotePreconditions, 'not-verified');
  assert.equal(prepared.plan.providerDryRun, 'not-performed');
  assert.deepEqual(prepared.plan.requiredAuthorities, ['release-manager']);
  assert.deepEqual(prepared.plan.proposedRequest, { method: 'DELETE', origin: 'https://api.planetscale.com',
    path: '/v1/organizations/sample-org/databases/sample-db/branches/sample-branch?delete_descendants=false', body: null });
  assert.equal(typeof canonicalHash(prepared), 'string');
  assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
});

test('delete preparation captures and freezes the host snapshot before caller mutation', () => {
  const input = target();
  const prepare = bindDeleteBranchPreparation(input);
  const before = prepare({});
  input.branchId = 'other';
  input.revision = 'b'.repeat(64);
  input.branch = 'other';
  assert.deepEqual(prepare({}), before);
  for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
    before.plan.arguments, before.plan.proposedRequest, before.plan.requiredAuthorities]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { before.resource.revision = 'b'.repeat(64); }, TypeError);
});

test('caller cannot inject a target, approval, artifact, URL or recursive deletion', () => {
  const prepare = bindDeleteBranchPreparation(target());
  for (const args of [null, [], { target: target() }, { branchId: 'other' }, { revision: 'b'.repeat(64) },
    { approved: true }, { artifactDigest: 'b'.repeat(64) }, { url: 'https://example.invalid' },
    { delete_descendants: true }, { force: true }]) refused(() => prepare(args));
  let touched = false;
  refused(() => prepare(Object.defineProperty({}, 'approval', { enumerable: true, get() { touched = true; return true; } })));
  assert.equal(touched, false);
});

test('host target must be closed and deletion protection cannot be overridden', () => {
  for (const input of [null, {}, { ...target(), deletionProtected: true }, { ...target(), branchId: '../other' },
    { ...target(), revision: 'latest' }, { ...target(), credential: 'synthetic-canary' }]) {
    refused(() => bindDeleteBranchPreparation(input));
  }
  // The existing shared flag validator uses the fixed upstream refusal code.
  assert.throws(() => bindDeleteBranchPreparation({ ...target(), production: 'false' }), { code: 'upstream' });
});

test('core hash binds resource identity, revision and every name or safety classification', () => {
  const original = bindDeleteBranchPreparation(target())({});
  for (const delta of [{ branchId: 'branch_2' }, { revision: 'b'.repeat(64) }, { organization: 'other-org' },
    { database: 'other-db' }, { branch: 'other-branch' }, { production: true }, { safeMigrations: false }]) {
    const changed = bindDeleteBranchPreparation({ ...target(), ...delta })({});
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
  }
  const production = bindDeleteBranchPreparation({ ...target(), production: true })({});
  assert.deepEqual(production.plan.requiredAuthorities, ['release-manager']);
  assert.equal(production.plan.target.production, true);
});

test('preparation is deterministic and accepts only the operation-specific empty arguments', () => {
  const prepare = bindDeleteBranchPreparation(target());
  assert.deepEqual(prepare({}), prepare(Object.create(null)));
  assert.equal(canonicalHash(prepare({})), canonicalHash(prepare({})));
  assert.equal(Object.hasOwn(prepare, 'execute'), false);
  assert.equal(Object.hasOwn(prepare, 'project'), false);
});
