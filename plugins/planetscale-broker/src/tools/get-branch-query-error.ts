import { errorQueryScope, errorQueryMetadata, errorPage, type FirstErrorPage } from "../query-errors.js";
import { type QueryRecordMetadata } from "../query-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_query_error";
export const tool = "planetscale.get_branch_query_error";

export function prepare(scope: ReturnType<typeof errorQueryScope.parse>, args: unknown): PreparedRead<FirstErrorPage<QueryRecordMetadata>> {
  const target = errorQueryScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/errors/${target.errorFingerprint}?page=1&per_page=10`, body => errorPage(body, row => errorQueryMetadata(row, target.queryIds)));
}
