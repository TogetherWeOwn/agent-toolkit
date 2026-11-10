import { keyspaceScope, keyspaceSummary, type KeyspaceSummary } from "../topology.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_keyspace";
export const tool = "planetscale.get_keyspace";

export function prepare(scope: ReturnType<typeof keyspaceScope.parse>, args: unknown): PreparedRead<KeyspaceSummary> {
  const target = keyspaceScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace.name}`,
    body => keyspaceSummary(body, [target.keyspace]));
}
