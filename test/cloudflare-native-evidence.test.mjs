import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCloudflareNativeCaptureSink, createCloudflareNativeCaptureReader } from "../dist/plugins/cloudflare-broker/src/native-evidence.js";
import { createCloudflareReadBroker } from "../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary } from "../packages/core/testing/provider-fixture.mjs";

const record = { contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-current-content-projection",
  event: "event-one", targetHash: "a".repeat(64), valueHash: "b".repeat(64) };
const unavailable = /^Error: cloudflare\.evidence\.unavailable$/;
// SQL-backed synthetic port only; not PostgreSQL, host admission or durability qualification.
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "cloudflare-native-evidence-"));
  const path = join(directory, "evidence.sqlite"), connections = [], calls = [];
  const connect = () => { const db = new DatabaseSync(path, { timeout: 5000 }); connections.push(db); return db; };
  const db = connect();
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE cloudflare_capture_evidence (event TEXT PRIMARY KEY, contract TEXT NOT NULL,
      subject TEXT NOT NULL, target_hash TEXT NOT NULL, value_hash TEXT NOT NULL);`);
  const port = (connection = db) => ({ namespace: "main", async execute(sql, params) {
    calls.push({ sql, params });
    return { rowCount: Number(connection.prepare(sql).run(Object.fromEntries(params.map((v, i) => [`$${i + 1}`, v]))).changes) };
  }, async query(sql, params) {
    calls.push({ sql, params });
    return connection.prepare(sql).all(Object.fromEntries(params.map((v, i) => [`$${i + 1}`, v])));
  } });
  t.after(() => { for (const connection of connections) connection.close(); rmSync(directory, { recursive: true }); });
  return { db, calls, connect, port, sink: createCloudflareNativeCaptureSink(port()), reader: createCloudflareNativeCaptureReader(port()),
    rows: () => db.prepare("SELECT * FROM cloudflare_capture_evidence ORDER BY event").all().map(row => ({ ...row })) };
}
function core(t, kind = "content", wrap = port => port) {
  const sql = fixture(t), f = providerFixture({ authority: kind === "content" ? true : null });
  const accountId = "c".repeat(32), requests = [];
  const scope = { accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName: "safe-pages", projectId: "project-id", deploymentIds: [] }],
    pagesPagination: { projects: true, deploymentProjects: [] } };
  const source = { accountId, revision: "resource-1", sourceDigestScriptNames: ["safe-worker"] };
  const tool = kind === "content" ? "cloudflare.workers.current_content.digest" : "cloudflare.pages.projects.list";
  const args = kind === "content" ? { scriptName: "safe-worker" } : { page: 1, perPage: 10 };
  const operation = cloudflareReadOperations(scope, source).find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(args).resource.id] };
  const broker = createCloudflareReadBroker(scope, source, f.dependencies, createCloudflareNativeCaptureSink(wrap(sql.port())), async (url, init) => {
    requests.push(url); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return kind === "content" ? new Response("--fixture\r\nContent-Disposition: form-data; name=\"main.js\"\r\n\r\nprivate-source\r\n--fixture--\r\n",
      { headers: { "content-type": "multipart/form-data; boundary=fixture" } }) :
      new Response(JSON.stringify({ success: true, errors: [], result: [{ id: "project-id", name: "safe-pages" }],
        result_info: { page: 1, per_page: 10, total_pages: 1 } }), { headers: { "content-type": "application/json" } });
  });
  return { ...f, sql, requests, invoke: (key = "call-one") => broker.call(tool, args, "verified-runtime", key) };
}

test("Cloudflare candidate capture ports snapshot namespace/methods and expose append or exact read only", async () => {
  const calls = [];
  const db = { namespace: "plugin_example", async execute(sql, params) { calls.push({ sql, params, receiver: this }); return { rowCount: 1 }; },
    async query(sql, params) { calls.push({ sql, params, receiver: this }); return []; } };
  const sink = createCloudflareNativeCaptureSink(db), reader = createCloudflareNativeCaptureReader(db);
  db.namespace = "foreign"; db.execute = db.query = () => { throw Error("mutated"); };
  await sink.append(record); assert.equal(await reader.read(record), null);
  assert.deepEqual(Object.keys(sink), ["append"]); assert.deepEqual(Object.keys(reader), ["read"]);
  assert.ok(Object.isFrozen(sink) && Object.isFrozen(reader)); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.receiver === db && call.sql.includes('"plugin_example"."cloudflare_capture_evidence"')));
  assert.deepEqual(calls[0].params, [record.event, record.contract, record.subject, record.targetHash, record.valueHash]);
  assert.deepEqual(calls[1].params, [record.event]); assert.match(calls[1].sql, /WHERE event = \$1 LIMIT 2$/);
  assert.ok(calls.every(call => !/UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|ON CONFLICT/i.test(call.sql)));
  for (const namespace of [null, "", "a".repeat(64), "x.y", 'x"; DROP TABLE x', "PUBLIC", "a-b"]) {
    assert.throws(() => createCloudflareNativeCaptureSink({ ...db, namespace }), unavailable);
    assert.throws(() => createCloudflareNativeCaptureReader({ ...db, namespace }), unavailable);
  }
  assert.throws(() => createCloudflareNativeCaptureSink({ namespace: "main" }), unavailable);
  assert.throws(() => createCloudflareNativeCaptureReader({ namespace: "main" }), unavailable);
});

test("Cloudflare candidate captures persist across connections and refuse duplicate or rebound events", async t => {
  const f = fixture(t); assert.equal(await f.reader.read(record), null);
  await f.sink.append(record);
  const reader = createCloudflareNativeCaptureReader(f.port(f.connect()));
  const out = await reader.read(record); assert.deepEqual(out, record); assert.ok(Object.isFrozen(out));
  const sink = createCloudflareNativeCaptureSink(f.port(f.connect()));
  for (const change of [{}, { targetHash: "d".repeat(64) }, { valueHash: "e".repeat(64) }, { subject: "credential-filtered-pages-list-projection" }]) {
    await assert.rejects(sink.append({ ...record, ...change }), unavailable);
    if (Object.keys(change).length) await assert.rejects(reader.read({ ...record, ...change }), unavailable);
  }
  assert.equal(f.rows().length, 1); assert.deepEqual(await reader.read(record), record);
  const other = { ...record, event: "pages-event", subject: "credential-filtered-pages-list-projection" };
  await sink.append(other); assert.deepEqual(await reader.read(other), other);
});

test("Cloudflare candidate captures validate closed bounded records before SQL", async t => {
  const f = fixture(t);
  const bad = [undefined, null, [], {}, { ...record, extra: credentialCanary },
    ...[null, "", "a".repeat(81), "event\n"].map(event => ({ ...record, event })),
    ...[null, "", "A".repeat(64), "x".repeat(65)].flatMap(hash => [{ ...record, targetHash: hash }, { ...record, valueHash: hash }]),
    { ...record, contract: "unknown" }, { ...record, subject: "unknown" }];
  let accesses = 0;
  bad.push(Object.defineProperty({ ...record }, "valueHash", { enumerable: true, get() { accesses++; return record.valueHash; } }));
  for (const value of bad) {
    await assert.rejects(f.sink.append(value), unavailable); await assert.rejects(f.reader.read(value), unavailable);
  }
  assert.equal(accesses, 0); assert.equal(f.calls.length, 0);
});

test("Cloudflare candidate capture reader refuses duplicate/corrupt/foreign rows and fixed errors redact diagnostics", async () => {
  const row = { event: record.event, contract: record.contract, subject: record.subject, target_hash: record.targetHash, value_hash: record.valueHash };
  for (const rows of [undefined, null, {}, [null], [[]], [row, row], [{ ...row, extra: credentialCanary }],
    ...Object.keys(row).map(key => [{ ...row, [key]: "foreign" }])]) {
    const reader = createCloudflareNativeCaptureReader({ namespace: "main", async query() { return rows; } });
    await assert.rejects(reader.read(record), unavailable);
  }
  for (const result of [undefined, null, {}, { rowCount: 0 }, { rowCount: "1" }, { rowCount: 2 }]) {
    const sink = createCloudflareNativeCaptureSink({ namespace: "main", async execute() { return result; } });
    await assert.rejects(sink.append(record), unavailable);
  }
  const fails = { namespace: "main", async execute() { throw Error(credentialCanary); }, async query() { throw Error(credentialCanary); } };
  for (const pending of [createCloudflareNativeCaptureSink(fails).append(record), createCloudflareNativeCaptureReader(fails).read(record)]) {
    await assert.rejects(pending, error => error.message === "cloudflare.evidence.unavailable" && error.cause === undefined && !error.stack.includes(credentialCanary));
  }
});

test("Cloudflare candidate capture sink does not retry a lost acknowledgment or overwrite the retained observation", async t => {
  const f = fixture(t), port = f.port(); let writes = 0;
  const sink = createCloudflareNativeCaptureSink({ ...port, async execute(sql, params) {
    writes++; await port.execute(sql, params); throw Error(credentialCanary);
  } });
  await assert.rejects(sink.append(record), unavailable); assert.equal(writes, 1);
  assert.deepEqual(await f.reader.read(record), record);
  await assert.rejects(f.sink.append(record), unavailable); assert.equal(f.rows().length, 1);
});

test("Cloudflare actual-core content and Pages calls bind SQL captures to exact filtered values, targets and outcomes", async t => {
  for (const kind of ["content", "pages"]) {
    const f = core(t, kind), out = await f.invoke(); assert.equal(out.ok, true);
    const expected = { ...record, subject: kind === "content" ? record.subject : "credential-filtered-pages-list-projection",
      event: out.event, targetHash: f.audit[0].targetHash, valueHash: canonicalHash(out.value) };
    assert.deepEqual(await f.sql.reader.read(expected), expected);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.ok(f.audit.some(row => row.event === out.event && row.phase === "outcome" && row.decision === "ALLOW"));
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); assert.equal(f.sql.rows().length, 1);
    assert.equal(f.calls.close, 1);
    assert.ok(!JSON.stringify({ rows: f.sql.rows(), out, audit: f.audit }).includes(credentialCanary));
    assert.ok(!JSON.stringify(f.sql.rows()).includes("private-source"));
  }
});

test("Cloudflare actual-core capture failure or lost acknowledgment suppresses output and preserves uncertain replay", async t => {
  for (const lost of [false, true]) {
    const f = core(t, "content", port => ({ ...port, async execute(sql, params) {
      if (lost) await port.execute(sql, params); throw Error(credentialCanary);
    } }));
    const out = await f.invoke(); assert.equal(out.code, "OUTCOME_UNCERTAIN"); assert.equal(out.value, undefined);
    assert.equal(f.sql.rows().length, lost ? 1 : 0); assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.ok(!f.audit.some(row => row.phase === "outcome" && row.decision === "ALLOW"));
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  }
});

test("Cloudflare actual-core success waits for the SQL capture acknowledgment", async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const acknowledged = new Promise(resolve => { release = resolve; });
  const f = core(t, "pages", port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params); enter(); await acknowledged; return result;
  } }));
  let settled = false;
  const pending = f.invoke().then(out => { settled = true; return out; });
  await Promise.race([entered, pending.then(() => assert.fail("returned before SQL acknowledgment"))]);
  assert.equal(settled, false); assert.equal(f.sql.rows().length, 1); assert.equal(f.calls.close, 1);
  assert.ok(!f.audit.some(row => row.phase === "outcome" && row.decision === "ALLOW"));
  release(); assert.equal((await pending).ok, true);
});

test("Cloudflare retained SQL capture cannot establish success after subsequent actual-core outcome audit failure", async t => {
  const f = core(t, "pages"), append = f.dependencies.audit.append;
  f.dependencies.audit.append = async row => { if (row.phase === "outcome" && row.decision === "ALLOW") throw Error(credentialCanary); await append(row); };
  const out = await f.invoke(); assert.equal(out.code, "OUTCOME_UNCERTAIN"); assert.equal(out.value, undefined);
  assert.equal(f.sql.rows().length, 1); assert.equal([...f.journal.values()][0].outcome, "uncertain");
  assert.ok(!f.audit.some(row => row.phase === "outcome" && row.decision === "ALLOW"));
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.sql.rows().length, 1);
});
