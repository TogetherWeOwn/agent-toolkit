import { deployThrottlerScope, throttlerSummary, type ThrottlerSummary } from "../network-throttler.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_deploy_request_throttler";
export const tool = "planetscale.get_deploy_request_throttler";

export function prepare(scope: ReturnType<typeof deployThrottlerScope.parse>, args: unknown): PreparedRead<ThrottlerSummary> {
  const target = deployThrottlerScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-requests/${target.number}/throttler`,
    body => throttlerSummary(body, target.configurableId, target.keyspaceNames));
}
