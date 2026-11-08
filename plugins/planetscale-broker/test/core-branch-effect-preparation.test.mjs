import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash } from '../../../dist/packages/core/src/provider/index.js';
import { bindCreateBackupPreparation, bindDeleteBranchPreparation, bindDisableSafeMigrationsPreparation } from '../../../dist/plugins/planetscale-broker/src/core-preparation.js';
import { prepareCreateBackup, prepareDisableSafeMigrations } from '../../../dist/plugins/planetscale-broker/src/mutation-plans.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const target = { organization: 'sample-org', database: 'sample-db', branch: 'sample-branch',
  branchId: 'branch_1', revision: 'a'.repeat(64), production: false, deletionProtected: false, safeMigrations: true };
const path = '/v1/organizations/sample-org/databases/sample-db/branches/sample-branch';
const fixtures = [
  { bind: bindCreateBackupPreparation, preview: prepareCreateBackup, operation: 'create_backup',
    args: { name: 'bounded-backup', retentionHours: 12 }, authorities: ['release-manager', 'owner-money'],
    request: { method: 'POST', origin: 'https://api.planetscale.com', path: `${path}/backups`,
      body: { name: 'bounded-backup', retention_unit: 'hour', retention_value: 12, emergency: false } } },
  { bind: bindDisableSafeMigrationsPreparation, preview: prepareDisableSafeMigrations, operation: 'disable_safe_migrations',
    args: {}, authorities: ['release-manager', 'owner-security'],
    request: { method: 'DELETE', origin: 'https://api.planetscale.com', path: `${path}/safe-migrations`, body: null } },
];
const refused = fn => assert.throws(fn, error => ['schema', 'scope', 'upstream'].includes(error.code)
  && !String(error).includes(canary));

for (const { bind, preview, operation, args, authorities, request } of fixtures) {
  test(`${operation} core preparation: complete preview and conjunctive obligations are retained`, () => {
    const prepared = bind(target)(args);
    assert.deepEqual(prepared.resource, { id: 'planetscale/branch/branch_1', revision: target.revision });
    assert.deepEqual({ ...prepared.arguments }, args);
    assert.deepEqual(prepared.plan, preview(target, args));
    assert.equal(prepared.plan.operationId, operation);
    assert.equal(prepared.plan.kind, 'validated-local-plan-not-provider-dry-run');
    assert.equal(prepared.plan.execution, 'not-implemented');
    assert.equal(prepared.plan.remotePreconditions, 'not-verified');
    assert.equal(prepared.plan.providerDryRun, 'not-performed');
    assert.deepEqual(prepared.plan.requiredAuthorities, authorities);
    assert.deepEqual(prepared.plan.proposedRequest, request);
    assert.equal(prepared.artifactDigest, null);
    assert.deepEqual(Object.keys(prepared).sort(), ['arguments', 'artifactDigest', 'plan', 'resource']);
  });

  test(`${operation} core preparation: host and caller snapshots remain deeply immutable`, () => {
    const input = { ...target }, caller = { ...args }, prepare = bind(input), before = prepare(caller);
    for (const key of Object.keys(input)) input[key] = canary;
    for (const key of Object.keys(caller)) caller[key] = canary;
    assert.deepEqual(prepare(args), before);
    assert.deepEqual({ ...before.plan.target }, target);
    assert.deepEqual({ ...before.arguments }, args);
    for (const value of [before, before.resource, before.arguments, before.plan, before.plan.target,
      before.plan.arguments, before.plan.proposedRequest, before.plan.requiredAuthorities,
      ...(before.plan.proposedRequest.body === null ? [] : [before.plan.proposedRequest.body])]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { before.plan.target.branchId = 'other'; }, TypeError);
    assert.throws(() => { before.plan.requiredAuthorities.pop(); }, TypeError);
  });

  test(`${operation} core preparation: callers cannot inject targets, provider controls or authority`, () => {
    const prepare = bind(target);
    for (const key of [...Object.keys(target), 'target', 'resource', 'plan', 'arguments', 'artifactDigest',
      'approval', 'authorities', 'agentId', 'url', 'credential', 'sql', 'force', 'emergency', 'retention_unit', 'retention_value']) {
      refused(() => prepare({ ...args, [key]: canary }));
    }
    for (const input of [undefined, null, [], 'x', 1, true, { ...args, ...JSON.parse('{"__proto__":{}}') }]) refused(() => prepare(input));
    for (const key of ['approval', ...Object.keys(args)]) {
      let touched = false;
      refused(() => prepare(Object.defineProperty({ ...args }, key, { enumerable: true,
        get() { touched = true; throw new Error(canary); } })));
      assert.equal(touched, false);
    }
  });

  test(`${operation} core preparation: complete closed host identity and revision are mandatory`, () => {
    for (const key of Object.keys(target)) {
      const input = { ...target };
      delete input[key];
      refused(() => bind(input));
      for (const value of [null, {}, [], canary]) refused(() => bind({ ...target, [key]: value }));
    }
    for (const input of [null, {}, [], { ...target, credential: canary }, { ...target, approval: true },
      { ...target, branchId: '../other' }, { ...target, revision: 'latest' }]) refused(() => bind(input));
  });

  test(`${operation} core preparation: host accessors refuse without invocation or reflection`, () => {
    for (const key of Object.keys(target)) {
      let touched = false;
      refused(() => bind(Object.defineProperty({ ...target }, key, { enumerable: true,
        get() { touched = true; throw new Error(canary); } })));
      assert.equal(touched, false);
    }
  });

  test(`${operation} core preparation: hash binds every allowed target classification and identity`, () => {
    const original = bind(target)(args);
    for (const delta of [{ organization: 'other-org' }, { database: 'other-db' }, { branch: 'other-branch' },
      { branchId: 'branch_2' }, { revision: 'b'.repeat(64) }, { production: true }, { deletionProtected: true },
      ...(operation === 'create_backup' ? [{ safeMigrations: false }] : [])]) {
      const changed = bind({ ...target, ...delta })(args);
      assert.notEqual(canonicalHash(changed), canonicalHash(original));
      assert.deepEqual(changed.plan.requiredAuthorities, authorities);
    }
  });

  test(`${operation} core preparation: deterministic operation-specific arguments without execution hooks`, () => {
    const prepare = bind(target);
    assert.deepEqual(prepare(args), prepare(Object.assign(Object.create(null), args)));
    assert.equal(canonicalHash(prepare(args)), canonicalHash(prepare(args)));
    for (const key of ['execute', 'project', 'credential', 'approval']) {
      assert.equal(Object.hasOwn(prepare, key), false);
      assert.equal(Object.hasOwn(prepare(args), key), false);
    }
  });
}

