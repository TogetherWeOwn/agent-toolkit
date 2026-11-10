import { closed, identifier, integer, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonTriggerCreateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly functionId: string;
  readonly functionSlug: string;
  readonly name: string;
  readonly hour: number;
  readonly minute: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const responseTriggerId = text(128, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
export const triggerCreateSlug = text(20, /^[a-z0-9]+$/);
export const triggerCreateName = text(40, /^[a-z][a-z0-9-]*$/);
export const triggerCreateHour = integer(0, 23);
export const triggerCreateMinute = integer(0, 59);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, function_slug: triggerCreateSlug,
  name: triggerCreateName, hour: triggerCreateHour, minute: triggerCreateMinute });

// Source only. Explicitly disabled creation is not independently verified inactivity.
export function createNeonTriggerCreateOperations(scope: NeonTriggerCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, functionId: identifier, functionSlug: triggerCreateSlug,
    name: triggerCreateName, hour: triggerCreateHour, minute: triggerCreateMinute, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/functions/${config.functionSlug}/triggers/${config.name}/create`;
  check(resourceId.length <= 256);
  const cron = `${config.minute} ${config.hour} * * *`;
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.function_slug === config.functionSlug &&
      args.name === config.name && args.hour === config.hour && args.minute === config.minute);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createProjectBranchTrigger", ...args, function_id: config.functionId,
        effect: "request_disabled_daily_schedule_trigger_creation", preflight: "exact_function_then_bounded_visible_trigger_name_absence",
        atomicCompareAndSwap: false, diff: { before: "selected_trigger_name_absent", after: {
          type: "schedule", function_slug: config.functionSlug, name: config.name, function_path: "/", schedule: { cron }, enabled: false } },
        reconciliation: "one_trigger_list_observation_no_retry", completion: "acknowledgement_only",
        inactivityVerified: false, persistenceVerified: false, committedInvocationsCancelled: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const value of rows(field(raw, "triggers"), 30)) {
      ancestry(value);
      const id = responseTriggerId.parse(field(value, "trigger_id"));
      const name = text(256, /^[\x20-\x7e]+$/).parse(field(value, "name"));
      check(!names.has(name) && !ids.has(id));
      names.add(name);
      ids.add(id);
      // Trigger configuration is not needed to establish visible-name absence.
    }
    return names.has(config.name);
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const value = field(raw, "trigger");
    ancestry(value);
    const id = responseTriggerId.parse(field(value, "trigger_id"));
    check(field(value, "type") === "schedule" && field(value, "function_slug") === config.functionSlug &&
      field(value, "name") === config.name && field(value, "function_path") === "/" &&
      field(value, "enabled") === false && field(value, "inherited") === false && field(value, "next_run_at") === null);
    const schedule = closed({ cron: text(1024, /^[\x20-\x7e]+$/) }).parse(field(value, "schedule"));
    check(schedule.cron === cron);
    const version = integer(1, Number.MAX_SAFE_INTEGER).parse(field(value, "version"));
    return { trigger_id: id, version, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createProjectBranchTrigger", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 4500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(await transport.listProjectBranchTriggers(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const rawFunction = await transport.getProjectBranchFunction(config.projectId, config.branchId, config.functionSlug, options);
      ancestry(rawFunction);
      const value = field(rawFunction, "function");
      ancestry(value);
      check(field(value, "id") === config.functionId && field(value, "slug") === config.functionSlug);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createProjectBranchTrigger(config.projectId, config.branchId, config.functionSlug, config.name, config.hour, config.minute, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal creation or inactivity evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
