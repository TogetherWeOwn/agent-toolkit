import { closed, identifier, integer, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonTriggerDisableScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly triggerId: string;
  readonly functionSlug: string;
  readonly expectedType: "schedule" | "storage_object_created";
  readonly expectedVersion: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const slug = text(20, /^[a-z0-9]+$/);
const triggerType = oneOf(["schedule", "storage_object_created"] as const);
const version = integer(1, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, trigger_id: identifier });

// Source only. Disabling does not cancel occurrences already committed for delivery.
export function createNeonTriggerDisableOperations(scope: NeonTriggerDisableScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, triggerId: identifier, functionSlug: slug,
    expectedType: triggerType, expectedVersion: version, revision: identifier }).parse(scope);
  check(config.expectedType !== "schedule" || config.expectedVersion < Number.MAX_SAFE_INTEGER);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/triggers/${config.triggerId}/disable`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.trigger_id === config.triggerId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateProjectBranchTrigger", ...args, function_slug: config.functionSlug,
        type: config.expectedType, version: config.expectedVersion, inherited: false, enabled: false,
        effect: "disable_branch_local_trigger", preflight: "exact_local_enabled_trigger_identity_and_version",
        reconciliation: "one_trigger_detail_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: { enabled: true }, after: { enabled: false } }, configurationReplaced: false,
        enforcementVerified: false, committedInvocationsCancelled: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function trigger(raw: unknown, updated: boolean): void {
    ancestry(raw);
    const value = field(raw, "trigger");
    ancestry(value);
    check(identifier.parse(field(value, "trigger_id")) === config.triggerId);
    check(slug.parse(field(value, "function_slug")) === config.functionSlug);
    check(triggerType.parse(field(value, "type")) === config.expectedType);
    check(boolean(field(value, "inherited")) === false);
    check(boolean(field(value, "enabled")) === !updated);
    const observedVersion = version.parse(field(value, "version"));
    check(updated ? (config.expectedType === "schedule" ? observedVersion > config.expectedVersion : observedVersion >= config.expectedVersion) :
      observedVersion === config.expectedVersion);
    // Names, function paths, cron, storage configuration and timestamps are not evaluated.
  }
  function receipt(raw: unknown): Json {
    trigger(raw, true);
    return { accepted: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateProjectBranchTrigger", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        trigger(await transport.getProjectBranchTrigger(config.projectId, config.branchId, config.triggerId, options), false);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateProjectBranchTrigger(config.projectId, config.branchId, config.triggerId, config.expectedType, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Desired state is not causal completion evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
