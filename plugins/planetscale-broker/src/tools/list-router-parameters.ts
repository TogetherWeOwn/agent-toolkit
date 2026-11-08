import { routerParameterScope, parameterSummary, validateParameterNamespaces, type ParameterSummary } from "../configuration-definitions.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_router_parameters";
export const tool = "planetscale.list_router_parameters";

export function prepare(scope: ReturnType<typeof routerParameterScope.parse>, args: unknown): PreparedRead<readonly ParameterSummary[]> {
  const target = routerParameterScope.parse(scope);
  emptyArguments.parse(args);
  validateParameterNamespaces(target.parameters, "neki");
  return preparedArray(`${branchPath(target)}/routers/${target.router.name}/parameters`, body => parameterSummary(body, target.parameters, "neki"));
}
