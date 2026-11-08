import { closed, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean as booleanValue, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_CLIENT_OPERATIONS = ["listNeonAuthOAuthClients", "getNeonAuthOAuthClient"] as const;
type AuthClientOperation = typeof AUTH_CLIENT_OPERATIONS[number];
type AuthClientArguments = { readonly project_id: string; readonly branch_id: string; readonly client_id?: string };
export const MAX_AUTH_CLIENT_BINDINGS = 16;
export interface NeonAuthClientScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly clients: readonly { readonly id: string; readonly branchId: string }[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const clientId = text(64, /^[A-Za-z0-9]+$/);
const clientType = oneOf(["confidential", "public"] as const);
const branchArguments = closed({ project_id: pathId, branch_id: pathId });
const detailArguments = closed({ project_id: pathId, branch_id: pathId, client_id: clientId });

// These GET schemas exclude secrets; create/rotate responses are not consumed.
export function createNeonAuthClientOperations(scope: NeonAuthClientScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_AUTH_CLIENT_BINDINGS).map(value => pathId.parse(value)) },
    clients: { parse: (v: unknown) => rows(v, MAX_AUTH_CLIENT_BINDINGS).map(value => closed({ id: clientId, branchId: pathId }).parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const key = (branch: string, id: string) => `${branch}/${id}`;
  const targets = new Set(config.clients.map(value => key(value.branchId, value.id)));
  check(branches.size === config.branchIds.length && targets.size === config.clients.length);
  check(config.clients.every(value => branches.has(value.branchId)));

  function parse(name: AuthClientOperation, raw: unknown): AuthClientArguments {
    const args: AuthClientArguments = name === "getNeonAuthOAuthClient" ? detailArguments.parse(raw) : branchArguments.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id) ||
      (args.client_id !== undefined && !targets.has(key(args.branch_id, args.client_id)))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: AuthClientOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/auth/oauth-provider/clients${args.client_id === undefined ? "" : `/${args.client_id}`}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown, branchId: string): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function projectClient(raw: unknown, branchId: string) {
    identity(raw, branchId);
    const id = clientId.parse(field(raw, "client_id"));
    check(targets.has(key(branchId, id)));
    return { client_id: id, type: clientType.parse(field(raw, "type")),
      skip_consent: booleanValue(field(raw, "skip_consent")), disabled: booleanValue(field(raw, "disabled")) };
  }
  function projectFor(name: AuthClientOperation, raw: unknown): Json {
    // Context is carried from the authenticated request, not asserted by the provider.
    const branchId = pathId.parse(field(raw, "branch_id"));
    check(branches.has(branchId));
    identity(raw, branchId);
    if (name === "getNeonAuthOAuthClient") return projectClient(field(raw, "client"), branchId);
    const seen = new Set<string>();
    const selected = rows(field(raw, "clients"), MAX_ITEMS).flatMap(value => {
      identity(value, branchId);
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "client_id"));
      check(!seen.has(id));
      seen.add(id);
      return targets.has(key(branchId, id)) ? [projectClient(value, branchId)] : [];
    });
    return { clients: selected };
  }
  return Object.freeze(AUTH_CLIENT_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getNeonAuthOAuthClient" ?
        await transport.getNeonAuthOAuthClient(config.projectId, args.branch_id, args.client_id!, options) :
        await transport.listNeonAuthOAuthClients(config.projectId, args.branch_id, options);
      identity(raw, args.branch_id);
      // The detail response is the client itself, not a client envelope.
      if (name === "getNeonAuthOAuthClient") check(field(raw, "client_id") === args.client_id);
      const value = name === "getNeonAuthOAuthClient" ? { branch_id: args.branch_id, client: raw } :
        { branch_id: args.branch_id, clients: field(raw, "clients") };
      projectFor(name, value);
      return value;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
