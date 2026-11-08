import { organizationMembershipListScope, organizationMembershipSummary, type OrganizationMembershipSummary } from "../organization-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_organization_members";
export const tool = "planetscale.list_organization_members";

export function prepare(scope: ReturnType<typeof organizationMembershipListScope.parse>, args: unknown): PreparedRead<MetadataPage<OrganizationMembershipSummary>> {
  const target = organizationMembershipListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/members?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => organizationMembershipSummary(row, target.memberships)));
}
