import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ProviderDependencies } from "../../../packages/core/src/provider/contracts.js";
import { digest, identifier } from "../../../packages/core/src/schema.js";

type Database = Pick<PluginContext["db"], "namespace" | "execute">;

// Candidate native SQL adapter, not installed-host qualification. The host must
// provision and qualify the fixed table/unique key, SQL admission and durability
// separately. No DDL, deletion, expiry, claim takeover or in-memory fallback.
export function createCloudflareNativeJournal(database: Database): ProviderDependencies["journal"] {
  const unavailable = () => new Error("cloudflare.journal.unavailable");
  const namespace = database?.namespace;
  if (typeof namespace !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(namespace) ||
    typeof database?.execute !== "function") throw unavailable();
  const execute = database.execute.bind(database);
  const table = `"${namespace}"."cloudflare_provider_calls"`;
  return Object.freeze({
    async claim(key: string, targetHash: string, event: string): Promise<boolean> {
      try {
        digest.parse(key); digest.parse(targetHash); identifier.parse(event);
        const result = await execute(`INSERT INTO ${table} (key, target, event, outcome)
          VALUES ($1, $2, $3, 'pending') ON CONFLICT (key) DO NOTHING`, [key, targetHash, event]);
        if (result?.rowCount !== 0 && result?.rowCount !== 1) throw unavailable();
        return result.rowCount === 1;
      } catch { throw unavailable(); }
    },
    async finish(key: string, event: string, outcome: "complete" | "refused" | "uncertain"): Promise<void> {
      try {
        digest.parse(key); identifier.parse(event);
        if (!["complete", "refused", "uncertain"].includes(outcome)) throw unavailable();
        // Core finishes before outcome audit: a failed audit must downgrade a
        // complete observation to uncertain. No caller can upgrade uncertain.
        const result = await execute(`UPDATE ${table} SET outcome = $3
          WHERE key = $1 AND event = $2 AND (outcome = 'pending' OR outcome = $3
            OR (outcome = 'complete' AND $3 = 'uncertain'))`, [key, event, outcome]);
        if (result?.rowCount !== 1) throw unavailable();
      } catch { throw unavailable(); }
    },
  });
}
