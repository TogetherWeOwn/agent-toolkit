import { branchChangeListScope } from "../change-records.js";
import { resizeSummary, type ResizeSummary } from "../resize-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_change_requests";
export const tool = "planetscale.list_branch_change_requests";

export function prepare(scope: ReturnType<typeof branchChangeListScope.parse>, args: unknown): PreparedRead<MetadataPage<ResizeSummary>> {
  const target = branchChangeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/changes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => resizeSummary(row, target.changes)));
}
