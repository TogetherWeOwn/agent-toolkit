import { profileShardScope, profileShardSummary } from "../configuration-profiles.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";
import type { ShardSummary } from "../topology.js";

export const operationId = "get_shard_configuration_profile_shard";
export const tool = "planetscale.get_shard_configuration_profile_shard";

export function prepare(scope: ReturnType<typeof profileShardScope.parse>, args: unknown): PreparedRead<ShardSummary> {
  const target = profileShardScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/configuration-profiles/${target.profile.name}/shards/${target.shard.id}`,
    body => profileShardSummary(body, target.profile, [target.shard]));
}
