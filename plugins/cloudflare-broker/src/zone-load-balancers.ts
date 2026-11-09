import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
// Pinned zone/balancer identifiers are strings with an example, not a hex/UUID contract.
// This is a deliberately bounded, path-safe local subset, not a provider claim.
const identifier = text(128, /^[A-Za-z0-9_-]+$(?![\s\S])/);
const listInput = closed({});
const getInput = closed({ loadBalancerId: identifier });
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string }>;
export interface ZoneLoadBalancerScope {
  accountId: string;
  zoneId: string;
  revision: string;
  listIds?: readonly string[];
  balancerIds?: readonly string[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function snapshot(raw: readonly string[] | undefined, max: number): ReadonlySet<string> {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= max, "cap");
  const ids = new Set<string>();
  for (const row of rows) {
    const id = identifier.parse(row);
    requireThat(!ids.has(id), "schema"); ids.add(id);
  }
  return ids;
}

export function zoneLoadBalancerDescriptors(scope: ZoneLoadBalancerScope) {
  const account = accountId.parse(scope.accountId), zone = identifier.parse(scope.zoneId), revision = label.parse(scope.revision);
  // Core jsonData permits at most 64 array elements; detail construction IDs never form output arrays.
  const listIds = snapshot(scope.listIds, 64), balancerIds = snapshot(scope.balancerIds, 100);
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
    if (row.account !== undefined) requireThat(object(row.account).id === account, "scope");
    if (row.zone !== undefined) requireThat(object(row.zone).id === zone, "scope");
  }
  function descriptor<A, O>(kind: "list" | "get", operation: string,
    prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string },
    project: (result: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name: `cloudflare.load_balancing.balancers.${kind}`, version: "1", tier: "read" as const,
      providerOperationId: operation,
      prepare(raw: unknown) {
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:load-balancing:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/load_balancers${input.suffix}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value); return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && Object.hasOwn(body, "result"), "upstream");
        // Collection metadata is not pagination authority or proof of completeness/ownership.
        if (kind === "list") object(body.result_info);
        const output = project(body.result, value.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return Object.freeze(output);
      },
    });
  }
  function identity(raw: unknown): Identity {
    const row = object(raw);
    context(row);
    requireThat(typeof row.id === "string" && row.id.length > 0 && row.id.length <= 128 && /^[A-Za-z0-9_-]+$(?![\s\S])/.test(row.id), "upstream");
    return Object.freeze({ id: row.id });
  }
  function collection(raw: unknown): readonly Identity[] {
    requireThat(Array.isArray(raw) && raw.length <= 1000, "cap");
    const items: Identity[] = [], seen = new Set<string>();
    for (const row of raw) {
      const item = identity(row);
      requireThat(!seen.has(item.id), "upstream"); seen.add(item.id);
      if (listIds.has(item.id)) items.push(item);
    }
    return Object.freeze(items);
  }
  const base = { subject: "configured-zone-load-balancers" as const, effectiveTrafficAndHealth: "not-established" as const };
  const balancersList = descriptor("list", "load-balancers-list-load-balancers", raw => {
    const args = listInput.parse(raw); requireThat(listIds.size > 0, "scope");
    return { arguments: args, suffix: "", resource: "balancers" };
  }, result => ({ ...base, items: collection(result), complete: false as const }));
  const balancerGet = descriptor("get", "load-balancers-load-balancer-details", raw => {
    const args = getInput.parse(raw); requireThat(balancerIds.has(args.loadBalancerId), "scope");
    return { arguments: args, suffix: `/${args.loadBalancerId}`, resource: `balancer:${args.loadBalancerId}` };
  }, (result, args) => {
    const item = identity(result); requireThat(item.id === args.loadBalancerId, "scope");
    return { ...base, item };
  });
  return Object.freeze({ balancersList, balancerGet });
}
