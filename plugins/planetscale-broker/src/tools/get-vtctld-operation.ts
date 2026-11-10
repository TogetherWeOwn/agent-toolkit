import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";
import { vtctldOperationScope, vtctldOperationSummary, type VtctldOperationSummary } from "../operation-status.js";

export const operationId = "get_vtctld_operation";
export const tool = "planetscale.get_vtctld_operation";

export function prepare(scope: ReturnType<typeof vtctldOperationScope.parse>, args: unknown): PreparedRead<VtctldOperationSummary> {
  const target = vtctldOperationScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/vtctld/operations/${target.operationId}`,
    body => vtctldOperationSummary(body, target.operationId));
}
