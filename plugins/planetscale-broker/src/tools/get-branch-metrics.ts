import { historicalBranchMetricScope, historicalMetricAvailability, historicalMetricQuery, type HistoricalMetricAvailability } from "../historical-metrics.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_metrics";
export const tool = "planetscale.get_branch_metrics";

export function prepare(scope: ReturnType<typeof historicalBranchMetricScope.parse>, args: unknown): PreparedRead<HistoricalMetricAvailability> {
  const target = historicalBranchMetricScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/metrics?${historicalMetricQuery(target)}`, body => historicalMetricAvailability(body, target));
}
