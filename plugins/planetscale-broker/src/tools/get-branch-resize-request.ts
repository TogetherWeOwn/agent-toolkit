import { branchResizeScope, resizeSummary, type ResizeSummary } from "../resize-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_resize_request";
export const tool = "planetscale.get_branch_resize_request";

export function prepare(scope: ReturnType<typeof branchResizeScope.parse>, args: unknown): PreparedRead<ResizeSummary> {
  const target = branchResizeScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/resizes/${target.resize.id}`,
    body => resizeSummary(body, [target.resize]));
}
