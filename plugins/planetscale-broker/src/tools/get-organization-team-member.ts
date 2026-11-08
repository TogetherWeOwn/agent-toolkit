import { organizationTeamMemberScope, organizationTeamMemberSummary, type OrganizationTeamMemberSummary } from "../organization-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization_team_member";
export const tool = "planetscale.get_organization_team_member";

export function prepare(scope: ReturnType<typeof organizationTeamMemberScope.parse>, args: unknown): PreparedRead<OrganizationTeamMemberSummary> {
  const target = organizationTeamMemberScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/teams/${target.team.slug}/members/${target.membership.id}`,
    body => organizationTeamMemberSummary(body, [target.membership]));
}
