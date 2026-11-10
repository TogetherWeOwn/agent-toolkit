import { closed, integer, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonSnapshotScheduleUpdateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly expectedHour: number;
  readonly hour: number;
  readonly retentionSeconds: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const snapshotScheduleHour = integer(0, 23);
export const snapshotScheduleRetention = integer(3600, 3024000);
const entry = closed({ frequency: oneOf(["daily"]), hour: snapshotScheduleHour, retention_seconds: snapshotScheduleRetention });
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, hour: snapshotScheduleHour });

// Existing single daily schedule only; frequency and explicit retention do not change.
export function createNeonSnapshotScheduleUpdateOperations(scope: NeonSnapshotScheduleUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, expectedHour: snapshotScheduleHour, hour: snapshotScheduleHour,
    retentionSeconds: snapshotScheduleRetention, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/) }).parse(scope);
  check(config.hour !== config.expectedHour);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/backup_schedule/hour`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const before = { frequency: "daily", hour: config.expectedHour, retention_seconds: config.retentionSeconds };
    const after = { ...before, hour: config.hour };
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.hour === config.hour);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "setSnapshotSchedule", ...args, effect: "request_daily_snapshot_hour_update",
        preflight: "exact_single_daily_schedule_with_explicit_unchanged_retention", atomicCompareAndSwap: false,
        diff: { before: { schedule: [before] }, after: { schedule: [after] } },
        reconciliation: "one_schedule_observation_no_retry", completion: "acknowledgement_only",
        scheduledExecutionVerified: false, recoverabilityVerified: false, expiry: "not_guaranteed_teardown" }, artifactDigest: null };
  }
  function observeSchedule(raw: unknown): number {
    check(optional(raw, "project_id") === undefined || field(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || field(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
    const schedule = rows(field(raw, "schedule"), 1);
    check(schedule.length === 1);
    const value = entry.parse(schedule[0]);
    check(value.retention_seconds === config.retentionSeconds);
    return value.hour;
  }
  function receipt(raw: unknown): Json {
    closed({}).parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.setSnapshotSchedule", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<number> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const hour = observeSchedule(await transport.getSnapshotSchedule(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return hour;
      }
      check(await observe() === config.expectedHour);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.setSnapshotSchedule(config.projectId, config.branchId, config.hour, config.retentionSeconds, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Observed hour is not causal scheduling evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
