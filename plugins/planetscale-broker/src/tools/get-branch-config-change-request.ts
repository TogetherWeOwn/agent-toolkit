import { branchConfigScope, requireBranchConfig, configChangeSummary, type ConfigChangeSummary } from "../change-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_config_change_request";
export const tool = "planetscale.get_branch_config_change_request";

export function prepare(scope: ReturnType<typeof branchConfigScope.parse>, args: unknown): PreparedRead<ConfigChangeSummary> {
  const target = branchConfigScope.parse(scope);
  emptyArguments.parse(args);
  requireBranchConfig(target.change);
  return prepared(`${branchPath(target)}/config-changes/${target.change.id}`,
    body => configChangeSummary(body, [target.change]));
}
