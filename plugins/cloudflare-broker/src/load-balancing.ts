import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
// The pinned pool/monitor identifiers are strings, not hex/UUID contracts.
// This is a deliberately bounded, path-safe local subset, not a provider claim.
const identifier = text(128, /^[A-Za-z0-9_-]+$(?![\s\S])/);
const empty = closed({});
const pool = closed({ poolId: identifier });
const monitor = closed({ monitorId: identifier });
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string }>;
export interface LoadBalancingScope {
  accountId: string;
  revision: string;
  poolListIds?: readonly string[];
  poolIds?: readonly string[];
  monitorListIds?: readonly string[];
  monitorIds?: readonly string[];
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

export function loadBalancingDescriptors(scope: LoadBalancingScope) {
  const account = accountId.parse(scope.accountId), revision = label.parse(scope.revision);
  // Core jsonData permits at most 64 array elements (plus the length key).
  const poolList = snapshot(scope.poolListIds, 64), pools = snapshot(scope.poolIds, 100);
  const monitorList = snapshot(scope.monitorListIds, 64), monitors = snapshot(scope.monitorIds, 100);
  function descriptor<A, O>(family: "pools" | "monitors", kind: "list" | "get", operation: string,
    prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string },
    project: (result: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name: `cloudflare.load_balancing.${family}.${kind}`, version: "1", tier: "read" as const,
      providerOperationId: operation,
      prepare(raw: unknown) {
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}:load-balancing:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/load_balancers/${family}${input.suffix}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value); return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && Object.hasOwn(body, "result"), "upstream");
        // result_info is required for collections, but gives no request pagination
        // authority. Neither it nor unmodeled account fields establish ownership.
        if (kind === "list") object(body.result_info);
        const output = project(body.result, value.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return Object.freeze(output);
      },
    });
  }
  function identity(raw: unknown): Identity {
    const row = object(raw);
    requireThat(typeof row.id === "string" && row.id.length > 0 && row.id.length <= 128 && /^[A-Za-z0-9_-]+$(?![\s\S])/.test(row.id), "upstream");
    return Object.freeze({ id: row.id });
  }
  function collection(raw: unknown, selected: ReadonlySet<string>): readonly Identity[] {
    requireThat(Array.isArray(raw) && raw.length <= 1000, "cap");
    const items: Identity[] = [], seen = new Set<string>();
    for (const row of raw) {
      const item = identity(row);
      requireThat(!seen.has(item.id), "upstream"); seen.add(item.id);
      if (selected.has(item.id)) items.push(item);
    }
    return Object.freeze(items);
  }
  function detail(raw: unknown, expected: string): Identity {
    const item = identity(raw); requireThat(item.id === expected, "scope"); return item;
  }
  const poolBase = { subject: "configured-load-balancer-pools" as const, effectiveTrafficAndHealth: "not-established" as const };
  const monitorBase = { subject: "configured-load-balancer-monitors" as const, effectiveTrafficAndHealth: "not-established" as const };
  const poolsList = descriptor("pools", "list", "account-load-balancer-pools-list-pools", raw => {
    const args = empty.parse(raw); requireThat(poolList.size > 0, "scope");
    return { arguments: args, suffix: "", resource: "pools" };
  }, result => ({ ...poolBase, items: collection(result, poolList), complete: false as const }));
  const poolGet = descriptor("pools", "get", "account-load-balancer-pools-pool-details", raw => {
    const args = pool.parse(raw); requireThat(pools.has(args.poolId), "scope");
    return { arguments: args, suffix: `/${args.poolId}`, resource: `pool:${args.poolId}` };
  }, (result, args) => ({ ...poolBase, item: detail(result, args.poolId) }));
  const monitorsList = descriptor("monitors", "list", "account-load-balancer-monitors-list-monitors", raw => {
    const args = empty.parse(raw); requireThat(monitorList.size > 0, "scope");
    return { arguments: args, suffix: "", resource: "monitors" };
  }, result => ({ ...monitorBase, items: collection(result, monitorList), complete: false as const }));
  const monitorGet = descriptor("monitors", "get", "account-load-balancer-monitors-monitor-details", raw => {
    const args = monitor.parse(raw); requireThat(monitors.has(args.monitorId), "scope");
    return { arguments: args, suffix: `/${args.monitorId}`, resource: `monitor:${args.monitorId}` };
  }, (result, args) => ({ ...monitorBase, item: detail(result, args.monitorId) }));
  return Object.freeze({ poolsList, poolGet, monitorsList, monitorGet });
}
