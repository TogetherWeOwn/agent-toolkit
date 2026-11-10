import { organizationTeamListScope, organizationTeamSummary, type OrganizationTeamSummary } from "../organization-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_organization_teams";
export const tool = "planetscale.list_organization_teams";

export function prepare(scope: ReturnType<typeof organizationTeamListScope.parse>, args: unknown): PreparedRead<MetadataPage<OrganizationTeamSummary>> {
  const target = organizationTeamListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/teams?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => organizationTeamSummary(row, target.teams)));
}
