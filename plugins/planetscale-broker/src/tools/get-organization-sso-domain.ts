import { domainScope, domainSummary, type DomainSummary } from "../organization-security.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization_sso_domain";
export const tool = "planetscale.get_organization_sso_domain";

export function prepare(scope: ReturnType<typeof domainScope.parse>, args: unknown): PreparedRead<DomainSummary> {
  const target = domainScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/sso/domains/${target.domainId}`,
    body => domainSummary(body, [target.domainId]));
}
