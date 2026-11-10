import { replicaChangeListScope, replicaChangeSummary, type ReplicaChangeSummary } from "../unified-change-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_dedicated_read_replica_change_requests";
export const tool = "planetscale.list_dedicated_read_replica_change_requests";

export function prepare(scope: ReturnType<typeof replicaChangeListScope.parse>, args: unknown): PreparedRead<MetadataPage<ReplicaChangeSummary>> {
  const target = replicaChangeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/dedicated-read-replica-changes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => replicaChangeSummary(row, target.changes)));
}
