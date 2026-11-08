import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const hostname = text(253, /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$(?![\s\S])/);
const input = closed({ hostname });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface HostnameOriginPullsScope {
  accountId: string;
  zoneId: string;
  revision: string;
  hostnames?: readonly string[];
}
interface HostnameOriginPullsResult {
  readonly hostname: string;
  readonly enabled: boolean | null | "unavailable";
  readonly subject: "configured-hostname-origin-pulls";
  readonly effectiveProtection: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function hostnameOriginPullsDescriptor(scope: HostnameOriginPullsScope): MetadataDescriptor<Arguments, HostnameOriginPullsResult> {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  const names = scope.hostnames === undefined ? [] : scope.hostnames;
  requireThat(Array.isArray(names) && names.length <= 100, "cap");
  const allowed = new Set<string>();
  for (const raw of names) {
    const name = hostname.parse(raw);
    requireThat(!allowed.has(name), "schema");
    allowed.add(name);
  }
  const prepared = new WeakSet<object>();
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
  }
  return Object.freeze({ name: "cloudflare.tls.hostname_origin_pulls.get", version: "1", tier: "read" as const,
    providerOperationId: "per-hostname-authenticated-origin-pull-get-the-hostname-status-for-client-authentication",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed.has(args.hostname), "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:hostname-origin-pulls:${args.hostname}`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/origin_tls_client_auth/hostnames/${args.hostname}`,
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
      requireThat(row.hostname === value.arguments.hostname, "scope");
      requireThat(row.enabled === undefined || row.enabled === null || typeof row.enabled === "boolean", "upstream");
      return Object.freeze({ hostname: value.arguments.hostname,
        enabled: row.enabled === undefined ? "unavailable" as const : row.enabled as boolean | null,
        subject: "configured-hostname-origin-pulls" as const, effectiveProtection: "not-established" as const });
    },
  });
}
