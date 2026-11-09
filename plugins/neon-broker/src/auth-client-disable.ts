import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthClientDisableScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly clientId: string;
  readonly expectedType: "confidential" | "public";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const clientId = text(64, /^[A-Za-z0-9]+$/);
const clientType = oneOf(["confidential", "public"] as const);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, client_id: clientId });

export function createNeonAuthClientDisableOperations(scope: NeonAuthClientDisableScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, clientId, expectedType: clientType, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/oauth-provider/clients/${config.clientId}/disable`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.client_id === config.clientId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateNeonAuthOAuthClient", ...args, expectedType: config.expectedType, disabled: true,
        effect: "disable_oauth_client", preflight: "exact_client_identity_type_and_disabled_false",
        reconciliation: "one_client_detail_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: { disabled: false }, after: { disabled: true } },
        configurationReplaced: false, enforcementVerified: false, issuedTokensRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function status(raw: unknown): boolean {
    check(clientId.parse(field(raw, "client_id")) === config.clientId);
    check(clientType.parse(field(raw, "type")) === config.expectedType);
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
    return boolean(field(raw, "disabled"));
  }
  function receipt(raw: unknown): Json {
    check(status(raw) === true);
    return { accepted: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateNeonAuthOAuthClient", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const value = status(await transport.getNeonAuthOAuthClient(config.projectId, config.branchId, config.clientId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return value;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateNeonAuthOAuthClient(config.projectId, config.branchId, config.clientId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // A disabled client observation does not establish causal completion or issued-token revocation.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
