import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindListExtensionsPreparation, bindListShardConfigurationProfileExtensionsPreparation,
  bindListParametersPreparation, bindListAdminParametersPreparation, bindListRouterParametersPreparation,
  bindListShardConfigurationProfileParametersPreparation }
  from '../../../dist/plugins/planetscale-broker/src/core-read-preparation.js';
import { prepare as extensions } from '../../../dist/plugins/planetscale-broker/src/tools/list-extensions.js';
import { prepare as profileExtensions } from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profile-extensions.js';
import { prepare as parameters } from '../../../dist/plugins/planetscale-broker/src/tools/list-parameters.js';
import { prepare as adminParameters } from '../../../dist/plugins/planetscale-broker/src/tools/list-admin-parameters.js';
import { prepare as routerParameters } from '../../../dist/plugins/planetscale-broker/src/tools/list-router-parameters.js';
import { prepare as profileParameters } from '../../../dist/plugins/planetscale-broker/src/tools/list-shard-configuration-profile-parameters.js';

const revision = 'a'.repeat(64);
const parent = () => ({ organization: 'sample-org', organizationId: 'org_1', database: 'sample-db', databaseId: 'db_1',
  branch: 'staging', branchId: 'branch_1', revision });
const profile = () => ({ id: 'profile_1', name: 'standard' });
const router = () => ({ id: 'router_1', name: 'primary' });
const extensionBindings = () => [{ name: 'pg_stat_statements' }, { name: 'pgcrypto' }];
const parameterBindings = () => [{ name: 'shared_buffers', namespace: 'pgconf' }, { name: 'work_mem', namespace: 'pgconf' }];
const prefix = '/v1/organizations/sample-org/databases/sample-db/branches/staging';
const cases = [
  { operation: 'list_extensions', bind: bindListExtensionsPreparation, read: extensions, key: 'extensions',
    target: () => ({ ...parent(), extensions: extensionBindings() }), path: '/extensions' },
  { operation: 'list_shard_configuration_profile_extensions', bind: bindListShardConfigurationProfileExtensionsPreparation,
    read: profileExtensions, key: 'extensions', child: 'profile',
    target: () => ({ ...parent(), profile: profile(), extensions: extensionBindings() }), path: '/configuration-profiles/standard/extensions' },
  { operation: 'list_parameters', bind: bindListParametersPreparation, read: parameters, key: 'parameters', engine: 'postgres',
    target: () => ({ ...parent(), parameters: parameterBindings() }), path: '/parameters' },
  { operation: 'list_admin_parameters', bind: bindListAdminParametersPreparation, read: adminParameters, key: 'parameters', engine: 'neki',
    target: () => ({ ...parent(), parameters: parameterBindings() }), path: '/admin/parameters' },
  { operation: 'list_router_parameters', bind: bindListRouterParametersPreparation, read: routerParameters, key: 'parameters', engine: 'neki', child: 'router',
    target: () => ({ ...parent(), router: router(), parameters: parameterBindings() }), path: '/routers/primary/parameters' },
  { operation: 'list_shard_configuration_profile_parameters', bind: bindListShardConfigurationProfileParametersPreparation,
    read: profileParameters, key: 'parameters', engine: 'neki', child: 'profile',
    target: () => ({ ...parent(), profile: profile(), parameters: parameterBindings() }), path: '/configuration-profiles/standard/parameters' },
];
const scope = (c, target) => ({ organization: target.organization, database: target.database, branch: target.branch,
  [c.key]: target[c.key], ...(c.child ? { [c.child]: target[c.child] } : {}) });
const row = c => c.key === 'extensions'
  ? { name: 'pg_stat_statements', can_enable: true, enabled: false, internal: false }
  : { name: 'shared_buffers', namespace: 'pgconf', parameter_type: 'bytes', internal: false, disabled: true, required: false, restart: true };
const expected = c => c.key === 'extensions'
  ? { name: 'pg_stat_statements', canEnable: true, enabled: false, internal: false }
  : { name: 'shared_buffers', namespace: 'pgconf', parameterType: 'bytes', internal: false, disabled: true, required: false, restart: true };
const project = (c, body) => c.read(scope(c, c.target()), {}).project(Buffer.from(JSON.stringify(body)));
const refused = fn => assert.throws(fn, { code: 'schema' });
function frozenTree(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozenTree(child);
}
function leaves(value, prefix = []) {
  return Object.entries(value).flatMap(([key, child]) => child !== null && typeof child === 'object'
    ? leaves(child, [...prefix, key]) : [[...prefix, key]]);
}

