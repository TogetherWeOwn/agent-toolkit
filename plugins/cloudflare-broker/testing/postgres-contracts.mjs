import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createCloudflareNativeJournal, createCloudflareNativeJournalReader } from "../../../dist/plugins/cloudflare-broker/src/native-journal.js";
import { createCloudflareNativeCaptureSink, createCloudflareNativeCaptureReader } from "../../../dist/plugins/cloudflare-broker/src/native-evidence.js";
import { createCloudflareNativeAuditSink, createCloudflareNativeAuditReader } from "../../../dist/plugins/cloudflare-broker/src/native-audit.js";
import { createCloudflareReadBroker } from "../../../dist/plugins/cloudflare-broker/src/read-broker.js";
import { cloudflareReadOperations } from "../../../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash } from "../../../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary } from "../../../packages/core/testing/provider-fixture.mjs";

// This file runs only in the dedicated Actions job, never against a supplied DB
// URL. psql/JSON is a test port, not the installed SDK's RPC/numeric decoder.
assert.equal(process.env.CLOUDFLARE_POSTGRES_TEST, "1");
assert.match(process.env.CLOUDFLARE_POSTGRES_PORT ?? "", /^[1-9][0-9]{0,4}$/);
const executeFile = promisify(execFile);
async function psql(sql) {
  const { stdout } = await executeFile("psql", ["-X", "--no-password", "--set", "ON_ERROR_STOP=1", "-At", "--command", sql], {
    timeout: 15000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, PGHOST: "127.0.0.1", PGPORT: process.env.CLOUDFLARE_POSTGRES_PORT,
      PGUSER: "postgres", PGDATABASE: "postgres", PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "5" },
  });
  return stdout.trim().split("\n").at(-1);
}
function literal(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") { assert.ok(Number.isSafeInteger(value)); return String(value); }
  assert.equal(typeof value, "string"); assert.ok(!value.includes("\0"));
  return `'${value.replaceAll("'", "''")}'`;
}
async function statement(sql, params, query = false) {
  // PostgreSQL, not JS interpolation, resolves the candidate's $n parameters.
  // EXECUTE literals are confined to this synthetic CLI fixture.
  const prepared = query ? `SELECT COALESCE(json_agg(row_to_json(candidate)), '[]'::json) FROM (${sql}) candidate` : sql;
  const output = await psql(`SET standard_conforming_strings = on; PREPARE candidate AS ${prepared}; EXECUTE candidate (${params.map(literal).join(", ")});`);
  if (query) return JSON.parse(output);
  assert.match(output, /^(?:INSERT 0|UPDATE) [0-9]+$/);
  return { rowCount: Number(output.split(" ").at(-1)) };
}
async function fixture(t) {
  const namespace = `cf_test_${randomUUID().replaceAll("-", "")}`;
  await psql(`CREATE SCHEMA "${namespace}";
    CREATE TABLE "${namespace}".cloudflare_provider_calls (
      key TEXT PRIMARY KEY, target TEXT NOT NULL, event TEXT NOT NULL, outcome TEXT NOT NULL
      CHECK (outcome IN ('pending', 'complete', 'refused', 'uncertain')));
    CREATE TABLE "${namespace}".cloudflare_capture_evidence (
      event TEXT PRIMARY KEY, contract TEXT NOT NULL, subject TEXT NOT NULL, target_hash TEXT NOT NULL, value_hash TEXT NOT NULL);
    CREATE TABLE "${namespace}".cloudflare_provider_audit (
      event TEXT NOT NULL, phase TEXT NOT NULL, time BIGINT NOT NULL CHECK (time BETWEEN 0 AND 9007199254740991),
      decision TEXT NOT NULL, contract TEXT NOT NULL, provider TEXT NOT NULL, tool TEXT,
      principal_hash TEXT, target_hash TEXT, PRIMARY KEY (event, phase));`);
  t.after(async () => { await psql(`DROP SCHEMA "${namespace}" CASCADE`); });
  const port = { namespace, execute: (sql, params) => statement(sql, params), query: (sql, params) => statement(sql, params, true) };
  return { port, journal: createCloudflareNativeJournal(port), journalReader: createCloudflareNativeJournalReader(port),
    capture: createCloudflareNativeCaptureSink(port), captureReader: createCloudflareNativeCaptureReader(port),
    audit: createCloudflareNativeAuditSink(port), auditReader: createCloudflareNativeAuditReader(port) };
}
const key = "a".repeat(64), targetHash = "b".repeat(64);
const audit = { event: "event-one", time: 1000, phase: "intent", decision: "ALLOW", contract: "toolkit.provider-broker/v1",
  provider: "cloudflare", tool: "cloudflare.pages.projects.list", principalHash: "c".repeat(64), targetHash };
