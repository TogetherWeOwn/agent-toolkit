import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOperationMap, PROVIDER_CONTRACT } from '../dist/packages/core/src/provider/index.js';

function map() {
  return { contract: PROVIDER_CONTRACT, provider: 'synthetic', version: '1.0.0',
    reference: { url: 'https://example.invalid/api/reference', version: 'fixture-1', sha256: 'a'.repeat(64) },
    inventory: ['resources.inspect'], operations: [{ id: 'resources.inspect', apiArea: 'resources',
      tool: 'resource.inspect', scope: 'account-a/resource-a', sideEffects: ['compute-wake'], tier: 'read',
      authorization: 'policy', entitlement: 'entitled', status: 'implemented',
      tests: ['test/provider-core.test.mjs'], implemented: true, reviewed: false, enabled: false, prerequisite: null }] };
}

test('operation maps track official snapshot identity and implementation separately from enablement', () => {
  const result = validateOperationMap(map());
  assert.equal(result.complete, true);
  assert.equal(result.map.operations[0].reviewed, false);
  assert.equal(result.map.operations[0].enabled, false);
});
for (const mutation of [m => m.inventory.push('resources.delete'), m => m.operations.push(m.operations[0]),
  m => m.operations[0].extra = true, m => delete m.reference.sha256, m => m.reference.sha256 = 'not-hashed',
  m => m.operations[0].tests = [], m => m.operations[0].enabled = true,
  m => m.operations[0].tier = 'reserved', m => m.operations[0].implemented = false,
  m => m.reference.url = 'http://example.invalid/reference', m => m.operations[0].entitlement = 'invented']) {
  test(`coverage manifest refuses contradiction or omission: ${mutation.toString()}`, () => {
    const m = map();
    mutation(m);
    assert.throws(() => validateOperationMap(m));
  });
}
for (const field of ['tier', 'authorization', 'entitlement', 'status']) {
  test(`array-valued enum cannot bypass coverage semantics: ${field}`, () => {
    const m = map();
    const values = { tier: 'reserved', authorization: 'policy', entitlement: 'unknown', status: 'implemented' };
    m.operations[0][field] = [values[field]];
    m.operations[0].prerequisite = 'Verify native scope';
    assert.throws(() => validateOperationMap(m));
  });
}
for (const status of ['incomplete', 'unsupported']) {
  test(`an entitled ${status} operation cannot earn feature completeness`, () => {
    const m = map();
    Object.assign(m.operations[0], { status, implemented: false, prerequisite: 'Implement typed operation' });
    const result = validateOperationMap(m);
    assert.equal(result.complete, false);
    assert.deepEqual(result.incomplete, ['resources.inspect']);
  });
}
test('unknown entitlement is explicit, incomplete, disabled and has a named prerequisite', () => {
  const m = map();
  Object.assign(m.operations[0], { entitlement: 'unknown', prerequisite: 'Verify scope metadata' });
  assert.equal(validateOperationMap(m).complete, false);
  m.operations[0].enabled = true;
  m.operations[0].reviewed = true;
  assert.throws(() => validateOperationMap(m));
});
test('prohibited operations are explicit, not executors or missing grants', () => {
  const m = map();
  Object.assign(m.operations[0], { status: 'prohibited', authorization: 'prohibited', implemented: false,
    tool: null, prerequisite: 'Specific owner prohibition; do not enable' });
  assert.equal(validateOperationMap(m).complete, true);
  m.operations[0].tool = 'owner.execute';
  assert.throws(() => validateOperationMap(m));
});
test('denied placeholders and future tools cannot claim implementation or completeness', () => {
  const m = map();
  Object.assign(m.operations[0], { tool: null, status: 'incomplete', implemented: false, prerequisite: 'Typed provider implementation' });
  assert.equal(validateOperationMap(m).complete, false);
  m.operations[0].status = 'implemented';
  m.operations[0].implemented = true;
  assert.throws(() => validateOperationMap(m));
});
test('operation map rejects getters rather than invoking them', () => {
  const m = map();
  Object.defineProperty(m, 'provider', { enumerable: true, get() { throw Error('must not run'); } });
  assert.throws(() => validateOperationMap(m), /INVALID_OPERATION_MAP/);
});
