import { closed, identifier, requireThat } from "../../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, prepared, record, slug, type PreparedRead } from "../metadata.js";

export const operationId = "get_move_tables_workflow_status";
export const tool = "planetscale.get_move_tables_workflow_status";
export const scopeSchema = closed({
  organization: slug, database: slug, branch: slug, branchId: identifier,
  workflow: slug, targetKeyspace: slug, keyspaceId: identifier,
});

export interface MoveTablesStatusAvailability {
  readonly requestBranchId: string;
  readonly requestKeyspaceId: string;
  readonly trafficStateReported: boolean;
  readonly tableCopyReported: boolean;
  readonly shardStreamsReported: boolean;
  readonly provenance: "not-established";
  readonly executionAuthority: "not-established";
}

function optionalEntries(value: unknown): readonly Record<string, unknown>[] {
  if (value === undefined) return [];
  const entries = Object.values(record(value));
  requireThat(entries.length <= 32, "upstream");
  return entries.map(record);
}

export function prepare(scope: ReturnType<typeof scopeSchema.parse>, args: unknown): PreparedRead<MoveTablesStatusAvailability> {
  const target = scopeSchema.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/move-tables/workflows/${target.workflow}/status?target_keyspace=${target.targetKeyspace}`, body => {
    const data = record(body.data);
    requireThat(data.traffic_state === undefined || (typeof data.traffic_state === "string" && data.traffic_state.length <= 4096), "upstream");
    const tables = optionalEntries(data.table_copy_state);
    const streams = optionalEntries(data.shard_streams);
    for (const table of tables) {
      for (const field of ["rows_copied", "rows_total", "bytes_copied", "bytes_total"]) {
        requireThat(table[field] === undefined || Number.isSafeInteger(table[field]), "upstream");
      }
      for (const field of ["rows_percentage", "bytes_percentage"]) {
        requireThat(table[field] === undefined || (typeof table[field] === "number" && Number.isFinite(table[field])), "upstream");
      }
    }
    // The documented response has no branch, keyspace or workflow identity.
    // Field presence is not copy completion, traffic safety or native authority.
    return Object.freeze({
      requestBranchId: target.branchId, requestKeyspaceId: target.keyspaceId,
      trafficStateReported: typeof data.traffic_state === "string" && data.traffic_state.length > 0,
      tableCopyReported: tables.length > 0, shardStreamsReported: streams.length > 0,
      provenance: "not-established", executionAuthority: "not-established",
    });
  });
}
