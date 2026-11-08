import { maintenanceScheduleListScope, maintenanceScheduleSummary, type MaintenanceScheduleSummary } from "../maintenance-schedules.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_maintenance_schedules";
export const tool = "planetscale.list_maintenance_schedules";

export function prepare(scope: ReturnType<typeof maintenanceScheduleListScope.parse>, args: unknown): PreparedRead<MetadataPage<MaintenanceScheduleSummary>> {
  const target = maintenanceScheduleListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/maintenance-schedules?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => maintenanceScheduleSummary(row, target.scheduleIds)));
}
