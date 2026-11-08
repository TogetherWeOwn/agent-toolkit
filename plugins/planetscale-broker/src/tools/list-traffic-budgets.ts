import { requireThat } from "../../../../packages/core/src/schema.js";
import { trafficBudgetListScope, trafficBudgetSummary, type TrafficBudgetSummary } from "../traffic-budgets.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_traffic_budgets";
export const tool = "planetscale.list_traffic_budgets";

export function prepare(scope: ReturnType<typeof trafficBudgetListScope.parse>, args: unknown): PreparedRead<MetadataPage<TrafficBudgetSummary>> {
  const target = trafficBudgetListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/traffic/budgets?page=${parsed.page}&per_page=${parsed.perPage}`, body => {
    const result = page(body, parsed, row => trafficBudgetSummary(row, target.budgetIds));
    requireThat(new Set(result.items.map(row => row.id)).size === result.items.length, "upstream");
    return result;
  });
}
