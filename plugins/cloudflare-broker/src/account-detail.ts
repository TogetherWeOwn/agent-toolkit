import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface AccountDetail {
  subject: "provider-account-detail";
  id: string;
  type: "standard" | "enterprise";
  configuredEnforceTwofactor: boolean | "unavailable";
  effectiveEnforcementAndMembership: "not-established";
}
export interface AccountDetailScope {
  accountId: string;
  revision: string;
  readAllowed?: boolean;
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// Account detail has its own authority, not inherited service visibility.
// The configured flag does not establish effective enforcement or membership.
export function accountDetailDescriptor(scope: AccountDetailScope): MetadataDescriptor<Arguments, AccountDetail> {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  requireThat(scope.readAllowed === undefined || typeof scope.readAllowed === "boolean", "schema");
  const readAllowed = scope.readAllowed === true;
  const preparations = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.accounts.get", version: "1", tier: "read", providerOperationId: "accounts-account-details",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      requireThat(readAllowed, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:details`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): AccountDetail {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      requireThat(body.account_id === undefined || body.account_id === account, "scope");
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      requireThat(identifier.parse(row.id) === account && (row.account_id === undefined || row.account_id === account), "scope");
      requireThat(row.type === "standard" || row.type === "enterprise", "upstream");
      const settings = row.settings === undefined ? undefined : object(row.settings);
      const enforce = settings?.enforce_twofactor;
      requireThat(enforce === undefined || typeof enforce === "boolean", "upstream");
      return Object.freeze({ subject: "provider-account-detail", id: account, type: row.type as "standard" | "enterprise",
        configuredEnforceTwofactor: enforce === undefined ? "unavailable" : enforce as boolean,
        effectiveEnforcementAndMembership: "not-established" });
    },
  });
}
