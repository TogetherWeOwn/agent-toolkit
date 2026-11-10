import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { authDomainDeleteOrigin } from "./auth-domain-delete.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthClientCreateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly name: string;
  readonly redirectOrigin: string;
  readonly resourceOrigin: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const authClientCreateName = text(60, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const authClientCreateOrigin = authDomainDeleteOrigin;
const clientId = text(128, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, name: authClientCreateName,
  redirect_origin: authClientCreateOrigin, resource_origin: authClientCreateOrigin });

// Public clients have no secret. This source does not authorize live trust expansion.
export function createNeonAuthClientCreateOperations(scope: NeonAuthClientCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, name: authClientCreateName,
    redirectOrigin: authClientCreateOrigin, resourceOrigin: authClientCreateOrigin, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/oauth-provider/clients/create/${config.name}`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.name === config.name &&
      args.redirect_origin === config.redirectOrigin && args.resource_origin === config.resourceOrigin);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createNeonAuthOAuthClient", ...args, type: "public", skip_consent: false,
        effect: "request_public_oauth_client_and_redirect_trust_creation", preflight: "bounded_client_name_absence",
        reconciliation: "one_client_list_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: "selected_client_name_absent", after: { name: config.name, type: "public",
          redirect_uris: [config.redirectOrigin], resources: [config.resourceOrigin], skip_consent: false } },
        persistenceVerified: false, enforcementVerified: false, resourceConfigurationVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const seen = new Set<string>();
    let found = false;
    for (const value of rows(field(raw, "clients"), 30)) {
      ancestry(value);
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "client_id"));
      const name = text(100, /^[\x20-\x7e]+$/).parse(field(value, "name"));
      check(!seen.has(id));
      seen.add(id);
      if (name === config.name) found = true;
      // Client secrets, redirect lists and unrelated configuration are not evaluated.
    }
    return found;
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const id = clientId.parse(field(raw, "client_id"));
    check(field(raw, "name") === config.name && field(raw, "type") === "public" &&
      field(raw, "skip_consent") === false && field(raw, "disabled") === false);
    const redirects = rows(field(raw, "redirect_uris"), 1);
    const resources = rows(field(raw, "resources"), 1);
    check(redirects.length === 1 && redirects[0] === config.redirectOrigin &&
      resources.length === 1 && resources[0] === config.resourceOrigin);
    return { client_id: id, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createNeonAuthOAuthClient", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(await transport.listNeonAuthOAuthClients(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createNeonAuthOAuthClient(config.projectId, config.branchId, config.name,
          config.redirectOrigin, config.resourceOrigin, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal creation evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
