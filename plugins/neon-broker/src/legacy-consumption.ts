import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const LEGACY_CONSUMPTION_OPERATIONS = ["getConsumptionHistoryPerProject"] as const;
export interface NeonLegacyConsumptionScope {
  readonly organizationId: string;
  readonly projectId: string;
  readonly revision: string;
  readonly from: string;
  readonly to: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const hour = { parse(raw: unknown): string {
  const value = text(20, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/).parse(raw);
  check(Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace("Z", ".000Z"));
  return value;
} };
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const paginationSchema = closed({ cursor: text(256, /^[\x20-\x7e]+$/) });
const argumentsSchema = closed({ org_id: pathId, project_id: pathId, from: hour, to: hour });

export function createNeonLegacyConsumptionOperations(scope: NeonLegacyConsumptionScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, projectId: pathId, revision: identifier, from: hour, to: hour }).parse(scope);
  check(config.from >= "2024-03-01T00:00:00Z" && config.from < config.to && Date.parse(config.to) - Date.parse(config.from) <= 86_400_000);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId || args.project_id !== config.projectId || args.from !== config.from || args.to !== config.to) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/organizations/${config.organizationId}/projects/${config.projectId}/consumption/legacy`, revision: config.revision },
      arguments: args, plan: { operation: LEGACY_CONSUMPTION_OPERATIONS[0], ...args, granularity: "hourly", metrics: ["compute_time_seconds"] }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    for (const [key, expected] of [["org_id", config.organizationId], ["project_id", config.projectId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "branch_id") === undefined && optional(raw, "pagination") === undefined);
  }
  function project(raw: unknown): Json {
    identity(raw);
    const seen = new Set<string>();
    const projects = rows(field(raw, "projects"), MAX_ITEMS).map(value => {
      identity(value);
      const id = pathId.parse(field(value, "project_id"));
      check(id === config.projectId && !seen.has(id));
      seen.add(id);
      const periods = new Set<string>();
      let previousEnd = config.from;
      let count = 0;
      const consumption = rows(field(value, "periods"), MAX_ITEMS).flatMap(period => {
        identity(period);
        const periodId = uuid.parse(field(period, "period_id"));
        check(!periods.has(periodId));
        periods.add(periodId);
        const start = hour.parse(field(period, "period_start"));
        const endRaw = optional(period, "period_end");
        const end = endRaw === undefined ? undefined : hour.parse(endRaw);
        check(end === undefined || start < end);
        return rows(field(period, "consumption"), 24).map(frame => {
          identity(frame);
          const frameStart = hour.parse(field(frame, "timeframe_start"));
          const frameEnd = hour.parse(field(frame, "timeframe_end"));
          check(++count <= 24 && frameStart >= previousEnd && frameEnd <= config.to &&
            Date.parse(frameEnd) - Date.parse(frameStart) === 3_600_000 && frameStart >= start && (end === undefined || frameEnd <= end));
          previousEnd = frameEnd;
          return { timeframe_start: frameStart, timeframe_end: frameEnd,
            compute_time_seconds: integer(0, Number.MAX_SAFE_INTEGER).parse(field(frame, "compute_time_seconds")) };
        });
      });
      return { project_id: id, consumption };
    });
    return { projects };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${LEGACY_CONSUMPTION_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      const projects: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.getConsumptionHistoryPerProject(config.organizationId, config.projectId, config.from, config.to, cursor, { credential, signal });
        for (const [key, expected] of [["org_id", config.organizationId], ["project_id", config.projectId]] as const) {
          const value = optional(raw, key);
          check(value === undefined || value === expected);
        }
        check(optional(raw, "branch_id") === undefined);
        projects.push(...rows(field(raw, "projects"), PAGE_SIZE));
        const combined = { projects };
        project(combined);
        const pagination = optional(raw, "pagination");
        if (pagination === undefined) return combined;
        cursor = paginationSchema.parse(pagination).cursor;
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project,
  })]);
}
