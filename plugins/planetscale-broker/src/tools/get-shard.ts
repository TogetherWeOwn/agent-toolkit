import { shardScope, shardSummary, type ShardSummary } from "../topology.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_shard";
export const tool = "planetscale.get_shard";

export function prepare(scope: ReturnType<typeof shardScope.parse>, args: unknown): PreparedRead<ShardSummary> {
  const target = shardScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/shards/${target.shard.id}`,
    body => shardSummary(body, [target.shard]));
}
