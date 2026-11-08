import { parameterScope, parameterSummary, validateParameterNamespaces, type ParameterSummary } from "../configuration-definitions.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_parameters";
export const tool = "planetscale.list_parameters";

export function prepare(scope: ReturnType<typeof parameterScope.parse>, args: unknown): PreparedRead<readonly ParameterSummary[]> {
  const target = parameterScope.parse(scope);
  emptyArguments.parse(args);
  validateParameterNamespaces(target.parameters, "postgres");
  return preparedArray(`${branchPath(target)}/parameters`, body => parameterSummary(body, target.parameters, "postgres"));
}
