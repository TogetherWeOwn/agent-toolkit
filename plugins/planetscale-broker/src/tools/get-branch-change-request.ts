import { branchChangeScope } from "../change-records.js";
import { resizeSummary, type ResizeSummary } from "../resize-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_change_request";
export const tool = "planetscale.get_branch_change_request";

export function prepare(scope: ReturnType<typeof branchChangeScope.parse>, args: unknown): PreparedRead<ResizeSummary> {
  const target = branchChangeScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/changes/${target.change.id}`,
    body => resizeSummary(body, [target.change]));
}
