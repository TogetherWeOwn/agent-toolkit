import { readFileSync } from 'node:fs';
import { createProviderBroker, canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { closed, name } from '../../../dist/packages/core/src/schema.js';

export const providerVector = JSON.parse(readFileSync(new URL('./provider-v1.json', import.meta.url), 'utf8'));
export const credentialCanary = 'synthetic-broad-credential-canary-a';
export const derivedCanary = 'synthetic-derived-credential-canary-a';

// Test-only, process-local authority/journal: never native authorization evidence.
// No default transport or network. Provider tests replace execute with strict fixtures.
export function providerFixture(overrides = {}) {
  let now = 1000;
  const vector = structuredClone(providerVector);
  const calls = { secret: 0, upstream: 0, close: 0, auth: 0, consumed: 0 };
  const audit = [];
  const journal = new Map();
  const grants = new Map();
  const operation = {
    name: 'resource.inspect', version: '1.0.0', tier: 'read', timeoutMs: 1000, lifecycle: 'none',
    prepare(raw) {
      const args = closed({ name }).parse(raw);
      return { resource: vector.resource, arguments: args,
        plan: { action: 'inspect', name: args.name }, artifactDigest: vector.artifactDigest };
    },
    async execute(plan, credential, signal, requestKey) {
      calls.upstream++;
      if (credential !== credentialCanary || signal.aborted || !/^[a-f0-9]{64}$/.test(requestKey)) throw Error('bad fixture');
      return { status: 'ready' };
    },
    project(raw) { return { status: raw.status }; },
    ...overrides.operation,
  };
  const dependencies = {
    provider: 'synthetic', operations: [operation],
    host: {
      async authenticate(context) { calls.auth++; return context === 'verified-runtime' ? vector.principal : null; },
      async revalidate() { return true; },
      ...overrides.host,
    },
    policy: { async read() { return vector.policy; }, ...overrides.policy },
    authority: null,
    journal: {
      async claim(key, target, event) {
        if (journal.has(key)) return false;
        journal.set(key, { target, event, outcome: 'pending' });
        return true;
      },
      async finish(key, event, outcome) {
        const item = journal.get(key);
        if (item?.event !== event) throw Error('wrong journal owner');
        item.outcome = outcome;
      },
      ...overrides.journal,
    },
    audit: { async append(record) { audit.push(record); }, ...overrides.audit },
    credentials: { async resolve() {
      calls.secret++;
      return { value: credentialCanary, redactions: [derivedCanary], async close() { calls.close++; } };
    }, ...overrides.credentials },
    clock: () => now,
  };
  const authority = {
    async verify(target) {
      const evidence = { reference: 'native-fixture', targetHash: canonicalHash(target), issuedAt: now, expiresAt: now + 1000 };
      grants.set(evidence.reference, evidence);
      return evidence;
    },
    async consume(evidence, target, time) {
      const grant = grants.get(evidence.reference);
      if (!grant || grant.targetHash !== canonicalHash(target) || time >= grant.expiresAt) return false;
      grants.delete(evidence.reference);
      calls.consumed++;
      return true;
    },
  };
  if (overrides.authority !== undefined) dependencies.authority = overrides.authority === true ? authority : overrides.authority;
  return { vector, calls, audit, journal, grants, operation, dependencies, authority,
    setNow(value) { now = value; },
    broker() { return createProviderBroker(dependencies); },
  };
}
