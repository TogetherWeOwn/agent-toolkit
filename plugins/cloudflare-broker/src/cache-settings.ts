import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface CacheSettingsScope {
  accountId: string;
  zoneId: string;
  revision: string;
  reserveReadAllowed?: boolean;
  smartTieredReadAllowed?: boolean;
}
interface CacheSettingResult {
  readonly configuredValue: "on" | "off";
  readonly subject: "configured-cache-reserve" | "configured-smart-tiered-cache";
  readonly effectiveCacheBehavior: "not-established";
  readonly performance: "not-established";
  readonly entitlements: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function cacheSettingsDescriptors(scope: CacheSettingsScope) {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  for (const value of [scope.reserveReadAllowed, scope.smartTieredReadAllowed]) {
    requireThat(value === undefined || typeof value === "boolean", "schema");
  }
  const reserveAllowed = scope.reserveReadAllowed === true;
  const smartTieredAllowed = scope.smartTieredReadAllowed === true;
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
  }
  function descriptor(name: string, providerOperationId: string, id: string, resource: string,
    subject: CacheSettingResult["subject"], allowed: boolean): MetadataDescriptor<Arguments, CacheSettingResult> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        requireThat(allowed, "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:${resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/cache/${id}`,
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
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && Object.hasOwn(body, "result"), "upstream");
        const row = object(body.result);
        context(row);
        requireThat(row.id === id && (row.value === "on" || row.value === "off") && typeof row.editable === "boolean", "upstream");
        return Object.freeze({ configuredValue: row.value as "on" | "off", subject,
          effectiveCacheBehavior: "not-established" as const, performance: "not-established" as const,
          entitlements: "not-established" as const });
      },
    });
  }
  return Object.freeze({
    reserveGet: descriptor("cloudflare.cache.reserve.get", "zone-cache-settings-get-cache-reserve-setting",
      "cache_reserve", "cache-reserve", "configured-cache-reserve", reserveAllowed),
    smartTieredGet: descriptor("cloudflare.cache.smart_tiered.get", "smart-tiered-cache-get-smart-tiered-cache-setting",
      "tiered_cache_smart_topology_enable", "smart-tiered-cache", "configured-smart-tiered-cache", smartTieredAllowed),
  });
}
