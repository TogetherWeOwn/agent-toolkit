import { profileScope, profileSummary, type ProfileSummary } from "../configuration-profiles.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_shard_configuration_profile";
export const tool = "planetscale.get_shard_configuration_profile";

export function prepare(scope: ReturnType<typeof profileScope.parse>, args: unknown): PreparedRead<ProfileSummary> {
  const target = profileScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/configuration-profiles/${target.profile.name}`,
    body => profileSummary(body, [target.profile]));
}
