import { keyspaceListScope, keyspaceSummary, type KeyspaceSummary } from "../topology.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_keyspaces";
export const tool = "planetscale.list_keyspaces";

export function prepare(scope: ReturnType<typeof keyspaceListScope.parse>, args: unknown): PreparedRead<MetadataPage<KeyspaceSummary>> {
  const target = keyspaceListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/keyspaces?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => keyspaceSummary(row, target.keyspaces)));
}
