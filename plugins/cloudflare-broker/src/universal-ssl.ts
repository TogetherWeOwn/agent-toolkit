import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface UniversalSslScope {
  accountId: string;
  zoneId: string;
  revision: string;
  readAllowed?: boolean;
}
interface UniversalSslResult {
  readonly enabled: boolean | "unavailable";
  readonly subject: "configured-zone-universal-ssl";
  readonly effectiveProtection: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function universalSslDescriptor(scope: UniversalSslScope): MetadataDescriptor<Arguments, UniversalSslResult> {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  requireThat(scope.readAllowed === undefined || typeof scope.readAllowed === "boolean", "schema");
  const allowed = scope.readAllowed === true;
  const prepared = new WeakSet<object>();
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
  }
  return Object.freeze({ name: "cloudflare.tls.universal.get", version: "1", tier: "read" as const,
    providerOperationId: "universal-ssl-settings-for-a-zone-universal-ssl-settings-details",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed, "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:universal-ssl`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/ssl/universal/settings`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      prepared.add(value);
      return value;
    },
    project(raw: string, value: PreparedMetadata<Arguments>) {
      requireThat(prepared.has(value), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      context(body);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      context(row);
      requireThat(row.enabled === undefined || typeof row.enabled === "boolean", "upstream");
      return Object.freeze({ enabled: row.enabled === undefined ? "unavailable" as const : row.enabled as boolean,
        subject: "configured-zone-universal-ssl" as const, effectiveProtection: "not-established" as const });
    },
  });
}
