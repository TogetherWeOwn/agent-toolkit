import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_DOMAIN_OPERATIONS = ["listNeonAuthRedirectURIWhitelistDomains", "listBranchNeonAuthTrustedDomains"] as const;
type AuthDomainOperation = typeof AUTH_DOMAIN_OPERATIONS[number];
export interface NeonAuthDomainScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
}
const projectArguments = closed({ project_id: identifier });
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const authProvider = oneOf(["mock", "stack", "better_auth"] as const);
// Conservative hostname subset only: never return URLs, userinfo, paths or query strings.
const domainName = text(253, /^(?:\*\.)?[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/);

export function createNeonAuthDomainOperations(scope: NeonAuthDomainScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  check(branches.size === config.branchIds.length);

  function parse(name: AuthDomainOperation, raw: unknown) {
    const args: { readonly project_id: string; readonly branch_id?: string } = name === "listBranchNeonAuthTrustedDomains" ? branchArguments.parse(raw) : projectArguments.parse(raw);
    if (args.project_id !== config.projectId || (args.branch_id !== undefined && !branches.has(args.branch_id))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: AuthDomainOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    const parent = args.branch_id !== undefined ? `/branches/${args.branch_id}` : "";
    return { resource: { id: `neon/projects/${config.projectId}${parent}/auth/domains`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectFor(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    const projectId = optional(raw, "project_id");
    check(projectId === undefined || projectId === config.projectId);
    const domains = rows(field(raw, "domains"), MAX_ITEMS).map(value => {
      const domain = domainName.parse(field(value, "domain"));
      check(!/[^A-Za-z0-9.*-]/.test(domain));
      return { domain, auth_provider: authProvider.parse(field(value, "auth_provider")) };
    });
    check(new Set(domains.map(value => `${value.auth_provider}/${value.domain.toLowerCase()}`)).size === domains.length);
    return { domains };
  }
  return Object.freeze(AUTH_DOMAIN_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = args.branch_id !== undefined ? await transport.listBranchNeonAuthTrustedDomains(config.projectId, args.branch_id, options) :
        await transport.listNeonAuthRedirectURIWhitelistDomains(config.projectId, options);
      // Neither schema has identity fields; bind to the exact authenticated request path.
      const returnedBranch = optional(raw, "branch_id");
      check(returnedBranch === undefined || (args.branch_id !== undefined && returnedBranch === args.branch_id));
      projectFor(raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(raw); },
  })));
}
