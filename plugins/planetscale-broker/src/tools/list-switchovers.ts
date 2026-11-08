import { switchoverListScope, switchoverSummary, type SwitchoverSummary } from "../routing-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_switchovers";
export const tool = "planetscale.list_switchovers";

export function prepare(scope: ReturnType<typeof switchoverListScope.parse>, args: unknown): PreparedRead<MetadataPage<SwitchoverSummary>> {
  const target = switchoverListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/switchovers?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => switchoverSummary(row, target.switchoverIds)));
}
