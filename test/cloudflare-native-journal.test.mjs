import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createCloudflareNativeJournal, createCloudflareNativeJournalReader } from "../dist/plugins/cloudflare-broker/src/native-journal.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary } from "../packages/core/testing/provider-fixture.mjs";

const key = "a".repeat(64), target = "b".repeat(64), event = "event-one";
// SQLite executes the candidate SQL for isolated source tests only. This does
// not qualify PostgreSQL, the native restricted SQL evaluator or host durability.
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "cloudflare-native-journal-"));
  const path = join(directory, "journal.sqlite");
  const connections = [];
  const connect = () => {
    const db = new DatabaseSync(path, { timeout: 5000 }); connections.push(db);
    return db;
  };
  const db = connect();
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE cloudflare_provider_calls (
      key TEXT PRIMARY KEY, target TEXT NOT NULL, event TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('pending','complete','refused','uncertain'))
    );`);
  const calls = [];
  const port = (connection = db) => ({ namespace: "main", async execute(sql, params) {
    calls.push({ sql, params });
    return { rowCount: Number(connection.prepare(sql).run(Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value]))).changes) };
  }, async query(sql, params) {
    calls.push({ sql, params });
    return connection.prepare(sql).all(Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value])));
  } });
  t.after(() => { for (const connection of connections) connection.close(); rmSync(directory, { recursive: true }); });
  return { path, db, connect, port, calls, journal: createCloudflareNativeJournal(port()),
    rows: () => db.prepare("SELECT * FROM cloudflare_provider_calls ORDER BY key").all().map(row => ({ ...row })) };
}
function core(t, wrap = port => port) {
  const sql = fixture(t), f = providerFixture(), requests = [];
  const accountId = "c".repeat(32);
  const operations = cloudflareReadOperations({ accountId, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountDnsReadAllowed: true }, { accountId, revision: "resource-1" }, async (url, init) => {
    requests.push(url); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(JSON.stringify({ success: true, errors: [], result: { zone_defaults: {} } }),
      { headers: { "content-type": "application/json" } });
  });
  const tool = "cloudflare.dns.account_settings.get";
  const operation = operations.find(operation => operation.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare({}).resource.id] };
  Object.assign(f.dependencies, { provider: "cloudflare", operations, journal: createCloudflareNativeJournal(wrap(sql.port())) });
  return { ...f, sql, requests, invoke: (requestKey = "call-one") =>
    createProviderBroker(f.dependencies).call(tool, {}, "verified-runtime", requestKey) };
}

test("Cloudflare candidate native journal snapshots the fixed SQL namespace and executor", async () => {
  const calls = [];
  const db = { namespace: "plugin_example", async execute(sql, params) { calls.push({ sql, params, receiver: this }); return { rowCount: 1 }; } };
  const journal = createCloudflareNativeJournal(db);
  db.namespace = "foreign"; db.execute = () => { throw new Error("mutated"); };
  assert.ok(Object.isFrozen(journal)); assert.equal(await journal.claim(key, target, event), true);
  await journal.finish(key, event, "complete");
  assert.ok(calls.every(call => call.sql.includes('"plugin_example"."cloudflare_provider_calls"')));
  assert.equal(calls[0].receiver, db);
  assert.deepEqual(calls[0].params, [key, target, event]);
  assert.deepEqual(calls[1].params, [key, event, "complete"]);
  assert.match(calls[0].sql, /ON CONFLICT \(key\) DO NOTHING/);
  assert.ok(calls.every(call => !/DELETE|TRUNCATE|CREATE|ALTER|DROP|expires|ttl/i.test(call.sql)));
  for (const namespace of [undefined, null, "", "a".repeat(64), "x.y", 'x"; DROP TABLE x', "x\n", "PUBLIC", "a-b"]) {
    assert.throws(() => createCloudflareNativeJournal({ ...db, namespace }), /^Error: cloudflare\.journal\.unavailable$/);
  }
  assert.throws(() => createCloudflareNativeJournal({ namespace: "main", execute: null }), /cloudflare.journal.unavailable/);
});

test("Cloudflare candidate native journal keeps claims across connections, changed targets and reopen", async t => {
  const f = fixture(t);
  assert.equal(await f.journal.claim(key, target, event), true);
  const other = createCloudflareNativeJournal(f.port(f.connect()));
  for (const [hash, id] of [[target, event], [target, "other-event"], ["d".repeat(64), "other-event"]]) {
    assert.equal(await other.claim(key, hash, id), false);
  }
  await f.journal.finish(key, event, "complete");
  assert.equal(await createCloudflareNativeJournal(f.port(f.connect())).claim(key, target, "restart-event"), false);
  assert.deepEqual(f.rows(), [{ key, target, event, outcome: "complete" }]);
});

test("Cloudflare candidate native journal makes uncertain terminal and matches the original event", async t => {
  const f = fixture(t); await f.journal.claim(key, target, event);
  await assert.rejects(f.journal.finish(key, "foreign-event", "complete"), /cloudflare.journal.unavailable/);
  await f.journal.finish(key, event, "complete"); await f.journal.finish(key, event, "complete");
  await f.journal.finish(key, event, "uncertain"); await f.journal.finish(key, event, "uncertain");
  for (const outcome of ["complete", "refused"]) await assert.rejects(f.journal.finish(key, event, outcome), /cloudflare.journal.unavailable/);
  const second = "e".repeat(64); await f.journal.claim(second, target, "refused-event");
  await f.journal.finish(second, "refused-event", "refused"); await f.journal.finish(second, "refused-event", "refused");
  for (const outcome of ["complete", "uncertain"]) await assert.rejects(f.journal.finish(second, "refused-event", outcome), /cloudflare.journal.unavailable/);
  assert.deepEqual(f.rows().map(row => row.outcome), ["uncertain", "refused"]);
  await assert.rejects(f.journal.finish("f".repeat(64), event, "complete"), /cloudflare.journal.unavailable/);
});

test("Cloudflare candidate native journal rejects invalid data before SQL dispatch", async t => {
  const f = fixture(t);
  for (const value of [undefined, null, "", "A".repeat(64), "x".repeat(65), "invalid/hash", {}]) {
    await assert.rejects(f.journal.claim(value, target, event), /cloudflare.journal.unavailable/);
    await assert.rejects(f.journal.claim(key, value, event), /cloudflare.journal.unavailable/);
    await assert.rejects(f.journal.finish(value, event, "complete"), /cloudflare.journal.unavailable/);
  }
  for (const value of [null, "", "a".repeat(81), "event\n", "event/one", {}]) {
    await assert.rejects(f.journal.claim(key, target, value), /cloudflare.journal.unavailable/);
    await assert.rejects(f.journal.finish(key, value, "complete"), /cloudflare.journal.unavailable/);
  }
  for (const outcome of [undefined, null, "pending", "expired", "COMPLETE", {}]) {
    await assert.rejects(f.journal.finish(key, event, outcome), /cloudflare.journal.unavailable/);
  }
  assert.equal(f.calls.length, 0); assert.deepEqual(f.rows(), []);
});

test("Cloudflare candidate native journal emits fixed errors for database failures and malformed acknowledgments", async () => {
  for (const result of [null, undefined, {}, { rowCount: "1" }, { rowCount: -1 }, { rowCount: 2 }, { rowCount: NaN }]) {
    const journal = createCloudflareNativeJournal({ namespace: "main", async execute() { return result; } });
    await assert.rejects(journal.claim(key, target, event), /^Error: cloudflare\.journal\.unavailable$/);
    await assert.rejects(journal.finish(key, event, "complete"), /^Error: cloudflare\.journal\.unavailable$/);
  }
  const error = new Error(credentialCanary);
  const journal = createCloudflareNativeJournal({ namespace: "main", async execute() { throw error; } });
  for (const pending of [journal.claim(key, target, event), journal.finish(key, event, "complete")]) {
    await assert.rejects(pending, failure => failure.message === "cloudflare.journal.unavailable" && failure.cause === undefined && !failure.stack.includes(credentialCanary));
  }
});

test("Cloudflare candidate native journal binds actual-core success and permanently denies replay", async t => {
  const f = core(t), out = await f.invoke(); assert.equal(out.ok, true);
  const [record] = f.sql.rows(); assert.equal(record.event, out.event); assert.equal(record.outcome, "complete");
  assert.equal(record.target, f.audit.find(row => row.phase === "intent").targetHash);
  const audit = f.audit.find(row => row.phase === "outcome"); assert.equal(audit.decision, "ALLOW"); assert.equal(audit.targetHash, record.target);
  assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  assert.ok(!JSON.stringify({ rows: f.sql.rows(), out, audit: f.audit }).includes(credentialCanary));
});

test("Cloudflare candidate native journal downgrades complete after outcome-audit failure and never upgrades uncertain", async t => {
  const f = core(t); const append = f.dependencies.audit.append;
  f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw new Error(credentialCanary); return append(record); };
  assert.equal((await f.invoke()).code, "OUTCOME_UNCERTAIN");
  const [record] = f.sql.rows(); assert.equal(record.outcome, "uncertain");
  f.dependencies.audit.append = append;
  f.dependencies.journal = createCloudflareNativeJournal(f.sql.port(f.sql.connect()));
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1);
  await assert.rejects(f.dependencies.journal.finish(record.key, record.event, "complete"), /cloudflare.journal.unavailable/);
  assert.equal(f.sql.rows()[0].outcome, "uncertain");
});

test("Cloudflare candidate native journal lost claim acknowledgment leaves pending tombstone without credentials", async t => {
  let lose = true;
  const f = core(t, port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params);
    if (lose && sql.startsWith("INSERT")) { lose = false; throw new Error(credentialCanary); }
    return result;
  } }));
  assert.equal((await f.invoke()).code, "DEPENDENCY_UNAVAILABLE");
  assert.equal(f.sql.rows()[0].outcome, "pending"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.sql.rows()[0].outcome, "pending"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
});

test("Cloudflare candidate native journal lost completion acknowledgment refuses output and preserves uncertain claim", async t => {
  let lose = true;
  const f = core(t, port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params);
    if (lose && sql.startsWith("UPDATE")) { lose = false; throw new Error(credentialCanary); }
    return result;
  } }));
  assert.equal((await f.invoke()).code, "OUTCOME_UNCERTAIN");
  assert.equal(f.sql.rows()[0].outcome, "uncertain");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  assert.ok(!f.audit.some(record => record.phase === "outcome" && record.decision === "ALLOW"));
});

test("Cloudflare candidate journal reader snapshots its namespace/query and exposes no writer", async () => {
  const calls = [];
  const db = { namespace: "plugin_example", async query(sql, params) {
    calls.push({ sql, params, receiver: this }); return [{ key, target, event, outcome: "pending" }];
  } };
  const reader = createCloudflareNativeJournalReader(db);
  db.namespace = "foreign"; db.query = () => { throw new Error("mutated"); };
  const out = await reader.read(key, target, event);
  assert.deepEqual(out, { targetHash: target, event, outcome: "pending" });
  assert.ok(Object.isFrozen(reader)); assert.ok(Object.isFrozen(out));
  assert.deepEqual(Object.keys(reader), ["read"]); assert.equal(calls.length, 1);
  assert.equal(calls[0].receiver, db); assert.deepEqual(calls[0].params, [key]);
  assert.match(calls[0].sql, /^SELECT key, target, event, outcome FROM "plugin_example"\."cloudflare_provider_calls" WHERE key = \$1 LIMIT 2$/);
  for (const namespace of [undefined, null, "", "a".repeat(64), "x.y", 'x"; DROP TABLE x', "x\n", "PUBLIC", "a-b"]) {
    assert.throws(() => createCloudflareNativeJournalReader({ ...db, namespace }), /^Error: cloudflare\.journal\.unavailable$/);
  }
  assert.throws(() => createCloudflareNativeJournalReader({ namespace: "main", query: null }), /cloudflare.journal.unavailable/);
});

test("Cloudflare candidate journal reader returns absent and persistent exact pending/terminal snapshots", async t => {
  const f = fixture(t), reader = createCloudflareNativeJournalReader(f.port());
  assert.equal(await reader.read(key, target, event), null);
  await f.journal.claim(key, target, event);
  for (const outcome of ["pending", "complete", "uncertain"]) {
    if (outcome !== "pending") await f.journal.finish(key, event, outcome);
    const reopened = createCloudflareNativeJournalReader(f.port(f.connect()));
    assert.deepEqual(await reopened.read(key, target, event), { targetHash: target, event, outcome });
  }
  const otherKey = "e".repeat(64); await f.journal.claim(otherKey, target, "refused-event");
  await f.journal.finish(otherKey, "refused-event", "refused");
  assert.deepEqual(await reader.read(otherKey, target, "refused-event"), { targetHash: target, event: "refused-event", outcome: "refused" });
  assert.equal(f.rows().length, 2);
  assert.equal(await f.journal.claim(key, target, "replay-event"), false);
});

test("Cloudflare candidate journal reader rejects invalid selectors before query and mismatched ownership", async t => {
  const f = fixture(t), reader = createCloudflareNativeJournalReader(f.port());
  for (const value of [undefined, null, "", "A".repeat(64), "x".repeat(65), "invalid/hash", {}]) {
    await assert.rejects(reader.read(value, target, event), /cloudflare.journal.unavailable/);
    await assert.rejects(reader.read(key, value, event), /cloudflare.journal.unavailable/);
  }
  for (const value of [null, "", "a".repeat(81), "event\n", "event/one", {}]) {
    await assert.rejects(reader.read(key, target, value), /cloudflare.journal.unavailable/);
  }
  assert.equal(f.calls.length, 0);
  await f.journal.claim(key, target, event);
  await assert.rejects(reader.read(key, "e".repeat(64), event), /cloudflare.journal.unavailable/);
  await assert.rejects(reader.read(key, target, "foreign-event"), /cloudflare.journal.unavailable/);
  assert.deepEqual(f.rows(), [{ key, target, event, outcome: "pending" }]);
});

test("Cloudflare candidate journal reader rejects malformed/duplicate records with fixed redacted diagnostics", async () => {
  const row = { key, target, event, outcome: "complete" };
  for (const rows of [null, undefined, {}, [null], [[]], [row, row], [row, row, row],
    [{ ...row, key: "e".repeat(64) }], [{ ...row, target: "e".repeat(64) }], [{ ...row, event: "foreign-event" }],
    ...[undefined, null, "", "COMPLETE", "expired", {}].map(outcome => [{ ...row, outcome }]),
    [{ ...row, extra: credentialCanary }]]) {
    const reader = createCloudflareNativeJournalReader({ namespace: "main", async query() { return rows; } });
    await assert.rejects(reader.read(key, target, event), failure => failure.message === "cloudflare.journal.unavailable" &&
      failure.cause === undefined && !failure.stack.includes(credentialCanary));
  }
  const reader = createCloudflareNativeJournalReader({ namespace: "main", async query() { throw new Error(credentialCanary); } });
  await assert.rejects(reader.read(key, target, event), failure => failure.message === "cloudflare.journal.unavailable" &&
    failure.cause === undefined && !failure.stack.includes(credentialCanary));
});

test("Cloudflare candidate journal reader preserves actual-core success and uncertain audit snapshots", async t => {
  const f = core(t); const append = f.dependencies.audit.append;
  const success = await f.invoke(); assert.equal(success.ok, true);
  const first = f.sql.rows()[0], reader = createCloudflareNativeJournalReader(f.sql.port(f.sql.connect()));
  assert.deepEqual(await reader.read(first.key, first.target, first.event), { targetHash: first.target, event: success.event, outcome: "complete" });
  f.dependencies.audit.append = async record => { if (record.phase === "outcome") throw new Error(credentialCanary); return append(record); };
  const uncertain = await f.invoke("audit-failure"); assert.equal(uncertain.code, "OUTCOME_UNCERTAIN");
  const second = f.sql.rows().find(row => row.event === uncertain.event);
  assert.deepEqual(await reader.read(second.key, second.target, second.event), { targetHash: second.target, event: second.event, outcome: "uncertain" });
  f.dependencies.audit.append = append;
  assert.equal((await f.invoke("audit-failure")).code, "REPLAY_CONFLICT");
  assert.equal(f.calls.secret, 2); assert.equal(f.requests.length, 2);
  assert.ok(!JSON.stringify({ first, second, success, uncertain }).includes(credentialCanary));
});

test("Cloudflare candidate journal reader does not promote a lost-claim acknowledgment or allow replay", async t => {
  let lose = true;
  const f = core(t, port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params);
    if (lose && sql.startsWith("INSERT")) { lose = false; throw new Error(credentialCanary); }
    return result;
  } }));
  assert.equal((await f.invoke()).code, "DEPENDENCY_UNAVAILABLE");
  const [row] = f.sql.rows(), reader = createCloudflareNativeJournalReader(f.sql.port(f.sql.connect()));
  assert.deepEqual(await reader.read(row.key, row.target, row.event), { targetHash: row.target, event: row.event, outcome: "pending" });
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  assert.equal((await reader.read(row.key, row.target, row.event)).outcome, "pending");
});

test("Cloudflare candidate native journal excludes competing processes on one persistent key", async t => {
  const f = fixture(t);
  const module = new URL("../dist/plugins/cloudflare-broker/src/native-journal.js", import.meta.url).href;
  const code = `import { DatabaseSync } from 'node:sqlite';
    import { once } from 'node:events';
    import { createCloudflareNativeJournal } from ${JSON.stringify(module)};
    const db = new DatabaseSync(process.argv[1], { timeout: 5000 });
    const journal = createCloudflareNativeJournal({ namespace: 'main', async execute(sql, params) {
      return { rowCount: Number(db.prepare(sql).run(Object.fromEntries(params.map((value, index) => ['$'+(index+1), value]))).changes) };
    } });
    process.stdout.write('ready\\n'); await once(process.stdin, 'data');
    const claimed = await journal.claim(${JSON.stringify(key)}, ${JSON.stringify(target)}, process.argv[2]);
    process.stdout.write(JSON.stringify({ claimed, event: process.argv[2] })+'\\n'); db.close(); process.stdin.destroy();`;
  const start = id => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, f.path, id], { stdio: ["pipe", "pipe", "pipe"] });
    t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
    let stdout = "", stderr = "", ready;
    const waiting = new Promise((resolve, reject) => { ready = resolve; child.once("error", reject); child.once("exit", () => { if (!stdout.includes("ready\n")) reject(new Error(stderr || "child exited before ready")); }); });
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.includes("ready\n")) ready(); });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const exited = once(child, "exit");
    return { child, waiting, async result() { const [exit] = await exited; assert.equal(exit, 0, stderr); return JSON.parse(stdout.trim().split("\n").at(-1)); } };
  };
  const first = start("process-one"), second = start("process-two");
  await Promise.all([first.waiting, second.waiting]); first.child.stdin.end("go\n"); second.child.stdin.end("go\n");
  const results = await Promise.all([first.result(), second.result()]);
  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.deepEqual(f.rows(), [{ key, target, event: results.find(result => result.claimed).event, outcome: "pending" }]);
});