for (const c of cases) {
  test(`${c.operation}: fixed array request, host resource and empty arguments`, () => {
    const target = c.target(); const prepared = c.bind(target)({});
    const resource = c.child === 'profile' ? 'configuration-profile/profile_1' : c.child === 'router' ? 'router/router_1' : 'branch/branch_1';
    assert.deepEqual(prepared.resource, { id: `planetscale/${resource}`, revision });
    assert.deepEqual(prepared.arguments, {}); assert.equal(prepared.artifactDigest, null);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.plan.target)), target);
    assert.equal(Object.getPrototypeOf(prepared.plan.target), null);
    assert.equal(prepared.plan.operationId, c.operation); assert.equal(prepared.plan.tool, `planetscale.${c.operation}`);
    assert.deepEqual(prepared.plan.proposedRequest, { method: 'GET', origin: 'https://api.planetscale.com', path: prefix + c.path });
    assert.deepEqual(prepared.plan.proposedRequest, c.read(scope(c, target), {}).request);
    assert.equal(canonicalHash(prepared), canonicalHash(c.bind(target)(Object.create(null))));
  });

  test(`${c.operation}: preparation confers no execution, immutable response identity or authority`, () => {
    const prepare = c.bind(c.target()); const prepared = prepare({});
    assert.equal(prepared.plan.kind, 'validated-local-read-plan');
    assert.equal(prepared.plan.responseIdentity, 'name-only-not-immutable');
    assert.equal(prepared.plan.nonWaking, 'not-verified'); assert.equal(prepared.plan.execution, 'not-implemented');
    for (const key of ['execute', 'project']) assert.equal(Object.hasOwn(prepare, key), false);
    for (const key of ['credential', 'approved', 'tier', 'collectionAuthority', 'engine']) assert.equal(Object.hasOwn(prepared.plan, key), false);
  });

  test(`${c.operation}: projections omit values, defaults, options and secret canaries`, () => {
    const result = project(c, [{ ...row(c), id: 'synthetic-canary', value: 'synthetic-canary', default_value: 'synthetic-canary',
      options: ['synthetic-canary'], description: 'synthetic-canary', password: 'synthetic-canary', dsn: 'synthetic-canary',
      url: 'synthetic-canary', actor: 'synthetic-canary', created_at: 'synthetic-canary', approval: true }]);
    assert.deepEqual(result, [expected(c)]); assert.equal(JSON.stringify(result).includes('synthetic-canary'), false);
    assert.deepEqual(project(c, []), []); frozenTree(result);
  });

  test(`${c.operation}: unknown definitions and malformed flags refuse the whole array`, () => {
    assert.throws(() => project(c, [row(c), { ...row(c), name: 'foreign' }]), { code: 'scope' });
    const flags = c.key === 'extensions' ? ['can_enable', 'internal'] : ['internal', 'disabled', 'required', 'restart'];
    for (const flag of flags) for (const value of [null, 0, 'true'])
      assert.throws(() => project(c, [{ ...row(c), [flag]: value }]), { code: 'upstream' });
    if (c.key === 'parameters') {
      assert.throws(() => project(c, [{ ...row(c), parameter_type: 'unknown' }]), { code: 'schema' });
      assert.throws(() => project(c, [{ ...row(c), namespace: c.engine === 'postgres' ? 'patroni' : 'router' }]), { code: 'scope' });
    }
  });

  test(`${c.operation}: plain-array and wire bounds fail closed without invented pagination`, () => {
    const read = c.read(scope(c, c.target()), {});
    assert.throws(() => read.project(new Uint8Array(65537)), { code: 'upstream' });
    for (const body of [null, { data: [row(c)] }, Array(33).fill(row(c)), [null]])
      assert.throws(() => project(c, body), { code: 'upstream' });
    refused(() => c.bind({ ...c.target(), pagination: { page: 1, perPage: 2 } }));
  });

  test(`${c.operation}: later host changes cannot widen the deeply frozen capture`, () => {
    const target = c.target(); const prepare = c.bind(target); const before = prepare({});
    for (const path of leaves(target)) {
      const holder = path.slice(0, -1).reduce((v, key) => v[key], target); holder[path.at(-1)] = 'other';
    }
    target[c.key].push({ name: 'other' });
    assert.deepEqual(prepare({}), before); frozenTree(before);
    assert.throws(() => { before.plan.target[c.key][0].name = 'other'; }, TypeError);
  });

  test(`${c.operation}: every host leaf and definition order changes plan and full hashes`, () => {
    const original = c.bind(c.target())({});
    for (const path of leaves(c.target())) {
      const target = c.target(); const holder = path.slice(0, -1).reduce((v, key) => v[key], target); const key = path.at(-1);
      holder[key] = key === 'revision' ? 'b'.repeat(64) : key === 'namespace' ? c.engine === 'postgres' ? 'patroni' : 'router' : 'other';
      const changed = c.bind(target)({});
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
    const target = c.target(); target[c.key].reverse(); const changed = c.bind(target)({});
    assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
    assert.notEqual(canonicalHash(original), canonicalHash(changed));
  });

  test(`${c.operation}: caller cannot inject scope, filters, settings, secrets or approval`, () => {
    const prepare = c.bind(c.target());
    for (const raw of [null, [], { target: c.target() }, { internal: true }, { engine: 'neki' }, { page: 2 },
      { value: 'synthetic-canary' }, { credential: 'synthetic-canary' }, { approved: true },
      { [Symbol('scope')]: true }, Object.defineProperty({}, 'hidden', { value: true })]) refused(() => prepare(raw));
    let touched = false;
    refused(() => prepare(Object.defineProperty({}, 'internal', { enumerable: true, get() { touched = true; return true; } })));
    assert.equal(touched, false);
  });

  test(`${c.operation}: host bindings reject missing, malformed, duplicate and accessor fields`, () => {
    for (const key of Object.keys(c.target())) {
      const missing = c.target(); delete missing[key]; refused(() => c.bind(missing));
      refused(() => c.bind({ ...c.target(), [key]: '../escape' }));
      let touched = false;
      refused(() => c.bind(Object.defineProperty(c.target(), key, { enumerable: true, get() { touched = true; return 'other'; } })));
      assert.equal(touched, false);
    }
    for (const patch of [{ approved: true }, { engine: 'neki' }, { [Symbol('scope')]: true }]) refused(() => c.bind({ ...c.target(), ...patch }));
    const rows = c.target()[c.key];
    for (const value of [[], [rows[0], rows[0]], Array(33).fill(rows[0]), [null], [{ ...rows[0], approved: true }]])
      refused(() => c.bind({ ...c.target(), [c.key]: value }));
    let touched = false;
    Object.defineProperty(rows, '0', { enumerable: true, get() { touched = true; return null; } });
    refused(() => c.bind({ ...c.target(), [c.key]: rows })); assert.equal(touched, false);
    if (c.child) {
      const target = c.target(); target[c.child].approved = true; refused(() => c.bind(target));
      const accessor = c.target(); let accessed = false;
      Object.defineProperty(accessor[c.child], 'id', { enumerable: true, get() { accessed = true; return 'other'; } });
      refused(() => c.bind(accessor)); assert.equal(accessed, false);
    }
  });
}

