import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_DOMAIN_DELETE_OPERATIONS = ["deleteBranchNeonAuthTrustedDomain"] as const;
export interface NeonAuthDomainDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly authProvider: "mock" | "stack" | "better_auth";
  readonly domain: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const authDomainDeleteProvider = oneOf(["mock", "stack", "better_auth"] as const);
// Exact HTTPS origins only; no wildcard, port, path, query, fragment or URL following.
export const authDomainDeleteOrigin = text(128, /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/);
const listedDomain = text(512, /^[\x20-\x7e]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, auth_provider: authDomainDeleteProvider, domain: authDomainDeleteOrigin });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

export function createNeonAuthDomainDeleteOperations(scope: NeonAuthDomainDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, authProvider: authDomainDeleteProvider,
    domain: authDomainDeleteOrigin, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/domains/${config.authProvider}/${config.domain.slice(8)}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId &&
      args.auth_provider === config.authProvider && args.domain === config.domain);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteBranchNeonAuthTrustedDomain", ...args,
        effect: "request_single_trusted_redirect_origin_removal", preflight: "bounded_exact_provider_and_origin_presence",
        reconciliation: "one_domain_list_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: "selected_provider_origin_present", after: "origin_removal_requested" },
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
    for (const row of rows(field(raw, "domains"), 30)) {
      ancestry(row);
      const domain = listedDomain.parse(field(row, "domain"));
      const provider = authDomainDeleteProvider.parse(field(row, "auth_provider"));
      const key = `${provider}/${domain.toLowerCase()}`;
      check(!seen.has(key));
      seen.add(key);
      if (domain === config.domain && provider === config.authProvider) found = true;
      // Unselected domain strings are never followed or emitted.
    }
    check(found);
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteBranchNeonAuthTrustedDomain", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        present(await transport.listBranchNeonAuthTrustedDomains(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteBranchNeonAuthTrustedDomain(config.projectId, config.branchId, config.authProvider, config.domain, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Neither absence nor presence proves this request's effective enforcement.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
