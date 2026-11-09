import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface DnsSettingsScope {
  accountId: string;
  zoneId: string;
  revision: string;
  readAllowed?: boolean;
}
interface DnsSettingsResult {
  readonly flattenAllCnames: boolean | "unavailable";
  readonly multiProvider: boolean | "unavailable";
  readonly secondaryOverrides: boolean | "unavailable";
  readonly zoneMode: "standard" | "cdn_only" | "dns_only" | "unavailable";
  readonly nameserverTtl: number | "unavailable";
  readonly subject: "configured-zone-dns-settings";
  readonly effectiveDnsBehavior: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function flag(row: Row, field: string): boolean | "unavailable" {
  const value = row[field];
  requireThat(value === undefined || typeof value === "boolean", "upstream");
  return value === undefined ? "unavailable" : value as boolean;
}

export function projectDnsConfiguration(row: Row) {
  const mode = row.zone_mode;
  requireThat(mode === undefined || mode === "standard" || mode === "cdn_only" || mode === "dns_only", "upstream");
  const ttl = row.ns_ttl;
  requireThat(ttl === undefined || (typeof ttl === "number" && Number.isFinite(ttl) && ttl >= 30 && ttl <= 86400), "upstream");
  return Object.freeze({ flattenAllCnames: flag(row, "flatten_all_cnames"), multiProvider: flag(row, "multi_provider"),
    secondaryOverrides: flag(row, "secondary_overrides"),
    zoneMode: (mode === undefined ? "unavailable" : mode) as DnsSettingsResult["zoneMode"],
    nameserverTtl: ttl === undefined ? "unavailable" as const : ttl as number });
}

// SOA names/contact, internal fallback-zone IDs and nameserver-set identities
// are deliberately omitted. Configured values do not establish DNS behavior.
export function dnsSettingsDescriptor(scope: DnsSettingsScope): MetadataDescriptor<Arguments, DnsSettingsResult> {
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
  return Object.freeze({ name: "cloudflare.dns.settings.get", version: "1", tier: "read" as const,
    providerOperationId: "dns-settings-for-a-zone-list-dns-settings",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed, "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:dns-settings`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/dns_settings`,
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
      return Object.freeze({ ...projectDnsConfiguration(row),
        subject: "configured-zone-dns-settings" as const, effectiveDnsBehavior: "not-established" as const });
    },
  });
}
