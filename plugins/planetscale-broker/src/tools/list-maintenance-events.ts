import { maintenanceEventListScope, maintenanceEventSummary, type MaintenanceEventSummary } from "../topology.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_maintenance_events";
export const tool = "planetscale.list_maintenance_events";

export function prepare(scope: ReturnType<typeof maintenanceEventListScope.parse>, args: unknown): PreparedRead<MetadataPage<MaintenanceEventSummary>> {
  const target = maintenanceEventListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/maintenance-events?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => maintenanceEventSummary(row, target.events)));
}
