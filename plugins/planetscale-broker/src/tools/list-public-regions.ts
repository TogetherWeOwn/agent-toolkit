import { publicRegionScope, regionSummary, type PublicRegionScope, type RegionSummary } from "../discovery.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_public_regions";
export const tool = "planetscale.list_public_regions";

export function prepare(scope: PublicRegionScope, args: unknown): PreparedRead<MetadataPage<RegionSummary>> {
  const target = publicRegionScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/regions?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => regionSummary(row, target.regions)));
}
