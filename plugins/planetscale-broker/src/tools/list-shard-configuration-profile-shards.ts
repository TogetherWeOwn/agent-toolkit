import { profileShardListScope, profileShardSummary } from "../configuration-profiles.js";
import { branchPath, pageArguments, page, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";
import type { ShardSummary } from "../topology.js";

export const operationId = "list_shard_configuration_profile_shards";
export const tool = "planetscale.list_shard_configuration_profile_shards";

export function prepare(scope: ReturnType<typeof profileShardListScope.parse>, args: unknown): PreparedRead<MetadataPage<ShardSummary>> {
  const target = profileShardListScope.parse(scope);
  const input = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/configuration-profiles/${target.profile.name}/shards?page=${input.page}&per_page=${input.perPage}`,
    body => page(body, input, row => profileShardSummary(row, target.profile, target.shards)));
}
