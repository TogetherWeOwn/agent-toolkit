import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ROLE_DELETE_OPERATIONS = ["deleteProjectBranchRole"] as const;
export interface NeonRoleDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly roleName: string;
  readonly expectedCreatedAt: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const roleName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
// Exact provider fingerprint only, not expiry/chronology evidence or an immutable role ID.
const expectedCreatedAt = text(40, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId, role_name: roleName });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. A name/creation fingerprint cannot fence a concurrent same-name replacement.
export function createNeonRoleDeleteOperations(scope: NeonRoleDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, roleName, expectedCreatedAt, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/roles/${config.roleName}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.role_name === config.roleName);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchRole", ...args, expected_created_at: config.expectedCreatedAt, effect: "request_role_deletion",
        preflight: "exact_role_name_branch_creation_fingerprint_and_unprotected", reconciliation: "bounded_role_observation_no_retry",
        diff: { before: "selected_unprotected_role", after: "deletion_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId],
      ["role_name", config.roleName]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown): void {
    ancestry(raw);
    const role = field(raw, "role");
    ancestry(role);
    check(field(role, "name") === config.roleName && field(role, "branch_id") === config.branchId &&
      field(role, "created_at") === config.expectedCreatedAt && field(role, "protected") === false);
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
    return { name: config.roleName, branch_id: config.branchId, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchRole", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        bound(await transport.getProjectBranchRole(config.projectId, config.branchId, config.roleName, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchRole(config.projectId, config.branchId, config.roleName, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence, a changed fingerprint or a same-name role never proves deletion or session closure.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
