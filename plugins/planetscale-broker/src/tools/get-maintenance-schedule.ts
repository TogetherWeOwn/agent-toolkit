import { maintenanceScheduleScope, maintenanceScheduleSummary, type MaintenanceScheduleSummary } from "../maintenance-schedules.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_maintenance_schedule";
export const tool = "planetscale.get_maintenance_schedule";

export function prepare(scope: ReturnType<typeof maintenanceScheduleScope.parse>, args: unknown): PreparedRead<MaintenanceScheduleSummary> {
  const target = maintenanceScheduleScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/maintenance-schedules/${target.scheduleId}`,
    body => maintenanceScheduleSummary(body, [target.scheduleId]));
}
