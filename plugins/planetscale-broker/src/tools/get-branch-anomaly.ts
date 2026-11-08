import { anomalyScope, anomalySummary, type AnomalySummary } from "../anomalies.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_anomaly";
export const tool = "planetscale.get_branch_anomaly";

export function prepare(scope: ReturnType<typeof anomalyScope.parse>, args: unknown): PreparedRead<AnomalySummary> {
  const target = anomalyScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/anomalies/${target.anomalyId}`,
    body => anomalySummary(body, [target.anomalyId]));
}
