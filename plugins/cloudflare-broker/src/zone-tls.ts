import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const setting = text(16, /^(?:ssl|min_tls_version|tls_1_3|always_use_https|http2|ciphers)$(?![\s\S])/);
const cipher = text(128, /^[A-Z0-9][A-Z0-9_-]*$(?![\s\S])/);
const input = closed({ settingId: setting });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface ZoneTlsScope {
  accountId: string;
  zoneId: string;
  revision: string;
  settingIds?: readonly string[];
}
interface ZoneTlsResult {
  readonly settingId: string;
  readonly value: string | readonly string[];
  readonly subject: "configured-zone-tls";
  readonly effectiveProtection: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function zoneTlsDescriptor(scope: ZoneTlsScope): MetadataDescriptor<Arguments, ZoneTlsResult> {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  const ids = scope.settingIds ?? [];
  requireThat(Array.isArray(ids) && ids.length <= 6, "cap");
  const allowed = new Set<string>();
  for (const raw of ids) {
    const id = setting.parse(raw);
    requireThat(!allowed.has(id), "schema");
    allowed.add(id);
  }
  const prepared = new WeakSet<object>();
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
  }
  return Object.freeze({ name: "cloudflare.tls.zone.get", version: "1", tier: "read" as const,
    providerOperationId: "zone-settings-get-single-setting",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed.has(args.settingId), "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:tls-setting:${args.settingId}`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/settings/${args.settingId}`,
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
      const id = value.arguments.settingId;
      requireThat(row.id === id, "scope");
      let configured: string | readonly string[];
      if (id === "ciphers") {
        // An explicitly empty provider list is valid, not an invented cipher default.
        requireThat(Array.isArray(row.value) && row.value.length <= 100, "cap");
        const values = row.value.map(item => cipher.parse(item));
        requireThat(new Set(values).size === values.length, "upstream");
        configured = Object.freeze(values);
      } else {
        const values = id === "ssl" ? ["off", "flexible", "full", "strict"]
          : id === "min_tls_version" ? ["1.0", "1.1", "1.2", "1.3"]
          : id === "tls_1_3" ? ["on", "off", "zrt"] : ["on", "off"];
        requireThat(typeof row.value === "string" && values.includes(row.value), "upstream");
        configured = row.value;
      }
      const output = Object.freeze({ settingId: id, value: configured, subject: "configured-zone-tls" as const,
        effectiveProtection: "not-established" as const });
      requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
      return output;
    },
  });
}
