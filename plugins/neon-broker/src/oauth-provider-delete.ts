import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { providerId, providerType } from "./oauth-providers.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonOAuthProviderDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly oauthProviderId: "google" | "github" | "microsoft" | "vercel" | "apple";
  readonly expectedType: "standard" | "shared";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, oauth_provider_id: providerId });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

export function createNeonOAuthProviderDeleteOperations(scope: NeonOAuthProviderDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, oauthProviderId: providerId,
    expectedType: providerType, revision: identifier }).parse(scope);
  const name = "deleteBranchNeonAuthOauthProvider";
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/oauth_providers/${config.oauthProviderId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.oauth_provider_id === config.oauthProviderId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: name, ...args, expectedType: config.expectedType,
        effect: "request_single_oauth_provider_removal", preflight: "bounded_exact_provider_presence_and_type",
        reconciliation: "one_provider_list_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: { id: config.oauthProviderId, type: config.expectedType }, after: "provider_removal_requested" },
        enforcementVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): void {
    ancestry(raw);
    const seen = new Set<string>();
    let found = false;
    for (const row of rows(field(raw, "providers"), 5)) {
      ancestry(row);
      const id = providerId.parse(field(row, "id"));
      const type = providerType.parse(field(row, "type"));
      check(!seen.has(id));
      seen.add(id);
      if (id === config.oauthProviderId) {
        check(type === config.expectedType);
        found = true;
      }
      // Client identities, masked secrets and provider-specific metadata are not consumed.
    }
    check(found);
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
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        present(await transport.listBranchNeonAuthOauthProviders(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteBranchNeonAuthOauthProvider(config.projectId, config.branchId, config.oauthProviderId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence or a replacement configuration is not causal enforcement evidence.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
