import { cidrScope, cidrSummary, type CidrSummary } from "../network-throttler.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_database_postgres_cidr";
export const tool = "planetscale.get_database_postgres_cidr";

export function prepare(scope: ReturnType<typeof cidrScope.parse>, args: unknown): PreparedRead<CidrSummary> {
  const target = cidrScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/cidrs/${target.cidrId}`,
    body => cidrSummary(body, [target.cidrId]));
}
