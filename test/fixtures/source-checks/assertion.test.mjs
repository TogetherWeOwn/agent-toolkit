import test from 'node:test';
import assert from 'node:assert/strict';
import { providerFixture } from '../../../packages/core/testing/provider-fixture.mjs';

test('intentional wrong assertion after source authorization', async () => {
  const f = providerFixture();
  const result = await f.broker().call(f.operation.name, f.vector.arguments, { ...f.vector.principal }, 'request-a');
  assert.equal(result.code, 'IDENTITY_UNAVAILABLE');
  assert.equal(f.calls.secret, 0);
  assert.equal(result.ok, true, 'intentional assertion probe: a copied principal is not authenticated');
});
