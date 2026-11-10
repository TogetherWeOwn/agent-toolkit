import { queryRecordMetadata, queryRecordScope, type QueryRecordMetadata } from "../query-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_query";
export const tool = "planetscale.get_branch_query";

export function prepare(scope: ReturnType<typeof queryRecordScope.parse>, args: unknown): PreparedRead<QueryRecordMetadata> {
  const target = queryRecordScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/queries/${target.queryId}`,
    body => queryRecordMetadata(body, target.queryId));
}
