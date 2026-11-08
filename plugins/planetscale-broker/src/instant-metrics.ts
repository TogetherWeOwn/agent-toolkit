import { closed, identifier, oneOf, requireThat } from "../../../packages/core/src/schema.js";
import { record, slug } from "./metadata.js";

export const branchMetricNames = Object.freeze([
  "planetscale_backup_fetch_percent", "planetscale_backup_restore_active",
  "planetscale_dedicated_pgbouncer_cpu_usage", "planetscale_dedicated_pgbouncer_current_client_connections",
  "planetscale_dedicated_pgbouncer_current_connections", "planetscale_dedicated_pgbouncer_current_server_connections",
  "planetscale_dedicated_pgbouncer_max_connections", "planetscale_dedicated_pgbouncer_memory_usage",
  "planetscale_pgbouncer_current_client_connections", "planetscale_pgbouncer_current_server_connections",
  "planetscale_pgbouncer_settings_max_client_conn", "planetscale_postgres_connection_state",
  "planetscale_postgres_settings_max_connections", "planetscale_postgres_settings_max_wal_size_bytes",
  "planetscale_volume_capacity_bytes", "planetscale_volume_disk_usage_bytes", "planetscale_volume_usage_percentage",
] as const);
export const tabletMetricNames = Object.freeze([
  "replication_lag", "primary_cpu_usage", "primary_memory_usage", "vtgate_cpu_usage", "vtgate_memory_usage",
] as const);

const targetShape = { organization: slug, database: slug, branch: slug, branchId: identifier };
export const instantBranchMetricScope = closed({ ...targetShape, metric: oneOf(branchMetricNames) });
export const instantTabletMetricScope = closed({ ...targetShape, metric: oneOf(tabletMetricNames) });
type InstantMetricScope = ReturnType<typeof instantBranchMetricScope.parse> | ReturnType<typeof instantTabletMetricScope.parse>;

export interface InstantMetricAvailability {
  readonly branchId: string;
  readonly items: readonly Readonly<{ metric: InstantMetricScope["metric"]; samplesPresent: boolean }>[];
  readonly health: "not-established";
}

export function instantMetricAvailability(body: Record<string, unknown>, target: InstantMetricScope): InstantMetricAvailability {
  const branch = record(body.branch);
  requireThat(branch.id === target.branchId && branch.name === target.branch, "scope");
  // The schema does not define an enum for type. Never interpret it as status.
  requireThat(typeof body.type === "string" && body.type.length > 0 && body.type.length <= 80, "upstream");
  requireThat(Array.isArray(body.metrics) && body.metrics.length <= 1, "upstream");
  const items = body.metrics.map(value => {
    const row = record(value);
    requireThat(row.metric === target.metric, "scope");
    requireThat(Array.isArray(row.values) && row.values.length <= 32, "upstream");
    // Validate sample shape, but never return values or interpret health/roles.
    for (const value of row.values) {
      const sample = record(value);
      requireThat(typeof sample.pod === "string" && sample.pod.length > 0 && sample.pod.length <= 256, "upstream");
      requireThat(typeof sample.role === "string" && sample.role.length > 0 && sample.role.length <= 80, "upstream");
      requireThat(typeof sample.value === "number" && Number.isFinite(sample.value), "upstream");
    }
    return Object.freeze({ metric: target.metric, samplesPresent: row.values.length > 0 });
  });
  return Object.freeze({ branchId: target.branchId, items: Object.freeze(items), health: "not-established" });
}
