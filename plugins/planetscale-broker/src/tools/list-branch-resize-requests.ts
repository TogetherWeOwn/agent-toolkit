import { branchResizeListScope, resizeSummary, type ResizeSummary } from "../resize-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_resize_requests";
export const tool = "planetscale.list_branch_resize_requests";

export function prepare(scope: ReturnType<typeof branchResizeListScope.parse>, args: unknown): PreparedRead<MetadataPage<ResizeSummary>> {
  const target = branchResizeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/resizes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => resizeSummary(row, target.resizes)));
}
