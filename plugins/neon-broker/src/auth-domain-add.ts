import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { authDomainDeleteOrigin as origin, authDomainDeleteProvider as provider } from "./auth-domain-delete.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonLegacyAuthDomainAddScope {
  readonly projectId: string;
  readonly authProvider: "mock" | "stack" | "better_auth";
  readonly domain: string;
  readonly revision: string;
}
export interface NeonAuthDomainAddScope extends NeonLegacyAuthDomainAddScope {
  readonly branchId: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const targetFields = { project_id: pathId, auth_provider: provider, domain: origin };
const projectArguments = closed(targetFields);
const argumentsSchema = closed({ ...targetFields, branch_id: pathId });
const scopeFields = { projectId: pathId, authProvider: provider, domain: origin, revision: identifier };
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. Adding an origin broadens redirect trust; preflight is not atomic CAS.
export function createNeonAuthDomainAddOperations(scope: NeonAuthDomainAddScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  return createOperations(closed({ ...scopeFields, branchId: pathId }).parse(scope), transport);
}
export function createNeonLegacyAuthDomainAddOperations(scope: NeonLegacyAuthDomainAddScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  return createOperations(closed(scopeFields).parse(scope), transport);
}
function createOperations(config: NeonLegacyAuthDomainAddScope & { readonly branchId?: string }, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const name = config.branchId === undefined ? "addNeonAuthDomainToRedirectURIWhitelist" : "addBranchNeonAuthTrustedDomain";
  const parent = config.branchId === undefined ? "/auth/legacy/domains" : `/branches/${config.branchId}/auth/domains`;
  const resourceId = `neon/projects/${config.projectId}${parent}/${config.authProvider}/${config.domain.slice(8)}/add`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = config.branchId === undefined ? projectArguments.parse(raw) : argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && ("branch_id" in args ? args.branch_id : undefined) === config.branchId &&
      args.auth_provider === config.authProvider && args.domain === config.domain);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: name, ...args,
        effect: "request_single_trusted_redirect_origin_addition", preflight: "bounded_provider_origin_absence",
        reconciliation: "one_domain_list_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: "selected_provider_origin_absent", after: "redirect_trust_expansion_requested" },
        persistenceVerified: false, enforcementVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const seen = new Set<string>();
    let found = false;
    for (const row of rows(field(raw, "domains"), 30)) {
      ancestry(row);
      const domain = text(512, /^[\x20-\x7e]+$/).parse(field(row, "domain"));
      const authProvider = provider.parse(field(row, "auth_provider"));
      const key = `${authProvider}/${domain.toLowerCase()}`;
      check(!seen.has(key));
      seen.add(key);
      if (authProvider === config.authProvider && domain.toLowerCase() === config.domain) found = true;
      // Unselected strings are bounded data, never followed or emitted.
    }
    return found;
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
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(config.branchId === undefined ? await transport.listNeonAuthRedirectURIWhitelistDomains(config.projectId, options) :
          await transport.listBranchNeonAuthTrustedDomains(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = config.branchId === undefined ?
          await transport.addNeonAuthDomainToRedirectURIWhitelist(config.projectId, config.authProvider, config.domain, options) :
          await transport.addBranchNeonAuthTrustedDomain(config.projectId, config.branchId, config.authProvider, config.domain, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal addition evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
