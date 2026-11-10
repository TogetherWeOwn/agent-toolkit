import { domainListScope, domainSummary, type DomainSummary } from "../organization-security.js";
import { emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_organization_sso_domains";
export const tool = "planetscale.list_organization_sso_domains";

export function prepare(scope: ReturnType<typeof domainListScope.parse>, args: unknown): PreparedRead<readonly DomainSummary[]> {
  const target = domainListScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`/v1/organizations/${target.organization}/sso/domains`,
    body => domainSummary(body, target.domainIds));
}
