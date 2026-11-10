import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetBranchAnomalyPreparation, bindGetTrafficBudgetPreparation, bindGetQueryPatternsReportStatusPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as anomalyRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-anomaly.js';
import { prepare as budgetRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-traffic-budget.js';
import { prepare as reportRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-query-patterns-report-status.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const path = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'get_branch_anomaly', bind: bindGetBranchAnomalyPreparation, read: anomalyRead, field: 'anomalyId',
    resource: 'planetscale/branch-anomaly/record_1', path: `${path}/insights/anomalies/record_1`,
    body: { id: 'record_1', active: true }, keys: ['id', 'active', 'remediationAuthority'],
    authority: 'remediationAuthority', invalid: { active: 'true' }, invalidCode: 'upstream' },
  { operation: 'get_traffic_budget', bind: bindGetTrafficBudgetPreparation, read: budgetRead, field: 'budgetId',
    resource: 'planetscale/traffic-budget/record_1', path: `${path}/traffic/budgets/record_1`,
    body: { id: 'record_1', mode: 'enforce' }, keys: ['id', 'mode', 'effectiveEnforcement'],
    authority: 'effectiveEnforcement', invalid: { mode: 'other' }, invalidCode: 'schema' },
  { operation: 'get_query_patterns_report_status', bind: bindGetQueryPatternsReportStatusPreparation,
    read: reportRead, field: 'reportId', resource: 'planetscale/query-patterns-report/record_1',
    path: `${path}/query-patterns/record_1`, body: { id: 'record_1', state: 'completed' },
    keys: ['id', 'state', 'downloadAuthority'], authority: 'downloadAuthority',
    invalid: { state: 'other' }, invalidCode: 'schema' },
];
const targetFor = c => ({ ...branch(), [c.field]: 'record_1' });
const scopeFor = (c, t) => ({ organization: t.organization, database: t.database, branch: t.branch, [c.field]: t[c.field] });

for (const c of cases) {
  test(`${c.operation}: preparation binds immutable parent/record IDs, revision and fixed GET`, () => {
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

  test(`${c.operation}: preparation retains identity/non-waking gaps without action authority`, () => {
    const prepare = c.bind(targetFor(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, 'record-id-only-parent-not-verified');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', c.authority]) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits SQL/rules/report/operational canaries`, () => {
    const output = c.read(scopeFor(c, targetFor(c)), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', branch_id: 'unverified-parent',
      sql: 'synthetic-canary', correlations: [{ query: 'synthetic-canary' }], fingerprint: 'synthetic-canary',
      rules: [{ tag: 'synthetic-canary' }], thresholds: 'synthetic-canary', metrics: 'synthetic-canary',
      url: 'synthetic-canary', download_url: 'synthetic-canary', report: 'synthetic-canary',
      actor: { name: 'synthetic-canary' }, created_at: 'synthetic-canary', error: 'synthetic-canary',
      approved: true, [c.authority]: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.equal(output[c.authority], 'not-established');
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
    assert.throws(() => { before.plan.target.branchId = 'other'; }, TypeError);
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

  test(`${c.operation}: caller cannot supply target/request/selectors/authority`, () => {
    const prepare = c.bind(targetFor(c));
    for (const raw of [null, [], { target: targetFor(c) }, { approved: true }, { branchId: 'other' },
      { [c.field]: 'other' }, { fingerprint: 'other' }, { resource: 'other' }, { revision: 'b'.repeat(64) },
      { method: 'POST' }, { credential: 'synthetic-canary' }, { url: 'https://example.invalid' },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return targetFor(c); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse`, () => {
    for (const raw of [null, [], {}, { ...targetFor(c), credential: 'synthetic-canary' },
      { ...targetFor(c), revision: 'latest' }, { ...targetFor(c), branch: '../other' },
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

test('anomaly, budget and report preparations do not collide with equal record IDs', () => {
  const prepared = cases.map(c => c.bind(targetFor(c))({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 3);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 3);
});
