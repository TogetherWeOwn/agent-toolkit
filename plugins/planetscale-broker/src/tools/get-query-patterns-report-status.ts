import { queryReportScope, queryReportSummary, type QueryReportSummary } from "../query-reports.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_query_patterns_report_status";
export const tool = "planetscale.get_query_patterns_report_status";

export function prepare(scope: ReturnType<typeof queryReportScope.parse>, args: unknown): PreparedRead<QueryReportSummary> {
  const target = queryReportScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/query-patterns/${target.reportId}`,
    body => queryReportSummary(body, [target.reportId]));
}
