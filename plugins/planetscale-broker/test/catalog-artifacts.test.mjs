import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as catalog from '../../../dist/plugins/planetscale-broker/src/catalog-artifacts.js';

const wire = value => new TextEncoder().encode(JSON.stringify(value));
const secret = 'synthetic-secret://NEVER-RETURN-this-value';
const fixtures = [
  [catalog.targetIdentity, { currentUser: 'inspector', sessionUser: 'inspector', database: 'example' }],
  [catalog.roles, { oid: '10', name: 'inspector', superuser: false, createRole: false, createDatabase: false, login: true, inherit: false, replication: false, bypassRls: false, connectionLimit: 1, validUntil: null }],
  [catalog.roleEdges, { roleOid: '10', memberOid: '11', grantorOid: '12', admin: true, inherit: false, set: true }],
  [catalog.databasePaths, { oid: '10', name: 'example', ownerOid: '11', acl: null, allowConnections: true }],
  [catalog.namespaces, { oid: '10', name: 'public', ownerOid: '11', acl: '{=U/owner}' }],
  [catalog.relations, { oid: '10', namespaceOid: '11', name: 'widgets', kind: 'r', ownerOid: '12', acl: null, rowSecurity: true, forceRowSecurity: false }],
  [catalog.columns, { relationOid: '10', number: 1, name: 'id', typeOid: '23', dropped: false, acl: null }],
  [catalog.defaults, { oid: '10', creatorOid: '11', namespaceOid: '0', kind: 'r', acl: '{reader=r/owner}' }],
  [catalog.functions, { oid: '10', namespaceOid: '11', name: 'example', ownerOid: '12', kind: 'f', securityDefiner: false, volatility: 'v', acl: null }],
];

for (const [artifact, row] of fixtures) {
  test(`${artifact.tool}: fixed bounded artifact and typed receipt, never an execution grant`, () => {
    assert.ok(Object.isFrozen(artifact));
    assert.equal(artifact.sha256, createHash('sha256').update(artifact.statement).digest('hex'));
    assert.match(artifact.statement, /^SELECT\n/);
    assert.match(artifact.statement, /LIMIT 1001$/);
    assert.equal(artifact.plane, 'postgresql-catalog');
    assert.equal(artifact.lifecycle, 'waking-requires-authorized-window');
    assert.equal(artifact.rowLimit, 1000);
    assert.equal(artifact.byteLimit, 262144);
    const prepared = artifact.prepare({});
    assert.ok(Object.isFrozen(prepared));
    assert.equal(prepared.statement, artifact.statement);
    const receipt = prepared.project(wire([row]));
    assert.deepEqual(JSON.parse(JSON.stringify(receipt.rows)), [row]);
    assert.equal(receipt.completeness, 'unverified');
    assert.equal(receipt.effectiveRights, 'not-computed');
    assert.ok(Object.isFrozen(receipt));
    assert.ok(Object.isFrozen(receipt.rows));
    assert.ok(Object.isFrozen(receipt.rows[0]));
    // Empty catalogs never prove absence or effective exclusion.
    assert.equal(prepared.project(wire([])).completeness, 'unverified');
  });

  test(`${artifact.tool}: no SQL, target, credential, window or approval arguments`, () => {
    for (const invalid of [null, [], 1, 'SELECT 1', { sql: 'SELECT 1' }, { database: 'main' }, { target: 'other' }, { credential: secret }, { approval: true }, { window: 'now' }, { after: 0 }, JSON.parse('{"__proto__":{}}')]) {
      assert.throws(() => artifact.prepare(invalid), error => !String(error).includes(secret));
    }
  });

  test(`${artifact.tool}: bounded decode, overflow sentinel and forbidden fields refuse`, () => {
    const prepared = artifact.prepare({});
    for (const invalid of [new Uint8Array(), new Uint8Array(262145), new Uint8Array([0xff]), wire(null), wire({ rows: [row] }), wire([null]), wire([{}]), wire([{ ...row, password: secret }]), wire(Array(1001).fill(row))]) {
      assert.throws(() => prepared.project(invalid), error => !String(error).includes(secret));
    }
    assert.throws(() => prepared.project(new TextEncoder().encode('[{"password":"' + secret)), error => !String(error).includes(secret));
  });
}

test('catalog statement allowlist excludes content, secret, configuration and execution APIs', () => {
  assert.equal(Object.keys(catalog).length, fixtures.length);
  assert.equal(new Set(fixtures.map(([artifact]) => artifact.tool)).size, fixtures.length);
  const forbidden = /\b(?:rolpassword|rolconfig|pg_authid|attmissingval|prosrc|probin|prosqlbody|proargdefaults|proconfig|pg_settings|pg_stat_activity|pg_stat_statements|pg_get_functiondef|pg_get_viewdef|pg_get_expr|pg_sleep|dblink|lo_export|SELECT\s+\*|INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|REVOKE)\b/i;
  for (const [artifact] of fixtures) {
    assert.doesNotMatch(artifact.statement, forbidden);
    assert.doesNotMatch(artifact.statement, /;|\$\d|--|\/\*/);
    assert.doesNotMatch(artifact.statement, /\b(?:public|drizzle|web_v1)\./);
  }
});

test('ACL NULL/defaults, PUBLIC and ADMIN/INHERIT/SET distinctions survive projection', () => {
  const relation = fixtures.find(([artifact]) => artifact === catalog.relations)[1];
  const edge = fixtures.find(([artifact]) => artifact === catalog.roleEdges)[1];
  const database = fixtures.find(([artifact]) => artifact === catalog.databasePaths)[1];
  assert.equal(catalog.relations.prepare({}).project(wire([relation])).rows[0].acl, null);
  assert.equal(catalog.databasePaths.prepare({}).project(wire([{ ...database, acl: '{=Tc/owner}' }])).rows[0].acl, '{=Tc/owner}');
  assert.deepEqual(JSON.parse(JSON.stringify(catalog.roleEdges.prepare({}).project(wire([edge])).rows[0])), edge);
  for (const acl of ['reader=r/owner', 1, secret, '{bad\nvalue}', '{' + 'x'.repeat(4096) + '}']) {
    assert.throws(() => catalog.relations.prepare({}).project(wire([{ ...relation, acl }])));
  }
});

test('OID and scalar ambiguity refuses instead of claiming effective access', () => {
  const row = fixtures.find(([artifact]) => artifact === catalog.roles)[1];
  for (const oid of ['-1', '01', '1.0', '4294967296', 10, 'x', '', '10\n']) {
    assert.throws(() => catalog.roles.prepare({}).project(wire([{ ...row, oid }])));
  }
  for (const changes of [{ login: 'true' }, { connectionLimit: -2 }, { name: 'unsafe\nname' }, { validUntil: {} }]) {
    assert.throws(() => catalog.roles.prepare({}).project(wire([{ ...row, ...changes }])));
  }
});
