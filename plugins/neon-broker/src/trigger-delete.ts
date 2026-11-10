import { closed, identifier, integer, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean as booleanValue, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const TRIGGER_DELETE_OPERATIONS = ["deleteProjectBranchTrigger"] as const;
export interface NeonTriggerDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly triggerId: string;
  readonly functionSlug: string;
  readonly expectedType: "schedule" | "storage_object_created";
  readonly expectedVersion: number;
  readonly expectedInherited: boolean;
  readonly expectedEnabled: boolean;
  readonly revision: string;
}
// This subset also fits the existing detail transport and common resource limits.
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const slug = text(20, /^[a-z0-9]+$/);
const triggerType = oneOf(["schedule", "storage_object_created"] as const);
const version = integer(1, Number.MAX_SAFE_INTEGER);
const booleanSchema = { parse: booleanValue };
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, trigger_id: identifier });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. Committed invocations are not cancelled by trigger deletion.
export function createNeonTriggerDeleteOperations(scope: NeonTriggerDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, triggerId: identifier, functionSlug: slug,
    expectedType: triggerType, expectedVersion: version, expectedInherited: booleanSchema,
    expectedEnabled: booleanSchema, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/triggers/${config.triggerId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.trigger_id === config.triggerId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchTrigger", ...args, function_slug: config.functionSlug,
        type: config.expectedType, version: config.expectedVersion, inherited: config.expectedInherited, enabled: config.expectedEnabled,
        effect: config.expectedInherited ? "request_branch_local_trigger_tombstone" : "request_branch_local_trigger_deletion",
        preflight: "exact_trigger_detail_identity_and_version", reconciliation: "one_trigger_detail_observation_no_retry",
        diff: { before: "selected_effective_trigger_present", after: "trigger_deletion_requested" }, completion: "acknowledgement_only",
        committedInvocationsCancelled: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function trigger(raw: unknown): void {
    ancestry(raw);
    const value = field(raw, "trigger");
    ancestry(value);
    check(identifier.parse(field(value, "trigger_id")) === config.triggerId);
    check(slug.parse(field(value, "function_slug")) === config.functionSlug);
    check(triggerType.parse(field(value, "type")) === config.expectedType);
    check(version.parse(field(value, "version")) === config.expectedVersion);
    check(booleanValue(field(value, "inherited")) === config.expectedInherited);
    check(booleanValue(field(value, "enabled")) === config.expectedEnabled);
    // Names, function paths, cron, storage configuration and timestamps are not evaluated.
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchTrigger", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        trigger(await transport.getProjectBranchTrigger(config.projectId, config.branchId, config.triggerId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchTrigger(config.projectId, config.branchId, config.triggerId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence is not causal deletion, committed-invocation cancellation or fencing proof.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
