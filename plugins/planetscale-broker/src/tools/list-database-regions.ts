import { databaseRegionScope, regionSummary, type DatabaseRegionScope, type RegionSummary } from "../discovery.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_database_regions";
export const tool = "planetscale.list_database_regions";

export function prepare(scope: DatabaseRegionScope, args: unknown): PreparedRead<MetadataPage<RegionSummary>> {
  const target = databaseRegionScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/regions?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => regionSummary(row, target.regions)));
}
