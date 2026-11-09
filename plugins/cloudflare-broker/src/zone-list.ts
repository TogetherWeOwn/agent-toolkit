import { closed, integer, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const input = closed({ page: integer(1, 1000), perPage: integer(5, 50) });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface ZoneList {
  subject: "provider-zone-identities";
  items: readonly { id: string }[];
  complete: false;
  internalZones: "excluded-by-provider-default";
  enumeration: "not-established";
}
export interface ZoneListScope {
  accountId: string;
  revision: string;
  zoneIds?: readonly string[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// Account-filtered discovery does not inherit a zone-detail grant. Internal
// zones are excluded by the official default; no complete estate claim follows.
export function zoneListDescriptor(scope: ZoneListScope): MetadataDescriptor<Arguments, ZoneList> {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const zoneIds = scope.zoneIds === undefined ? [] : scope.zoneIds;
  requireThat(Array.isArray(zoneIds) && zoneIds.length <= 100, "cap");
  const selected = new Set<string>(zoneIds.map((value: unknown) => identifier.parse(value)));
  requireThat(selected.size === zoneIds.length, "schema");
  const preparations = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.zones.list", version: "1", tier: "read", providerOperationId: "zones-get",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      requireThat(selected.size > 0, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:zones`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/zones?account.id=${account}&page=${args.page}&per_page=${args.perPage}&match=all`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): ZoneList {
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
        requireThat(object(row.account).id === account && (row.account_id === undefined || row.account_id === account), "scope");
        requireThat(!seen.has(id), "scope"); seen.add(id);
        if (selected.has(id)) items.push(Object.freeze({ id }));
      }
      return Object.freeze({ subject: "provider-zone-identities", items: Object.freeze(items), complete: false,
        internalZones: "excluded-by-provider-default", enumeration: "not-established" });
    },
  });
}
