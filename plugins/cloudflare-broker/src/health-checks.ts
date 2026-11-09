import { closed, integer, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
// Retain the common zone grammar; healthchecks_identifier is not a hex guarantee.
const zoneId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
// Deliberate local path-safe subset of the official string maxLength 32.
const identifier = text(32, /^[A-Za-z0-9_-]+$(?![\s\S])/);
const listInput = closed({ page: integer(1, 100), perPage: integer(5, 100) });
const getInput = closed({ healthcheckId: identifier });
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string }>;
export interface HealthCheckScope {
  accountId: string;
  zoneId: string;
  revision: string;
  listIds?: readonly string[];
  healthcheckIds?: readonly string[];
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

export function healthCheckDescriptors(scope: HealthCheckScope) {
  const account = accountId.parse(scope.accountId), zone = zoneId.parse(scope.zoneId), revision = label.parse(scope.revision);
  // Core jsonData permits 64 array elements; detail scope never becomes an output array.
  const listIds = snapshot(scope.listIds, 64), healthcheckIds = snapshot(scope.healthcheckIds, 100);
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
    if (row.account !== undefined) requireThat(object(row.account).id === account, "scope");
    if (row.zone !== undefined) requireThat(object(row.zone).id === zone, "scope");
  }
  function descriptor<A, O>(kind: "list" | "get", operation: string,
    prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string },
    project: (body: Row, args: A) => O): MetadataDescriptor<A, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name: `cloudflare.health_checks.${kind}`, version: "1", tier: "read" as const,
      providerOperationId: operation,
      prepare(raw: unknown) {
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:health-checks:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/healthchecks${input.suffix}`,
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
        const output = project(body, value.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return Object.freeze(output);
      },
    });
  }
  function identity(raw: unknown): Identity {
    const row = object(raw);
    context(row);
    requireThat(typeof row.id === "string" && row.id.length > 0 && row.id.length <= 32 && /^[A-Za-z0-9_-]+$(?![\s\S])/.test(row.id), "upstream");
    return Object.freeze({ id: row.id });
  }
  const base = { subject: "configured-health-checks" as const, effectiveHealthAndProtection: "not-established" as const };
  const checksList = descriptor("list", "health-checks-list-health-checks", raw => {
    const args = listInput.parse(raw);
    requireThat(args.perPage % 5 === 0, "schema"); requireThat(listIds.size > 0, "scope");
    return { arguments: args, suffix: `?page=${args.page}&per_page=${args.perPage}`, resource: "checks" };
  }, (body, args) => {
    const info = object(body.result_info);
    for (const key of ["page", "per_page", "count", "total_count"]) {
      const value = info[key];
      requireThat(value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0), "upstream");
    }
    requireThat(info.page === undefined || info.page === args.page, "upstream");
    requireThat(info.per_page === undefined || info.per_page === args.perPage, "upstream");
    requireThat(Array.isArray(body.result) && body.result.length <= args.perPage, "cap");
    const items: Identity[] = [], seen = new Set<string>();
    for (const row of body.result) {
      const item = identity(row);
      requireThat(!seen.has(item.id), "upstream"); seen.add(item.id);
      if (listIds.has(item.id)) items.push(item);
    }
    // No terminal-page inference or follow-up request, including an empty page.
    return { ...base, items: Object.freeze(items), complete: false as const };
  });
  const checkGet = descriptor("get", "health-checks-health-check-details", raw => {
    const args = getInput.parse(raw); requireThat(healthcheckIds.has(args.healthcheckId), "scope");
    return { arguments: args, suffix: `/${args.healthcheckId}`, resource: `check:${args.healthcheckId}` };
  }, (body, args) => {
    const item = identity(body.result); requireThat(item.id === args.healthcheckId, "scope");
    return { ...base, item };
  });
  return Object.freeze({ checksList, checkGet });
}
