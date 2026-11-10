import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";
import { rolloutScope, rolloutSummary, type RolloutSummary } from "../operation-status.js";

export const operationId = "get_keyspace_rollout_status";
export const tool = "planetscale.get_keyspace_rollout_status";

export function prepare(scope: ReturnType<typeof rolloutScope.parse>, args: unknown): PreparedRead<RolloutSummary> {
  const target = rolloutScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace}/rollout-status`,
    body => rolloutSummary(body, target.keyspace, target.shardNames));
}
