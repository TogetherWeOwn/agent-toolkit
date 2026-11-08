import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = JSON.parse(await readFile(new URL('../api/operation-map.json', import.meta.url), 'utf8'));
const map = JSON.parse(await readFile(new URL('../api/core-operation-map.json', import.meta.url), 'utf8'));
const fields = ['id', 'apiArea', 'tool', 'scope', 'sideEffects', 'tier', 'authorization', 'entitlement', 'status', 'tests', 'implemented', 'reviewed', 'enabled', 'prerequisite'];
const token = /^[A-Za-z0-9][A-Za-z0-9:/._-]*$/;

// Source-format invariants only: not a copy of the core validator or its execution.
test('core map records the exact inspected interface and pending integration', () => {
  assert.deepEqual(source.commonCoreContract, {
    contract: 'toolkit.provider-broker/v1',
    sourceCommit: 'a838436aa4492c77dc7fb995bc776ec7c7d922e7',
    coverageSourceSha256: '6e96d7ab98ceb630af33007134bff79c996963c9a0deab23cee21db3f1110e68',
    artifact: 'api/core-operation-map.json',
    status: 'schema-mapping-candidate-not-runtime-integration',
    validatorExecution: 'not-performed',
    runtimeIntegrated: false,
  });
});

test('core map uses the closed top-level format and official reference', () => {
  assert.deepEqual(Object.keys(map).sort(), ['contract', 'provider', 'version', 'reference', 'inventory', 'operations'].sort());
  assert.equal(map.contract, source.commonCoreContract.contract);
  assert.equal(map.provider, 'planetscale');
  assert.equal(map.version, '0.1.0');
  assert.deepEqual(map.reference, { url: source.source.schemaUrl, version: source.source.apiVersion, sha256: source.source.sha256 });
});

test('core map preserves exactly one row for every official operation in order', () => {
  const ids = source.operations.map(row => row.operationId);
  assert.equal(ids.length, 291);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(map.inventory, ids);
  assert.deepEqual(map.operations.map(row => row.id), ids);
});

test('core rows retain intended tools, parameter scopes and fixed effect labels', () => {
  for (const [index, row] of map.operations.entries()) {
    const original = source.operations[index];
    assert.deepEqual(Object.keys(row).sort(), [...fields].sort());
    assert.equal(row.tool, original.tool);
    assert.equal(row.scope, original.resourceParameters.join('/') || 'provider-discovery');
    assert.equal(row.apiArea, original.areas[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    assert.deepEqual(row.sideEffects, [original.sideEffects, 'classification-pending']);
    for (const value of [row.id, row.apiArea, row.tool, row.scope, ...row.sideEffects, ...row.tests]) {
      assert.ok(value.length <= 256);
      assert.match(value, token);
    }
  }
});

test('no offline adapter, preview or missing operation becomes core-implemented', () => {
  for (const row of map.operations) {
    assert.equal(row.status, 'incomplete');
    assert.equal(row.implemented, false);
    assert.equal(row.reviewed, false);
    assert.equal(row.enabled, false);
    assert.equal(row.entitlement, 'unknown');
    // All-reserved is a conservative export envelope, not an approved tier route.
    assert.equal(row.tier, 'reserved');
    assert.equal(row.authorization, 'native');
  }
  assert.equal(source.operations.filter(row => row.adapter).length, 134);
  assert.equal(source.operations.filter(row => row.localPlan).length, 12);
});

test('core map links exactly the existing offline read and preview test tuples', async () => {
  for (const [index, row] of map.operations.entries()) {
    const original = source.operations[index];
    const expected = original.test ? [original.test] : [];
    if (original.localPlan) expected.push(original.localPlan.test);
    assert.deepEqual(row.tests, expected);
    for (const path of row.tests) await readFile(new URL('../' + path, import.meta.url));
  }
});

test('every core row retains prerequisites without replacing missing work by prohibition', () => {
  for (const [index, row] of map.operations.entries()) {
    assert.deepEqual(row.prerequisite.split(';'), [...source.operations[index].prerequisites,
      'core-validator-execution-and-provider-operation-integration',
      'operation-specific-tier-and-conjunctive-authority-review',
      'authenticated-host-policy-journal-audit-credential-and-transport-adapters',
    ]);
    assert.ok(row.prerequisite.length > 0 && row.prerequisite.length <= 4096);
    assert.notEqual(row.status, 'prohibited');
    assert.notEqual(row.authorization, 'prohibited');
  }
});

test('documented read entitlement cannot downgrade a destructive core map entry', () => {
  const original = source.operations.find(row => row.operationId === 'delete_query_patterns_report');
  assert.ok(original.documentedAuthorization.serviceTokenAnyOf.includes('read_branch'));
  const row = map.operations.find(row => row.id === original.operationId);
  assert.equal(row.tier, 'reserved');
  assert.equal(row.authorization, 'native');
  assert.equal(row.entitlement, 'unknown');
  assert.equal(row.status, 'incomplete');
  assert.deepEqual(row.tests, [original.localPlan.test]);
});
