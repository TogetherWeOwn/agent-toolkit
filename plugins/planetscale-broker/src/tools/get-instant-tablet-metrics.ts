import { instantTabletMetricScope, instantMetricAvailability, type InstantMetricAvailability } from "../instant-metrics.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_instant_tablet_metrics";
export const tool = "planetscale.get_instant_tablet_metrics";

export function prepare(scope: ReturnType<typeof instantTabletMetricScope.parse>, args: unknown): PreparedRead<InstantMetricAvailability> {
  const target = instantTabletMetricScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/metrics/tablets-instant?metrics=${target.metric}`, body => instantMetricAvailability(body, target));
}
