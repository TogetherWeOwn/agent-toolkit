import { branchBouncerResizeListScope, bouncerResizeSummary, type BouncerResizeSummary } from "../resize-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_bouncer_resize_requests";
export const tool = "planetscale.list_branch_bouncer_resize_requests";

export function prepare(scope: ReturnType<typeof branchBouncerResizeListScope.parse>, args: unknown): PreparedRead<MetadataPage<BouncerResizeSummary>> {
  const target = branchBouncerResizeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/bouncer-resizes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => bouncerResizeSummary(row, target.resizes)));
}
