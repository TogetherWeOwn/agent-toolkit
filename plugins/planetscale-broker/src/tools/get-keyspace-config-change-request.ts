import { keyspaceConfigScope, requireKeyspaceConfig, configChangeSummary, type ConfigChangeSummary } from "../change-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_keyspace_config_change_request";
export const tool = "planetscale.get_keyspace_config_change_request";

export function prepare(scope: ReturnType<typeof keyspaceConfigScope.parse>, args: unknown): PreparedRead<ConfigChangeSummary> {
  const target = keyspaceConfigScope.parse(scope);
  emptyArguments.parse(args);
  requireKeyspaceConfig(target.change, target.keyspace.name);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace.name}/config-changes/${target.change.id}`,
    body => configChangeSummary(body, [target.change]));
}
