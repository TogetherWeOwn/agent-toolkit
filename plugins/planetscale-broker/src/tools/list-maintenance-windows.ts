import { maintenanceWindowListScope, maintenanceWindowSummary, type MaintenanceWindowSummary } from "../maintenance-schedules.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_maintenance_windows";
export const tool = "planetscale.list_maintenance_windows";

export function prepare(scope: ReturnType<typeof maintenanceWindowListScope.parse>, args: unknown): PreparedRead<MetadataPage<MaintenanceWindowSummary>> {
  const target = maintenanceWindowListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/maintenance-schedules/${target.scheduleId}/windows?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => maintenanceWindowSummary(row, target.windowIds)));
}
