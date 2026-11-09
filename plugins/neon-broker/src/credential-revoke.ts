import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const CREDENTIAL_REVOKE_OPERATIONS = ["revokeCredential"] as const;
export interface NeonCredentialRevokeScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly tokenId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, token_id: identifier });

// Source only; opaque IDs are not secrets and HTTP204 is not a session fence.
export function createNeonCredentialRevokeOperations(scope: NeonCredentialRevokeScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, tokenId: identifier, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/credentials/${config.tokenId}/revoke`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.token_id === config.tokenId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "revokeCredential", ...args, effect: "request_customer_credential_soft_deletion",
        preflight: "bounded_exact_anchor_user_credential_presence", reconciliation: "bounded_branch_credential_observation_no_retry",
        diff: { before: "selected_customer_credential_present", after: "revocation_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function credentials(raw: unknown): void {
    ancestry(raw);
    const seen = new Set<string>();
    for (const value of rows(field(raw, "credentials"), 30)) {
      ancestry(value);
      const id = identifier.parse(field(value, "token_id"));
      check(!seen.has(id));
      seen.add(id);
      if (id === config.tokenId) {
        check(field(value, "branch_id") === config.branchId && field(value, "principal_type") === "user");
      }
      // Scopes, labels, dates, function identity and secret-like extras are never evaluated.
    }
    check(seen.has(config.tokenId));
  }
  function receipt(raw: unknown): Json {
    closed({ acknowledged: { parse: (value: unknown) => { check(value === true); return true; } } }).parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.revokeCredential", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        credentials(await transport.listCredentials(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.revokeCredential(config.projectId, config.branchId, config.tokenId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Provider idempotence does not authorize retries or prove effective revocation on absence.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
