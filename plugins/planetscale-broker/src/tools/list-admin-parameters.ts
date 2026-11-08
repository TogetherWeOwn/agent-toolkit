import { parameterScope, parameterSummary, validateParameterNamespaces, type ParameterSummary } from "../configuration-definitions.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_admin_parameters";
export const tool = "planetscale.list_admin_parameters";

export function prepare(scope: ReturnType<typeof parameterScope.parse>, args: unknown): PreparedRead<readonly ParameterSummary[]> {
  const target = parameterScope.parse(scope);
  emptyArguments.parse(args);
  validateParameterNamespaces(target.parameters, "neki");
  return preparedArray(`${branchPath(target)}/admin/parameters`, body => parameterSummary(body, target.parameters, "neki"));
}
