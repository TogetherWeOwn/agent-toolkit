import { errorSummaryScope, errorSummaryMetadata, errorPage, type ErrorSummaryMetadata, type FirstErrorPage } from "../query-errors.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_query_errors";
export const tool = "planetscale.list_branch_query_errors";

export function prepare(scope: ReturnType<typeof errorSummaryScope.parse>, args: unknown): PreparedRead<FirstErrorPage<ErrorSummaryMetadata>> {
  const target = errorSummaryScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/errors?page=1&per_page=10`, body => errorPage(body, row => errorSummaryMetadata(row, target.errors)));
}
