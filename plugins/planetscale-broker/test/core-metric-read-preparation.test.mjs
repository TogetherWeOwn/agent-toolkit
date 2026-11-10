import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import * as bindings from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { branchMetricNames, tabletMetricNames } from '../../../dist/plugins/planetscale-broker/src/instant-metrics.js';
import { historicalBranchMetricNames, historicalTabletMetricNames } from '../../../dist/plugins/planetscale-broker/src/historical-metrics.js';
import { prepare as instantBranchRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-instant-branch-metrics.js';
import { prepare as instantTabletRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-instant-tablet-metrics.js';
import { prepare as branchRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-metrics.js';
import { prepare as tabletRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-tablet-metrics.js';
import { prepare as queryRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-query-metrics.js';
import { prepare as tagRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-branch-tag-metrics.js';

const branch = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db',
  databaseId: 'db_1', branch: 'staging', branchId: 'branch_1', revision: 'a'.repeat(64) });
const window = { from: '2026-11-07T00:00:00Z', to: '2026-11-07T00:15:00Z' };
const path = '/v1/organizations/sample-org/databases/sample-db/branches/staging/metrics';
const cases = [
  { operation: 'get_instant_branch_metrics', bind: bindings.bindGetInstantBranchMetricsPreparation,
    read: instantBranchRead, metrics: branchMetricNames, suffix: '/instant', instant: true },
  { operation: 'get_instant_tablet_metrics', bind: bindings.bindGetInstantTabletMetricsPreparation,
    read: instantTabletRead, metrics: tabletMetricNames, suffix: '/tablets-instant', instant: true },
  { operation: 'get_branch_metrics', bind: bindings.bindGetBranchMetricsPreparation,
    read: branchRead, metrics: historicalBranchMetricNames, suffix: '' },
  { operation: 'get_tablet_metrics', bind: bindings.bindGetTabletMetricsPreparation,
    read: tabletRead, metrics: historicalTabletMetricNames, suffix: '/tablets' },
  { operation: 'get_branch_query_metrics', bind: bindings.bindGetBranchQueryMetricsPreparation,
    read: queryRead, metrics: historicalBranchMetricNames, suffix: '/query' },
  { operation: 'get_branch_tag_metrics', bind: bindings.bindGetBranchTagMetricsPreparation,
    read: tagRead, metrics: historicalBranchMetricNames, suffix: '/tag' },
];
const target = c => ({ ...branch(), metric: c.metrics[0], ...(c.instant ? {} : window) });
const scope = c => {
  const { organizationId, databaseId, revision, ...value } = target(c);
  return value;
};
const body = c => c.instant ? { branch: { id: 'branch_1', name: 'staging' }, type: 'synthetic-canary',
  metrics: [{ metric: c.metrics[0], values: [{ pod: 'synthetic-canary', role: 'synthetic-canary', value: 123456 }] }] } :
  { start_date: window.from, end_date: window.to, type: 'synthetic-canary', interval: 60,
    series: [{ metric: c.metrics[0], type: 'synthetic-canary', label: 'synthetic-canary',
      labels: { 'synthetic-canary': 'synthetic-canary' }, points: [[Date.parse(window.from) / 1000, 123456]] }] };
const project = (c, value) => c.read(scope(c), {}).project(Buffer.from(JSON.stringify(value)));
const refused = fn => assert.throws(fn, { code: 'schema' });

for (const c of cases) {
  test(`${c.operation}: binds all immutable parents, revision, selectors and fixed GET`, () => {
    const prepared = c.bind(target(c))({});
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/branch_1', revision: 'a'.repeat(64) });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target(c));
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    const query = `metrics=${c.metrics[0]}` + (c.instant ? '' :
      `&from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}&steps=16`);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com',
      path: `${path}${c.suffix}?${query}` });
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scope(c), {}).request);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target(c))(Object.create(null))));
  });

  test(`${c.operation}: no execution, authority, non-waking or health guarantee`, () => {
    const prepare = c.bind(target(c));
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    assert.equal(prepared.plan.responseIdentity, c.instant ? 'branch-id-and-name-parent-not-verified' : 'absent-request-bound-only');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential', 'health', 'provenance']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: captured target and fixed request remain deeply frozen`, () => {
    const raw = target(c);
    const prepare = c.bind(raw);
    const before = prepare({});
    for (const key of Object.keys(raw)) raw[key] = 'other';
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target, before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.metric = 'other'; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.path = '/other'; }, TypeError);
  });

  test(`${c.operation}: every host field affects plan and full hashes`, () => {
    const original = c.bind(target(c))({});
    for (const key of Object.keys(target(c))) {
      const value = key === 'metric' ? c.metrics[1] : key === 'revision' ? 'b'.repeat(64) :
        key === 'from' ? '2026-11-07T00:00:01Z' : key === 'to' ? '2026-11-07T00:14:59Z' : 'other';
      const changed = c.bind({ ...target(c), [key]: value })({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan), key);
      assert.notEqual(canonicalHash(original), canonicalHash(changed), key);
    }
  });

  test(`${c.operation}: caller cannot change metric, window, branch, request or authority`, () => {
    const prepare = c.bind(target(c));
    for (const raw of [null, [], { target: target(c) }, { metric: c.metrics[1] }, { metrics: c.metrics[0] },
      window, { steps: 16 }, { branchId: 'other' }, { queryId: 'other' }, { tag: 'other' }, { approved: true },
      { artifactDigest: 'a'.repeat(64) }, { method: 'POST' }, { credential: 'synthetic-canary' },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'metric', { enumerable: true, get() { touched = true; return c.metrics[0]; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe/accessor host fields refuse without invocation`, () => {
    for (const raw of [null, [], {}, { ...target(c), credential: 'synthetic-canary' }, { ...target(c), steps: 32 },
      { ...target(c), queryId: 'other' }, { ...target(c), tag: 'other' }, { ...target(c), revision: 'latest' },
      { ...target(c), [Symbol('scope')]: true }, Object.defineProperty(target(c), 'hidden', { value: true })]) refused(() => c.bind(raw));
    for (const key of Object.keys(target(c))) {
      const missing = target(c);
      delete missing[key];
      refused(() => c.bind(missing));
      refused(() => c.bind({ ...target(c), [key]: '../other' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(target(c), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
  });

  test(`${c.operation}: allowlists one selector and refuses arbitrary or combined metrics`, () => {
    for (const metric of c.metrics) assert.equal(c.bind({ ...target(c), metric })({}).plan.target.metric, metric);
    for (const metric of [null, [], c.metrics, '', 'unknown', c.metrics.slice(0, 2).join(','), `${c.metrics[0]}&steps=100`]) refused(() => c.bind({ ...target(c), metric }));
  });

  test(`${c.operation}: availability projection omits samples, labels and unverified parents`, () => {
    const output = project(c, { ...body(c), organization_id: 'unverified-parent', database_id: 'unverified-parent',
      sql: 'synthetic-canary', actor: 'synthetic-canary', created_at: 'synthetic-canary' });
    assert.deepEqual(output, c.instant ? { branchId: 'branch_1', items: [{ metric: c.metrics[0], samplesPresent: true }],
      health: 'not-established' } : { requestBranchId: 'branch_1', metric: c.metrics[0], seriesPresent: true,
      samplesPresent: true, health: 'not-established', provenance: 'not-established' });
    for (const text of ['synthetic-canary', 'unverified-parent', '123456', window.from]) assert.equal(JSON.stringify(output).includes(text), false);
    for (const value of [output, ...(c.instant ? [output.items, ...output.items] : [])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => project(c, {}), { code: c.instant ? 'upstream' : 'scope' });
    const foreign = body(c);
    if (c.instant) foreign.metrics[0].metric = 'other'; else foreign.series[0].metric = 'other';
    assert.throws(() => project(c, foreign), { code: 'scope' });
  });
}

for (const c of cases.filter(c => !c.instant)) {
  test(`${c.operation}: reuses canonical bounded window validation at binding time`, () => {
    for (const change of [{ from: '2026-02-30T00:00:00Z' }, { from: '2026-11-07T00:00:00+00:00' },
      { from: '2026-11-07T00:00:00.000Z' }, { to: '2026-11-07T00:15:01Z' },
      { to: window.from }, { to: '2026-11-06T23:59:59Z' }]) assert.throws(() => c.bind({ ...target(c), ...change }));
    assert.ok(c.bind({ ...target(c), to: '2026-11-07T00:00:01Z' })({}));
    assert.deepEqual(project(c, { ...body(c), series: [] }), { requestBranchId: 'branch_1', metric: c.metrics[0],
      seriesPresent: false, samplesPresent: false, health: 'not-established', provenance: 'not-established' });
    assert.throws(() => project(c, { ...body(c), end_date: '2026-11-07T00:14:59Z' }), { code: 'scope' });
  });
}

for (const c of cases.filter(c => c.instant)) {
  test(`${c.operation}: matches branch ID/name, not supplied parent claims`, () => {
    for (const branch of [{ id: 'other', name: 'staging' }, { id: 'branch_1', name: 'other' }]) assert.throws(() => project(c, { ...body(c), branch }), { code: 'scope' });
    assert.deepEqual(project(c, { ...body(c), metrics: [] }), { branchId: 'branch_1', items: [], health: 'not-established' });
  });
}

test('metric operations share a branch resource but retain distinct operation/request hashes', () => {
  const prepared = cases.map(c => c.bind(target(c))({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 1);
  assert.equal(new Set(prepared.map(p => canonicalHash(p.plan))).size, 6);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 6);
});
