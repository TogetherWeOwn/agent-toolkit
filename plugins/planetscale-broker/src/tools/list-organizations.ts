import { organizationListScope, organizationSummary, type OrganizationSummary } from "../account-availability.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_organizations";
export const tool = "planetscale.list_organizations";

export function prepare(scope: ReturnType<typeof organizationListScope.parse>, args: unknown): PreparedRead<MetadataPage<OrganizationSummary>> {
  const target = organizationListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => organizationSummary(row, target.organizations)));
}
