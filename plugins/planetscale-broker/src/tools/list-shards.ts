import { shardListScope, shardSummary, type ShardSummary } from "../topology.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_shards";
export const tool = "planetscale.list_shards";

export function prepare(scope: ReturnType<typeof shardListScope.parse>, args: unknown): PreparedRead<MetadataPage<ShardSummary>> {
  const target = shardListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/shards?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => shardSummary(row, target.shards)));
}
