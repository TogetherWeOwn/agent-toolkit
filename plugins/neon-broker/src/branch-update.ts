import { closed, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const BRANCH_UPDATE_OPERATIONS = ["updateProjectBranch"] as const;
export interface NeonBranchUpdateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly expectedName: string;
  readonly name: string;
}
const id = text(60, /^[a-z0-9-]+$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const branchLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: id, branch_id: id, name: branchLabel });

// Name-only source seam. Protection, expiry and runtime registration are absent.
export function createNeonBranchUpdateOperations(scope: NeonBranchUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: id, branchId: id, revision, expectedName: branchLabel, name: branchLabel }).parse(scope);
  check(config.expectedName !== config.name);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/rename`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateProjectBranch", ...args, effect: "rename_branch", preflight: "exact_branch_binding_and_label",
        diff: { before: config.expectedName, after: config.name }, protection: "unchanged", expiry: "unchanged", atomicCompareAndSwap: false,
        reconciliation: "bounded_branch_observation_no_retry" }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown): unknown {
    ancestry(raw);
    const branch = field(raw, "branch");
    ancestry(branch);
    check(field(branch, "id") === config.branchId && field(branch, "project_id") === config.projectId);
    return branch;
  }
  function receipt(raw: unknown): Json {
    check(field(bound(raw), "name") === config.name);
    return { id: config.branchId, updated: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateProjectBranch", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(preflight: boolean): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const branch = bound(await transport.getProjectBranch(config.projectId, config.branchId, options));
        if (preflight) check(field(branch, "name") === config.expectedName);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe(true);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateProjectBranch(config.projectId, config.branchId, config.name, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Desired state observed after an error does not establish causation.
        if (!signal.aborted) { try { await observe(false); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
