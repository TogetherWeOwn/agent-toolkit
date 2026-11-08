import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const OAUTH_PROVIDER_OPERATIONS = ["listNeonAuthOauthProviders", "listBranchNeonAuthOauthProviders"] as const;
type OAuthProviderOperation = typeof OAUTH_PROVIDER_OPERATIONS[number];
const providerId = oneOf(["google", "github", "microsoft", "vercel", "apple"] as const);
const providerType = oneOf(["standard", "shared"] as const);
const pathId = text(60, /^[a-z0-9-]+$/);
const projectArguments = closed({ project_id: pathId });
const branchArguments = closed({ project_id: pathId, branch_id: pathId });
export interface NeonOAuthProviderScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly providerIds: readonly string[];
}

export function createNeonOAuthProviderOperations(scope: NeonOAuthProviderScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier,
    providerIds: { parse: (value: unknown) => rows(value, 5).map(item => providerId.parse(item)) },
  }).parse(scope);
  const selected = new Set(config.providerIds);
  check(selected.size > 0 && selected.size === config.providerIds.length);
  function parse(name: OAuthProviderOperation, raw: unknown) {
    const args: { readonly project_id: string; readonly branch_id?: string } = name === "listBranchNeonAuthOauthProviders" ?
      branchArguments.parse(raw) : projectArguments.parse(raw);
    if (args.project_id !== config.projectId || (args.branch_id !== undefined && args.branch_id !== config.branchId)) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: OAuthProviderOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    const parent = args.branch_id === undefined ? "" : `/branches/${config.branchId}`;
    return { resource: { id: `neon/projects/${config.projectId}${parent}/auth/oauth_providers`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectFor(name: OAuthProviderOperation, raw: unknown): Json {
    const expectedBranch = name === "listBranchNeonAuthOauthProviders" ? config.branchId : undefined;
    function ancestry(value: unknown) {
      const project = optional(value, "project_id");
      const branch = optional(value, "branch_id");
      check((project === undefined || project === config.projectId) && (branch === undefined || branch === expectedBranch));
    }
    check(optional(raw, "pagination") === undefined);
    ancestry(raw);
    const providers = rows(field(raw, "providers"), 5).map(value => {
      ancestry(value);
      // The pinned GET schema describes masked secrets; even fingerprints are not consumed.
      return { id: providerId.parse(field(value, "id")), type: providerType.parse(field(value, "type")) };
    });
    check(new Set(providers.map(value => value.id)).size === providers.length);
    return { providers: providers.filter(value => selected.has(value.id)) };
  }
  return Object.freeze(OAUTH_PROVIDER_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = args.branch_id === undefined ? await transport.listNeonAuthOauthProviders(config.projectId, options) :
        await transport.listBranchNeonAuthOauthProviders(config.projectId, config.branchId, options);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
