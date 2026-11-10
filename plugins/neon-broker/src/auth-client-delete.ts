import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_CLIENT_DELETE_OPERATIONS = ["deleteNeonAuthOAuthClient"] as const;
export interface NeonAuthClientDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly clientId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const clientId = text(64, /^[A-Za-z0-9]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, client_id: clientId });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. The provider explicitly does not revoke tokens already issued to this client.
export function createNeonAuthClientDeleteOperations(scope: NeonAuthClientDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, clientId, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/oauth-provider/clients/${config.clientId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.client_id === config.clientId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteNeonAuthOAuthClient", ...args, effect: "request_oauth_client_deletion",
        preflight: "exact_client_detail_identity", reconciliation: "one_client_detail_observation_no_retry",
        diff: { before: "selected_oauth_client_present", after: "client_deletion_requested" }, completion: "acknowledgement_only",
        issuedTokensRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function client(raw: unknown): void {
    check(clientId.parse(field(raw, "client_id")) === config.clientId);
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
    // Display names, redirects, resources, flags, timestamps and unexpected secrets are not evaluated.
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteNeonAuthOAuthClient", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        client(await transport.getNeonAuthOAuthClient(config.projectId, config.branchId, config.clientId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteNeonAuthOAuthClient(config.projectId, config.branchId, config.clientId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence does not prove causal deletion, issued-token revocation or session closure.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
