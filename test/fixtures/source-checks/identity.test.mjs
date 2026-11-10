import test from 'node:test';
import assert from 'node:assert/strict';
import { providerFixture } from '../../../packages/core/testing/provider-fixture.mjs';

test('source authorization accepts trusted context and refuses copied identity', async () => {
  const trusted = providerFixture();
  assert.equal((await trusted.broker().call(trusted.operation.name, trusted.vector.arguments, 'verified-runtime', 'request-a')).ok, true);
  const copied = providerFixture();
  const result = await copied.broker().call(copied.operation.name, copied.vector.arguments, { ...copied.vector.principal }, 'request-a');
  assert.equal(result.code, 'IDENTITY_UNAVAILABLE');
  assert.equal(copied.calls.secret, 0);
  assert.equal(copied.calls.upstream, 0);
});
