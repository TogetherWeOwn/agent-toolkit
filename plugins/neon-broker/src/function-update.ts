import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonFunctionUpdateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly functionId: string;
  readonly functionSlug: string;
  readonly expectedName: string;
  readonly name: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const slug = text(20, /^[a-z0-9]+$/);
export const functionLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, slug, name: functionLabel });

// Name-only source seam. The provider refuses inherited-only function updates.
export function createNeonFunctionUpdateOperations(scope: NeonFunctionUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, functionId: identifier,
    functionSlug: slug, expectedName: functionLabel, name: functionLabel, revision }).parse(scope);
  check(config.expectedName !== config.name);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/functions/${config.functionSlug}/rename`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId &&
      args.slug === config.functionSlug && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateProjectBranchFunction", ...args, function_id: config.functionId,
        effect: "rename_function_display_name", preflight: "exact_function_id_slug_and_name",
        diff: { before: config.expectedName, after: config.name }, atomicCompareAndSwap: false,
        inheritedUpdate: "provider_refuses", completion: "acknowledgement_only",
        reconciliation: "one_function_detail_observation_no_retry" }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId],
      ["function_id", config.functionId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown, name: string): void {
    ancestry(raw);
    const value = field(raw, "function");
    ancestry(value);
    check(field(value, "id") === config.functionId && field(value, "slug") === config.functionSlug &&
      field(value, "name") === name);
    // Invocation URLs, deployments, environment names, timestamps and errors are not evaluated.
  }
  function receipt(raw: unknown): Json {
    bound(raw, config.name);
    return { id: config.functionId, slug: config.functionSlug, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateProjectBranchFunction", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        bound(await transport.getProjectBranchFunction(config.projectId, config.branchId, config.functionSlug, options), config.expectedName);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateProjectBranchFunction(config.projectId, config.branchId, config.functionSlug, config.name, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Observing a label or absence after an error establishes no causal rename.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
