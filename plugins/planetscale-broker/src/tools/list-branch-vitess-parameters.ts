import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";
import { vitessParameterMetadata, vitessParameterScope, type VitessParameterMetadata } from "../vitess-parameters.js";

export const operationId = "list_branch_vitess_parameters";
export const tool = "planetscale.list_branch_vitess_parameters";

export function prepare(scope: ReturnType<typeof vitessParameterScope.parse>, args: unknown): PreparedRead<VitessParameterMetadata> {
  const target = vitessParameterScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/vitess-parameters`, body => vitessParameterMetadata(body, target));
}
