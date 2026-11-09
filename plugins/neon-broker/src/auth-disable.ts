import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthDisableScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly expectedProvider: "mock" | "stack" | "better_auth";
  readonly expectedOwnedBy: "user" | "neon";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const authProvider = oneOf(["mock", "stack", "better_auth"] as const);
const ownedBy = oneOf(["user", "neon"] as const);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

export function createNeonAuthDisableOperations(scope: NeonAuthDisableScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, expectedProvider: authProvider, expectedOwnedBy: ownedBy, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/disable`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "disableNeonAuth", ...args, expectedProvider: config.expectedProvider, expectedOwnedBy: config.expectedOwnedBy,
        effect: "remove_auth_provider_connection_without_requesting_data_erasure", delete_data: false,
        preflight: "exact_branch_provider_ownership_no_pending_transfer", reconciliation: "one_state_observation_no_retry",
        completion: "acknowledgement_only", diff: { before: { auth_provider: config.expectedProvider, owned_by: config.expectedOwnedBy },
          after: "auth_provider_connection_removal_requested" },
        enforcementVerified: false, dataPreservationVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function present(raw: unknown): void {
    check(field(raw, "branch_id") === config.branchId);
    check(authProvider.parse(field(raw, "auth_provider")) === config.expectedProvider && ownedBy.parse(field(raw, "owned_by")) === config.expectedOwnedBy);
    const transfer = optional(raw, "transfer_status");
    check(transfer === undefined || transfer === "finished");
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "pagination") === undefined);
    // Database name, provider project ID, URLs, timestamps and extras are not consumed.
  }
  function receipt(raw: unknown): Json {
    const value = closed({ acknowledged: { parse: boolean } }).parse(raw);
    check(value.acknowledged === true);
    return { accepted: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.disableNeonAuth", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        present(await transport.getNeonAuth(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.disableNeonAuth(config.projectId, config.branchId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence or changed integration state is not causal completion evidence.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
