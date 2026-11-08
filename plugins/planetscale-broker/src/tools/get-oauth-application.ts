import { applicationScope, applicationSummary, type ApplicationSummary } from "../organization-security.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_oauth_application";
export const tool = "planetscale.get_oauth_application";

export function prepare(scope: ReturnType<typeof applicationScope.parse>, args: unknown): PreparedRead<ApplicationSummary> {
  const target = applicationScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/oauth-applications/${target.applicationId}`,
    body => applicationSummary(body, [target.applicationId]));
}
