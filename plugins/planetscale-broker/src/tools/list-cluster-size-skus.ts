import { clusterSkuScope, enabledSkuSummary, preparedSkus, type EnabledSkuSummary } from "../compute-catalog.js";
import { emptyArguments, type PreparedRead } from "../metadata.js";

export const operationId = "list_cluster_size_skus";
export const tool = "planetscale.list_cluster_size_skus";

export function prepare(scope: ReturnType<typeof clusterSkuScope.parse>, args: unknown): PreparedRead<readonly EnabledSkuSummary[]> {
  const target = clusterSkuScope.parse(scope);
  emptyArguments.parse(args);
  return preparedSkus(`/v1/organizations/${target.organization}/cluster-size-skus?engine=${target.engine}&rates=false`, body => enabledSkuSummary(body, target.skuNames));
}
