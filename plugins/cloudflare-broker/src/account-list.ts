import { closed, integer, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const input = closed({ page: integer(1, 1000), perPage: integer(5, 50) });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface AccountList {
  subject: "provider-account-identities";
  items: readonly { id: string }[];
  complete: false;
  enumeration: "not-established";
  effectiveMembership: "not-established";
}
export interface AccountListScope {
  accountId: string;
  revision: string;
  readAllowed?: boolean;
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// The provider has no account-ID list filter. Project only the trusted account,
// never other accessible identities or an absence/membership conclusion.
export function accountListDescriptor(scope: AccountListScope): MetadataDescriptor<Arguments, AccountList> {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  requireThat(scope.readAllowed === undefined || typeof scope.readAllowed === "boolean", "schema");
  const readAllowed = scope.readAllowed === true;
  const preparations = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.accounts.list", version: "1", tier: "read", providerOperationId: "accounts-list-accounts",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      requireThat(readAllowed, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:account-list`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts?page=${args.page}&per_page=${args.perPage}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): AccountList {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      requireThat(body.account_id === undefined || body.account_id === account, "scope");
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      requireThat(Array.isArray(body.result) && body.result.length <= prepared.arguments.perPage, "cap");
      const items: { id: string }[] = [], seen = new Set<string>();
      for (const entry of body.result) {
        const row = object(entry), id = identifier.parse(row.id);
        requireThat(row.account_id === undefined || row.account_id === id, "scope");
        requireThat(!seen.has(id), "scope"); seen.add(id);
        if (id === account) items.push(Object.freeze({ id }));
      }
      return Object.freeze({ subject: "provider-account-identities", items: Object.freeze(items), complete: false,
        enumeration: "not-established", effectiveMembership: "not-established" });
    },
  });
}
