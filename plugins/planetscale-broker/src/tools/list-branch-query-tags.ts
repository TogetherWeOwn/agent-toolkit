import { queryTagListScope, queryTagMetadata, type QueryTagMetadata } from "../query-tags.js";
import { errorPage, type FirstErrorPage } from "../query-errors.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_query_tags";
export const tool = "planetscale.list_branch_query_tags";

export function prepare(scope: ReturnType<typeof queryTagListScope.parse>, args: unknown): PreparedRead<FirstErrorPage<QueryTagMetadata>> {
  const target = queryTagListScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/tags?page=1&per_page=10`, body => errorPage(body, row => queryTagMetadata(row, target.tags)));
}