test('backup creation core preparation confines names and retention to the existing non-emergency subset', () => {
  const prepare = bindCreateBackupPreparation(target);
  for (const hours of [1, 24]) {
    const prepared = prepare({ name: 'bounded-backup', retentionHours: hours });
    assert.equal(prepared.plan.proposedRequest.body.retention_value, hours);
    assert.equal(prepared.plan.proposedRequest.body.emergency, false);
  }
  for (const hours of [0, 25, 1.5, '12', null, Infinity]) refused(() => prepare({ name: 'bounded-backup', retentionHours: hours }));
  for (const name of ['', '../other', canary, null, {}]) refused(() => prepare({ name, retentionHours: 12 }));
  for (const input of [{}, { name: 'bounded-backup' }, { retentionHours: 12 }]) refused(() => prepare(input));
  const original = prepare({ name: 'bounded-backup', retentionHours: 12 });
  for (const args of [{ name: 'other-backup', retentionHours: 12 }, { name: 'bounded-backup', retentionHours: 24 }]) {
    const changed = prepare(args);
    assert.notEqual(canonicalHash(changed), canonicalHash(original));
    assert.deepEqual({ ...changed.arguments }, args);
    assert.equal(changed.plan.proposedRequest.body.name, args.name);
    assert.equal(changed.plan.proposedRequest.body.retention_value, args.retentionHours);
  }
});

test('migration-safety removal refuses an already-disabled snapshot at binding time', () => {
  refused(() => bindDisableSafeMigrationsPreparation({ ...target, safeMigrations: false }));
  const prepare = bindDisableSafeMigrationsPreparation(target);
  for (const args of [{ name: 'backup' }, { retentionHours: 1 }, { safeMigrations: false }]) refused(() => prepare(args));
});

test('branch effects share resource identity without colliding in complete core hashes', () => {
  const preparations = [bindDeleteBranchPreparation(target)({}),
    bindCreateBackupPreparation(target)({ name: 'bounded-backup', retentionHours: 12 }),
    bindDisableSafeMigrationsPreparation(target)({})];
  assert.equal(new Set(preparations.map(value => value.resource.id)).size, 1);
  assert.equal(new Set(preparations.map(value => canonicalHash(value))).size, 3);
});
