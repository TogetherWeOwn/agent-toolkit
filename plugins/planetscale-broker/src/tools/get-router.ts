import { routerScope, routerSummary, type RouterSummary } from "../routing-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_router";
export const tool = "planetscale.get_router";

export function prepare(scope: ReturnType<typeof routerScope.parse>, args: unknown): PreparedRead<RouterSummary> {
  const target = routerScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/routers/${target.router.name}`,
    body => routerSummary(body, [target.router]));
}
