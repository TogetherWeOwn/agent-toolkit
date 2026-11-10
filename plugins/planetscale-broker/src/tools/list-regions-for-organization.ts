import { organizationRegionScope, regionSummary, type OrganizationRegionScope, type RegionSummary } from "../discovery.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_regions_for_organization";
export const tool = "planetscale.list_regions_for_organization";

export function prepare(scope: OrganizationRegionScope, args: unknown): PreparedRead<MetadataPage<RegionSummary>> {
  const target = organizationRegionScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/regions?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => regionSummary(row, target.regions)));
}
