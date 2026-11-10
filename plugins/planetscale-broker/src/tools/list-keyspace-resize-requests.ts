import { keyspaceResizeListScope, resizeSummary, type ResizeSummary } from "../resize-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_keyspace_resize_requests";
export const tool = "planetscale.list_keyspace_resize_requests";

export function prepare(scope: ReturnType<typeof keyspaceResizeListScope.parse>, args: unknown): PreparedRead<MetadataPage<ResizeSummary>> {
  const target = keyspaceResizeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace.name}/resizes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => resizeSummary(row, target.resizes)));
}
