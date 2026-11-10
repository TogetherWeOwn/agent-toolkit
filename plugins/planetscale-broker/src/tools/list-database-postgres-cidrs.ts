import { cidrListScope, cidrSummary, type CidrSummary } from "../network-throttler.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_database_postgres_cidrs";
export const tool = "planetscale.list_database_postgres_cidrs";

export function prepare(scope: ReturnType<typeof cidrListScope.parse>, args: unknown): PreparedRead<MetadataPage<CidrSummary>> {
  const target = cidrListScope.parse(scope);
  const pagination = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/cidrs?page=${pagination.page}&per_page=${pagination.perPage}`,
    body => page(body, pagination, row => cidrSummary(row, target.cidrIds)));
}
