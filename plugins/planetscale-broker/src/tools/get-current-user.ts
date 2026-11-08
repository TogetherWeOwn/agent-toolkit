import { currentUserScope, userSummary, type UserSummary } from "../account-availability.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_current_user";
export const tool = "planetscale.get_current_user";

export function prepare(scope: ReturnType<typeof currentUserScope.parse>, args: unknown): PreparedRead<UserSummary> {
  const target = currentUserScope.parse(scope);
  emptyArguments.parse(args);
  return prepared("/v1/user", body => userSummary(body, target.user));
}
