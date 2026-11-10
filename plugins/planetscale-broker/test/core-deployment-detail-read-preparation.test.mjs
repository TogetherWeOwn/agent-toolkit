import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindGetDeploymentPreparation, bindGetSchemaRecommendationPreparation } from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as deploymentRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-deployment.js';
import { prepare as recommendationRead } from '../../../dist/plugins/planetscale-broker/src/tools/get-schema-recommendation.js';

const database = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1', revision: 'a'.repeat(64) });
const refused = fn => assert.throws(fn, { code: 'schema' });
const cases = [
  { operation: 'get_deployment', bind: bindGetDeploymentPreparation, read: deploymentRead, child: 'deployment',
    target: () => ({ ...database(), deployment: { id: 'record_1', number: 7, intoBranch: 'main' }, intoBranchId: 'branch_1' }),
    identity: 'record-and-number-parent-and-destination-not-verified', resource: 'planetscale/deployment/record_1',
    path: '/v1/organizations/sample-org/databases/sample-db/deploy-requests/7/deployment',
    body: { id: 'record_1', deploy_request_number: 7, into_branch: 'main', state: 'complete', auto_cutover: false, auto_delete_branch: false, queue_paused: false },
    keys: ['id', 'number', 'intoBranch', 'state', 'autoCutover', 'autoDeleteBranch', 'queuePaused'] },
  { operation: 'get_schema_recommendation', bind: bindGetSchemaRecommendationPreparation, read: recommendationRead, child: 'recommendation',
    target: () => ({ ...database(), recommendation: { id: 'record_1', number: 7 } }),
    identity: 'record-and-number-parent-not-verified', resource: 'planetscale/schema-recommendation/record_1',
    path: '/v1/organizations/sample-org/databases/sample-db/schema-recommendations/7',
    body: { id: 'record_1', number: 7, state: 'open', recommendation_type: 'unused_index' },
    keys: ['id', 'number', 'state', 'recommendationType'] },
];
const scope = (c, target) => ({ organization: target.organization, database: target.database, [c.child]: target[c.child] });

for (const c of cases) {
  test(`${c.operation}: core preparation binds immutable IDs, sequence and fixed GET`, () => {
    const target = c.target();
    const prepared = c.bind(target)({});
    assert.deepEqual(prepared.resource, { id: c.resource, revision: target.revision });
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.equal(Object.getPrototypeOf(prepared.plan.target[c.child]), null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.deepEqual(prepared.arguments, {});
    assert.equal(prepared.artifactDigest, null);
    assert.equal(prepared.plan.operationId, c.operation);
    assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scope(c, target), {}).request);
    assert.equal(prepared.plan.proposedRequest.method, 'GET');
    assert.equal(prepared.plan.proposedRequest.origin, 'https://api.planetscale.com');
    assert.equal(prepared.plan.proposedRequest.path, c.path);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation retains identity/non-waking gaps without authority`, () => {
    const prepare = c.bind(c.target());
    const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.responseIdentity, c.identity);
    assert.equal(prepared.plan.nonWaking, 'not-verified');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['approved', 'tier', 'credential']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projection omits unverified parents and DDL/actor canaries`, () => {
    const output = c.read(scope(c, c.target()), {}).project(Buffer.from(JSON.stringify({ ...c.body,
      organization_id: 'unverified-parent', database_id: 'unverified-parent', into_branch_id: 'unverified-parent',
      ddl: 'synthetic-canary', schema: 'synthetic-canary', reason: 'synthetic-canary',
      actor: { name: 'synthetic-canary' }, sql: 'synthetic-canary' })));
    assert.equal(JSON.stringify(output).includes('synthetic-canary'), false);
    assert.equal(JSON.stringify(output).includes('unverified-parent'), false);
    assert.deepEqual(Object.keys(output).sort(), [...c.keys].sort());
    assert.ok(Object.isFrozen(output));
  });

  test(`${c.operation}: projection refuses record or sequence rebound`, () => {
    const read = c.read(scope(c, c.target()), {});
    for (const patch of [{ id: 'other' }, { [c.child === 'deployment' ? 'deploy_request_number' : 'number']: 8 },
      ...(c.child === 'deployment' ? [{ into_branch: 'other' }] : [])]) {
      assert.throws(() => read.project(Buffer.from(JSON.stringify({ ...c.body, ...patch }))), { code: 'scope' });
    }
  });

  test(`${c.operation}: captured nested host target and request are immutable`, () => {
    const target = c.target();
    const prepare = c.bind(target);
    const before = prepare({});
    target[c.child].id = 'other';
    target[c.child].number = 8;
    if (c.child === 'deployment') target[c.child].intoBranch = 'other';
    target.organization = 'other';
    target.databaseId = 'other';
    target.revision = 'b'.repeat(64);
    assert.deepEqual(prepare({}), before);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.target[c.child], before.plan.proposedRequest]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target[c.child].number = 8; }, TypeError);
    assert.throws(() => { before.plan.proposedRequest.method = 'DELETE'; }, TypeError);
  });

  test(`${c.operation}: every parent/record/sequence/revision field changes hashes`, () => {
    const target = c.target();
    const original = c.bind(target)({});
    for (const key of Object.keys(target).filter(key => key !== c.child)) {
      const changed = { ...target, [key]: key === 'revision' ? 'b'.repeat(64) : 'other' };
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan), key);
      assert.notEqual(canonicalHash(original), canonicalHash(prepared), key);
    }
    for (const key of Object.keys(target[c.child])) {
      const changed = { ...target, [c.child]: { ...target[c.child], [key]: key === 'number' ? 8 : 'other' } };
      const prepared = c.bind(changed)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(prepared.plan), key);
      assert.notEqual(canonicalHash(original), canonicalHash(prepared), key);
    }
  });

  test(`${c.operation}: caller cannot supply scope, request, DDL or authority`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { number: 8 }, { approved: true }, { ddl: 'synthetic-canary' },
      { resource: 'other' }, { revision: 'b'.repeat(64) }, { method: 'DELETE' }, { credential: 'synthetic-canary' },
      { url: 'https://example.invalid' }, { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'target', { enumerable: true, get() { touched = true; return c.target(); } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: missing/extra/unsafe host fields and nested accessors refuse`, () => {
    for (const raw of [null, [], {}, { ...c.target(), credential: 'synthetic-canary' },
      { ...c.target(), revision: 'latest' }, { ...c.target(), organization: '../other' }]) refused(() => c.bind(raw));
    for (const key of Object.keys(c.target())) {
      const missing = c.target();
      delete missing[key];
      refused(() => c.bind(missing));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const [key, values] of Object.entries({ id: ['', '../other'], number: [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7'],
      ...(c.child === 'deployment' ? { intoBranch: ['../other', ''] } : {}) })) {
      for (const value of values) refused(() => c.bind({ ...c.target(), [c.child]: { ...c.target()[c.child], [key]: value } }));
      const missing = c.target();
      delete missing[c.child][key];
      refused(() => c.bind(missing));
      let touched = false;
      const accessor = c.target();
      Object.defineProperty(accessor[c.child], key, { enumerable: true, get() { touched = true; return 'other'; } });
      refused(() => c.bind(accessor));
      assert.equal(touched, false);
    }
    const extra = c.target();
    extra[c.child].hiddenAuthority = true;
    refused(() => c.bind(extra));
  });
}

test('deployment and recommendation resources remain distinct for identical record IDs', () => {
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(p => p.resource.id)).size, 2);
  assert.equal(new Set(prepared.map(canonicalHash)).size, 2);
});
