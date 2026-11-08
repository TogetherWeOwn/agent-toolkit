import { organizationTeamScope, organizationTeamSummary, type OrganizationTeamSummary } from "../organization-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization_team";
export const tool = "planetscale.get_organization_team";

export function prepare(scope: ReturnType<typeof organizationTeamScope.parse>, args: unknown): PreparedRead<OrganizationTeamSummary> {
  const target = organizationTeamScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/teams/${target.team.slug}`,
    body => organizationTeamSummary(body, [target.team]));
}
