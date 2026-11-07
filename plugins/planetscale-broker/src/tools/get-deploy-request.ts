import { deployRequestScope, deployRequestSummary, type DeployRequestSummary } from "../lifecycle.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_deploy_request";
export const tool = "planetscale.get_deploy_request";

export function prepare(scope: ReturnType<typeof deployRequestScope.parse>, args: unknown): PreparedRead<DeployRequestSummary> {
  const target = deployRequestScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-requests/${target.request.number}`,
    body => deployRequestSummary(body, [target.request]));
}
