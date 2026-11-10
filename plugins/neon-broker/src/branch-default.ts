import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonBranchDefaultScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly previousDefaultId: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Two detail reads cannot make the default designation switch atomic.
export function createNeonBranchDefaultOperations(scope: NeonBranchDefaultScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, previousDefaultId: branchId, revision }).parse(scope);
  check(config.previousDefaultId !== config.branchId);
  const resourceId = `neon/projects/${config.projectId}/default-branch/${config.previousDefaultId}/to/${config.branchId}`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "setDefaultProjectBranch", ...args, previous_default_id: config.previousDefaultId,
        effect: "request_default_branch_switch", preflight: "exact_previous_default_and_nondefault_target",
        atomicCompareAndSwap: false, diff: { before: { default_branch_id: config.previousDefaultId }, after: { default_branch_id: config.branchId } },
        reconciliation: "one_target_detail_observation_no_retry", completion: "acknowledgement_only",
        previousRemovalVerified: false, persistenceVerified: false, routingVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown, selected: string): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", selected]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown, selected: string): unknown {
    ancestry(raw, selected);
    const branch = field(raw, "branch");
    ancestry(branch, selected);
    check(field(branch, "id") === selected && field(branch, "project_id") === config.projectId);
    return branch;
  }
  function receipt(raw: unknown): Json {
    const branch = bound(raw, config.branchId);
    check(field(branch, "default") === true);
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value, config.branchId);
      const id = operationId.parse(field(value, "id"));
      check(field(value, "project_id") === config.projectId && !seen.has(id));
      seen.add(id);
      return { id, status: status.parse(field(value, "status")) };
    });
    return { id: config.branchId, default: true, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.setDefaultProjectBranch", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 4500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(selected: string): Promise<unknown> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const branch = bound(await transport.getProjectBranch(config.projectId, selected, options), selected);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return branch;
      }
      check(field(await observe(config.previousDefaultId), "default") === true);
      check(field(await observe(config.branchId), "default") === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.setDefaultProjectBranch(config.projectId, config.branchId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Desired state after a lost response proves neither causation nor persistence.
        if (!signal.aborted) { try { await observe(config.branchId); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
