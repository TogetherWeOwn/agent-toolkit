import { ssoScope, ssoSummary, type SsoSummary } from "../organization-security.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization_sso";
export const tool = "planetscale.get_organization_sso";

export function prepare(scope: ReturnType<typeof ssoScope.parse>, args: unknown): PreparedRead<SsoSummary> {
  const target = ssoScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/sso`,
    body => ssoSummary(body, target.organizationId));
}