const capture = { event: audit.event, contract: "toolkit.cloudflare-capture/v1",
  subject: "credential-filtered-pages-list-projection", targetHash, valueHash: "d".repeat(64) };

async function core(t, wrap = port => port) {
  const sql = await fixture(t), f = providerFixture(), requests = [], audits = [], captures = [];
  const scope = { accountId: "e".repeat(32), revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesProjects: [{ projectName: "safe-pages", projectId: "project-id", deploymentIds: [] }],
    pagesPagination: { projects: true, deploymentProjects: [] } };
  const source = { accountId: scope.accountId, revision: scope.revision, sourceDigestScriptNames: [] };
  const tool = "cloudflare.pages.projects.list", args = { page: 1, perPage: 10 };
  const operation = cloudflareReadOperations(scope, source).find(op => op.name === tool);
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [operation.prepare(args).resource.id] };
  const port = wrap(sql.port), auditSink = createCloudflareNativeAuditSink(port), captureSink = createCloudflareNativeCaptureSink(port);
  f.dependencies.journal = createCloudflareNativeJournal(port);
  f.dependencies.audit = { async append(row) { audits.push(row); await auditSink.append(row); } };
  const broker = createCloudflareReadBroker(scope, source, f.dependencies, { async append(row) { captures.push(row); await captureSink.append(row); } }, async (url, init) => {
    requests.push(url); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(JSON.stringify({ success: true, errors: [], result: [{ id: "project-id", name: "safe-pages" }],
      result_info: { page: 1, per_page: 10, total_pages: 1 } }), { headers: { "content-type": "application/json" } });
  });
  const journalKey = canonicalHash({ provider: "cloudflare", tool, company: f.vector.principal.company,
    agent: f.vector.principal.agent, project: f.vector.principal.project, task: f.vector.principal.task, requestKey: "call-one" });
  return { ...f, sql, requests, audits, captures, journalKey, invoke: () => broker.call(tool, args, "verified-runtime", "call-one") };
}

test("PostgreSQL independent claims elect one owner and reopened ports retain absorbing outcomes", async t => {
  const f = await fixture(t);
  const contenders = await Promise.all(Array.from({ length: 8 }, (_, i) => createCloudflareNativeJournal(f.port).claim(key, targetHash, `event-${i}`)));
  assert.equal(contenders.filter(Boolean).length, 1);
  const event = `event-${contenders.indexOf(true)}`;
  const reopened = createCloudflareNativeJournal(f.port);
  await assert.rejects(reopened.finish(key, "wrong-owner", "complete"), /cloudflare\.journal\.unavailable/);
  await reopened.finish(key, event, "complete"); await reopened.finish(key, event, "complete");
  await reopened.finish(key, event, "uncertain");
  await assert.rejects(reopened.finish(key, event, "complete"), /cloudflare\.journal\.unavailable/);
  assert.deepEqual(await f.journalReader.read(key, targetHash, event), { targetHash, event, outcome: "uncertain" });
  assert.equal(await reopened.claim(key, "f".repeat(64), "replacement"), false);
  const other = "1".repeat(64); await reopened.claim(other, targetHash, "refused-owner");
  await reopened.finish(other, "refused-owner", "refused");
  await assert.rejects(reopened.finish(other, "refused-owner", "complete"), /cloudflare\.journal\.unavailable/);
});

