import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { branchFeatureCases, branchFeatureFixture, branchFeatureScope, response } from './branch-feature-fixture.mjs';

assert(process.env.PROVIDER_CORE_ROOT, 'PROVIDER_CORE_ROOT must name the pinned candidate checkout');
const { providerFixture, credentialCanary, derivedCanary } = await import(pathToFileURL(resolve(process.env.PROVIDER_CORE_ROOT, 'packages/core/testing/provider-fixture.mjs')));

function setup(name, args, raw, scope = branchFeatureScope, overrides = {}) {
  const provider = branchFeatureFixture(raw, scope);
  const common = providerFixture(overrides);
  common.vector.policy.resources = [provider.operation(name).prepare(args).resource.id];
  common.dependencies.provider = 'neon';
  common.dependencies.operations = provider.operations;
  return { provider, common, call: (context = 'verified-runtime', key = 'request-a') => common.broker().call(`neon.${name}`, args, context, key) };
}
function safe(f, result) {
  const serialized = JSON.stringify([result, f.common.audit, [...f.common.journal]]);
  for (const secret of [credentialCanary, derivedCanary, 'password-canary']) assert(!serialized.includes(secret));
}

for (const [name, args, raw, expected] of branchFeatureCases) {
  test(`${name}: broker projects poisoned raw data and closes its credential lease`, async () => {
    const poisoned = { ...raw, password: 'password-canary', secret: credentialCanary,
      nested: { token: derivedCanary }, invocation_url: credentialCanary };
    const f = setup(name, args, poisoned);
    const result = await f.call();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, expected);
    assert.equal(f.provider.requests.length, 1);
    assert.equal(f.common.calls.secret, 1);
    assert.equal(f.common.calls.close, 1);
    safe(f, result);
    const unavailable = setup(name, args, () => response(poisoned, { status: 404 }));
    const refused = await unavailable.call();
    assert.equal(refused.code, 'UPSTREAM_UNAVAILABLE');
    safe(unavailable, refused);
  });

  test(`${name}: identity, agent and feature resources must all authorize`, async () => {
    for (const mode of ['identity', 'agent', 'resource']) {
      const f = setup(name, args, raw);
      if (mode === 'agent') f.common.vector.policy.agents = ['agent-other'];
      if (mode === 'resource') f.common.vector.policy.resources = ['neon/projects/project-a/branches/br-a/other'];
      const result = await f.call(mode === 'identity' ? { ...f.common.vector.principal, authenticated: true } : 'verified-runtime');
      assert.equal(result.code, mode === 'identity' ? 'IDENTITY_UNAVAILABLE' : 'POLICY_DENIED');
      assert.equal(f.common.calls.secret, 0);
      assert.equal(f.provider.requests.length, 0);
    }
  });
}

test('maximum branch scope and feature-specific grants cannot cross-authorize', async () => {
  const scope = { ...branchFeatureScope, branchIds: Array.from({ length: 30 }, (_, n) => `br-${n}`) };
  const args = { project_id: 'project-a', branch_id: 'br-29' };
  for (const [name, , raw, expected] of branchFeatureCases) {
    const f = setup(name, args, raw, scope);
    assert.deepEqual((await f.call()).value, expected);
    const target = f.provider.operation(name).prepare(args).resource.id;
    for (const resource of ['neon/projects/project-a/branches/br-0/realtime',
      ...['realtime', 'storage', 'ai_gateway'].map(suffix => `neon/projects/project-a/branches/br-29/${suffix}`).filter(id => id !== target)]) {
      const other = setup(name, args, raw, scope);
      other.common.vector.policy.resources = [resource];
      assert.equal((await other.call()).code, 'POLICY_DENIED');
      assert.equal(other.common.calls.secret, 0);
      assert.equal(other.provider.requests.length, 0);
    }
  }
});

test('broker revalidates resource and policy after credential resolution and prevents replay', async () => {
  const [name, args, raw] = branchFeatureCases[0];
  for (const mode of ['resource', 'policy', 'revision']) {
    const f = setup(name, args, raw);
    const resolveCredential = f.common.dependencies.credentials.resolve;
    f.common.dependencies.credentials.resolve = async (...parameters) => {
      const lease = await resolveCredential(...parameters);
      if (mode === 'resource') f.common.dependencies.host.revalidate = async () => false;
      else if (mode === 'policy') f.common.vector.policy.agents = [];
      else f.common.vector.policy.revision = 'policy-v2';
      return lease;
    };
    const result = await f.call();
    assert.equal(result.code, mode === 'resource' ? 'RESOURCE_CHANGED' : mode === 'policy' ? 'POLICY_DENIED' : 'POLICY_CHANGED');
    assert.equal(f.provider.requests.length, 0);
    assert.equal(f.common.calls.close, 1);
  }
  const f = setup(name, args, raw);
  assert.equal((await f.call()).ok, true);
  assert.equal((await f.call()).code, 'REPLAY_CONFLICT');
  assert.equal(f.provider.requests.length, 1);
});
