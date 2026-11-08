import { keyspaceResizeScope, resizeSummary, type ResizeSummary } from "../resize-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_keyspace_resize_request";
export const tool = "planetscale.get_keyspace_resize_request";

export function prepare(scope: ReturnType<typeof keyspaceResizeScope.parse>, args: unknown): PreparedRead<ResizeSummary> {
  const target = keyspaceResizeScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace.name}/resizes/${target.resize.id}`,
    body => resizeSummary(body, [target.resize]));
}
