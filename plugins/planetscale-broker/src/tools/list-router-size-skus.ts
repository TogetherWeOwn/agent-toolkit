import { branchSkuScope, enabledSkuSummary, preparedSkus, type EnabledSkuSummary } from "../compute-catalog.js";
import { branchPath, emptyArguments, type PreparedRead } from "../metadata.js";

export const operationId = "list_router_size_skus";
export const tool = "planetscale.list_router_size_skus";

export function prepare(scope: ReturnType<typeof branchSkuScope.parse>, args: unknown): PreparedRead<readonly EnabledSkuSummary[]> {
  const target = branchSkuScope.parse(scope);
  emptyArguments.parse(args);
  return preparedSkus(`${branchPath(target)}/router-size-skus`, body => enabledSkuSummary(body, target.skuNames));
}
