import { instantBranchMetricScope, instantMetricAvailability, type InstantMetricAvailability } from "../instant-metrics.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_instant_branch_metrics";
export const tool = "planetscale.get_instant_branch_metrics";

export function prepare(scope: ReturnType<typeof instantBranchMetricScope.parse>, args: unknown): PreparedRead<InstantMetricAvailability> {
  const target = instantBranchMetricScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/metrics/instant?metrics=${target.metric}`, body => instantMetricAvailability(body, target));
}
