import { branchConfigListScope, configChangeSummary, type ConfigChangeSummary } from "../change-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_config_change_requests";
export const tool = "planetscale.list_branch_config_change_requests";

export function prepare(scope: ReturnType<typeof branchConfigListScope.parse>, args: unknown): PreparedRead<MetadataPage<ConfigChangeSummary>> {
  const target = branchConfigListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/config-changes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => configChangeSummary(row, target.changes)));
}
