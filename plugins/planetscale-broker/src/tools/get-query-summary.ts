import { fingerprintSummaryScope, fingerprintSummaryMetadata } from "../query-statistics.js";
import { type QuerySummaryMetadata } from "../query-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_query_summary";
export const tool = "planetscale.get_query_summary";

export function prepare(scope: ReturnType<typeof fingerprintSummaryScope.parse>, args: unknown): PreparedRead<QuerySummaryMetadata> {
  const target = fingerprintSummaryScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/${target.fingerprint}/summary?keyspace=${target.keyspace}`, body => fingerprintSummaryMetadata(body, target));
}
