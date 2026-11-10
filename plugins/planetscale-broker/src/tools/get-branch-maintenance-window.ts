import { branchMaintenanceWindowScope, maintenanceScheduleSummary, type MaintenanceScheduleSummary } from "../maintenance-schedules.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_maintenance_window";
export const tool = "planetscale.get_branch_maintenance_window";

export function prepare(scope: ReturnType<typeof branchMaintenanceWindowScope.parse>, args: unknown): PreparedRead<MaintenanceScheduleSummary> {
  const target = branchMaintenanceWindowScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/maintenance-window`,
    body => maintenanceScheduleSummary(body, [target.scheduleId]));
}
