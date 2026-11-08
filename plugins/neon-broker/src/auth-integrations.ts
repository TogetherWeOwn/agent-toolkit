import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_INTEGRATION_OPERATIONS = ["getNeonAuth", "listNeonAuthIntegrations"] as const;
type AuthIntegrationOperation = typeof AUTH_INTEGRATION_OPERATIONS[number];
export interface NeonAuthIntegrationScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
}
const projectArguments = closed({ project_id: identifier });
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const authProvider = oneOf(["mock", "stack", "better_auth"] as const);
const ownedBy = oneOf(["user", "neon"] as const);
const transferStatus = oneOf(["initiated", "finished"] as const);

export function createNeonAuthIntegrationOperations(scope: NeonAuthIntegrationScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  check(branches.size === config.branchIds.length);

  function parse(name: AuthIntegrationOperation, raw: unknown) {
    const args: { readonly project_id: string; readonly branch_id?: string } = name === "getNeonAuth" ? branchArguments.parse(raw) : projectArguments.parse(raw);
    if (args.project_id !== config.projectId || (args.branch_id !== undefined && !branches.has(args.branch_id))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: AuthIntegrationOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    const suffix = args.branch_id !== undefined ? `branches/${args.branch_id}/auth` : "auth/integrations";
    return { resource: { id: `neon/projects/${config.projectId}/${suffix}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    check(optional(raw, "pagination") === undefined);
    const projectId = optional(raw, "project_id");
    check(projectId === undefined || projectId === config.projectId);
  }
  function integration(raw: unknown) {
    identity(raw);
    const branchId = identifier.parse(field(raw, "branch_id"));
    check(branches.has(branchId));
    const transfer = optional(raw, "transfer_status");
    return { branch_id: branchId, auth_provider: authProvider.parse(field(raw, "auth_provider")),
      owned_by: ownedBy.parse(field(raw, "owned_by")),
      ...(transfer !== undefined ? { transfer_status: transferStatus.parse(transfer) } : {}) };
  }
  function projectFor(name: AuthIntegrationOperation, raw: unknown): Json {
    if (name === "getNeonAuth") return integration(raw);
    identity(raw);
    const data = rows(field(raw, "data"), MAX_ITEMS).map(integration);
    check(new Set(data.map(value => `${value.branch_id}/${value.auth_provider}`)).size === data.length);
    return { data };
  }
  return Object.freeze(AUTH_INTEGRATION_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = args.branch_id !== undefined ? await transport.getNeonAuth(config.projectId, args.branch_id, options) :
        await transport.listNeonAuthIntegrations(config.projectId, options);
      if (args.branch_id !== undefined) check(field(raw, "branch_id") === args.branch_id);
      else check(optional(raw, "branch_id") === undefined);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
