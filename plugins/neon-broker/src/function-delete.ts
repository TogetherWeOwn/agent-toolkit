import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const FUNCTION_DELETE_OPERATIONS = ["deleteProjectBranchFunction"] as const;
export interface NeonFunctionDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly functionId: string;
  readonly functionSlug: string;
  readonly revision: string;
}
// This subset also fits the existing detail transport and common resource limits.
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const slug = text(20, /^[a-z0-9]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, slug });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. Acknowledgement is not independently verified invocation refusal.
export function createNeonFunctionDeleteOperations(scope: NeonFunctionDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, functionId: identifier,
    functionSlug: slug, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/functions/${config.functionSlug}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.slug === config.functionSlug);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchFunction", ...args, function_id: config.functionId,
        effect: "request_branch_function_deletion", preflight: "exact_function_detail_identity",
        reconciliation: "one_function_detail_observation_no_retry",
        diff: { before: "selected_function_present", after: "function_deletion_requested" }, completion: "acknowledgement_only",
        invocationRefusalVerified: false, committedWorkCancellationVerified: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function identity(raw: unknown): void {
    ancestry(raw);
    const value = field(raw, "function");
    ancestry(value);
    check(identifier.parse(field(value, "id")) === config.functionId);
    check(slug.parse(field(value, "slug")) === config.functionSlug);
    // Names, invocation URLs, deployments, environment names and errors are not evaluated.
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchFunction", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        identity(await transport.getProjectBranchFunction(config.projectId, config.branchId, config.functionSlug, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchFunction(config.projectId, config.branchId, config.functionSlug, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence is not causal deletion, invocation refusal or cancellation proof.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
