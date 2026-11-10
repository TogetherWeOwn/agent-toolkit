import { organizationMembershipScope, organizationMembershipSummary, type OrganizationMembershipSummary } from "../organization-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization_membership";
export const tool = "planetscale.get_organization_membership";

export function prepare(scope: ReturnType<typeof organizationMembershipScope.parse>, args: unknown): PreparedRead<OrganizationMembershipSummary> {
  const target = organizationMembershipScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/members/${target.membership.id}`,
    body => organizationMembershipSummary(body, [target.membership]));
}
