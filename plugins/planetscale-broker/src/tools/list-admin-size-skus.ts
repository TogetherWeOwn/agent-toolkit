import { branchSkuScope, preparedSkus, skuSummary, type SkuSummary } from "../compute-catalog.js";
import { branchPath, emptyArguments, type PreparedRead } from "../metadata.js";

export const operationId = "list_admin_size_skus";
export const tool = "planetscale.list_admin_size_skus";

export function prepare(scope: ReturnType<typeof branchSkuScope.parse>, args: unknown): PreparedRead<readonly SkuSummary[]> {
  const target = branchSkuScope.parse(scope);
  emptyArguments.parse(args);
  return preparedSkus(`${branchPath(target)}/admin-size-skus`, body => skuSummary(body, target.skuNames));
}
