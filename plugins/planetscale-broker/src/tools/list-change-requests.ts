import { unifiedChangeListScope, unifiedChangeSummary, type UnifiedChangeSummary } from "../unified-change-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_change_requests";
export const tool = "planetscale.list_change_requests";

export function prepare(scope: ReturnType<typeof unifiedChangeListScope.parse>, args: unknown): PreparedRead<MetadataPage<UnifiedChangeSummary>> {
  const target = unifiedChangeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/change-requests?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => unifiedChangeSummary(row, target.changes)));
}
