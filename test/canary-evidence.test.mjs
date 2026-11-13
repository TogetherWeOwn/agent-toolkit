import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSyntheticEvidence } from "../scripts/canary-evidence.mjs";

const bytes = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const audit = { pluginId: "togetherweown.discord-broker-dev", event: "12345678-1234-4123-8123-123456789abc", agentId: "agent", runId: "run", companyId: "company", policyHash: "a".repeat(64), policyRevision: 1, operation: "discord.channel_get" };
const projection = { guildId: "11111111111111111", channelId: "22222222222222222" };
const expected = { audit, projection };
const { pluginId, ...identity } = audit;
const record = { ...identity, time: 100, decision: "allow", rule: "policy.allow", requestIds: [] };
const rows = [
  { pluginId, sequence: 1, record: { ...record, phase: "intent", outcome: "pending" } },
  { pluginId, sequence: 2, record: { ...record, phase: "outcome", outcome: "success" } },
];
const payload = { ok: true, policyHash: audit.policyHash, policyRevision: 1, guildId: projection.guildId, operation: audit.operation,
  page: { id: projection.channelId, guild_id: projection.guildId, type: 0 }, pagination: "bounded; request subsequent pages explicitly" };
const wrap = (p) => ({ pluginId, toolName: audit.operation, result: { content: [{ type: "text", text: JSON.stringify(p) }], isError: false } });
const validate = (e, a = rows) => validateSyntheticEvidence(bytes(e), bytes(a), expected);

test("integrates a source-derived synthetic envelope and audit pair", () => {
  assert.deepEqual(validate(wrap(payload)), { ok: true, evidence: "synthetic_source_derived" });
});

test("integrates synthetic message projections and rejects replay and mismatched context", () => {
  const operation = "discord.messages_list";
  const message = { id: "33333333333333333", channel_id: projection.channelId, guild_id: projection.guildId,
    timestamp: "2026-01-01T00:00:00Z", url: `https://discord.com/channels/${projection.guildId}/${projection.channelId}/33333333333333333` };
  const messageExpected = { audit: { ...audit, operation }, projection };
  const messageRows = rows.map((row) => ({ ...row, record: { ...row.record, operation } }));
  const messagePayload = { ...payload, operation, page: [message] };
  const messageEnvelope = { ...wrap(messagePayload), toolName: operation };
  const check = (e, a = messageRows, exp = messageExpected) => validateSyntheticEvidence(bytes(e), bytes(a), exp);
  assert.deepEqual(check(messageEnvelope), { ok: true, evidence: "synthetic_source_derived" });
  assert.deepEqual(check({ ...wrap({ ...messagePayload, page: [] }), toolName: operation }), { ok: true, evidence: "synthetic_source_derived" });
  for (const page of [[message, message], [{ ...message, content: "secret" }], [{ ...message, channel_id: "44444444444444444" }], Array(101).fill(message)]) {
    const result = check({ ...wrap({ ...messagePayload, page }), toolName: operation });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
  assert.equal(check(messageEnvelope, rows).reason, "audit_pair");
  assert.equal(check({ ...messageEnvelope, toolName: audit.operation }).reason, "envelope");
  assert.equal(check(messageEnvelope, messageRows, { ...messageExpected, projection: { ...projection, channelId: "44444444444444444" } }).reason, "projection");
});

test("rejects errors, unknown fields, redaction, ambiguous audit and nested duplicate keys without echoing input", () => {
  const invalid = [wrap({ ...payload, page: { ...payload.page, name: "secret" } }), wrap({ ...payload, policyHash: "[REDACTED]" }),
    { ...wrap(payload), extra: "secret" }, { ...wrap(payload), result: { content: [], isError: true } }];
  for (const value of invalid) {
    const result = validate(value);
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
  assert.equal(validate(wrap(payload), [...rows, rows[1]]).reason, "audit_pair");
  const duplicate = wrap(payload); duplicate.result.content[0].text = '{"ok":true,"ok":true}';
  assert.equal(validate(duplicate).reason, "duplicate_key");
});

test("applies input bounds before accepting either source", () => {
  const check = (envelopeBytes, auditBytes) => validateSyntheticEvidence(envelopeBytes, auditBytes, expected);
  assert.equal(check(bytes(" ".repeat(131073)), bytes(rows)).reason, "input_size");
  assert.equal(check(bytes(wrap(payload)), bytes(" ".repeat(131073))).reason, "input_size");
  assert.equal(check(bytes(wrap(payload)), bytes("[".repeat(14) + "0" + "]".repeat(14))).reason, "input_depth");
  const nested = wrap(payload);
  nested.result.content[0].text = "[".repeat(14) + "0" + "]".repeat(14);
  assert.equal(check(bytes(nested), bytes(rows)).reason, "input_depth");
  assert.equal(check(Uint8Array.of(0xff), bytes(rows)).reason, "invalid_json");
});
