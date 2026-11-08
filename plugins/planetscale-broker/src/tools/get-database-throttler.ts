import { databaseThrottlerScope, throttlerSummary, type ThrottlerSummary } from "../network-throttler.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_database_throttler";
export const tool = "planetscale.get_database_throttler";

export function prepare(scope: ReturnType<typeof databaseThrottlerScope.parse>, args: unknown): PreparedRead<ThrottlerSummary> {
  const target = databaseThrottlerScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/throttler`,
    body => throttlerSummary(body, target.configurableId, target.keyspaceNames));
}
