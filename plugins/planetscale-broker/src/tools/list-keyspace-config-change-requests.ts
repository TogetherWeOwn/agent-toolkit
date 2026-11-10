import { keyspaceConfigListScope, requireKeyspaceConfig, configChangeSummary, type ConfigChangeSummary } from "../change-records.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_keyspace_config_change_requests";
export const tool = "planetscale.list_keyspace_config_change_requests";

export function prepare(scope: ReturnType<typeof keyspaceConfigListScope.parse>, args: unknown): PreparedRead<MetadataPage<ConfigChangeSummary>> {
  const target = keyspaceConfigListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  for (const change of target.changes) requireKeyspaceConfig(change, target.keyspace.name);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace.name}/config-changes?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => configChangeSummary(row, target.changes)));
}
