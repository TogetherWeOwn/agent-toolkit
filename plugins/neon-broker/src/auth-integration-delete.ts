import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthIntegrationDeleteScope {
  readonly projectId: string;
  readonly authProvider: "mock" | "stack" | "better_auth";
  readonly expectedBranchId: string;
  readonly expectedOwnedBy: "user" | "neon";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const provider = oneOf(["mock", "stack", "better_auth"] as const);
const ownedBy = oneOf(["user", "neon"] as const);
const argumentsSchema = closed({ project_id: pathId, auth_provider: provider });

export function createNeonAuthIntegrationDeleteOperations(scope: NeonAuthIntegrationDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, authProvider: provider, expectedBranchId: pathId, expectedOwnedBy: ownedBy, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/auth/integration/${config.authProvider}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.auth_provider === config.authProvider);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteNeonAuthIntegration", ...args, expectedBranchId: config.expectedBranchId, expectedOwnedBy: config.expectedOwnedBy,
        effect: "remove_legacy_auth_provider_connection_without_requesting_data_erasure", delete_data: false,
        preflight: "unique_provider_exact_branch_ownership_no_pending_transfer", reconciliation: "one_list_observation_no_retry",
        completion: "acknowledgement_only", diff: { before: { branch_id: config.expectedBranchId, owned_by: config.expectedOwnedBy },
          after: "legacy_auth_provider_connection_removal_requested" },
        enforcementVerified: false, dataPreservationVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): void {
    identity(raw);
    check(optional(raw, "branch_id") === undefined);
    const data = rows(field(raw, "data"), MAX_ITEMS).map(value => {
      identity(value);
      const branch = pathId.parse(field(value, "branch_id"));
      const auth = provider.parse(field(value, "auth_provider"));
      const owner = ownedBy.parse(field(value, "owned_by"));
      const transfer = optional(value, "transfer_status");
      check(transfer === undefined || transfer === "initiated" || transfer === "finished");
      // Sensitive database, provider project, URL and timestamp fields are not consumed.
      return { branch, auth, owner, transfer };
    });
    check(new Set(data.map(value => `${value.branch}/${value.auth}`)).size === data.length);
    // The legacy DELETE has no branch selector. Never choose among same-provider rows.
    const matches = data.filter(value => value.auth === config.authProvider);
    check(matches.length === 1);
    const selected = matches[0]!;
    check(selected.branch === config.expectedBranchId && selected.owner === config.expectedOwnedBy);
    check(selected.transfer === undefined || selected.transfer === "finished");
  }
  function receipt(raw: unknown): Json {
    const value = closed({ acknowledged: { parse: boolean } }).parse(raw);
    check(value.acknowledged === true);
    return { accepted: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteNeonAuthIntegration", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        present(await transport.listNeonAuthIntegrations(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteNeonAuthIntegration(config.projectId, config.authProvider, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Absence is not causal completion evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
