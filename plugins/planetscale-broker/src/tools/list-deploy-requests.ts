import { deployRequestListScope, deployRequestSummary, type DeployRequestSummary } from "../lifecycle.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_deploy_requests";
export const tool = "planetscale.list_deploy_requests";

export function prepare(scope: ReturnType<typeof deployRequestListScope.parse>, args: unknown): PreparedRead<MetadataPage<DeployRequestSummary>> {
  const target = deployRequestListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-requests?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => deployRequestSummary(row, target.requests)));
}
