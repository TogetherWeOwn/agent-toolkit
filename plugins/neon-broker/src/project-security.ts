import { closed, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const PROJECT_SECURITY_OPERATIONS = ["getProjectJWKS", "listProjectVPCEndpoints"] as const;
type ProjectSecurityOperation = typeof PROJECT_SECURITY_OPERATIONS[number];
export const MAX_PROJECT_SECURITY_BINDINGS = 16;
export interface NeonProjectSecurityScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly jwks: readonly { readonly id: string; readonly branchId: string | null }[];
  readonly vpcEndpointIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const identifier = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const projectArguments = closed({ project_id: pathId });
const suffix = (name: ProjectSecurityOperation) => name === "getProjectJWKS" ? "jwks" : "vpc_endpoints";

export function createNeonProjectSecurityOperations(scope: NeonProjectSecurityScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_PROJECT_SECURITY_BINDINGS).map(value => pathId.parse(value)) },
    jwks: { parse: (v: unknown) => rows(v, MAX_PROJECT_SECURITY_BINDINGS).map(value => closed({ id: identifier,
      branchId: { parse: (v: unknown) => v === null ? null : pathId.parse(v) },
    }).parse(value)) },
    vpcEndpointIds: { parse: (v: unknown) => rows(v, MAX_PROJECT_SECURITY_BINDINGS).map(value => identifier.parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const jwks = new Map(config.jwks.map(value => [value.id, value.branchId]));
  const endpoints = new Set(config.vpcEndpointIds);
  check(branches.size === config.branchIds.length && jwks.size === config.jwks.length && endpoints.size === config.vpcEndpointIds.length);
  check(config.jwks.every(value => value.branchId === null || branches.has(value.branchId)));

  function parse(raw: unknown) {
    const args = projectArguments.parse(raw);
    if (args.project_id !== config.projectId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: ProjectSecurityOperation, raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/${suffix(name)}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectIdentity(raw: unknown): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    check(optional(raw, "pagination") === undefined);
  }
  function projectFor(name: ProjectSecurityOperation, raw: unknown): Json {
    projectIdentity(raw);
    check(optional(raw, "branch_id") === undefined);
    const seen = new Set<string>();
    if (name === "getProjectJWKS") {
      const selected = rows(field(raw, "jwks"), MAX_ITEMS).flatMap(value => {
        projectIdentity(value);
        check(field(value, "project_id") === config.projectId);
        const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "id"));
        check(!seen.has(id));
        seen.add(id);
        if (!jwks.has(id)) return [];
        const branch = optional(value, "branch_id");
        const expected = jwks.get(id);
        check(expected === null ? branch === undefined : branch === expected);
        return [{ id: identifier.parse(id), project_id: config.projectId, ...(expected === null ? {} : { branch_id: pathId.parse(branch) }) }];
      });
      return { jwks: selected };
    }
    const selected = rows(field(raw, "endpoints"), MAX_ITEMS).flatMap(value => {
      projectIdentity(value);
      check(optional(value, "branch_id") === undefined);
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "vpc_endpoint_id"));
      check(!seen.has(id));
      seen.add(id);
      return endpoints.has(id) ? [{ vpc_endpoint_id: identifier.parse(id) }] : [];
    });
    return { endpoints: selected };
  }
  return Object.freeze(PROJECT_SECURITY_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getProjectJWKS" ? await transport.getProjectJWKS(config.projectId, options) :
        await transport.listProjectVPCEndpoints(config.projectId, options);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