test('host-only IDs and definition bindings remain hashed when requests are identical', () => {
  for (const c of cases) {
    for (const change of [t => { t.branchId = 'other'; }, t => { t[c.key][0].name = 'other'; },
      ...(c.child ? [t => { t[c.child].id = 'other'; }] : [])]) {
      const original = c.bind(c.target())({}); const target = c.target(); change(target); const changed = c.bind(target)({});
      assert.deepEqual(original.plan.proposedRequest, changed.plan.proposedRequest);
      assert.notEqual(canonicalHash(original.plan), canonicalHash(changed.plan));
      assert.notEqual(canonicalHash(original), canonicalHash(changed));
    }
  }
  const prepared = cases.map(c => c.bind(c.target())({}));
  assert.equal(new Set(prepared.map(canonicalHash)).size, cases.length);
});

test('parameter namespaces remain engine-specific and the pair is the definition binding', () => {
  for (const c of cases.filter(c => c.key === 'parameters')) {
    const namespaces = c.engine === 'postgres' ? ['patroni', 'pgbouncer', 'pgconf'] : ['admin', 'pgconf', 'replicator', 'router', 'sidecar'];
    for (const namespace of namespaces) {
      const target = c.target(); target.parameters = [{ name: 'shared_buffers', namespace }];
      assert.equal(c.bind(target)({}).plan.target.parameters[0].namespace, namespace);
    }
    for (const namespace of c.engine === 'postgres' ? ['admin', 'router'] : ['patroni', 'pgbouncer']) {
      const target = c.target(); target.parameters[0].namespace = namespace; refused(() => c.bind(target));
    }
    const target = c.target(); target.parameters = [{ name: 'shared_buffers', namespace: 'pgconf' },
      { name: 'shared_buffers', namespace: c.engine === 'postgres' ? 'patroni' : 'router' }];
    assert.equal(c.bind(target)({}).plan.target.parameters.length, 2);
  }
});

test('extension enabled stays nullable and optional, never effective enablement authority', () => {
  for (const c of cases.filter(c => c.key === 'extensions')) {
    for (const enabled of [null, undefined, true, false])
      assert.deepEqual(project(c, [{ ...row(c), enabled }]), [{ ...expected(c), enabled: enabled ?? null }]);
    for (const enabled of [0, 'true', {}]) assert.throws(() => project(c, [{ ...row(c), enabled }]), { code: 'upstream' });
  }
});
