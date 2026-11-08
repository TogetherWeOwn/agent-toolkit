import { replicaListScope, replicaSummary, type ReplicaSummary } from "../routing-records.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_dedicated_read_replicas";
export const tool = "planetscale.list_dedicated_read_replicas";

export function prepare(scope: ReturnType<typeof replicaListScope.parse>, args: unknown): PreparedRead<readonly ReplicaSummary[]> {
  const target = replicaListScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`${branchPath(target)}/dedicated-read-replicas`, body => replicaSummary(body, target.replicas));
}
