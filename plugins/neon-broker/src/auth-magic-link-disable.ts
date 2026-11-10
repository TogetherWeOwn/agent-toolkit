import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthMagicLinkDisableScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

// Source only. The management schema has no dedicated magic-link status GET.
export function createNeonAuthMagicLinkDisableOperations(scope: NeonAuthMagicLinkDisableScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/plugins/magic-link/disable`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateNeonAuthMagicLinkPlugin", ...args, enabled: false, effect: "disable_magic_link_authentication",
        preflight: "exact_branch_better_auth_no_pending_transfer", reconciliation: "status_read_unavailable_remain_uncertain_no_retry",
        diff: { before: "magic_link_state_unverified", after: { enabled: false } }, completion: "acknowledgement_only",
        previousStateVerified: false, authenticationRefusalVerified: false, outstandingLinksInvalidated: false, configurationPreserved: false,
        sessionsRevoked: false, connectionFence: false, atomicCompareAndSwap: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    check(boolean(field(raw, "enabled")) === false);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateNeonAuthMagicLinkPlugin", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getNeonAuth(config.projectId, config.branchId, options);
      ancestry(raw);
      check(field(raw, "branch_id") === config.branchId && field(raw, "auth_provider") === "better_auth");
      const transfer = optional(raw, "transfer_status");
      check(transfer === undefined || transfer === "finished");
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const result = await transport.updateNeonAuthMagicLinkPlugin(config.projectId, config.branchId, options);
        receipt(result);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return result;
      } catch {
        // Parent auth metadata cannot reconcile magic-link state; never invent a read or retry.
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
