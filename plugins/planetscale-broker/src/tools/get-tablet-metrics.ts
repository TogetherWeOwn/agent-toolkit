import { historicalTabletMetricScope, historicalMetricAvailability, historicalMetricQuery, type HistoricalMetricAvailability } from "../historical-metrics.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_tablet_metrics";
export const tool = "planetscale.get_tablet_metrics";

export function prepare(scope: ReturnType<typeof historicalTabletMetricScope.parse>, args: unknown): PreparedRead<HistoricalMetricAvailability> {
  const target = historicalTabletMetricScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/metrics/tablets?${historicalMetricQuery(target)}`, body => historicalMetricAvailability(body, target));
}
