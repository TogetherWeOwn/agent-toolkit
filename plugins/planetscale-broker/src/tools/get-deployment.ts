import { deploymentScope, deploymentSummary, type DeploymentSummary } from "../deployment-details.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_deployment";
export const tool = "planetscale.get_deployment";

export function prepare(scope: ReturnType<typeof deploymentScope.parse>, args: unknown): PreparedRead<DeploymentSummary> {
  const target = deploymentScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-requests/${target.deployment.number}/deployment`,
    body => deploymentSummary(body, [target.deployment]));
}
