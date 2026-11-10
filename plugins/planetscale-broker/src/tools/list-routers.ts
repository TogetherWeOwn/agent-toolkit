import { routerListScope, routerSummary, type RouterSummary } from "../routing-records.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_routers";
export const tool = "planetscale.list_routers";

export function prepare(scope: ReturnType<typeof routerListScope.parse>, args: unknown): PreparedRead<readonly RouterSummary[]> {
  const target = routerListScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`${branchPath(target)}/routers`, body => routerSummary(body, target.routers));
}
