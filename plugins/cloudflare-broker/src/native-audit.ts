import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ProviderAuditRecord, ProviderDependencies } from "../../../packages/core/src/provider/contracts.js";
import { closed, digest, identifier, integer, oneOf, text, type Schema } from "../../../packages/core/src/schema.js";

function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return { parse(value) { return value === null ? null : schema.parse(value); } };
}
const phase = oneOf(["refused", "intent", "outcome"] as const);
const decision = oneOf(["ALLOW", "INVALID_ARGUMENTS", "UNKNOWN_TOOL", "IDENTITY_UNAVAILABLE", "POLICY_DENIED",
  "POLICY_CHANGED", "RESOURCE_CHANGED", "AUTHORIZATION_UNAVAILABLE", "AUTHORIZATION_DENIED", "REPLAY_CONFLICT",
  "AUDIT_UNAVAILABLE", "DEPENDENCY_UNAVAILABLE", "CREDENTIAL_UNAVAILABLE", "OUTPUT_REFUSED", "UPSTREAM_UNAVAILABLE", "OUTCOME_UNCERTAIN"] as const);
const common = { event: identifier, time: integer(0, Number.MAX_SAFE_INTEGER), phase, decision,
  contract: oneOf(["toolkit.provider-broker/v1"] as const), provider: oneOf(["cloudflare"] as const),
  tool: nullable(text(128, /^cloudflare\.[A-Za-z0-9][A-Za-z0-9._-]*$/)) };
const audit = closed({ ...common, principalHash: nullable(digest), targetHash: nullable(digest) });
const stored = closed({ ...common, principal_hash: nullable(digest), target_hash: nullable(digest) });
const unavailable = () => new Error("cloudflare.audit.unavailable");
function validated(input: unknown): ProviderAuditRecord {
  const record = audit.parse(input);
  if (record.phase === "refused" ? record.decision === "ALLOW" :
    record.tool === null || record.principalHash === null || record.targetHash === null ||
      (record.phase === "intent" && record.decision !== "ALLOW")) throw unavailable();
  return record;
}
function table(namespace: unknown): string {
  if (typeof namespace !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(namespace)) throw unavailable();
  return `"${namespace}"."cloudflare_provider_audit"`;
}

// Unconnected candidate ports, not native audit acceptance. Provision/qualify the
// plugin-owned schema, durable acknowledgments and complete retrieval separately.
export function createCloudflareNativeAuditSink(database: Pick<PluginContext["db"], "namespace" | "execute">): ProviderDependencies["audit"] {
  const target = table(database?.namespace);
  if (typeof database?.execute !== "function") throw unavailable();
  const execute = database.execute.bind(database);
  return Object.freeze({
    async append(input: ProviderAuditRecord): Promise<void> {
      try {
        const record = validated(input);
        const result = await execute(`INSERT INTO ${target} (event, phase, time, decision, contract, provider, tool, principal_hash, target_hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [record.event, record.phase, record.time, record.decision,
          record.contract, record.provider, record.tool, record.principalHash, record.targetHash]);
        // Duplicate phases refuse, including identical records or an attempted
        // refusal after lost ALLOW acknowledgment. Never overwrite or retry.
        if (result?.rowCount !== 1) throw unavailable();
      } catch { throw unavailable(); }
    },
  });
}

export function createCloudflareNativeAuditReader(database: Pick<PluginContext["db"], "namespace" | "query">) {
  const target = table(database?.namespace);
  if (typeof database?.query !== "function") throw unavailable();
  const query = database.query.bind(database);
  return Object.freeze({
    async read(input: ProviderAuditRecord): Promise<ProviderAuditRecord | null> {
      try {
        const expected = validated(input);
        const rows: unknown = await query(`SELECT event, phase, time, decision, contract, provider, tool, principal_hash, target_hash
          FROM ${target} WHERE event = $1 AND phase = $2 LIMIT 2`, [expected.event, expected.phase]);
        if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
        if (rows.length === 0) return null;
        const row = stored.parse(rows[0]);
        const record = validated({ event: row.event, time: row.time, phase: row.phase, decision: row.decision,
          contract: row.contract, provider: row.provider, tool: row.tool, principalHash: row.principal_hash, targetHash: row.target_hash });
        if (Object.keys(expected).some(key => record[key as keyof ProviderAuditRecord] !== expected[key as keyof ProviderAuditRecord])) throw unavailable();
        return Object.freeze({ ...record });
      } catch { throw unavailable(); }
    },
  });
}
