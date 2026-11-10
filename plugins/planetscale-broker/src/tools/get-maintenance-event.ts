import { maintenanceEventScope, maintenanceEventSummary, type MaintenanceEventSummary } from "../topology.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_maintenance_event";
export const tool = "planetscale.get_maintenance_event";

export function prepare(scope: ReturnType<typeof maintenanceEventScope.parse>, args: unknown): PreparedRead<MaintenanceEventSummary> {
  const target = maintenanceEventScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/maintenance-events/${target.event.id}`,
    body => maintenanceEventSummary(body, [target.event]));
}
