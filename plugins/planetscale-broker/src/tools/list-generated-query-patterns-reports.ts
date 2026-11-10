import { queryReportListScope, queryReportFirstPage, type QueryReportFirstPage } from "../query-reports.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "list_generated_query_patterns_reports";
export const tool = "planetscale.list_generated_query_patterns_reports";

export function prepare(scope: ReturnType<typeof queryReportListScope.parse>, args: unknown): PreparedRead<QueryReportFirstPage> {
  const target = queryReportListScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/query-patterns?limit=10`,
    body => queryReportFirstPage(body, target.reportIds));
}
