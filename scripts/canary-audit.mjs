// Offline synthetic correlation. The caller supplies the plugin provenance and
// ordering wrapper: neither is present in the broker's own audit payload.
// These assertions alone do not authenticate a live host audit source.
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, names) => object(v) && Object.keys(v).length === names.length
  && names.every((name) => Object.hasOwn(v, name));
const identifier = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(v);
const uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const digest = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const rowKeys = ["event", "time", "agentId", "runId", "companyId", "policyHash", "policyRevision", "operation", "phase", "decision", "rule", "requestIds", "outcome"];

export function correlateAudit(rows, expected) {
  if (!exact(expected, ["pluginId", "event", "agentId", "runId", "companyId", "policyHash", "policyRevision", "operation"])
    || expected.pluginId !== "togetherweown.discord-broker-dev" || !uuid(expected.event)
    || ![expected.agentId, expected.runId, expected.companyId].every(identifier)
    || !digest(expected.policyHash) || !Number.isSafeInteger(expected.policyRevision) || expected.policyRevision < 0
    || !["discord.channel_get", "discord.messages_list"].includes(expected.operation)) {
    return { ok: false, reason: "audit_expected" };
  }
  if (!Array.isArray(rows) || rows.length !== 2) return { ok: false, reason: "audit_pair" };
  for (const wrapper of rows) {
    if (!exact(wrapper, ["pluginId", "sequence", "record"]) || wrapper.pluginId !== expected.pluginId
      || !Number.isSafeInteger(wrapper.sequence) || wrapper.sequence < 0 || !exact(wrapper.record, rowKeys)) {
      return { ok: false, reason: "audit_pair" };
    }
    const r = wrapper.record;
    if (!["event", "agentId", "runId", "companyId", "policyHash", "policyRevision", "operation"].every((k) => r[k] === expected[k])
      || !Number.isSafeInteger(r.time) || r.time < 0 || r.decision !== "allow" || r.rule !== "policy.allow"
      || !Array.isArray(r.requestIds) || r.requestIds.length > 100
      || !Array.from(r.requestIds).every((id) => typeof id === "string" && /^[A-Za-z0-9-]{6,64}$/.test(id))) {
      return { ok: false, reason: "audit_pair" };
    }
  }
  const [intent, outcome] = rows;
  if (intent.sequence >= outcome.sequence || intent.record.time > outcome.record.time
    || intent.record.phase !== "intent" || intent.record.outcome !== "pending" || intent.record.requestIds.length !== 0
    || outcome.record.phase !== "outcome" || outcome.record.outcome !== "success") {
    return { ok: false, reason: "audit_pair" };
  }
  return { ok: true };
}
