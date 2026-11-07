import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import * as backups from '../../../dist/plugins/planetscale-broker/src/tools/list-backups.js';
import * as backup from '../../../dist/plugins/planetscale-broker/src/tools/get-backup.js';
import * as policies from '../../../dist/plugins/planetscale-broker/src/tools/list-backup-policies.js';
import * as policy from '../../../dist/plugins/planetscale-broker/src/tools/get-backup-policy.js';
import * as deploys from '../../../dist/plugins/planetscale-broker/src/tools/list-deploy-requests.js';
import * as deploy from '../../../dist/plugins/planetscale-broker/src/tools/get-deploy-request.js';

const canary = 'synthetic-secret://NEVER-RETURN-this-value';
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const databaseScope = { organization: 'example-org', database: 'example-db' };
const branchScope = { ...databaseScope, branch: 'staging' };
const dbPath = '/v1/organizations/example-org/databases/example-db';
const deployBinding = { id: 'dr123', number: 7, branch: 'staging', branchId: 'br123', intoBranch: 'main' };
const backupRow = { id: 'bk123', state: 'success', protected: true, required: false, emergency: false, name: canary, actor: { name: canary }, restored_branches: [canary], download_url: canary, estimated_storage_cost: canary };
const backupExpected = { id: 'bk123', state: 'success', protected: true, required: false, emergency: false };
const policyRow = { id: 'bp123', target: 'development', required: false, name: canary, display_name: canary, retention_unit: canary, frequency_unit: canary };
const policyExpected = { id: 'bp123', target: 'development', required: false };
const deployRow = { id: 'dr123', number: 7, branch: 'staging', branch_id: 'br123', into_branch: 'main', state: 'open', deployment_state: 'ready', branch_deleted: false, approved: true, notes: canary, html_body: canary, html_url: canary, actor: { name: canary }, deployment: { credentials: canary } };
const deployExpected = { ...deployBinding, state: 'open', deploymentState: 'ready', branchDeleted: false };
const page = data => ({ data, current_page: 1, per_page: 2, next_page: null, next_page_url: canary });
const fixtures = [
  [backups, { ...branchScope, backupIds: ['bk123'] }, 'backupIds', backupRow, backupExpected, dbPath + '/branches/staging/backups', true],
  [backup, { ...branchScope, backupId: 'bk123' }, 'backupId', backupRow, backupExpected, dbPath + '/branches/staging/backups/bk123', false],
  [policies, { ...databaseScope, policyIds: ['bp123'] }, 'policyIds', policyRow, policyExpected, dbPath + '/backup-policies', true],
  [policy, { ...databaseScope, policyId: 'bp123' }, 'policyId', policyRow, policyExpected, dbPath + '/backup-policies/bp123', false],
  [deploys, { ...databaseScope, requests: [deployBinding] }, 'requests', deployRow, deployExpected, dbPath + '/deploy-requests', true],
  [deploy, { ...databaseScope, request: deployBinding }, 'request', deployRow, deployExpected, dbPath + '/deploy-requests/7', false],
];

