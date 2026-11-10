import { trafficBudgetScope, trafficBudgetSummary, type TrafficBudgetSummary } from "../traffic-budgets.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_traffic_budget";
export const tool = "planetscale.get_traffic_budget";

export function prepare(scope: ReturnType<typeof trafficBudgetScope.parse>, args: unknown): PreparedRead<TrafficBudgetSummary> {
  const target = trafficBudgetScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/traffic/budgets/${target.budgetId}`,
    body => trafficBudgetSummary(body, [target.budgetId]));
}
