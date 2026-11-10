import { bouncerScope, bouncerSummary, type BouncerSummary } from "../resize-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_bouncer";
export const tool = "planetscale.get_bouncer";

export function prepare(scope: ReturnType<typeof bouncerScope.parse>, args: unknown): PreparedRead<BouncerSummary> {
  const target = bouncerScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/bouncers/${target.bouncer.name}`,
    body => bouncerSummary(body, [target.bouncer], target.branchId, target.branch));
}