for (const [adapter, scope, bindingKey, row, expected, path, list] of fixtures) {
  const args = list ? { page: 1, perPage: 2 } : {};
  const response = rows => list ? page(rows) : rows[0];
  test(`${adapter.operationId}: exact endpoint, bounded projection and immutable output`, () => {
    const prepared = adapter.prepare(scope, args);
    assert.deepEqual(prepared.request, { method: 'GET', origin: 'https://api.planetscale.com', path: path + (list ? '?page=1&per_page=2' : '') });
    const result = prepared.project(wire(response([row])));
    assert.deepEqual(result, list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.ok(!JSON.stringify(result).includes(canary));
    assert.ok(!JSON.stringify(result).includes('approved'));
    assert.ok(Object.isFrozen(list ? result.items[0] : result));
    assert.ok(Object.isFrozen(prepared.request));
    if (list) assert.deepEqual(prepared.project(wire(page([]))), { items: [], nextPage: null, complete: true });
  });

  test(`${adapter.operationId}: mismatched identity refuses the whole response`, () => {
    const prepared = adapter.prepare(scope, args);
    const changes = [{ id: 'foreign' }, { id: canary }, { id: null }];
    if (bindingKey.startsWith('request')) changes.push({ number: 8 }, { number: '7' }, { branch: 'foreign' }, { branch_id: 'foreign' }, { into_branch: 'foreign' });
    for (const change of changes) {
      const rows = list ? [row, { ...row, ...change }] : [{ ...row, ...change }];
      assert.throws(() => prepared.project(wire(response(rows))), error => !String(error).includes(canary));
    }
  });

  test(`${adapter.operationId}: malformed fields and bounded transport refuse`, () => {
    const prepared = adapter.prepare(scope, args);
    for (const key of Object.keys(expected)) {
      const wireKey = ({ deploymentState: 'deployment_state', branchDeleted: 'branch_deleted', branchId: 'branch_id', intoBranch: 'into_branch' })[key] ?? key;
      for (const invalid of [null, {}, canary]) assert.throws(() => prepared.project(wire(response([{ ...row, [wireKey]: invalid }]))), error => !String(error).includes(canary));
    }
    for (const body of [new Uint8Array(), new Uint8Array(65537), new Uint8Array([0xff]), wire(null), wire([]), wire({}), wire(canary)]) assert.throws(() => prepared.project(body), error => !String(error).includes(canary));
    if (list) {
      for (const body of [{ ...page([row]), current_page: 2 }, { ...page([row]), per_page: 11 }, { ...page([row]), next_page: 3 }, page([row, row, row]), page([null])]) assert.throws(() => prepared.project(wire(body)));
      assert.equal(prepared.project(wire({ ...page([row]), next_page: 2 })).complete, false);
      assert.throws(() => adapter.prepare(scope, { page: 100, perPage: 2 }).project(wire({ ...page([row]), current_page: 100, next_page: 101 })));
    }
  });

  test(`${adapter.operationId}: closed scopes and arguments cannot select authority or resources`, () => {
    for (const key of ['url', 'headers', 'credential', 'sql', 'agentId', 'approval', 'production', 'all', 'state', 'branch', 'number']) assert.throws(() => adapter.prepare(scope, { ...args, [key]: canary }));
    for (const value of [null, [], { ...scope, extra: true }, { ...scope, organization: '../escape' }, { ...scope, database: 'a?b' }]) assert.throws(() => adapter.prepare(value, args));
    const hostile = Object.defineProperty({ ...scope }, 'organization', { get() { throw new Error(canary); }, enumerable: true });
    assert.throws(() => adapter.prepare(hostile, args), error => !String(error).includes(canary));
    if (list) {
      for (const value of [[], Array(33).fill(scope[bindingKey][0]), [scope[bindingKey][0], scope[bindingKey][0]], ['../escape']]) assert.throws(() => adapter.prepare({ ...scope, [bindingKey]: value }, args));
      for (const value of [{ page: 0, perPage: 2 }, { page: 101, perPage: 2 }, { page: 1, perPage: 11 }, { page: '1', perPage: 2 }]) assert.throws(() => adapter.prepare(scope, value));
    } else {
      assert.throws(() => adapter.prepare({ ...scope, [bindingKey]: bindingKey === 'request' ? { ...deployBinding, number: 0 } : '../escape' }, args));
    }
  });

  test(`${adapter.operationId}: input mutation after prepare cannot widen or retarget scope`, () => {
    const copy = structuredClone(scope);
    const copiedArgs = structuredClone(args);
    const prepared = adapter.prepare(copy, copiedArgs);
    copy.organization = 'other-org';
    if (bindingKey === 'requests') { copy.requests[0].branchId = 'foreign'; copy.requests.push({ ...deployBinding, id: 'foreign', number: 8 }); }
    else if (bindingKey === 'request') copy.request.id = 'foreign';
    else if (list) copy[bindingKey].push('foreign');
    else copy[bindingKey] = 'foreign';
    if (list) copiedArgs.page = 2;
    assert.deepEqual(prepared.project(wire(response([row]))), list ? { items: [expected], nextPage: null, complete: true } : expected);
    assert.throws(() => prepared.project(wire(response([{ ...row, id: 'foreign' }]))));
  });
}

test('deploy request binding rejects duplicate IDs and numbers independently', () => {
  for (const second of [{ ...deployBinding, id: 'other' }, { ...deployBinding, number: 8 }]) assert.throws(() => deploys.prepare({ ...databaseScope, requests: [deployBinding, second] }, { page: 1, perPage: 2 }));
  for (const value of [{ ...deployBinding, number: 2147483648 }, { ...deployBinding, number: -0 }, { ...deployBinding, branch: '../main' }, { ...deployBinding, approved: true }]) assert.throws(() => deploy.prepare({ ...databaseScope, request: value }, {}));
});

test('all pinned backup and deploy status enum values remain projectable', async () => {
  const schema = JSON.parse(gunzipSync(await readFile(new URL('../api/upstream/openapi-v1.json.gz', import.meta.url))).toString());
  for (const state of schema.definitions.Backup.properties.state.enum) assert.equal(backup.prepare({ ...branchScope, backupId: 'bk123' }, {}).project(wire({ ...backupRow, state })).state, state);
  for (const state of schema.definitions.DatabaseDeployRequest.properties.state.enum) assert.equal(deploy.prepare({ ...databaseScope, request: deployBinding }, {}).project(wire({ ...deployRow, state })).state, state);
  for (const deployment_state of schema.definitions.DatabaseDeployRequest.properties.deployment_state.enum) assert.equal(deploy.prepare({ ...databaseScope, request: deployBinding }, {}).project(wire({ ...deployRow, deployment_state })).deploymentState, deployment_state);
});
