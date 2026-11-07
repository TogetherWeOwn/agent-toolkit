import { deployQueueScope, deploymentSummary, type DeploymentSummary } from "../deployment-details.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "get_deploy_queue";
export const tool = "planetscale.get_deploy_queue";

export function prepare(scope: ReturnType<typeof deployQueueScope.parse>, args: unknown): PreparedRead<MetadataPage<DeploymentSummary>> {
  const target = deployQueueScope.parse(scope);
  const input = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-queue?page=${input.page}&per_page=${input.perPage}`,
    body => page(body, input, row => deploymentSummary(row, target.deployments)));
}
