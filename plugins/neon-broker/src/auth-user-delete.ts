import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthUserDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly userId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const authUserDeleteId = text(64, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, auth_user_id: authUserDeleteId });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. The public management schema supplies no user-detail reconciliation read.
export function createNeonAuthUserDeleteOperations(scope: NeonAuthUserDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, userId: authUserDeleteId, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/users/${config.userId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.auth_user_id === config.userId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteBranchNeonAuthUser", ...args, effect: "request_irreversible_auth_user_record_removal",
        preflight: "exact_branch_identity_trusted_user_binding_only", reconciliation: "user_read_unavailable_remain_uncertain_no_retry",
        diff: { before: "trusted_selected_user_presence_unverified", after: "user_record_removal_requested" }, completion: "acknowledgement_only",
        userPresenceVerified: false, deletionVerified: false, issuedTokensRevoked: false, sessionsRevoked: false,
        connectionFence: false, atomicCompareAndSwap: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteBranchNeonAuthUser", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const rawBranch = await transport.getProjectBranch(config.projectId, config.branchId, options);
      ancestry(rawBranch);
      const branch = field(rawBranch, "branch");
      ancestry(branch);
      check(field(branch, "id") === config.branchId && field(branch, "project_id") === config.projectId);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteBranchNeonAuthUser(config.projectId, config.branchId, config.userId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Branch metadata cannot reconcile a user-directory mutation. Never invent a read or retry.
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
