import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";
import { projectDnsConfiguration } from "./dns-settings.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface AccountDnsScope {
  accountId: string;
  revision: string;
  readAllowed?: boolean;
}
interface AccountDnsResult {
  readonly enforceDnsOnly: boolean | "unavailable";
  readonly newZoneDefaults: ReturnType<typeof projectDnsConfiguration>;
  readonly subject: "configured-account-dns-settings";
  readonly effectiveDnsBehavior: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// Account zone_defaults apply to new zones, not existing-zone configuration.
export function accountDnsDescriptor(scope: AccountDnsScope): MetadataDescriptor<Arguments, AccountDnsResult> {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  requireThat(scope.readAllowed === undefined || typeof scope.readAllowed === "boolean", "schema");
  const allowed = scope.readAllowed === true;
  const prepared = new WeakSet<object>();
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  return Object.freeze({ name: "cloudflare.dns.account_settings.get", version: "1", tier: "read" as const,
    providerOperationId: "dns-settings-for-an-account-list-dns-settings",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed, "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:dns-settings`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/dns_settings`,
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
      const defaults = object(row.zone_defaults);
      context(defaults);
      const enforce = row.enforce_dns_only;
      requireThat(enforce === undefined || typeof enforce === "boolean", "upstream");
      return Object.freeze({ enforceDnsOnly: enforce === undefined ? "unavailable" as const : enforce as boolean,
        newZoneDefaults: projectDnsConfiguration(defaults), subject: "configured-account-dns-settings" as const,
        effectiveDnsBehavior: "not-established" as const });
    },
  });
}
