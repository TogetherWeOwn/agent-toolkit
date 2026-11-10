import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { customDomainDeleteName } from "./custom-domain-delete.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonJWKSAddScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly roleName: string;
  readonly jwksUrl: string;
  readonly providerName: string;
  readonly audience: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const jwksAddRole = text(63, /^[a-z_][a-z0-9_]*$/);
export const jwksAddLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const jwksAddUrl = { parse(value: unknown): string {
  const raw = text(300, /^https:\/\/[a-z0-9.-]+\/\.well-known\/jwks\.json$/).parse(value);
  const url = new URL(raw);
  customDomainDeleteName.parse(url.hostname);
  check(url.href === raw && url.pathname === "/.well-known/jwks.json" && !url.port && !url.username && !url.password && !url.search && !url.hash);
  check(/\.[a-z]{2,}$/.test(url.hostname) && !/(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname));
  return raw;
} };
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, role_name: jwksAddRole,
  jwks_url: jwksAddUrl, provider_name: jwksAddLabel, jwt_audience: jwksAddLabel });
const responseId = text(256, /^[A-Za-z0-9._-]+$/);

// Source only. Configuring a URL can cause provider-side retrieval; this code never follows it.
export function createNeonJWKSAddOperations(scope: NeonJWKSAddScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, roleName: jwksAddRole,
    jwksUrl: jwksAddUrl, providerName: jwksAddLabel, audience: jwksAddLabel, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/jwks/add`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.role_name === config.roleName &&
      args.jwks_url === config.jwksUrl && args.provider_name === config.providerName && args.jwt_audience === config.audience);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "addProjectJWKS", ...args, skip_role_creation: true,
        effect: "request_branch_jwt_trust_registration", preflight: "role_identity_and_bounded_project_jwks_url_absence",
        diff: { before: "selected_jwks_url_absent", after: { branch_id: config.branchId, role_names: [config.roleName],
          jwks_url: config.jwksUrl, provider_name: config.providerName, jwt_audience: config.audience } },
        reconciliation: "one_jwks_list_observation_no_retry", completion: "acknowledgement_only",
        atomicCompareAndSwap: false, providerMayRetrieveURL: true, tokensWithoutAudienceAccepted: true,
        jwtAcceptanceVerified: false, domainCustodyVerified: false, persistenceVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown, branch = true): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    const value = optional(raw, "branch_id");
    check(branch ? value === undefined || value === config.branchId : value === undefined);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw, false);
    const seen = new Set<string>();
    let found = false;
    for (const value of rows(field(raw, "jwks"), 30)) {
      check(field(value, "project_id") === config.projectId && optional(value, "pagination") === undefined);
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "id"));
      check(!seen.has(id));
      seen.add(id);
      const branch = optional(value, "branch_id");
      if (branch !== undefined) pathId.parse(branch);
      // Other branches are legitimate in a project-wide list; URL presence anywhere refuses.
      const url = text(2048, /^[\x21-\x7e]+$/).parse(field(value, "jwks_url"));
      if (url === config.jwksUrl) found = true;
    }
    return found;
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const value = field(raw, "jwks");
    ancestry(value);
    const id = responseId.parse(field(value, "id"));
    check(field(value, "project_id") === config.projectId && field(value, "branch_id") === config.branchId &&
      field(value, "jwks_url") === config.jwksUrl && field(value, "provider_name") === config.providerName &&
      field(value, "jwt_audience") === config.audience);
    const roles = rows(field(value, "role_names"), 1);
    check(roles.length === 1 && roles[0] === config.roleName);
    // Operation chains, timestamps and key material are never evaluated or emitted.
    return { id, branch_id: config.branchId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.addProjectJWKS", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 4500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const detail = await transport.getProjectBranchRole(config.projectId, config.branchId, config.roleName, options);
      ancestry(detail);
      const role = field(detail, "role");
      ancestry(role);
      check(field(role, "name") === config.roleName && field(role, "branch_id") === config.branchId);
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(await transport.getProjectJWKS(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.addProjectJWKS(config.projectId, config.branchId, config.roleName, config.jwksUrl, config.providerName, config.audience, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal trust-registration evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
