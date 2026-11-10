import { profileParameterScope, parameterSummary, validateParameterNamespaces, type ParameterSummary } from "../configuration-definitions.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_shard_configuration_profile_parameters";
export const tool = "planetscale.list_shard_configuration_profile_parameters";

export function prepare(scope: ReturnType<typeof profileParameterScope.parse>, args: unknown): PreparedRead<readonly ParameterSummary[]> {
  const target = profileParameterScope.parse(scope);
  emptyArguments.parse(args);
  validateParameterNamespaces(target.parameters, "neki");
  return preparedArray(`${branchPath(target)}/configuration-profiles/${target.profile.name}/parameters`, body => parameterSummary(body, target.parameters, "neki"));
}
