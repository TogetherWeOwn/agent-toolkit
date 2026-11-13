// Offline synthetic fixtures only; this does not authenticate a host or audit source.
// Host: Paperclip d69631b01b9c658f80bf8bed389863dce82643e1,
// server/src/routes/plugins.ts and services/plugin-tool-registry.ts.
// Broker: agent-toolkit 4af09093d16e6ec5ec38c9f96fc30ecf7e39fbc3.
import { parseCanaryJson } from "./canary-json.mjs";
import { validateProjection } from "./canary-projection.mjs";
import { correlateAudit } from "./canary-audit.mjs";

const exact = (v, names) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));

// Accept raw JSON bytes for both inputs so bounds and duplicate-key checks apply
// before inspection. Return only fixed reason codes, never any supplied data.
export function validateSyntheticEvidence(envelopeBytes, auditBytes, expected) {
  const envelope = parseCanaryJson(envelopeBytes);
  if (!envelope.ok) return envelope;
  const audit = parseCanaryJson(auditBytes);
  if (!audit.ok) return audit;
  const pair = correlateAudit(audit.value, expected?.audit);
  if (!pair.ok) return pair;
  const e = envelope.value;
  if (!exact(e, ["pluginId", "toolName", "result"])
    || e.pluginId !== expected.audit.pluginId || e.toolName !== expected.audit.operation
    || !exact(e.result, ["content", "isError"]) || e.result.isError !== false
    || !Array.isArray(e.result.content) || e.result.content.length !== 1
    || !exact(e.result.content[0], ["type", "text"]) || e.result.content[0].type !== "text"
    || typeof e.result.content[0].text !== "string") return { ok: false, reason: "envelope" };
  const payload = parseCanaryJson(new TextEncoder().encode(e.result.content[0].text));
  if (!payload.ok) return payload;
  const p = payload.value;
  if (!exact(p, ["ok", "policyHash", "policyRevision", "guildId", "operation", "page", "pagination"])
    || p.ok !== true || p.policyHash !== expected.audit.policyHash
    || p.policyRevision !== expected.audit.policyRevision || p.operation !== expected.audit.operation
    || p.guildId !== expected.projection?.guildId
    || p.pagination !== "bounded; request subsequent pages explicitly") return { ok: false, reason: "payload" };
  const projection = validateProjection(p.page, p.operation, expected.projection);
  return projection.ok ? { ok: true, evidence: "synthetic_source_derived" } : projection;
}
