import { organizationTeamMemberListScope, organizationTeamMemberSummary, type OrganizationTeamMemberSummary } from "../organization-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_organization_team_members";
export const tool = "planetscale.list_organization_team_members";

export function prepare(scope: ReturnType<typeof organizationTeamMemberListScope.parse>, args: unknown): PreparedRead<MetadataPage<OrganizationTeamMemberSummary>> {
  const target = organizationTeamMemberListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/teams/${target.team.slug}/members?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => organizationTeamMemberSummary(row, target.memberships)));
}
