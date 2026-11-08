import { replicaScope, replicaSummary, type ReplicaSummary } from "../routing-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_dedicated_read_replica";
export const tool = "planetscale.get_dedicated_read_replica";

export function prepare(scope: ReturnType<typeof replicaScope.parse>, args: unknown): PreparedRead<ReplicaSummary> {
  const target = replicaScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/dedicated-read-replicas/${target.replica.name}`,
    body => replicaSummary(body, [target.replica]));
}
