import type { PluginContext } from "@paperclipai/plugin-sdk";
import { closed, digest, identifier, oneOf } from "../../../packages/core/src/schema.js";
import type { CaptureEvidenceRecord, CaptureEvidenceSink } from "./read-broker.js";

const contract = oneOf(["toolkit.cloudflare-capture/v1"] as const);
const subject = oneOf(["credential-filtered-current-content-projection", "credential-filtered-pages-list-projection"] as const);
const capture = closed({ contract, subject, event: identifier, targetHash: digest, valueHash: digest });
const stored = closed({ contract, subject, event: identifier, target_hash: digest, value_hash: digest });
const unavailable = () => new Error("cloudflare.evidence.unavailable");
function table(namespace: unknown): string {
  if (typeof namespace !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(namespace)) throw unavailable();
  return `"${namespace}"."cloudflare_capture_evidence"`;
}

// Unconnected candidate ports. The host must separately authorize/provision the
// namespace, qualify SQL/commit semantics and accept durable audit/journal joins.
export function createCloudflareNativeCaptureSink(database: Pick<PluginContext["db"], "namespace" | "execute">): CaptureEvidenceSink {
  const target = table(database?.namespace);
  if (typeof database?.execute !== "function") throw unavailable();
  const execute = database.execute.bind(database);
  return Object.freeze({
    async append(input: CaptureEvidenceRecord): Promise<void> {
      try {
        const record = capture.parse(input);
        const result = await execute(`INSERT INTO ${target} (event, contract, subject, target_hash, value_hash)
          VALUES ($1, $2, $3, $4, $5)`, [record.event, record.contract, record.subject, record.targetHash, record.valueHash]);
        // Duplicate events refuse, even identical observations. No upsert/retry:
        // a lost acknowledgment may have committed the immutable record already.
        if (result?.rowCount !== 1) throw unavailable();
      } catch { throw unavailable(); }
    },
  });
}

export function createCloudflareNativeCaptureReader(database: Pick<PluginContext["db"], "namespace" | "query">) {
  const target = table(database?.namespace);
  if (typeof database?.query !== "function") throw unavailable();
  const query = database.query.bind(database);
  return Object.freeze({
    async read(input: CaptureEvidenceRecord): Promise<CaptureEvidenceRecord | null> {
      try {
        const expected = capture.parse(input);
        const rows: unknown = await query(`SELECT event, contract, subject, target_hash, value_hash FROM ${target} WHERE event = $1 LIMIT 2`, [expected.event]);
        if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
        if (rows.length === 0) return null;
        const record = stored.parse(rows[0]);
        if (record.event !== expected.event || record.contract !== expected.contract || record.subject !== expected.subject ||
          record.target_hash !== expected.targetHash || record.value_hash !== expected.valueHash) throw unavailable();
        return Object.freeze({ ...expected });
      } catch { throw unavailable(); }
    },
  });
}
