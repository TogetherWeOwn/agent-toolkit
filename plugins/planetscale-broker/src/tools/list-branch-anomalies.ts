import { requireThat } from "../../../../packages/core/src/schema.js";
import { anomalyListScope, anomalySummary, type AnomalySummary } from "../anomalies.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_anomalies";
export const tool = "planetscale.list_branch_anomalies";

export function prepare(scope: ReturnType<typeof anomalyListScope.parse>, args: unknown): PreparedRead<MetadataPage<AnomalySummary>> {
  const target = anomalyListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/insights/anomalies?page=${parsed.page}&per_page=${parsed.perPage}`, body => {
    const result = page(body, parsed, row => anomalySummary(row, target.anomalyIds));
    requireThat(new Set(result.items.map(row => row.id)).size === result.items.length, "upstream");
    return result;
  });
}
