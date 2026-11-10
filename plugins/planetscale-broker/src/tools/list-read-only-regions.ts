import { readOnlyRegionScope, readOnlyRegionSummary, type ReadOnlyRegionSummary } from "../account-availability.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_read_only_regions";
export const tool = "planetscale.list_read_only_regions";

export function prepare(scope: ReturnType<typeof readOnlyRegionScope.parse>, args: unknown): PreparedRead<MetadataPage<ReadOnlyRegionSummary>> {
  const target = readOnlyRegionScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/read-only-regions?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => readOnlyRegionSummary(row, target.regions)));
}
