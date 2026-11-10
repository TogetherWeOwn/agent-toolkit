import { databaseDiscoveryScope, databaseSummary, type DatabaseDiscoveryScope, type DatabaseSummary } from "../discovery.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_databases";
export const tool = "planetscale.list_databases";

export function prepare(scope: DatabaseDiscoveryScope, args: unknown): PreparedRead<MetadataPage<DatabaseSummary>> {
  const target = databaseDiscoveryScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => databaseSummary(row, target.databases)));
}
