import { test } from "node:test";
import assert from "node:assert/strict";
import { correlateAudit } from "../scripts/canary-audit.mjs";

const expected = { pluginId: "togetherweown.discord-broker-dev", event: "12345678-1234-4123-8123-123456789abc",
  agentId: "agent", runId: "run", companyId: "company", policyHash: "a".repeat(64),
  policyRevision: 1, operation: "discord.channel_get" };
const { pluginId, ...identity } = expected;
const record = { ...identity, time: 100, decision: "allow", rule: "policy.allow", requestIds: [] };
const rows = () => [
  { pluginId, sequence: 1, record: { ...record, phase: "intent", outcome: "pending" } },
  { pluginId, sequence: 2, record: { ...record, phase: "outcome", outcome: "success", requestIds: ["request-1"] } },
];

test("correlates one ordered synthetic audit pair", () => {
  assert.deepEqual(correlateAudit(rows(), expected), { ok: true });
});

test("rejects ambiguity, provenance mismatch, replay and failed outcomes", () => {
  const invalid = [];
  invalid.push([...rows(), rows()[1]], rows().reverse());
  for (const [key, value] of [["event", "different"], ["runId", "other"], ["companyId", "other"],
    ["agentId", "other"], ["policyHash", "b".repeat(64)], ["policyRevision", 2], ["operation", "discord.messages_list"],
    ["phase", "refused"], ["outcome", "error"], ["decision", "deny"], ["rule", "secret"], ["extra", "secret"]]) {
    const pair = rows(); pair[1].record[key] = value; invalid.push(pair);
  }
  const wrongPlugin = rows(); wrongPlugin[1].pluginId = "discord-prod"; invalid.push(wrongPlugin);
  const tied = rows(); tied[1].sequence = 1; invalid.push(tied);
  const backwards = rows(); backwards[1].record.time = 99; invalid.push(backwards);
  const sparse = rows(); sparse[1].record.requestIds = Array(1); invalid.push(sparse);
  for (const pair of invalid) assert.deepEqual(correlateAudit(pair, expected), { ok: false, reason: "audit_pair" });
  assert.deepEqual(correlateAudit(rows(), { ...expected, event: "redacted" }), { ok: false, reason: "audit_expected" });
});
