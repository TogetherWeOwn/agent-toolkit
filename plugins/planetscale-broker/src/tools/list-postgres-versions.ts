import { postgresVersionScope, postgresVersionSummary, type PostgresVersionSummary } from "../account-availability.js";
import { emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_postgres_versions";
export const tool = "planetscale.list_postgres_versions";

export function prepare(scope: ReturnType<typeof postgresVersionScope.parse>, args: unknown): PreparedRead<readonly PostgresVersionSummary[]> {
  const target = postgresVersionScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`/v1/postgres-versions?engine=${target.engine}`, row => postgresVersionSummary(row, target.versions));
}
