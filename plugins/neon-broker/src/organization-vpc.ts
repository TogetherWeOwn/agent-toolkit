import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_VPC_OPERATIONS = ["listOrganizationVPCEndpointsAllRegions", "listOrganizationVPCEndpoints", "getOrganizationVPCEndpointDetails"] as const;
type OrganizationVPCOperation = typeof ORGANIZATION_VPC_OPERATIONS[number];
export const MAX_ORGANIZATION_VPC_BINDINGS = 16;
export interface NeonOrganizationVPCScope {
  readonly organizationId: string;
  readonly revision: string;
  readonly regionIds: readonly string[];
  readonly endpoints: readonly { readonly id: string; readonly regionId: string }[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const region = text(80, /^(aws|azure)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const printable = text(256, /^[\x20-\x7e]+$/);
const organizationArguments = closed({ org_id: pathId });
const regionArguments = closed({ org_id: pathId, region_id: region });
const endpointArguments = closed({ org_id: pathId, region_id: region, vpc_endpoint_id: identifier });

export function createNeonOrganizationVPCOperations(scope: NeonOrganizationVPCScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier,
    regionIds: { parse: (v: unknown) => rows(v, MAX_ORGANIZATION_VPC_BINDINGS).map(value => region.parse(value)) },
    endpoints: { parse: (v: unknown) => rows(v, MAX_ORGANIZATION_VPC_BINDINGS).map(value => closed({ id: identifier, regionId: region }).parse(value)) },
  }).parse(scope);
  const regions = new Set(config.regionIds);
  const endpoints = new Map(config.endpoints.map(value => [value.id, value.regionId]));
  check(regions.size === config.regionIds.length && endpoints.size === config.endpoints.length);
  check(config.endpoints.every(value => regions.has(value.regionId)));
  const root = `neon/organizations/${config.organizationId}/vpc`;
  // The composed detail resource must fit the common broker's 256-character limit.
  check(config.endpoints.every(value => `${root}/region/${value.regionId}/vpc_endpoints/${value.id}`.length <= 256));

  function parse(name: OrganizationVPCOperation, raw: unknown): { org_id: string; region_id?: string; vpc_endpoint_id?: string } {
    const args: { org_id: string; region_id?: string; vpc_endpoint_id?: string } = name === "listOrganizationVPCEndpointsAllRegions" ? organizationArguments.parse(raw) :
      name === "listOrganizationVPCEndpoints" ? regionArguments.parse(raw) : endpointArguments.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    if (args.region_id !== undefined && !regions.has(args.region_id)) throw Error("INVALID_ARGUMENTS");
    if (args.vpc_endpoint_id !== undefined && (endpoints.get(args.vpc_endpoint_id) !== args.region_id || !args.region_id?.startsWith("aws-"))) {
      throw Error("INVALID_ARGUMENTS");
    }
    return args;
  }
  function prepareFor(name: OrganizationVPCOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    const resource = name === "listOrganizationVPCEndpointsAllRegions" ? `${root}/vpc_endpoints` :
      `${root}/region/${args.region_id}/vpc_endpoints${name === "getOrganizationVPCEndpointDetails" ? `/${args.vpc_endpoint_id}` : ""}`;
    return { resource: { id: resource, revision: config.revision }, arguments: args,
      plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown, regionId?: string): void {
    const org = optional(raw, "org_id");
    const returnedRegion = optional(raw, "region_id");
    check(org === undefined || org === config.organizationId);
    check(regionId === undefined || returnedRegion === undefined || returnedRegion === regionId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
  }
  function projectFor(name: OrganizationVPCOperation, raw: unknown): Json {
    if (name === "listOrganizationVPCEndpointsAllRegions") {
      identity(raw);
      check(optional(raw, "region_id") === undefined);
    }
    const regionId = name === "listOrganizationVPCEndpointsAllRegions" ? undefined : region.parse(field(raw, "region_id"));
    check(regionId === undefined || regions.has(regionId));
    identity(raw, regionId);
    const seen = new Set<string>();
    function endpoint(value: unknown): Json[] {
      identity(value, regionId);
      const id = printable.parse(field(value, "vpc_endpoint_id"));
      const located = regionId ?? printable.parse(field(value, "region_id"));
      check(!seen.has(`${located}/${id}`));
      seen.add(`${located}/${id}`);
      if (!endpoints.has(id)) return [];
      check(endpoints.get(id) === located);
      return [{ vpc_endpoint_id: identifier.parse(id), region_id: region.parse(located) }];
    }
    if (name === "getOrganizationVPCEndpointDetails") {
      check(regionId!.startsWith("aws-"));
      const selected = endpoint(field(raw, "endpoint"));
      check(selected.length === 1);
      return selected[0]!;
    }
    return { endpoints: rows(field(raw, "endpoints"), MAX_ITEMS).flatMap(endpoint) };
  }
  return Object.freeze(ORGANIZATION_VPC_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "listOrganizationVPCEndpointsAllRegions" ? await transport.listOrganizationVPCEndpointsAllRegions(config.organizationId, options) :
        name === "listOrganizationVPCEndpoints" ? await transport.listOrganizationVPCEndpoints(config.organizationId, args.region_id!, options) :
          await transport.getOrganizationVPCEndpointDetails(config.organizationId, args.region_id!, args.vpc_endpoint_id!, options);
      identity(raw, args.region_id);
      if (name === "getOrganizationVPCEndpointDetails") check(field(raw, "vpc_endpoint_id") === args.vpc_endpoint_id);
      // Carry the authenticated request region, not fabricated provider ancestry.
      const value = name === "listOrganizationVPCEndpointsAllRegions" ? raw : name === "listOrganizationVPCEndpoints" ?
        { region_id: args.region_id, endpoints: field(raw, "endpoints") } : { region_id: args.region_id, endpoint: raw };
      projectFor(name, value);
      return value;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
