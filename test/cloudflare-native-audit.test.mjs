import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCloudflareNativeAuditSink, createCloudflareNativeAuditReader } from "../dist/plugins/cloudflare-broker/src/native-audit.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary } from "../packages/core/testing/provider-fixture.mjs";

const record = { event: "event-one", time: 1000, phase: "intent", decision: "ALLOW",
  contract: "toolkit.provider-broker/v1", provider: "cloudflare", tool: "cloudflare.pages.projects.list",
  principalHash: "a".repeat(64), targetHash: "b".repeat(64) };
const unavailable = /^Error: cloudflare\.audit\.unavailable$/;
const columns = input => ({ event: input.event, time: input.time, phase: input.phase, decision: input.decision,
  contract: input.contract, provider: input.provider, tool: input.tool, principal_hash: input.principalHash, target_hash: input.targetHash });
// SQL-backed synthetic port only, not PostgreSQL/host/durability qualification.
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "cloudflare-native-audit-"));
  const path = join(directory, "audit.sqlite"), connections = [], calls = [];
  const connect = () => { const db = new DatabaseSync(path, { timeout: 5000 }); connections.push(db); return db; };
  const db = connect();
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE cloudflare_provider_audit (event TEXT NOT NULL, phase TEXT NOT NULL, time INTEGER NOT NULL,
      decision TEXT NOT NULL, contract TEXT NOT NULL, provider TEXT NOT NULL, tool TEXT,
      principal_hash TEXT, target_hash TEXT, PRIMARY KEY (event, phase));`);
  const port = (connection = db) => ({ namespace: "main", async execute(sql, params) {
    calls.push({ sql, params });
    return { rowCount: Number(connection.prepare(sql).run(Object.fromEntries(params.map((v, i) => [`$${i + 1}`, v]))).changes) };
  }, async query(sql, params) {
    calls.push({ sql, params });
    return connection.prepare(sql).all(Object.fromEntries(params.map((v, i) => [`$${i + 1}`, v])));
  } });
  t.after(() => { for (const connection of connections) connection.close(); rmSync(directory, { recursive: true }); });
  return { db, calls, connect, port, sink: createCloudflareNativeAuditSink(port()), reader: createCloudflareNativeAuditReader(port()),
    rows: () => db.prepare("SELECT * FROM cloudflare_provider_audit ORDER BY event, phase").all().map(row => ({ ...row })) };
}
function core(t, wrap = port => port) {
  const sql = fixture(t), f = providerFixture(), requests = [], captures = [];
  const scope = { accountId: "c".repeat(32), revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName: "safe-pages", projectId: "project-id", deploymentIds: [] }],
    pagesPagination: { projects: true, deploymentProjects: [] } };
  const tool = "cloudflare.pages.projects.list", args = { page: 1, perPage: 10 };
  const operation = cloudflareReadOperations(scope).find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(args).resource.id] };
  const sink = createCloudflareNativeAuditSink(wrap(sql.port()));
  f.dependencies.audit = { async append(row) { f.audit.push(row); await sink.append(row); } };
  const broker = createCloudflareReadBroker(scope, undefined, f.dependencies, { async append(row) { captures.push(row); } }, async (url, init) => {
    requests.push(url); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(JSON.stringify({ success: true, errors: [], result: [{ id: "project-id", name: "safe-pages" }],
      result_info: { page: 1, per_page: 10, total_pages: 1 } }), { headers: { "content-type": "application/json" } });
  });
  return { ...f, sql, requests, captures, invoke: (key = "call-one") => broker.call(tool, args, "verified-runtime", key) };
}

test("Cloudflare candidate audit ports capture namespace/methods and expose append or exact read only", async () => {
  const calls = [];
  const db = { namespace: "plugin_example", async execute(sql, params) { calls.push({ sql, params, receiver: this }); return { rowCount: 1 }; },
    async query(sql, params) { calls.push({ sql, params, receiver: this }); return []; } };
  const sink = createCloudflareNativeAuditSink(db), reader = createCloudflareNativeAuditReader(db);
  db.namespace = "foreign"; db.execute = db.query = () => { throw Error("mutated"); };
  await sink.append(record); assert.equal(await reader.read(record), null);
  assert.deepEqual(Object.keys(sink), ["append"]); assert.deepEqual(Object.keys(reader), ["read"]);
  assert.ok(Object.isFrozen(sink) && Object.isFrozen(reader)); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.receiver === db && call.sql.includes('"plugin_example"."cloudflare_provider_audit"')));
  assert.deepEqual(calls[0].params, [record.event, record.phase, record.time, record.decision, record.contract, record.provider,
    record.tool, record.principalHash, record.targetHash]);
  assert.deepEqual(calls[1].params, [record.event, record.phase]); assert.match(calls[1].sql, /WHERE event = \$1 AND phase = \$2 LIMIT 2$/);
  assert.ok(calls.every(call => !/UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|ON CONFLICT/i.test(call.sql)));
  for (const namespace of [null, "", "a".repeat(64), "x.y", 'x"; DROP TABLE x', "PUBLIC", "a-b"]) {
    assert.throws(() => createCloudflareNativeAuditSink({ ...db, namespace }), unavailable);
    assert.throws(() => createCloudflareNativeAuditReader({ ...db, namespace }), unavailable);
  }
  assert.throws(() => createCloudflareNativeAuditSink({ namespace: "main" }), unavailable);
  assert.throws(() => createCloudflareNativeAuditReader({ namespace: "main" }), unavailable);
});

test("Cloudflare candidate audits reopen and refuse duplicate or rebound event phases without overwriting", async t => {
  const f = fixture(t); assert.equal(await f.reader.read(record), null);
  await f.sink.append(record);
  const reader = createCloudflareNativeAuditReader(f.port(f.connect())), sink = createCloudflareNativeAuditSink(f.port(f.connect()));
  const out = await reader.read(record); assert.deepEqual(out, record); assert.ok(Object.isFrozen(out));
  for (const change of [{}, { time: 1001 }, { targetHash: "d".repeat(64) }, { principalHash: "e".repeat(64) }, { tool: "cloudflare.accounts.list" }]) {
    await assert.rejects(sink.append({ ...record, ...change }), unavailable);
    if (Object.keys(change).length) await assert.rejects(reader.read({ ...record, ...change }), unavailable);
  }
  const outcome = { ...record, phase: "outcome", time: 1002 };
  await sink.append(outcome); assert.deepEqual(await reader.read(outcome), outcome); assert.equal(f.rows().length, 2);
  const refusal = { ...record, event: "refusal", phase: "refused", decision: "UNKNOWN_TOOL", tool: null, principalHash: null, targetHash: null, time: 0 };
  await sink.append(refusal); assert.deepEqual(await reader.read(refusal), refusal);
  for (const decision of ["INVALID_ARGUMENTS", "UNKNOWN_TOOL", "IDENTITY_UNAVAILABLE", "POLICY_DENIED", "POLICY_CHANGED", "RESOURCE_CHANGED",
    "AUTHORIZATION_UNAVAILABLE", "AUTHORIZATION_DENIED", "REPLAY_CONFLICT", "AUDIT_UNAVAILABLE", "DEPENDENCY_UNAVAILABLE", "CREDENTIAL_UNAVAILABLE",
    "OUTPUT_REFUSED", "UPSTREAM_UNAVAILABLE", "OUTCOME_UNCERTAIN"]) {
    const row = { ...record, event: decision, phase: "outcome", decision };
    await sink.append(row); assert.deepEqual(await reader.read(row), row);
  }
});

test("Cloudflare candidate audit validation is closed bounded Cloudflare-only and occurs before SQL", async t => {
  const f = fixture(t), bad = [null, [], {}, { ...record, extra: credentialCanary },
    ...[null, "", "a".repeat(81), "event\n"].map(event => ({ ...record, event })),
    ...[-1, -0, 1.5, "1000", Number.MAX_SAFE_INTEGER + 1, NaN].map(time => ({ ...record, time })),
    { ...record, provider: "foreign" }, { ...record, contract: "unknown" }, { ...record, phase: "unknown" }, { ...record, decision: "unknown" },
    { ...record, tool: "foreign.tool" }, { ...record, tool: "cloudflare." }, { ...record, tool: "cloudflare." + "x".repeat(118) },
    { ...record, phase: "refused" }, { ...record, decision: "POLICY_DENIED" },
    { ...record, targetHash: null }, { ...record, principalHash: null }, { ...record, tool: null },
    ...["", "A".repeat(64), "x".repeat(65)].flatMap(hash => [{ ...record, targetHash: hash }, { ...record, principalHash: hash }])];
  let accesses = 0;
  bad.push(Object.defineProperty({ ...record }, "targetHash", { enumerable: true, get() { accesses++; return record.targetHash; } }));
  for (const row of bad) { await assert.rejects(f.sink.append(row), unavailable); await assert.rejects(f.reader.read(row), unavailable); }
  assert.equal(accesses, 0); assert.equal(f.calls.length, 0);
});

test("Cloudflare candidate audit readers reject corrupt duplicate foreign rows and redact all port errors", async () => {
  const row = columns(record);
  for (const rows of [undefined, null, {}, [null], [[]], [row, row], [{ ...row, extra: credentialCanary }],
    ...Object.keys(row).map(key => [{ ...row, [key]: "foreign" }])]) {
    const reader = createCloudflareNativeAuditReader({ namespace: "main", async query() { return rows; } });
    await assert.rejects(reader.read(record), unavailable);
  }
  for (const result of [undefined, null, {}, { rowCount: 0 }, { rowCount: "1" }, { rowCount: 2 }]) {
    const sink = createCloudflareNativeAuditSink({ namespace: "main", async execute() { return result; } });
    await assert.rejects(sink.append(record), unavailable);
  }
  const fails = { namespace: "main", async execute() { throw Error(credentialCanary); }, async query() { throw Error(credentialCanary); } };
  for (const pending of [createCloudflareNativeAuditSink(fails).append(record), createCloudflareNativeAuditReader(fails).read(record)]) {
    await assert.rejects(pending, error => error.message === "cloudflare.audit.unavailable" && error.cause === undefined && !error.stack.includes(credentialCanary));
  }
});

test("Cloudflare candidate audit lost acknowledgment is never retried and retained phases cannot be replaced", async t => {
  const f = fixture(t), port = f.port(); let writes = 0;
  const sink = createCloudflareNativeAuditSink({ ...port, async execute(sql, params) {
    writes++; await port.execute(sql, params); throw Error(credentialCanary);
  } });
  await assert.rejects(sink.append(record), unavailable); assert.equal(writes, 1);
  assert.deepEqual(await f.reader.read(record), record);
  await assert.rejects(f.sink.append({ ...record, decision: "AUDIT_UNAVAILABLE", phase: "intent" }), unavailable);
  await assert.rejects(f.sink.append(record), unavailable); assert.equal(f.rows().length, 1);
});

test("Cloudflare actual-core SQL audit binds success and replay to exact principal target capture and journal", async t => {
  const f = core(t), out = await f.invoke(); assert.equal(out.ok, true);
  for (const row of f.audit) assert.deepEqual(await f.sql.reader.read(row), row);
  const intent = f.audit.find(row => row.phase === "intent"), outcome = f.audit.find(row => row.phase === "outcome");
  assert.equal(intent.principalHash, canonicalHash(f.vector.principal)); assert.equal(outcome.decision, "ALLOW");
  assert.equal(intent.targetHash, outcome.targetHash); assert.equal(intent.event, out.event);
  assert.equal(f.captures[0].event, out.event); assert.equal(f.captures[0].targetHash, intent.targetHash);
  assert.equal(f.captures[0].valueHash, canonicalHash(out.value)); assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  assert.ok(!JSON.stringify({ rows: f.sql.rows(), out }).includes(credentialCanary));
  f.vector.policy.agents = []; const denied = await f.invoke("denied"); assert.equal(denied.code, "POLICY_DENIED");
  const row = f.audit.find(row => row.event === denied.event); assert.equal(row.targetHash, null); assert.deepEqual(await f.sql.reader.read(row), row);
});

test("Cloudflare actual-core intent SQL failure or lost acknowledgment denies before credentials and network", async t => {
  for (const lost of [false, true]) {
    let failed = false;
    const f = core(t, port => ({ ...port, async execute(sql, params) {
      if (!failed && params[1] === "intent") { failed = true; if (lost) await port.execute(sql, params); throw Error(credentialCanary); }
      return port.execute(sql, params);
    } }));
    const out = await f.invoke(); assert.equal(out.code, "AUDIT_UNAVAILABLE"); assert.equal(out.value, undefined);
    assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0); assert.equal(f.journal.size, 0); assert.equal(f.captures.length, 0);
    assert.equal(f.sql.rows().filter(row => row.phase === "intent").length, lost ? 1 : 0);
    assert.equal(f.sql.rows().find(row => row.phase === "refused").decision, "AUDIT_UNAVAILABLE");
  }
});

test("Cloudflare actual-core outcome SQL failure or lost acknowledgment suppresses output and preserves uncertain replay", async t => {
  for (const lost of [false, true]) {
    const f = core(t, port => ({ ...port, async execute(sql, params) {
      if (params[1] === "outcome" && params[3] === "ALLOW") { if (lost) await port.execute(sql, params); throw Error(credentialCanary); }
      return port.execute(sql, params);
    } }));
    const out = await f.invoke(); assert.equal(out.code, "OUTCOME_UNCERTAIN"); assert.equal(out.value, undefined);
    assert.equal(f.captures.length, 1); assert.equal([...f.journal.values()][0].outcome, "uncertain");
    const outcome = f.sql.rows().find(row => row.phase === "outcome");
    assert.equal(outcome.decision, lost ? "ALLOW" : "OUTCOME_UNCERTAIN");
    if (lost) assert.deepEqual(await f.sql.reader.read(f.audit.find(row => row.phase === "outcome" && row.decision === "ALLOW")),
      f.audit.find(row => row.phase === "outcome" && row.decision === "ALLOW"));
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  }
});

test("Cloudflare actual-core output waits for SQL outcome acknowledgment even after capture and journal completion", async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), acknowledged = new Promise(resolve => { release = resolve; });
  const f = core(t, port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params);
    if (params[1] === "outcome" && params[3] === "ALLOW") { enter(); await acknowledged; }
    return result;
  } }));
  let settled = false; const pending = f.invoke().then(out => { settled = true; return out; });
  await Promise.race([entered, pending.then(() => assert.fail("returned before SQL acknowledgment"))]);
  assert.equal(settled, false); assert.equal(f.captures.length, 1); assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal(f.sql.rows().find(row => row.phase === "outcome").decision, "ALLOW");
  release(); assert.equal((await pending).ok, true);
});
