import { requireThat } from "../../../../packages/core/src/schema.js";
import { bouncerResizeListScope, bouncerResizeSummary, type BouncerResizeSummary } from "../resize-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_bouncer_resize_requests";
export const tool = "planetscale.list_bouncer_resize_requests";

export function prepare(scope: ReturnType<typeof bouncerResizeListScope.parse>, args: unknown): PreparedRead<MetadataPage<BouncerResizeSummary>> {
  const target = bouncerResizeListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  requireThat(target.resizes.every(item => item.bouncerId === target.bouncer.id && item.bouncer === target.bouncer.name), "scope");
  return prepared(`${branchPath(target)}/bouncers/${target.bouncer.name}/resizes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => bouncerResizeSummary(row, target.resizes)));
}
