import { requireThat } from "../../../../packages/core/src/schema.js";
import { queryTagScope, queryTagMetadata, type QueryTagMetadata } from "../query-tags.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_query_tag";
export const tool = "planetscale.get_branch_query_tag";

export function prepare(scope: ReturnType<typeof queryTagScope.parse>, args: unknown): PreparedRead<QueryTagMetadata> {
  const target = queryTagScope.parse(scope);
  emptyArguments.parse(args);
  // This literal is a different static endpoint, not a tag-detail request.
  requireThat(target.tag.name !== "summaries", "scope");
  return prepared(`${branchPath(target)}/insights/tags/${target.tag.name}`, body => queryTagMetadata(body, [target.tag]));
}
