import { unifiedChangeScope, unifiedChangeSummary, type UnifiedChangeSummary } from "../unified-change-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_change_request";
export const tool = "planetscale.get_change_request";

export function prepare(scope: ReturnType<typeof unifiedChangeScope.parse>, args: unknown): PreparedRead<UnifiedChangeSummary> {
  const target = unifiedChangeScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/change-requests/${target.change.id}`,
    body => unifiedChangeSummary(body, [target.change]));
}
