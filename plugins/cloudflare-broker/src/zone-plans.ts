import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const listInput = closed({});
const getInput = closed({ planId: identifier });
type Row = Record<string, unknown>;
export interface ZonePlanScope {
  accountId: string;
  zoneId: string;
  revision: string;
  listPlanIds?: readonly string[];
  planIds?: readonly string[];
}
interface PlanMetadata {
  readonly planId: string;
  readonly canSubscribe: boolean | "unavailable";
  readonly isSubscribed: boolean | "unavailable";
  readonly subject: "provider-reported-available-plan";
  readonly effectiveEntitlements: "not-established";
  readonly cost: "not-projected";
}
interface PlanList {
  readonly items: readonly PlanMetadata[];
  readonly complete: false;
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function flag(value: unknown): boolean | "unavailable" {
  requireThat(value === undefined || typeof value === "boolean", "upstream");
  return value === undefined ? "unavailable" : value as boolean;
}
function snapshot(values: readonly string[] | undefined): ReadonlySet<string> {
  const entries = values === undefined ? [] : values;
  requireThat(Array.isArray(entries) && entries.length <= 100, "cap");
  const ids = new Set<string>();
  for (const value of entries) {
    const id = identifier.parse(value);
    requireThat(!ids.has(id), "schema");
    ids.add(id);
  }
  return ids;
}

// Available-plan flags are provider reports, not effective limits or spend authority.
export function zonePlanDescriptors(scope: ZonePlanScope): {
  plansList: MetadataDescriptor<ReturnType<typeof listInput.parse>, PlanList>;
  planGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, PlanMetadata>;
} {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  const listIds = snapshot(scope.listPlanIds);
  const getIds = snapshot(scope.planIds);
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
    if (row.account !== undefined) requireThat(object(row.account).id === account, "scope");
    if (row.zone !== undefined) requireThat(object(row.zone).id === zone, "scope");
  }
  function envelope(raw: string): unknown {
    requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
    const body = object(parsed);
    context(body);
    requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
    return body.result;
  }
  function project(row: Row, id: string): PlanMetadata {
    return Object.freeze({ planId: id, canSubscribe: flag(row.can_subscribe), isSubscribed: flag(row.is_subscribed),
      subject: "provider-reported-available-plan" as const, effectiveEntitlements: "not-established" as const,
      cost: "not-projected" as const });
  }
  function prepare<A>(args: A, id?: string): PreparedMetadata<A> {
    return Object.freeze({ arguments: args,
      resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:available-plans${id === undefined ? "" : `:plan:${id}`}`, revision }),
      request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/available_plans${id === undefined ? "" : `/${id}`}`,
        maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
  }
  const lists = new WeakSet<object>();
  const gets = new WeakSet<object>();
  return Object.freeze({
    plansList: Object.freeze({ name: "cloudflare.zones.available_plans.list", version: "1", tier: "read" as const,
      providerOperationId: "zone-rate-plan-list-available-plans",
      prepare(raw: unknown) {
        const args = listInput.parse(raw);
        requireThat(listIds.size > 0, "scope");
        const value = prepare(args);
        lists.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<ReturnType<typeof listInput.parse>>) {
        requireThat(lists.has(value), "scope");
        const rows = envelope(raw);
        requireThat(Array.isArray(rows) && rows.length <= 1000, "cap");
        const seen = new Set<string>();
        const items: PlanMetadata[] = [];
        for (const rawRow of rows) {
          const row = object(rawRow);
          context(row);
          const id = identifier.parse(row.id);
          requireThat(!seen.has(id), "upstream");
          seen.add(id);
          if (listIds.has(id)) items.push(project(row, id));
        }
        const output = Object.freeze({ items: Object.freeze(items), complete: false as const });
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return output;
      },
    }),
    planGet: Object.freeze({ name: "cloudflare.zones.available_plans.get", version: "1", tier: "read" as const,
      providerOperationId: "zone-rate-plan-available-plan-details",
      prepare(raw: unknown) {
        const args = getInput.parse(raw);
        requireThat(getIds.has(args.planId), "scope");
        const value = prepare(args, args.planId);
        gets.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<ReturnType<typeof getInput.parse>>) {
        requireThat(gets.has(value), "scope");
        const row = object(envelope(raw));
        context(row);
        requireThat(row.id === value.arguments.planId, "scope");
        return project(row, value.arguments.planId);
      },
    }),
  });
}
