import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { definePlugin, startWorkerRpcHost } from "@paperclipai/plugin-sdk";
import { createCloudflareNativeJournal, createCloudflareNativeJournalReader } from "../dist/plugins/cloudflare-broker/src/native-journal.js";
import { createCloudflareNativeCaptureSink, createCloudflareNativeCaptureReader } from "../dist/plugins/cloudflare-broker/src/native-evidence.js";
import { createCloudflareNativeAuditSink, createCloudflareNativeAuditReader } from "../dist/plugins/cloudflare-broker/src/native-audit.js";

const key = "a".repeat(64), targetHash = "b".repeat(64), canary = "SYNTHETIC_PRIVATE_DATABASE_DIAGNOSTIC";
const audit = { event: "sdk-event", time: 1000, phase: "intent", decision: "ALLOW", contract: "toolkit.provider-broker/v1",
  provider: "cloudflare", tool: "cloudflare.pages.projects.list", principalHash: "c".repeat(64), targetHash };
const capture = { event: audit.event, contract: "toolkit.cloudflare-capture/v1",
  subject: "credential-filtered-pages-list-projection", targetHash, valueHash: "d".repeat(64) };

// Real published SDK on both sides of the worker boundary; the SQL host is
// synthetic SQLite, not installed-host admission, authorization or durability.
async function fixture(t, { namespace = "main", wrap = host => host } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cloudflare_provider_calls (key TEXT PRIMARY KEY, target TEXT, event TEXT, outcome TEXT);
    CREATE TABLE cloudflare_capture_evidence (event TEXT PRIMARY KEY, contract TEXT, subject TEXT, target_hash TEXT, value_hash TEXT);
    CREATE TABLE cloudflare_provider_audit (event TEXT, phase TEXT, time INTEGER, decision TEXT, contract TEXT,
      provider TEXT, tool TEXT, principal_hash TEXT, target_hash TEXT, PRIMARY KEY (event, phase));`);
  const input = new PassThrough(), output = new PassThrough(), lines = createInterface({ input: output });
  const waiting = new Map(), calls = [], failures = [];
  let nextId = 0, ports;
  const host = wrap(async (method, params) => {
    assert.ok(method === "db.query" || method === "db.execute");
    assert.deepEqual(Object.keys(params).sort(), ["params", "sql"]);
    const bound = Object.fromEntries(params.params.map((value, i) => [`$${i + 1}`, value]));
    const statement = db.prepare(params.sql);
    return method === "db.query" ? statement.all(bound) : { rowCount: Number(statement.run(bound).changes) };
  });
  const worker = startWorkerRpcHost({ stdin: input, stdout: output, plugin: definePlugin({ async setup(ctx) {
    ports = { journal: createCloudflareNativeJournal(ctx.db), journalReader: createCloudflareNativeJournalReader(ctx.db),
      capture: createCloudflareNativeCaptureSink(ctx.db), captureReader: createCloudflareNativeCaptureReader(ctx.db),
      audit: createCloudflareNativeAuditSink(ctx.db), auditReader: createCloudflareNativeAuditReader(ctx.db) };
  } }) });
  lines.on("line", line => {
    try {
      const message = JSON.parse(line);
      if (message.method) {
        calls.push({ method: message.method, ...message.params });
        Promise.resolve().then(() => host(message.method, message.params)).then(result => {
          input.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
        }, () => {
          input.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: canary } }) + "\n");
        });
      } else {
        assert.ok(waiting.has(message.id));
        waiting.get(message.id)(message); waiting.delete(message.id);
      }
    } catch (error) { failures.push(error); }
  });
  t.after(() => {
    worker.stop(); lines.close(); input.destroy(); output.destroy(); db.close();
    assert.deepEqual(failures, []); assert.equal(waiting.size, 0);
  });
  const id = ++nextId;
  const initialized = await new Promise(resolve => {
    waiting.set(id, resolve);
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method: "initialize",
      params: { manifest: { id: "synthetic-cloudflare-persistence" }, config: {}, databaseNamespace: namespace } }) + "\n");
  });
  return { initialized, ports, calls, db };
}

test("Cloudflare real SDK captures initialize namespace and forwards fixed SQL and positional parameters", async t => {
  const f = await fixture(t); assert.equal(f.initialized.error, undefined);
  await f.ports.journal.claim(key, targetHash, audit.event);
  await f.ports.capture.append(capture); await f.ports.audit.append(audit);
  await f.ports.journal.finish(key, audit.event, "complete");
  assert.deepEqual(await f.ports.journalReader.read(key, targetHash, audit.event), { targetHash, event: audit.event, outcome: "complete" });
  assert.deepEqual(await f.ports.captureReader.read(capture), capture);
  assert.deepEqual(await f.ports.auditReader.read(audit), audit);
  assert.equal(f.calls.length, 7);
  assert.deepEqual(f.calls[0].params, [key, targetHash, audit.event]);
  assert.deepEqual(f.calls[1].params, [capture.event, capture.contract, capture.subject, targetHash, capture.valueHash]);
  assert.deepEqual(f.calls[2].params, [audit.event, audit.phase, audit.time, audit.decision, audit.contract,
    audit.provider, audit.tool, audit.principalHash, targetHash]);
  assert.ok(f.calls.every(call => call.sql.includes('"main"."cloudflare_')));
  assert.ok(f.calls.every(call => !call.sql.includes(key) && !call.sql.includes(audit.event)));
  assert.ok(f.calls.every(call => !/CREATE|ALTER|DROP|DELETE|TRUNCATE/i.test(call.sql)));
});

test("Cloudflare real SDK missing or malformed namespace fails bootstrap without database access", async t => {
  for (const namespace of [null, "", "foreign.schema", "UPPER", 'x"; DROP TABLE x']) {
    const f = await fixture(t, { namespace });
    assert.ok(f.initialized.error); assert.equal(f.initialized.result, undefined); assert.equal(f.calls.length, 0);
    assert.ok(!JSON.stringify(f.initialized).includes(canary));
  }
});

test("Cloudflare real SDK concurrent claim responses preserve single ownership and absorbing uncertainty", async t => {
  const f = await fixture(t);
  const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => f.ports.journal.claim(key, targetHash, `event-${i}`)));
  assert.equal(claims.filter(Boolean).length, 1);
  const event = `event-${claims.indexOf(true)}`;
  await f.ports.journal.finish(key, event, "complete"); await f.ports.journal.finish(key, event, "uncertain");
  await assert.rejects(f.ports.journal.finish(key, event, "complete"), /^Error: cloudflare\.journal\.unavailable$/);
  assert.equal(await f.ports.journal.claim(key, "f".repeat(64), "replacement"), false);
  assert.equal((await f.ports.journalReader.read(key, targetHash, event)).outcome, "uncertain");
});

test("Cloudflare real SDK preserves safe integer and null audit fields but refuses host string decoding", async t => {
  const f = await fixture(t);
  for (const time of [0, 2147483648, Number.MAX_SAFE_INTEGER]) {
    const row = { ...audit, event: `time-${time}`, time, phase: "refused", decision: "UNKNOWN_TOOL",
      tool: null, principalHash: null, targetHash: null };
    await f.ports.audit.append(row); assert.deepEqual(await f.ports.auditReader.read(row), row);
  }
  const stringHost = await fixture(t, { wrap: host => async (method, params) => {
    const result = await host(method, params);
    return method === "db.query" ? result.map(row => ({ ...row, time: String(row.time) })) : result;
  } });
  await stringHost.ports.audit.append(audit);
  await assert.rejects(stringHost.ports.auditReader.read(audit), /^Error: cloudflare\.audit\.unavailable$/);
});

test("Cloudflare real SDK host errors and committed lost acknowledgments expose fixed errors without retries", async t => {
  const f = await fixture(t, { wrap: host => async (method, params) => { await host(method, params); throw Error(canary); } });
  for (const [invoke, code] of [
    [() => f.ports.journal.claim(key, targetHash, audit.event), "journal"],
    [() => f.ports.capture.append(capture), "evidence"], [() => f.ports.audit.append(audit), "audit"],
    [() => f.ports.journalReader.read(key, targetHash, audit.event), "journal"],
    [() => f.ports.captureReader.read(capture), "evidence"], [() => f.ports.auditReader.read(audit), "audit"],
  ]) await assert.rejects(invoke(), error => {
    assert.equal(String(error), `Error: cloudflare.${code}.unavailable`); assert.equal(error.cause, undefined); return true;
  });
  assert.equal(f.calls.length, 6);
  assert.equal(f.db.prepare("SELECT outcome FROM cloudflare_provider_calls").get().outcome, "pending");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM cloudflare_capture_evidence").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM cloudflare_provider_audit").get().n, 1);
  assert.ok(!JSON.stringify(f.calls).includes(canary));
});
