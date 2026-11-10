import { profileExtensionScope, extensionSummary, type ExtensionSummary } from "../configuration-definitions.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_shard_configuration_profile_extensions";
export const tool = "planetscale.list_shard_configuration_profile_extensions";

export function prepare(scope: ReturnType<typeof profileExtensionScope.parse>, args: unknown): PreparedRead<readonly ExtensionSummary[]> {
  const target = profileExtensionScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`${branchPath(target)}/configuration-profiles/${target.profile.name}/extensions`, body => extensionSummary(body, target.extensions));
}
