import { switchoverScope, switchoverSummary, type SwitchoverSummary } from "../routing-records.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_switchover";
export const tool = "planetscale.get_switchover";

export function prepare(scope: ReturnType<typeof switchoverScope.parse>, args: unknown): PreparedRead<SwitchoverSummary> {
  const target = switchoverScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/switchovers/${target.switchoverId}`,
    body => switchoverSummary(body, [target.switchoverId]));
}
