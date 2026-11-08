import { profileListScope, profileSummary, type ProfileSummary } from "../configuration-profiles.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_shard_configuration_profiles";
export const tool = "planetscale.list_shard_configuration_profiles";

export function prepare(scope: ReturnType<typeof profileListScope.parse>, args: unknown): PreparedRead<readonly ProfileSummary[]> {
  const target = profileListScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`${branchPath(target)}/configuration-profiles`, body => profileSummary(body, target.profiles));
}
