import { bouncerListScope, bouncerSummary, type BouncerSummary } from "../resize-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_bouncers";
export const tool = "planetscale.list_bouncers";

export function prepare(scope: ReturnType<typeof bouncerListScope.parse>, args: unknown): PreparedRead<MetadataPage<BouncerSummary>> {
  const target = bouncerListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/bouncers?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => bouncerSummary(row, target.bouncers, target.branchId, target.branch)));
}
