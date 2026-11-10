import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const BRANCH_DELETE_OPERATIONS = ["deleteProjectBranch"] as const;
export interface NeonBranchDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly parentId: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Branch deletion disrupts compute; acknowledgement is not completion.
export function createNeonBranchDeleteOperations(scope: NeonBranchDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, parentId: branchId, revision }).parse(scope);
  check(config.parentId !== config.branchId);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranch", ...args, parent_id: config.parentId, effect: "request_branch_deletion",
        preflight: "exact_nonroot_nondefault_unprotected_branch", reconciliation: "bounded_branch_observation_no_retry",
        diff: { before: "selected_branch", after: "deletion_requested" }, completion: "acknowledgement_only",
        connectionFence: false, cascade: false }, artifactDigest: null };
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
    check(field(branch, "id") === config.branchId && field(branch, "project_id") === config.projectId &&
      field(branch, "parent_id") === config.parentId);
    return branch;
  }
  function receipt(raw: unknown): Json {
    bound(raw);
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value);
      const id = operationId.parse(field(value, "id"));
      check(field(value, "project_id") === config.projectId && !seen.has(id));
      seen.add(id);
      return { id, status: status.parse(field(value, "status")) };
    });
    return { id: config.branchId, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranch", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<unknown> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const branch = bound(await transport.getProjectBranch(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return branch;
      }
      const branch = await observe();
      check(field(branch, "default") === false && field(branch, "protected") === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranch(config.projectId, config.branchId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence after a lost response does not establish completed deletion or causation.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
