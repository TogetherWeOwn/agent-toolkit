import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";
import { timestampPresent } from "./security-records.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const databaseFields = { organization: slug, database: slug };
// Output confinement only; trusted current parent ownership remains required.
export const maintenanceScheduleScope = closed({ ...databaseFields, scheduleId: identifier });
export const maintenanceScheduleListScope = closed({ ...databaseFields, scheduleIds: ids });
export const branchMaintenanceWindowScope = closed({ ...databaseFields, branch: slug, scheduleId: identifier });
export const maintenanceWindowListScope = closed({ ...databaseFields, scheduleId: identifier, windowIds: ids });

function matchedId(body: Record<string, unknown>, allowed: readonly string[]): string {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return id;
}

export const frequencyUnit = oneOf(["day", "week", "month", "once"] as const);
export interface MaintenanceScheduleSummary {
  readonly id: string;
  readonly enabled: boolean;
  readonly required: boolean;
  readonly frequencyUnit: ReturnType<typeof frequencyUnit.parse>;
}
export function maintenanceScheduleSummary(body: Record<string, unknown>, allowed: readonly string[]): MaintenanceScheduleSummary {
  // Provider scheduling metadata is never an authorized execution/use window.
  return Object.freeze({
    id: matchedId(body, allowed), enabled: flag(body.enabled), required: flag(body.required),
    frequencyUnit: frequencyUnit.parse(body.frequency_unit),
  });
}

export interface MaintenanceWindowSummary {
  readonly id: string;
  readonly startRecorded: boolean;
  readonly finishRecorded: boolean;
}
export function maintenanceWindowSummary(body: Record<string, unknown>, allowed: readonly string[]): MaintenanceWindowSummary {
  // Timestamp presence proves neither successful maintenance nor native closure.
  return Object.freeze({
    id: matchedId(body, allowed), startRecorded: timestampPresent(body.started_at),
    finishRecorded: timestampPresent(body.finished_at),
  });
}