test("PostgreSQL capture and audit unique inserts retain exact immutable records across sessions", async t => {
  const f = await fixture(t);
  assert.equal(await f.captureReader.read(capture), null); assert.equal(await f.auditReader.read(audit), null);
  const results = await Promise.allSettled([f.capture.append(capture), createCloudflareNativeCaptureSink(f.port).append(capture)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  await f.audit.append(audit);
  await assert.rejects(f.audit.append({ ...audit, time: 1001 }), /cloudflare\.audit\.unavailable/);
  assert.deepEqual(await createCloudflareNativeCaptureReader(f.port).read(capture), capture);
  assert.deepEqual(await createCloudflareNativeAuditReader(f.port).read(audit), audit);
  await assert.rejects(f.captureReader.read({ ...capture, valueHash: "e".repeat(64) }), /cloudflare\.evidence\.unavailable/);
  await assert.rejects(f.auditReader.read({ ...audit, targetHash: "e".repeat(64) }), /cloudflare\.audit\.unavailable/);
});

test("PostgreSQL BIGINT JSON round trips safe-integer audit times and nullable early refusal bindings", async t => {
  const f = await fixture(t);
  for (const time of [0, 2147483648, Number.MAX_SAFE_INTEGER]) {
    const row = { ...audit, event: `time-${time}`, time, phase: "refused", decision: "UNKNOWN_TOOL", tool: null, principalHash: null, targetHash: null };
    await f.audit.append(row); const out = await f.auditReader.read(row);
    assert.deepEqual(out, row); assert.equal(typeof out.time, "number"); assert.ok(Object.isFrozen(out));
  }
  // The native SDK might transport BIGINT as a string; the candidate must not
  // silently coerce that incompatible port into accepted evidence.
  const reader = createCloudflareNativeAuditReader({ ...f.port, async query(sql, params) {
    return (await f.port.query(sql, params)).map(row => ({ ...row, time: String(row.time) }));
  } });
  await f.audit.append(audit); await assert.rejects(reader.read(audit), /cloudflare\.audit\.unavailable/);
});

test("PostgreSQL schema selection isolates candidate records without implying caller authorization", async t => {
  const one = await fixture(t), two = await fixture(t);
  await one.journal.claim(key, targetHash, audit.event); await one.capture.append(capture); await one.audit.append(audit);
  assert.equal(await two.journalReader.read(key, targetHash, audit.event), null);
  assert.equal(await two.captureReader.read(capture), null); assert.equal(await two.auditReader.read(audit), null);
  assert.equal(await two.journal.claim(key, targetHash, audit.event), true);
});

test("PostgreSQL actual core persists matching capture audit and completed journal before success", async t => {
  const f = await core(t), out = await f.invoke(); assert.equal(out.ok, true);
  for (const row of f.audits) assert.deepEqual(await f.sql.auditReader.read(row), row);
  assert.deepEqual(await f.sql.captureReader.read(f.captures[0]), f.captures[0]);
  const intent = f.audits.find(row => row.phase === "intent");
  assert.equal(intent.principalHash, canonicalHash(f.vector.principal)); assert.equal(intent.targetHash, f.captures[0].targetHash);
  assert.equal(f.captures[0].valueHash, canonicalHash(out.value)); assert.equal(f.captures[0].event, out.event);
  assert.equal((await f.sql.journalReader.read(f.journalKey, intent.targetHash, out.event)).outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
  assert.ok(!JSON.stringify({ out, audits: f.audits, captures: f.captures }).includes(credentialCanary));
});

test("PostgreSQL lost outcome acknowledgment retains ALLOW but suppresses output and keeps uncertain replay", async t => {
  const f = await core(t, port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params);
    if (sql.includes('"cloudflare_provider_audit"') && params[1] === "outcome" && params[3] === "ALLOW") throw Error(credentialCanary);
    return result;
  } }));
  const out = await f.invoke(); assert.equal(out.code, "OUTCOME_UNCERTAIN"); assert.equal(out.value, undefined);
  const outcome = f.audits.find(row => row.phase === "outcome" && row.decision === "ALLOW");
  assert.deepEqual(await f.sql.auditReader.read(outcome), outcome);
  assert.deepEqual(await f.sql.captureReader.read(f.captures[0]), f.captures[0]);
  assert.equal((await f.sql.journalReader.read(f.journalKey, outcome.targetHash, out.event)).outcome, "uncertain");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
});

test("PostgreSQL lost intent acknowledgment retains refusal without claim credentials or network", async t => {
  let failed = false;
  const f = await core(t, port => ({ ...port, async execute(sql, params) {
    const result = await port.execute(sql, params);
    if (!failed && sql.includes('"cloudflare_provider_audit"') && params[1] === "intent") { failed = true; throw Error(credentialCanary); }
    return result;
  } }));
  const out = await f.invoke(); assert.equal(out.code, "AUDIT_UNAVAILABLE"); assert.equal(out.value, undefined);
  for (const row of f.audits) assert.deepEqual(await f.sql.auditReader.read(row), row);
  const intent = f.audits.find(row => row.phase === "intent");
  assert.equal(await f.sql.journalReader.read(f.journalKey, intent.targetHash, out.event), null);
  assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0); assert.equal(f.captures.length, 0);
});
