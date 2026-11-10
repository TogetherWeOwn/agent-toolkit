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
export type NeonLegacyAuthUserDeleteScope = Omit<NeonAuthUserDeleteScope, "branchId">;
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const authUserDeleteId = text(64, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

export function createNeonAuthUserDeleteOperations(scope: NeonAuthUserDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, userId: authUserDeleteId, revision: identifier }).parse(scope);
  return userDeleteOperations(config, config.branchId, transport);
}

// Legacy is a separate project-only capability, never a branch-operation fallback.
export function createNeonLegacyAuthUserDeleteOperations(scope: NeonLegacyAuthUserDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, userId: authUserDeleteId, revision: identifier }).parse(scope);
  return userDeleteOperations(config, null, transport);
}

// Source only. The public management schema supplies no user-detail reconciliation read.
function userDeleteOperations(config: NeonLegacyAuthUserDeleteScope, branchId: string | null, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const name = branchId === null ? "deleteNeonAuthUser" : "deleteBranchNeonAuthUser";
  const argumentsSchema = branchId === null ? closed({ project_id: pathId, auth_user_id: authUserDeleteId }) :
    closed({ project_id: pathId, branch_id: pathId, auth_user_id: authUserDeleteId });
  const target = branchId === null ? `neon/projects/${config.projectId}` : `neon/projects/${config.projectId}/branches/${branchId}`;
  const resourceId = `${target}/auth/users/${config.userId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.auth_user_id === config.userId);
    if (branchId !== null) check(field(args, "branch_id") === branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: name, ...args, effect: "request_irreversible_auth_user_record_removal",
        preflight: branchId === null ? "exact_project_identity_trusted_user_binding_only" : "exact_branch_identity_trusted_user_binding_only",
        reconciliation: "user_read_unavailable_remain_uncertain_no_retry",
        diff: { before: "trusted_selected_user_presence_unverified", after: "user_record_removal_requested" }, completion: "acknowledgement_only",
        userPresenceVerified: false, deletionVerified: false, issuedTokensRevoked: false, sessionsRevoked: false,
        connectionFence: false, atomicCompareAndSwap: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(branchId === null ? optional(raw, "branch_id") === undefined :
      optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = branchId === null ? await transport.getProject(config.projectId, options) :
        await transport.getProjectBranch(config.projectId, branchId, options);
      ancestry(raw);
      const detail = field(raw, branchId === null ? "project" : "branch");
      ancestry(detail);
      check(field(detail, "id") === (branchId ?? config.projectId));
      if (branchId !== null) check(field(detail, "project_id") === config.projectId);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const result = branchId === null ? await transport.deleteNeonAuthUser(config.projectId, config.userId, options) :
          await transport.deleteBranchNeonAuthUser(config.projectId, branchId, config.userId, options);
        receipt(result);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return result;
      } catch {
        // Parent metadata cannot reconcile a user-directory mutation. Never invent a read or retry.
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
