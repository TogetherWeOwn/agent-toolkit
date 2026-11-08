import { queryStatisticsScope, queryStatisticsMetadata } from "../query-statistics.js";
import { errorPage, type FirstErrorPage } from "../query-errors.js";
import { type QueryRecordMetadata } from "../query-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_query_statistics";
export const tool = "planetscale.get_query_statistics";

export function prepare(scope: ReturnType<typeof queryStatisticsScope.parse>, args: unknown): PreparedRead<FirstErrorPage<QueryRecordMetadata>> {
  const target = queryStatisticsScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/${target.fingerprint}?keyspace=${target.keyspace}&page=1&per_page=10`, body => errorPage(body, row => queryStatisticsMetadata(row, target)));
}
